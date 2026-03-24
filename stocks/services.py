import hashlib
import json
import re
import datetime
import traceback
import warnings
from typing import Optional, List, Any
from datetime import timedelta

import requests
import pandas as pd
import yfinance as yf
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.utils import timezone
from django.core.cache import cache
from rest_framework.exceptions import ValidationError

from .models import Watchlist, BrokerAccount, PortfolioPosition, Transaction


# ─── Auth Services ────────────────────────────────────────────────────────


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

        # Finnhub returns 200 even for errors sometimes, but raise for standard HTTP errors First
        response.raise_for_status()
        data = response.json()

        if "error" in data:
            raise Exception(data["error"])

        cache.set(cache_key, data, 43200)
        return data

    def get_eod(self, symbols, date_from=None, date_to=None, limit=100):
        # Fallback for unused bulk eod method
        return self.get_eod_latest(symbols)

    def get_eod_latest(self, symbols):
        """Simulate MarketStack latest EOD for multiple symbols using Finnhub quotes + profiles for logos."""
        symbols_list = [s.strip() for s in symbols.split(",") if s.strip()]
        data = []
        for sym in symbols_list:
            quote = self._get("quote", {"symbol": sym})
            clean_sym = self._clean_symbol_for_profile(sym)
            profile = self._get("stock/profile2", {"symbol": clean_sym})
            data.append(
                {
                    "symbol": sym,
                    "name": profile.get("name", sym),
                    "logo": profile.get("logo", ""),
                    "close": quote.get("c", 0),
                    "open": quote.get("o", 0),
                    "high": quote.get("h", 0),
                    "low": quote.get("l", 0),
                    "volume": 0,  # Finnhub quote lacks volume
                }
            )
        return {"data": data}

    def search_tickers(self, query, limit=10):
        """Map Finnhub search to MarketStack format."""
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
        """Use yfinance for historical chart data as Finnhub limits it."""

        # Strip internal suffixes like .US if present for standard yfinance lookups
        yf_symbol = symbol.split(".")[0] if symbol.endswith(".US") else symbol

        # We need the logo here too
        clean_sym = self._clean_symbol_for_profile(symbol)
        profile = self._get("stock/profile2", {"symbol": clean_sym})
        logo = profile.get("logo", "")

        cache_key = f"yfinance_{yf_symbol}_{period}"
        cached = cache.get(cache_key)
        if cached:
            cached["logo"] = logo
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

        # Reverse to descending order
        eod_list.reverse()

        result = {
            "name": symbol,
            "symbol": symbol,
            "logo": logo,
            "eod": eod_list,
        }

        cache.set(cache_key, result, 43200)
        return result


# ─── Portfolio Services ───────────────────────────────────────────────────


def map_xtb_symbol_to_yf(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if not symbol or symbol == "NAN":
        return ""

    # Strip any numeric suffixes like _9 (XTB fractional share markers)
    symbol = re.sub(r"_\d+$", "", symbol)

    # Handle XTB specific mappings
    if symbol.endswith(".US"):
        return symbol[:-3]
    if symbol.endswith(".UK"):
        return symbol[:-3] + ".L"
    if symbol.endswith(".FR"):
        return symbol[:-3] + ".PA"
    if symbol.endswith(".PL"):
        return symbol[:-3] + ".WA"
    if symbol.endswith(".ES"):
        return symbol[:-3] + ".MC"
    if symbol.endswith(".NL"):
        return symbol[:-3] + ".AS"
    if symbol.endswith(".IT"):
        return symbol[:-3] + ".MI"
    if symbol.endswith(".DE"):
        return symbol  # YFinance supports .DE

    # Common ETF mappings
    if "CSPX" in symbol:
        return "CSPX.L"
    if "SXR8" in symbol:
        return "SXR8.DE"

    return symbol


def parse_xtb_excel(user: User, file_obj) -> dict:
    """
    Parses XTB's Excel exports by looking for 'Open Positions' or 'Cash Operations'.
    """
    all_sheets = pd.read_excel(file_obj, sheet_name=None, header=None)
    account, _ = BrokerAccount.objects.get_or_create(
        user=user, broker=BrokerAccount.BrokerChoices.XTB
    )

    all_txs = []
    open_positions_data = {}
    history_positions_data = {}
    found_open_positions_sheet = False

    for sheet_name, sheet_df in all_sheets.items():
        for i in range(15):
            if i >= len(sheet_df):
                break
            row_vals = [str(x).lower().strip() for x in sheet_df.iloc[i].values]
            symbol_keywords = [
                "symbol",
                "instrument",
                "inštrument",
                "inštrument/pozícia",
                "instrument/position",
                "pozícia",
                "pozicia",
            ]
            volume_keywords = ["volume", "objem", "quantity", "units", "shares"]
            price_keywords = [
                "price",
                "open price",
                "cena",
                "otváracia cena",
                "otvaracia cena",
                "opening price",
            ]
            date_keywords = [
                "time",
                "dátum",
                "datum",
                "open time",
                "period",
                "čas",
                "cas",
            ]

            has_vol = any(kw in row_vals for kw in volume_keywords)
            has_sym = any(any(kw in val for kw in symbol_keywords) for val in row_vals)

            # Additional check to exclude "Closed Positions" sheet from being treated as "Open"
            closed_keywords = [
                "close price",
                "close time",
                "zisk",
                "profit",
                "cena uzatvorenia",
                "čas uzatvorenia",
            ]
            is_closed = any(
                any(kw in val for kw in closed_keywords) for val in row_vals
            )

            # Sheet name hints
            sn_lower = sheet_name.lower()
            is_closed_sheet = (
                "closed" in sn_lower or "uzatvoren" in sn_lower or "uzavret" in sn_lower
            )

            if has_vol and has_sym and not is_closed and not is_closed_sheet:
                found_open_positions_sheet = True
                df_clean = sheet_df.iloc[i + 1 :].copy()
                df_clean.columns = sheet_df.iloc[i].values

                symbol_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(kw in str(c).lower().strip() for kw in symbol_keywords)
                    ),
                    None,
                )
                vol_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(kw in str(c).lower().strip() for kw in volume_keywords)
                    ),
                    None,
                )
                price_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(kw in str(c).lower().strip() for kw in price_keywords)
                    ),
                    None,
                )
                date_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(kw in str(c).lower() for kw in date_keywords)
                    ),
                    None,
                )

                if symbol_col and vol_col:
                    for _, row in df_clean.iterrows():
                        sym_raw = str(row.get(symbol_col, "")).strip()
                        sym = map_xtb_symbol_to_yf(sym_raw)
                        if not sym or sym.lower() == "nan":
                            continue

                        try:
                            # Handle spaces, non-breaking spaces, and commas
                            vol_raw = (
                                str(row.get(vol_col, "0"))
                                .replace("\xa0", "")
                                .replace(" ", "")
                                .replace(",", ".")
                            )
                            # Handle cases where multiple dots might exist if . was thousands separator
                            if vol_raw.count(".") > 1:
                                last_dot = vol_raw.rfind(".")
                                vol_raw = (
                                    vol_raw[:last_dot].replace(".", "")
                                    + vol_raw[last_dot:]
                                )
                            vol = float(vol_raw)

                            price_raw = (
                                str(row.get(price_col, "0"))
                                .replace("\xa0", "")
                                .replace(" ", "")
                                .replace(",", ".")
                                if price_col
                                else "0"
                            )
                            if price_raw.count(".") > 1:
                                last_dot = price_raw.rfind(".")
                                price_raw = (
                                    price_raw[:last_dot].replace(".", "")
                                    + price_raw[last_dot:]
                                )
                            price = float(price_raw)

                            dt_val = (
                                pd.to_datetime(row.get(date_col), errors="coerce")
                                if not pd.isna(row.get(date_col))
                                else timezone.now()
                            )
                            if pd.isna(dt_val):
                                dt_val = timezone.now()
                            if timezone.is_naive(dt_val):
                                dt_val = timezone.make_aware(dt_val)

                            if vol > 0.0001:
                                # Aggregate current holdings from this sheet
                                if sym not in open_positions_data:
                                    open_positions_data[sym] = {
                                        "quantity": 0.0,
                                        "total_cost": 0.0,
                                        "date": dt_val,
                                    }

                                open_positions_data[sym]["quantity"] += vol
                                open_positions_data[sym]["total_cost"] += vol * price
                                # Keep earliest date for opened_at
                                if dt_val < open_positions_data[sym]["date"]:
                                    open_positions_data[sym]["date"] = dt_val

                                all_txs.append(
                                    Transaction(
                                        broker_account=account,
                                        symbol=sym,
                                        type="buy",
                                        quantity=vol,
                                        price=price,
                                        amount=vol * price,
                                        date=dt_val,
                                    )
                                )
                        except Exception:
                            continue
                    break  # Found the main sheet, move to next sheet

            # --- Cash Operations (History) ---
            # Use broad checks for "comment/komentár" and "instrument"
            if any(
                kw in val
                for val in row_vals
                for kw in ["comment", "komentár", "pozna", "poznámka"]
            ) and any(
                kw in val
                for val in row_vals
                for kw in ["instrument", "inštrument", "symbol"]
            ):
                df_clean = sheet_df.iloc[i + 1 :].copy()
                df_clean.columns = sheet_df.iloc[i].values

                comment_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(
                            kw in str(c).lower().strip()
                            for kw in ["comment", "komentár", "pozna", "poznámka"]
                        )
                    ),
                    None,
                )
                instr_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(
                            kw in str(c).lower().strip()
                            for kw in ["instrument", "inštrument", "symbol"]
                        )
                    ),
                    None,
                )
                time_col = next(
                    (
                        c
                        for c in df_clean.columns
                        if any(
                            kw in str(c).lower()
                            for kw in [
                                "time",
                                "dátum",
                                "datum",
                                "time of operation",
                                "čas",
                                "cas",
                            ]
                        )
                    ),
                    None,
                )

                for _, row in df_clean.iterrows():
                    instr_raw = str(row.get(instr_col, "")).strip()
                    instr = map_xtb_symbol_to_yf(instr_raw)
                    if not instr:
                        continue

                    comment = str(row.get(comment_col, ""))
                    # Clean "..." and other junk from comment
                    comment = comment.replace("...", "").strip()

                    dt_val = (
                        pd.to_datetime(row.get(time_col), errors="coerce")
                        if not pd.isna(row.get(time_col))
                        else timezone.now()
                    )
                    if pd.isna(dt_val):
                        dt_val = timezone.now()
                    if timezone.is_naive(dt_val):
                        dt_val = timezone.make_aware(dt_val)

                    # Robust regex for "OPEN BUY 10 @ 150,00"
                    # We normalize comment decimals to . for regex
                    comment_norm = comment.replace(",", ".")
                    m_open = re.search(
                        r"OPEN (BUY|SELL) ([\d\.\s]+) @ ([\d\.\s]+)", comment_norm
                    )
                    m_close = re.search(
                        r"CLOSE (BUY|SELL) ([\d\.\s]+)(?:/[\d\.\s]+)? @ ([\d\.\s]+)",
                        comment_norm,
                    )

                    if m_open:
                        act, vol_s, pr_s = m_open.groups()
                        try:
                            v = float(vol_s.replace(" ", ""))
                            p = float(pr_s.replace(" ", ""))
                            all_txs.append(
                                Transaction(
                                    broker_account=account,
                                    symbol=instr,
                                    type="buy" if act == "BUY" else "sell",
                                    quantity=v,
                                    price=p,
                                    amount=v * p,
                                    date=dt_val,
                                )
                            )
                            if instr not in history_positions_data:
                                history_positions_data[instr] = {
                                    "vol_acc": 0.0,
                                    "cost_acc": 0.0,
                                    "date": dt_val,
                                }
                            history_positions_data[instr]["vol_acc"] += (
                                v if act == "BUY" else -v
                            )
                            history_positions_data[instr]["cost_acc"] += (
                                (v * p) if act == "BUY" else -(v * p)
                            )
                            if dt_val < history_positions_data[instr]["date"]:
                                history_positions_data[instr]["date"] = dt_val
                        except Exception:
                            pass
                    elif m_close:
                        act, vol_s, pr_s = m_close.groups()
                        try:
                            v = float(vol_s.replace(" ", ""))
                            p = float(pr_s.replace(" ", ""))
                            all_txs.append(
                                Transaction(
                                    broker_account=account,
                                    symbol=instr,
                                    type="sell" if act == "BUY" else "buy",
                                    quantity=v,
                                    price=p,
                                    amount=v * p,
                                    date=dt_val,
                                )
                            )
                            if instr not in history_positions_data:
                                history_positions_data[instr] = {
                                    "vol_acc": 0.0,
                                    "cost_acc": 0.0,
                                    "date": dt_val,
                                }
                            history_positions_data[instr]["vol_acc"] -= (
                                v if act == "BUY" else -v
                            )
                            if dt_val < history_positions_data[instr]["date"]:
                                history_positions_data[instr]["date"] = dt_val
                        except Exception:
                            pass
                break

    # 2. Final Sanitize & Save
    if not found_open_positions_sheet:
        raise ValidationError(
            "This XTB export does not contain an 'Open Positions' sheet. It only contains 'Cash Operations' or 'Closed Positions', so the import would only capture trades from the selected period rather than the full current portfolio state. Please export a report that includes open positions, or import your complete history from the account's inception."
        )

    PortfolioPosition.objects.filter(broker_account=account).delete()
    Transaction.objects.filter(broker_account=account).delete()

    positions_data = open_positions_data or history_positions_data
    final_positions = []
    for sym, d in positions_data.items():
        if "total_cost" in d:
            qty = d["quantity"]
            cost = d["total_cost"] / qty if qty != 0 else 0
        else:
            qty = d.get("vol_acc", 0)
            cost = d.get("cost_acc", 0) / qty if qty != 0 else 0

        if abs(qty) > 0.0001:
            final_positions.append(
                PortfolioPosition(
                    broker_account=account,
                    symbol=sym,
                    quantity=abs(qty),
                    average_open_price=abs(cost),
                    opened_at=d["date"],
                )
            )

    if final_positions:
        PortfolioPosition.objects.bulk_create(final_positions)
    if all_txs:
        Transaction.objects.bulk_create(all_txs)

    account.last_synced_at = timezone.now()
    account.save()

    # Cache invalidation
    for p in ["1mo", "3mo", "6mo", "1y", "all"]:
        cache.delete(f"portfolio_history_{user.id}_^GSPC_{p}")

    return {"status": "success", "imported_positions": len(final_positions)}


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

        if not (is_open or is_close):
            continue

        symbol = _etoro_extract_symbol(str(row.get(details_col, "")))
        if not symbol:
            continue

        # Cleanup eToro suffixes
        if symbol.endswith(".RTH"):
            symbol = symbol[:-4]

        try:
            u_val = str(row.get(units_col, "0")).replace(",", ".").replace(" ", "")
            units = abs(float(u_val))
            a_val = str(row.get(amount_col, "0")).replace(",", ".").replace(" ", "")
            px_val = float(a_val) / units if units > 0 else 0.0
            dt_val = _etoro_parse_date(row.get(date_col))

            # Update aggregation
            if symbol not in raw_positions:
                raw_positions[symbol] = {
                    "volume": 0.0,
                    "total_cost": 0.0,
                    "opened_at": dt_val,
                }

            if is_open:
                raw_positions[symbol]["volume"] += units
                raw_positions[symbol]["total_cost"] += float(a_val)
                if dt_val < raw_positions[symbol]["opened_at"]:
                    raw_positions[symbol]["opened_at"] = dt_val
            else:
                raw_positions[symbol]["volume"] -= units

            # Create transaction
            to_create_txs.append(
                Transaction(
                    broker_account=broker_account,
                    symbol=symbol,
                    type="buy" if is_open else "sell",
                    quantity=units,
                    price=px_val,
                    amount=float(a_val),
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
                        for p in ["1mo", "3mo", "6mo", "1y", "20y"]:
                            cache.delete(f"portfolio_history_{user.id}_^GSPC_{p}")

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
                        for p in ["1mo", "3mo", "6mo", "1y", "20y"]:
                            cache.delete(f"portfolio_history_{user.id}_^GSPC_{p}")

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

        cache_key = f"portfolio_history_twr_v20_{user.id}_{benchmark}_{period}"
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

                if tx.type.lower() == "buy":
                    holdings[s] = holdings.get(s, 0.0) + q
                    daily_cf[date] += amt_usd
                    total_invested_acc += amt_usd
                else:
                    holdings[s] = max(0.0, holdings.get(s, 0.0) - q)
                    daily_cf[date] -= amt_usd
                    total_invested_acc = max(0.0, total_invested_acc - amt_usd)
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

            daily_value[date] = v_usd

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
