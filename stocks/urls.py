from django.urls import path
from . import views

urlpatterns = [
    # Stock data (MarketStack proxy)
    path("stocks/eod/", views.StockEodApi.as_view(), name="stock-eod"),
    path(
        "stocks/eod/latest/", views.StockEodLatestApi.as_view(), name="stock-eod-latest"
    ),
    path("stocks/search/", views.StockSearchApi.as_view(), name="stock-search"),
    path("stocks/<str:symbol>/", views.StockDetailApi.as_view(), name="stock-detail"),
    # Auth
    path("auth/register/", views.UserRegisterApi.as_view(), name="register"),
    path("auth/login/", views.UserLoginApi.as_view(), name="login"),
    path("auth/logout/", views.UserLogoutApi.as_view(), name="logout"),
    path("auth/user/", views.UserCurrentApi.as_view(), name="current-user"),
    # Watchlist
    path(
        "watchlist/",
        views.WatchlistListCreateApi.as_view(),
        name="watchlist-list-create",
    ),
    path(
        "watchlist/<int:pk_or_symbol>/",
        views.WatchlistDeleteApi.as_view(),
        name="watchlist-delete",
    ),
    # Portfolio
    path(
        "portfolio/positions/",
        views.PortfolioPositionsApi.as_view(),
        name="portfolio-positions",
    ),
    path(
        "portfolio/transactions/<str:symbol>/",
        views.StockTransactionsApi.as_view(),
        name="stock-transactions",
    ),
    path(
        "portfolio/history/",
        views.PortfolioHistoryApi.as_view(),
        name="portfolio-history",
    ),
    path(
        "portfolio/xtb/upload/",
        views.PortfolioUploadXTBApi.as_view(),
        name="portfolio-xtb-upload",
    ),
    path(
        "portfolio/etoro/upload/",
        views.PortfolioUploadEtoroApi.as_view(),
        name="portfolio-etoro-upload",
    ),
]
