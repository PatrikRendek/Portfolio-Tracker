from django.contrib import admin
from .models import Watchlist


@admin.register(Watchlist)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ("user", "symbol", "name", "added_at")
    list_filter = ("symbol",)
    search_fields = ("user__email", "symbol", "name")
