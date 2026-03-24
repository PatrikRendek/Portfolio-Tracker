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
    Uses batch fetching to avoid production timeouts and OOM.
    """
    positions = (
        PortfolioPosition.objects.filter(broker_account__user=user)
        .select_related("broker_account")
        .order_by("symbol")
    )
    if not positions:
        return []

    client = FinnhubClient()
    symbols = list(set(pos.symbol for pos in positions))

    # 1. Batch fetch quotes
    quotes_map = client.get_batch_quotes(symbols)

    # 2. Batch fetch profiles (only for those not in cache to be super safe)
    symbols_needing_profile = []
    profiles_map = {}
    for s in symbols:
        p_cache_key = f"stock_profile_v18_{s}"
        cached_p = cache.get(p_cache_key)
        if cached_p:
            profiles_map[s] = cached_p
        else:
            symbols_needing_profile.append(s)

    if symbols_needing_profile:
        new_profiles = client.get_batch_profiles(symbols_needing_profile)
        for s, p_data in new_profiles.items():
            if p_data:
                cache.set(f"stock_profile_v18_{s}", p_data, 43200)
                profiles_map[s] = p_data

    total_market_value = 0
    raw_items = []

    for pos in positions:
        symbol = pos.symbol
        quote = quotes_map.get(symbol, {})
        profile = profiles_map.get(symbol, {})

        curr_price = float(quote.get("c", 0)) or float(pos.average_open_price)
        prev_close = float(quote.get("pc", 0)) or curr_price

        market_value = curr_price * float(pos.quantity)
        total_market_value += market_value

        logo = profile.get("logo", "")
        name = profile.get("name", symbol)

        avg_cost = float(pos.average_open_price)
        raw_items.append(
            {
                "symbol": symbol,
                "name": name,
                "logo": logo,
                "quantity": float(pos.quantity),
                "avg_cost": avg_cost,
                "total_dividends": float(pos.total_dividends),
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
                "broker": pos.broker_account.broker
                if pos.broker_account
                else "Unknown",
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
