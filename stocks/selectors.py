from django.db.models import QuerySet
from django.contrib.auth.models import User
from django.core.cache import cache
from .models import Watchlist, PortfolioPosition
from .services import FinnhubClient


def watchlist_list(*, user: User) -> QuerySet[Watchlist]:
    """Return all watchlist items for a specific user."""
    return Watchlist.objects.filter(user=user).order_by("-added_at")


def portfolio_positions_list(*, user: User) -> QuerySet:
    """Return all portfolio positions belonging to a specific user."""
    return PortfolioPosition.objects.filter(broker_account__user=user)


def get_portfolio_positions_detailed(user: User) -> list:
    """
    Calculates detailed metrics (market value, gains, allocation) for a user's portfolio.
    Encapsulates logic formerly in PortfolioPositionsApi.
    """
    positions = (
        PortfolioPosition.objects.filter(broker_account__user=user)
        .select_related("broker_account")
        .order_by("symbol")
    )

    total_market_value = 0
    raw_items = []
    client = FinnhubClient()

    for pos in positions:
        symbol = pos.symbol
        quote = {}
        try:
            q_cache_key = f"quote_{symbol}"
            quote = cache.get(q_cache_key)
            if not quote:
                quote = client._get("quote", {"symbol": symbol})
                cache.set(q_cache_key, quote, 300)
        except Exception:
            pass

        curr_price = float((quote or {}).get("c", 0)) or float(pos.average_open_price)
        prev_close = float((quote or {}).get("pc", 0)) or curr_price

        market_value = curr_price * float(pos.quantity)
        total_market_value += market_value

        p_cache_key = f"stock_profile_v18_{symbol}"
        profile_data = cache.get(p_cache_key)
        if not profile_data:
            logo = ""
            name = symbol
            try:
                p = client._get("stock/profile2", {"symbol": symbol}) or {}
                logo = p.get("logo", "")
                name = p.get("name", "")
                if not logo and name:
                    brand = name.split()[0].lower().replace(",", "").replace(".", "")
                    known = {
                        "bmw": "bmw.com",
                        "porsche": "porsche.com",
                        "mercedes": "mercedes-benz.com",
                        "volkswagen": "vw.com",
                    }
                    domain = known.get(brand, f"{brand}.com")
                    logo = f"https://logo.clearbit.com/{domain}"
                profile_data = {"logo": logo, "name": name or symbol}
                cache.set(p_cache_key, profile_data, 86400 * 30)
            except Exception:
                profile_data = {"logo": "", "name": symbol}

        if not profile_data:
            profile_data = {"logo": "", "name": symbol}

        avg_cost = float(pos.average_open_price)
        raw_items.append(
            {
                "symbol": symbol,
                "name": profile_data["name"],
                "logo": profile_data["logo"],
                "quantity": float(pos.quantity),
                "avg_cost": avg_cost,
                "curr_price": curr_price,
                "market_value": market_value,
                "day_gain_abs": (curr_price - prev_close) * float(pos.quantity),
                "day_gain_pct": ((curr_price / prev_close) - 1) * 100
                if prev_close > 0
                else 0,
                "unrealized_gain_abs": (curr_price - avg_cost) * float(pos.quantity),
                "unrealized_gain_pct": ((curr_price / avg_cost) - 1) * 100
                if avg_cost > 0
                else 0,
                "cost_basis": avg_cost * float(pos.quantity),
                "broker": pos.broker_account.broker,
            }
        )

    # Calculate allocations
    for item in raw_items:
        item["allocation_pct"] = (
            (item["market_value"] / total_market_value * 100)
            if total_market_value > 0
            else 0
        )

    return raw_items
