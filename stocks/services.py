import hashlib
import json
import re
import datetime
import traceback
import warnings
from typing import Optional, List, Any
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor

import requests
from decimal import Decimal
import pandas as pd
import yfinance as yf
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.utils import timezone
from django.core.cache import cache
from rest_framework.exceptions import ValidationError

from .models import Watchlist, BrokerAccount, PortfolioPosition, Transaction


def _clean_decimal(val: Any) -> Decimal:
    """Robustly convert a value (float, str, etc.) to Decimal."""
    if pd.isna(val) or val is None:
        return Decimal("0")
    s = str(val).strip().replace("\xa0", "").replace(" ", "")
    if "," in s and "." in s:
        dot_idx = s.rfind(".")
        comma_idx = s.rfind(",")
        if dot_idx > comma_idx:
            s = s.replace(",", "")
        else:
            s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")

    if s.count(".") > 1:
        last_dot = s.rfind(".")
        s = s[:last_dot].replace(".", "") + s[last_dot:]

    try:
        return Decimal(s)
    except Exception:
        return Decimal("0")


def map_xtb_symbol_to_yf(symbol: str) -> str:
    """Map XTB symbol formats to Yahoo Finance (yfinance) symbols."""
    if not symbol:
        return ""
    s = symbol.upper().strip()
    # Handle common suffixes
    if s.endswith(".UK"):
        return s.replace(".UK", ".L")
    if s.endswith(".CH"):
        return s.replace(".CH", ".SW")
    if s.endswith(".CZ"):
        return s.replace(".CZ", ".PR")
    if s.endswith(".US"):
        return s.replace(".US", "")
    if s.endswith(".DE"):
        return s  # .DE is usually fine for YF
    if s.endswith(".FR"):
        return s.replace(".FR", ".PA")
    if s.endswith(".IT"):
        return s.replace(".IT", ".MI")
    if s.endswith(".ES"):
        return s.replace(".ES", ".MC")
    return s


def _invalidate_portfolio_history_cache(user_id: int, benchmark: str = "^GSPC") -> None:
    """Invalidate all versions and periods of portfolio history cache for a user."""
    for version in range(10, 31):
        for period in ["1mo", "3mo", "6mo", "1y", "all", "20y"]:
            cache.delete(
                f"portfolio_history_twr_v{version}_{user_id}_{benchmark}_{period}"
            )
            cache.delete(f"portfolio_history_{user_id}_{benchmark}_{period}")


def _xtb_normalize_col(df: pd.DataFrame, keywords: List[str]) -> Optional[str]:
    """Find a column name in df that containing any of the keywords (case-insensitive)."""
    for col in df.columns:
        c_low = str(col).lower().strip()
        if any(kw in c_low for kw in keywords):
            return col
    return None


def _xtb_parse_date(val: Any) -> datetime.datetime:
    """Robust XTB date parsing."""
    if pd.isna(val):
        return timezone.now()
    try:
        dt = pd.to_datetime(val)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt)
        return dt
    except Exception:
        return timezone.now()


def parse_xtb_excel(user: User, file_obj) -> dict:
    """
    Parses XTB's Excel Export (Open Positions + Cash Operations).
    Calculates avg prices and total dividends.
    """
    try:
        all_sheets = pd.read_excel(file_obj, sheet_name=None)
    except Exception as e:
        raise ValidationError(f"Failed to read Excel file: {str(e)}")

    # 1. Process Open Positions to get currently held shares
    open_df = None
    for name, df in all_sheets.items():
        if any(kw in name.lower() for kw in ["open pos", "otvoren", "otevřen"]):
            open_df = df
            break

    if open_df is None:
        raise ValidationError("Could not find 'Open Positions' sheet in XTB export.")

    sym_col = _xtb_normalize_col(open_df, ["symbol", "instrument"])
    vol_col = _xtb_normalize_col(open_df, ["volume", "objem", "množstv"])
    price_col = _xtb_normalize_col(
        open_df, ["open price", "otváracia cena", "nákupní cena"]
    )
    time_col = _xtb_normalize_col(open_df, ["open time", "čas otvorenia", "otevření"])

    if not all([sym_col, vol_col, price_col]):
        raise ValidationError("Missing required columns in Open Positions sheet.")

    broker_account, _ = BrokerAccount.objects.get_or_create(user=user, broker="xtb")
    # Clear old data to start fresh
    PortfolioPosition.objects.filter(broker_account=broker_account).delete()
    Transaction.objects.filter(broker_account=broker_account).delete()

    active_symbols = {}
    for _, row in open_df.iterrows():
        raw_sym = str(row.get(sym_col, ""))
        if not raw_sym or raw_sym.lower() == "nan":
            continue

        # Strip suffix for consistency if needed, but here we usually keep it for mapping later
        # Actually, let's keep it and map it to YF in the selector/detailed view
        # But for storage, let's keep the raw XTB symbol.
        vol = float(_clean_decimal(row.get(vol_col)))
        price = float(_clean_decimal(row.get(price_col)))
        dt = _xtb_parse_date(row.get(time_col))

        if raw_sym not in active_symbols:
            active_symbols[raw_sym] = {
                "qty": 0.0,
                "total_cost": 0.0,
                "opened_at": dt,
                "divs": Decimal("0"),
            }

        active_symbols[raw_sym]["qty"] += vol
        active_symbols[raw_sym]["total_cost"] += vol * price
        if dt < active_symbols[raw_sym]["opened_at"]:
            active_symbols[raw_sym]["opened_at"] = dt

    # 2. Process Cash Operations for historical context and DIVIDENDS
    cash_df = None
    for name, df in all_sheets.items():
        if any(kw in name.lower() for kw in ["cash oper", "peňažné", "peněžní"]):
            cash_df = df
            break

    total_divs_map = {}
    to_create_txs = []

    if cash_df is not None:
        type_col = _xtb_normalize_col(cash_df, ["type", "typ"])
        # Instrument/Symbol might be different here
        c_sym_col = _xtb_normalize_col(cash_df, ["symbol", "instrument"])
        amt_col = _xtb_normalize_col(cash_df, ["amount", "suma", "čiastka", "suma"])
        c_time_col = _xtb_normalize_col(cash_df, ["time", "čas"])
        comment_col = _xtb_normalize_col(cash_df, ["comment", "komentár", "poznámka"])

        for _, row in cash_df.iterrows():
            t_val = str(row.get(type_col, "")).upper()
            sym = str(row.get(c_sym_col, ""))
            amt = _clean_decimal(row.get(amt_col))
            dt = _xtb_parse_date(row.get(c_time_col))
            comment = str(row.get(comment_col, ""))

            is_buy = "PURCHASE" in t_val or "NÁKUP" in t_val or "NAKUP" in t_val
            is_sell = "SALE" in t_val or "PREDAJ" in t_val or "PRODEJ" in t_val
            is_div = "DIVIDEN" in t_val or "DIVIDEN" in comment.upper()
            is_tax = "WITHHOLDING TAX" in t_val or "DAŇ" in t_val

            if not (is_buy or is_sell or is_div or is_tax):
                continue

            if not sym or sym.lower() == "nan":
                # Try to extract symbol from comment if missing
                match = re.search(r"([A-Z0-9\.\-]+)\s+", comment)
                if match:
                    sym = match.group(1)
                else:
                    continue

            tx_type = (
                Transaction.TransactionType.BUY
                if is_buy
                else Transaction.TransactionType.SELL
                if is_sell
                else Transaction.TransactionType.DIVIDEND
                if is_div
                else Transaction.TransactionType.TAX
            )

            # Create Transaction
            to_create_txs.append(
                Transaction(
                    broker_account=broker_account,
                    symbol=sym,
                    type=tx_type,
                    quantity=0,  # XTB doesn't always show qty in cash sheet
                    price=0,
                    amount=amt,
                    date=dt,
                )
            )

            # Track dividends for Positions
            if is_div or is_tax:
                total_divs_map[sym] = total_divs_map.get(sym, Decimal("0")) + amt

    # 3. Save everything
    if to_create_txs:
        Transaction.objects.bulk_create(to_create_txs)

    final_positions = []
    for sym, data in active_symbols.items():
        divs = total_divs_map.get(sym, Decimal("0"))
        final_positions.append(
            PortfolioPosition(
                broker_account=broker_account,
                symbol=sym,
                quantity=data["qty"],
                average_open_price=data["total_cost"] / data["qty"]
                if data["qty"] > 0
                else 0,
                total_dividends=divs,
                opened_at=data["opened_at"],
            )
        )

    if final_positions:
        PortfolioPosition.objects.bulk_create(final_positions)

    broker_account.last_synced_at = timezone.now()
    broker_account.save()
    _invalidate_portfolio_history_cache(user.id)

    return {"status": "success", "imported_positions": len(final_positions)}


# ─── XTB Services ──────────────────────────────────────────────────────────


def user_create(
    *, email: str, password: str, first_name: str = "", last_name: str = ""
) -> User:
    """Create a new user with standard validation."""
    if not email or not password:
        raise ValidationError("Email and password are required")
    if User.objects.filter(email=email).exists():
        raise ValidationError("Email already registered")

    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    return user


def user_authenticate(request, *, email: str, password: str) -> Optional[User]:
    """Authenticate and return user if valid."""
    user = authenticate(request, username=email, password=password)
    if not user:
        raise ValidationError("Invalid credentials")
    return user


# ─── Watchlist Services ───────────────────────────────────────────────────


def watchlist_create(*, user: User, symbol: str, name: str) -> Watchlist:
    """Add a stock to the user's watchlist."""
    if Watchlist.objects.filter(user=user, symbol=symbol).exists():
        raise ValidationError("Stock already in watchlist")

    return Watchlist.objects.create(user=user, symbol=symbol, name=name)


def watchlist_delete(*, user: User, symbol: str) -> None:
    """Remove a stock from the user's watchlist."""
    deleted, _ = Watchlist.objects.filter(user=user, symbol=symbol).delete()
    if not deleted:
        raise ValidationError("Watchlist item not found")


# ─── Finnhub Service ────────────────────────────────────────────────────────


class FinnhubClient:
    """Centralized client for Finnhub API calls, mapped to MarketStack formats."""

    def __init__(self):
        self.base_url = settings.FINNHUB_BASE_URL
        self.api_key = settings.FINNHUB_API_KEY

    def _clean_symbol_for_profile(self, symbol: str) -> str:
        """Strip exchange suffixes (e.g. .DE, .L, .PA) for Finnhub profile lookup."""
        return symbol.split(".")[0].upper()

    def _get(self, endpoint, params=None):
        if params is None:
            params = {}

        cache_key_params = dict(params)
        cache_key = f"finnhub_{endpoint}_{hashlib.md5(json.dumps(cache_key_params, sort_keys=True).encode()).hexdigest()}"

        cached_result = cache.get(cache_key)
        if cached_result:
            return cached_result

        params["token"] = self.api_key
        url = f"{self.base_url}/{endpoint}"
        response = requests.get(url, params=params, timeout=10)

        response.raise_for_status()
        data = response.json()

        if "error" in data:
            raise Exception(data["error"])

        cache.set(cache_key, data, 43200)
        return data

    def get_eod(self, symbols, date_from=None, date_to=None, limit=100):
        return self.get_eod_latest(symbols)

    def get_eod_latest(self, symbols):
        """Simulate MarketStack latest EOD for multiple symbols using Finnhub quotes + profiles."""
        symbols_list = [s.strip() for s in symbols.split(",") if s.strip()]

        def fetch_all(sym):
            quote = self._get("quote", {"symbol": sym})
            clean_sym = self._clean_symbol_for_profile(sym)
            profile = self._get("stock/profile2", {"symbol": clean_sym})
            return {
                "symbol": sym,
                "name": profile.get("name", sym),
                "logo": profile.get("logo", ""),
                "close": quote.get("c", 0),
                "open": quote.get("o", 0),
                "high": quote.get("h", 0),
                "low": quote.get("l", 0),
                "volume": 0,
            }

        with ThreadPoolExecutor(max_workers=min(len(symbols_list), 10)) as executor:
            data = list(executor.map(fetch_all, symbols_list))

        return {"data": data}

    def get_batch_quotes(self, symbols: List[str]):
        """Fetch quotes in parallel using Finnhub."""

        def fetch_q(s):
            try:
                return s, self._get("quote", {"symbol": s})
            except Exception:
                return s, {}

        with ThreadPoolExecutor(max_workers=min(len(symbols), 15)) as executor:
            return dict(executor.map(fetch_q, symbols))

    def get_batch_profiles(self, symbols: List[str]):
        """Fetch profiles in parallel using Finnhub."""

        def fetch_p(s):
            try:
                clean = self._clean_symbol_for_profile(s)
                return s, self._get("stock/profile2", {"symbol": clean})
            except Exception:
                return s, {}

        with ThreadPoolExecutor(max_workers=min(len(symbols), 15)) as executor:
            return dict(executor.map(fetch_p, symbols))

    def search_tickers(self, query, limit=10):
        res = self._get("search", {"q": query})
        mapped = []
        for item in res.get("result", [])[:limit]:
            mapped.append(
                {
                    "symbol": item.get("symbol"),
                    "name": item.get("description"),
                    "stock_exchange": {"acronym": item.get("type", "")},
                }
            )
        return {"data": mapped}

    def get_ticker_eod(self, symbol, period="1mo"):
        yf_symbol = symbol.split(".")[0] if symbol.endswith(".US") else symbol
        clean_sym = self._clean_symbol_for_profile(symbol)
        profile = self._get("stock/profile2", {"symbol": clean_sym})
        logo = profile.get("logo", "")

        cache_key = f"yfinance_{yf_symbol}_{period}"
        cached = cache.get(cache_key)
        if cached:
            cached["logo"] = logo
            cached["name"] = (
                profile.get("name")
                or (
                    yf.Ticker(yf_symbol).info.get("longName")
                    if not profile.get("name")
                    else None
                )
                or cached.get("name")
                or symbol
            )
            return cached

        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=period)
        if df.empty:
            return {"name": symbol, "symbol": symbol, "logo": logo, "eod": []}

        df = df.reset_index()
        eod_list = []
        for _, row in df.iterrows():
            eod_list.append(
                {
                    "date": row["Date"].isoformat(),
                    "close": float(row["Close"]),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "volume": int(row["Volume"] if not pd.isna(row["Volume"]) else 0),
                }
            )
        eod_list.reverse()

        ticker_name = profile.get("name")
        if not ticker_name:
            try:
                info = ticker.info
                ticker_name = info.get("longName") or info.get("shortName") or symbol
            except Exception:
                ticker_name = symbol

        result = {"name": ticker_name, "symbol": symbol, "logo": logo, "eod": eod_list}
        cache.set(cache_key, result, 43200)
        return result


# ─── Parser Helpers ───────────────────────────────────────────────────────


def _etoro_extract_symbol(details_val: str) -> Optional[str]:
    """Extract ticker symbol from eToro activity details string."""
    details_val = details_val.strip()
    # 1. Look for symbol in parentheses: e.g. "Company Name (BMW.DE)"
    paren_match = re.search(r"\(([A-Za-z0-9\.\-]+)\)", details_val)
    if paren_match:
        return paren_match.group(1).upper()

    # 2. Look for symbol before slash: e.g. "BMW.DE/EUR Buy"
    slash_match = re.search(r"([A-Za-z0-9\.\-]+)/", details_val)
    if slash_match:
        return slash_match.group(1).upper()

    # 3. Fallback: Take the last word if it looks like a ticker (all caps/dots)
    words = details_val.split()
    if words:
        last_word = words[-1].upper()
        if re.match(r"^[A-Z0-9\.\-]+$", last_word) and len(last_word) < 10:
            return last_word

    return None


def _etoro_parse_date(dt_val: Any) -> datetime.datetime:
    """Robust date parsing with future-date heuristic and timezone normalization."""
    if pd.isna(dt_val):
        return timezone.now()

    # 1. Try standard parsing
    dt_parsed = pd.to_datetime(dt_val, errors="coerce")

    # Ensure dt_parsed is aware for comparison
    if dt_parsed and timezone.is_naive(dt_parsed):
        dt_parsed = timezone.make_aware(dt_parsed)

    now = timezone.now()
    # 2. Heuristic: If date is in future (>1d), swap day/month
    if dt_parsed and dt_parsed > now + timedelta(days=1):
        try:
            alt_dt = pd.to_datetime(dt_val, dayfirst=True, errors="coerce")
            if alt_dt and timezone.is_naive(alt_dt):
                alt_dt = timezone.make_aware(alt_dt)
            if alt_dt and alt_dt <= now + timedelta(days=1):
                dt_parsed = alt_dt
        except Exception:
            pass

    return dt_parsed if (dt_parsed and not pd.isna(dt_parsed)) else now


def _etoro_process_activity_sheet(
    df: pd.DataFrame, broker_account: BrokerAccount
) -> int:
    """Process the Account Activity sheet and aggregate into positions/transactions."""
    # Column mapping
    type_col = next(
        (c for c in df.columns if str(c).lower().strip() in ["type", "typ"]), None
    )
    details_col = next(
        (c for c in df.columns if str(c).lower().strip() in ["details", "podrobnosti"]),
        None,
    )
    units_col = next(
        (
            c
            for c in df.columns
            if any(
                kw in str(c).lower() for kw in ["unit", "jednotk", "kusy", "množstv"]
            )
        ),
        None,
    )
    date_col = next(
        (c for c in df.columns if str(c).lower().strip() in ["date", "dátum"]), None
    )
    amount_col = next(
        (
            c
            for c in df.columns
            if any(kw in str(c).lower() for kw in ["amount", "suma", "vloze"])
        ),
        None,
    )

    # Clear old transactions
    Transaction.objects.filter(broker_account=broker_account).delete()

    raw_positions = {}
    to_create_txs = []

    for _, row in df.iterrows():
        t_val = str(row.get(type_col, "")).lower().strip()
        is_open = any(
            kw in t_val
            for kw in ["open", "otvor", "otevr", "nákup", "nakup", "kúpa", "buy"]
        )
        is_close = any(
            kw in t_val
            for kw in ["close", "zatvor", "zavre", "uzavre", "predaj", "sell"]
        )
        is_dividend = any(
            kw in t_val
            for kw in ["dividend", "dividenda", "payment from stock", "platba z akcií"]
        )
        is_tax = any(
            kw in t_val for kw in ["withholding tax", "zrážková daň", "daň zo zdroja"]
        )

        if not (is_open or is_close or is_dividend or is_tax):
            continue

        symbol = _etoro_extract_symbol(str(row.get(details_col, "")))
        if not symbol:
            continue

        # Cleanup eToro suffixes
        if symbol.endswith(".RTH"):
            symbol = symbol[:-4]

        try:
            units = abs(_clean_decimal(row.get(units_col)))
            amount_dec = _clean_decimal(row.get(amount_col))
            px_val = amount_dec / units if units > 0 else Decimal("0")
            dt_val = _etoro_parse_date(row.get(date_col))

            # Update aggregation
            if symbol not in raw_positions:
                raw_positions[symbol] = {
                    "volume": Decimal("0"),
                    "total_cost": Decimal("0"),
                    "opened_at": dt_val,
                    "dividends": Decimal("0"),
                }

            if is_open:
                raw_positions[symbol]["volume"] += units
                raw_positions[symbol]["total_cost"] += amount_dec
                if dt_val < raw_positions[symbol]["opened_at"]:
                    raw_positions[symbol]["opened_at"] = dt_val
            elif is_close:
                raw_positions[symbol]["volume"] -= units
            elif is_dividend or is_tax:
                # Dividends are usually positive, taxes negative in Amount column
                raw_positions[symbol]["dividends"] += amount_dec

            tx_type = (
                Transaction.TransactionType.BUY
                if is_open
                else Transaction.TransactionType.SELL
                if is_close
                else Transaction.TransactionType.DIVIDEND
                if is_dividend
                else Transaction.TransactionType.TAX
            )

            # Create transaction
            to_create_txs.append(
                Transaction(
                    broker_account=broker_account,
                    symbol=symbol,
                    type=tx_type,
                    quantity=units,
                    price=px_val,
                    amount=amount_dec,
                    date=dt_val,
                )
            )
        except (ValueError, TypeError):
            continue

    if to_create_txs:
        Transaction.objects.bulk_create(to_create_txs)

    # Finalize positions
    PortfolioPosition.objects.filter(broker_account=broker_account).delete()
    active_positions = []
    for symbol, data in raw_positions.items():
        if data["volume"] > 0.001:
            active_positions.append(
                PortfolioPosition(
                    broker_account=broker_account,
                    symbol=symbol,
                    quantity=data["volume"],
                    average_open_price=data["total_cost"] / data["volume"],
                    total_dividends=data.get("dividends", 0.0),
                    opened_at=data["opened_at"],
                )
            )

    if active_positions:
        PortfolioPosition.objects.bulk_create(active_positions)

    return len(active_positions)


def _etoro_process_summary_sheet(df: pd.DataFrame, account: BrokerAccount) -> int:
    """Process simpler Open Positions summary sheet."""
    action_col = next(
        (c for c in df.columns if str(c).lower().strip() in ["action", "akcia"]), None
    )
    units_col = next(
        (c for c in df.columns if str(c).lower().strip() in ["units", "jednotky"]), None
    )
    price_col = next(
        (
            c
            for c in df.columns
            if "open" in str(c).lower() or "otvárac" in str(c).lower()
        ),
        None,
    )

    if not action_col or not units_col:
        raise ValidationError(
            "Missing required Action or Units columns in the eToro dataset."
        )

    positions = {}
    for _, row in df.iterrows():
        action_val = str(row.get(action_col, "")).strip()
        if not action_val or action_val.lower() == "nan":
            continue

        match = re.search(
            r"(?:Buy|Sell|Kúpiť|Predať)\s+([A-Za-z0-9\.\-]+)", action_val, re.IGNORECASE
        )
        sym = match.group(1).upper() if match else action_val.split()[0].upper()

        try:
            vol = float(str(row.get(units_col, "0")).replace(",", "."))
            price = (
                float(str(row.get(price_col, "0")).replace(",", "."))
                if price_col
                else 0.0
            )
        except ValueError:
            continue

        if sym not in positions:
            positions[sym] = {"volume": 0.0, "total_cost": 0.0}
        positions[sym]["volume"] += vol
        positions[sym]["total_cost"] += vol * price

    PortfolioPosition.objects.filter(broker_account=account).delete()
    active = [
        PortfolioPosition(
            broker_account=account,
            symbol=sym,
            quantity=data["volume"],
            average_open_price=data["total_cost"] / data["volume"]
            if data["volume"] > 0
            else 0,
        )
        for sym, data in positions.items()
        if data["volume"] > 0.001
    ]

    if active:
        PortfolioPosition.objects.bulk_create(active)

    return len(active)


def parse_etoro_excel(user: User, file_obj) -> dict:
    """
    Parses eToro's Account Statement Excel structure.
    Delegates to specialized handlers for summary sheets or activity sheets.
    """
    all_sheets = pd.read_excel(file_obj, sheet_name=None, header=None)

    # 1. Look for Account Activity sheet (preferred for full history)
    for sheet_name, sheet_df in all_sheets.items():
        sn = sheet_name.lower()
        if any(kw in sn for kw in ["activity", "aktivit"]):
            for i in range(15):
                if i < len(sheet_df):
                    row_str = " ".join(
                        [str(x).lower() for x in sheet_df.iloc[i].fillna("").values]
                    )
                    # Fix: use individual any() checks instead of list comprehension for performance
                    has_type = any(kw in row_str for kw in ["type", "typ"])
                    has_details = any(
                        kw in row_str for kw in ["details", "podrobnosti"]
                    )
                    has_units = any(
                        kw in row_str for kw in ["unit", "jednotk", "kusy", "contracts"]
                    )

                    if has_type and has_details and has_units:
                        df_active = sheet_df.iloc[i + 1 :].copy()
                        df_active.columns = sheet_df.iloc[i].values
                        broker_account, _ = BrokerAccount.objects.get_or_create(
                            user=user, broker="etoro"
                        )
                        count = _etoro_process_activity_sheet(df_active, broker_account)

                        # Invalidate caches
                        broker_account.last_synced_at = timezone.now()
                        broker_account.save()
                        _invalidate_portfolio_history_cache(user.id)

                        return {"status": "success", "imported_positions": count}

    # 2. Look for Open Positions summary sheet (fallback)
    for sheet_name, sheet_df in all_sheets.items():
        sn = sheet_name.lower()
        if any(kw in sn for kw in ["open", "otvore", "otevřen", "pozíc", "pozic"]):
            for i in range(20):
                if i < len(sheet_df):
                    row_vals = [str(x).lower().strip() for x in sheet_df.iloc[i].values]
                    if any(kw in row_vals for kw in ["action", "akcia"]) and any(
                        kw in row_vals for kw in ["units", "jednotky"]
                    ):
                        df_summary = sheet_df.iloc[i + 1 :].copy()
                        df_summary.columns = sheet_df.iloc[i].values
                        account, _ = BrokerAccount.objects.get_or_create(
                            user=user, broker="etoro"
                        )
                        count = _etoro_process_summary_sheet(df_summary, account)

                        # Invalidate caches
                        account.last_synced_at = timezone.now()
                        account.save()
                        _invalidate_portfolio_history_cache(user.id)

                        return {"status": "success", "imported_positions": count}

    raise ValidationError(
        "Could not find an open positions sheet or account activity. Please check the file."
    )


def delete_user_portfolio(*, user: User):
    """
    Service to completely clear a user's portfolio and invalidate all chart caches.
    """
    # Delete everything related to the user's broker accounts (cascades to Positions and Transactions)
    BrokerAccount.objects.filter(user=user).delete()

    # Invalidate caches for all known versions and periods
    for v in range(10, 25):  # Clear a wide range of versioned keys
        for period in ["1mo", "3mo", "6mo", "1y", "all"]:
            cache.delete(f"portfolio_history_twr_v{v}_{user.id}_^GSPC_{period}")

    # Clear general cache
    cache.delete_many(
        [f"hydration_{s}" for s in ["*"]]
    )  # Redis pattern matching or just rely on v-bumping


# ─── TWR Performance Helpers ──────────────────────────────────────────


def _fetch_history_market_data(
    symbols: List[str], start_date: datetime.datetime
) -> pd.DataFrame:
    """Fetch and clean historical market data for all symbols and currencies."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        data = yf.download(symbols, start=start_date, progress=False)

    if data.empty:
        return pd.DataFrame()

    if isinstance(data.columns, pd.MultiIndex):
        close_data = data["Close"] if "Close" in data.columns else data["Adj Close"]
    else:
        c = "Close" if "Close" in data.columns else "Adj Close"
        close_data = pd.DataFrame({symbols[0]: data[c]})

    return close_data.bfill().ffill().fillna(0.0)


# ─── MWR / IRR Performance Helpers ─────────────────────────────────────


def _calculate_mwr_irr(cash_flows: pd.Series, final_value: float) -> float:
    """
    Calculate the Money-Weighted Return (IRR) for a series of cash flows.
    cash_flows: pd.Series with date indices and amount (positive for inflow/deposit)
    final_value: float (net market value at the end of the period)
    Returns: Annualized IRR (e.g. 0.05 for 5%)
    """
    if cash_flows.empty:
        return 0.0

    # Filter only non-zero cash flows
    cf_data = cash_flows[cash_flows != 0].copy()
    if cf_data.empty and final_value > 0:
        return 0.0  # Should not happen if there are assets

    # The MWR is r such that: sum(CF_i / (1+r)^t_i) = Value_end / (1+r)^T
    # t_i is the fraction of year from start to CF_i
    start_date = cf_data.index[0]
    end_date = cash_flows.index[-1]

    T_total = (end_date - start_date).days / 365.25
    if T_total < 1 / 365.25:  # Less than a day
        return 0.0

    # NPV function
    def npv(r):
        # r is annualized rate
        res = 0.0
        for dt, amt in cf_data.items():
            t = (dt - start_date).days / 365.25
            res += amt * ((1 + r) ** (T_total - t))
        return res - final_value

    # Binary search for IRR (simple and stable for typical ranges)
    low, high = -0.99, 50.0  # From -99% to 5000%
    for _ in range(50):
        mid = (low + high) / 2
        if npv(mid) > 0:
            high = mid
        else:
            low = mid

    # If the period is less than a year, we might want to NOT annualize
    # but the user likely wants the simple return if it's "All Time"
    # and "All Time" is often short. For now, return annualized.
    return (low + high) / 2


def get_portfolio_history(user: User, benchmark="^GSPC", period="6mo"):
    try:
        all_transactions = list(
            Transaction.objects.filter(broker_account__user=user).order_by("date")
        )
        if not all_transactions:
            return {"status": "success", "history": [], "benchmark_symbol": benchmark}

        # 1. Period Setup
        earliest_date = all_transactions[0].date
        now = timezone.now()
        period_map = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}
        period_start = now - timedelta(days=period_map.get(period, 365 * 20))
        actual_start = max(period_start, earliest_date)
        if hasattr(actual_start, "tzinfo") and actual_start.tzinfo:
            actual_start = actual_start.replace(tzinfo=None)

        cache_key = f"portfolio_history_twr_v21_{user.id}_{benchmark}_{period}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        # 2. Market Data Preparation
        all_symbols = list(set(tx.symbol for tx in all_transactions))
        if benchmark not in all_symbols:
            all_symbols.append(benchmark)

        def get_curr(s):
            s = s.upper()
            if any(s.endswith(sx) for sx in [".DE", ".F", ".PA", ".AS", ".MI", ".MC"]):
                return "EUR"
            if s.endswith(".L"):
                return "GBP"
            return "USD"

        symbol_currencies = {s: get_curr(s) for s in all_symbols}
        fetch_symbols = list(all_symbols)
        if "EUR" in symbol_currencies.values():
            fetch_symbols.append("EURUSD=X")
        if "GBP" in symbol_currencies.values():
            fetch_symbols.append("GBPUSD=X")

        inception_dt = (all_transactions[0].date - timedelta(days=10)).replace(
            tzinfo=None
        )
        close_data = _fetch_history_market_data(fetch_symbols, inception_dt)
        if close_data.empty:
            return {"error": "No historical data returned."}

        # 3. Daily Portfolio Reconstruction
        daily_value = pd.Series(0.0, index=close_data.index)
        daily_cf = pd.Series(0.0, index=close_data.index)
        daily_invested = pd.Series(0.0, index=close_data.index)

        holdings = {}
        last_prices = {}
        tx_ptr = 0
        total_invested_acc = 0.0
        income_cash_balance = 0.0

        for date in close_data.index:
            e_usd = (
                float(close_data.at[date, "EURUSD=X"])
                if "EURUSD=X" in close_data.columns
                else 1.0
            )
            g_usd = (
                float(close_data.at[date, "GBPUSD=X"])
                if "GBPUSD=X" in close_data.columns
                else 1.3
            )
            e_usd, g_usd = max(0.1, e_usd), max(0.1, g_usd)

            while (
                tx_ptr < len(all_transactions)
                and all_transactions[tx_ptr].date.date() <= date.date()
            ):
                tx = all_transactions[tx_ptr]
                s, q, p = tx.symbol, float(tx.quantity), float(tx.price)
                amt = float(tx.amount) if tx.amount else (q * p)

                curr = symbol_currencies.get(s, "USD")
                amt_usd = (
                    amt * e_usd
                    if curr == "EUR"
                    else (amt * g_usd if curr == "GBP" else amt)
                )

                tx_type = tx.type.lower()

                if tx_type == Transaction.TransactionType.BUY:
                    holdings[s] = holdings.get(s, 0.0) + q
                    daily_cf[date] += amt_usd
                    total_invested_acc += amt_usd
                elif tx_type == Transaction.TransactionType.SELL:
                    holdings[s] = max(0.0, holdings.get(s, 0.0) - q)
                    daily_cf[date] -= amt_usd
                    total_invested_acc = max(0.0, total_invested_acc - amt_usd)
                elif tx_type in {
                    Transaction.TransactionType.DIVIDEND,
                    Transaction.TransactionType.TAX,
                }:
                    income_cash_balance += amt_usd
                tx_ptr += 1

            daily_invested[date] = total_invested_acc

            # Valuation with last_prices fallback
            v_usd = 0.0
            for s, q in holdings.items():
                if q > 0.001:
                    try:
                        curr = symbol_currencies.get(s, "USD")
                        px_raw = close_data.at[date, s]

                        # Use last known price if current is NaN or 0
                        if pd.isna(px_raw) or px_raw <= 0:
                            px = last_prices.get(s, 0.0)
                        else:
                            px = float(px_raw)
                            last_prices[s] = px

                        px_usd = px * (
                            e_usd
                            if curr == "EUR"
                            else (g_usd if curr == "GBP" else 1.0)
                        )
                        v_usd += px_usd * q
                    except Exception:
                        v_usd += last_prices.get(s, 0.0) * q

            # If still 0 but we have invested, prevent poisoning by using previous value or invested amount
            if v_usd <= 0 and total_invested_acc > 0:
                v_usd = (
                    daily_value.iloc[daily_value.index.get_loc(date) - 1]
                    if daily_value.index.get_loc(date) > 0
                    else total_invested_acc
                )

            daily_value[date] = v_usd + income_cash_balance

        # 4. TWR Calculation (Still useful for Chart comparison)
        twr_multiplier = pd.Series(1.0, index=daily_value.index)
        mult, prev_v = 1.0, 0.0
        for i, dt in enumerate(daily_value.index):
            v, cf = daily_value[dt], daily_cf[dt]
            if i > 0 and (prev_v + cf) > 0.1:
                ret = v / (prev_v + cf)
                if 0.1 < ret < 10.0:
                    mult *= ret
            prev_v = v
            twr_multiplier[dt] = mult

        # 5. Normalization for View
        a_start_ts = pd.Timestamp(actual_start)
        chart_idx = close_data.index[close_data.index >= a_start_ts]
        if len(chart_idx) == 0:
            return {"status": "success", "history": []}

        pre_mask = close_data.index < a_start_ts
        base_twr = (
            twr_multiplier[pre_mask].iloc[-1]
            if any(pre_mask)
            else twr_multiplier.iloc[0]
        )
        base_bench = (
            close_data[benchmark][pre_mask].iloc[-1]
            if any(pre_mask) and benchmark in close_data.columns
            else (
                close_data[benchmark].iloc[0]
                if benchmark in close_data.columns
                else 1.0
            )
        )
        base_twr, base_bench = max(0.0001, base_twr), max(0.0001, base_bench)

        history = []
        p_val_start = daily_value[chart_idx[0]]
        b_val_start = (
            float(close_data[benchmark][chart_idx[0]])
            if benchmark in close_data.columns
            else 1.0
        )

        for d in chart_idx:
            p_val = float(daily_value[d])
            b_val_curr = (
                float(close_data[benchmark][d])
                if benchmark in close_data.columns
                else 1.0
            )
            p_idx_val = float(twr_multiplier[d])

            history.append(
                {
                    "date": d.strftime("%Y-%m-%d"),
                    "portfolio_value": round(p_val, 2),
                    "benchmark_value": round(
                        float(p_val_start * (b_val_curr / b_val_start)), 2
                    )
                    if b_val_start > 0
                    else 0,
                    "portfolio_pct": round((p_idx_val / base_twr - 1) * 100, 2)
                    if base_twr > 0
                    else 0,
                    "benchmark_pct": round((b_val_curr / base_bench - 1) * 100, 2)
                    if (benchmark in close_data.columns and base_bench > 0)
                    else 0,
                }
            )

        # Summary
        curr, prev = (
            close_data.index[-1],
            close_data.index[-2] if len(close_data) > 1 else close_data.index[-1],
        )
        summary = {
            "portfolio": {
                "total_value": float(daily_value[curr]),
                "total_invested": float(daily_invested[curr]),
                "today_change_abs": float(
                    daily_value[curr] - (daily_value[prev] + daily_cf[curr])
                ),
                "today_change_pct": float(
                    (twr_multiplier[curr] / twr_multiplier[prev] - 1) * 100
                )
                if (len(twr_multiplier) > 1 and twr_multiplier[prev] > 0.001)
                else 0,
                "all_time_pct": float(
                    (daily_value[curr] / daily_invested[curr] - 1) * 100
                )
                if daily_invested[curr] > 1.0
                else 0,
                "mwr_annualized": float(
                    _calculate_mwr_irr(daily_cf, daily_value[curr]) * 100
                ),
                "simple_roi_pct": float(
                    (daily_value[curr] / daily_invested[curr] - 1) * 100
                )
                if daily_invested[curr] > 1.0
                else 0,
            },
            "benchmark": {
                "symbol": benchmark,
                "today_change_pct": float(
                    (close_data[benchmark][curr] / close_data[benchmark][prev] - 1)
                    * 100
                )
                if (
                    benchmark in close_data.columns
                    and len(close_data) > 1
                    and close_data[benchmark][prev] > 0
                )
                else 0,
                "all_time_pct": float(
                    (close_data[benchmark][curr] / close_data[benchmark].iloc[0] - 1)
                    * 100
                )
                if (
                    benchmark in close_data.columns
                    and close_data[benchmark].iloc[0] > 0
                )
                else 0,
            },
        }

        res = {
            "status": "success",
            "history": history,
            "summary": summary,
            "benchmark_symbol": benchmark,
        }
        cache.set(cache_key, res, 3600)
        return res
    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}
