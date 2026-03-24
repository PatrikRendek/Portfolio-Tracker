from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _


class Watchlist(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="watchlist",
    )
    symbol = models.CharField(max_length=20)
    name = models.CharField(max_length=255, blank=True, default="")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "symbol")
        ordering = ["-added_at"]

    def __str__(self):
        return f"{self.user.email} - {self.symbol}"


class BrokerAccount(models.Model):
    class BrokerChoices(models.TextChoices):
        ETORO = "etoro", _("eToro")
        XTB = "xtb", _("XTB")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="broker_accounts",
    )
    broker = models.CharField(max_length=20, choices=BrokerChoices.choices)
    credentials = models.JSONField(
        blank=True,
        null=True,
        help_text="Store API keys or tokens. For XTB CSV imports, this can be empty.",
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "broker")

    def __str__(self):
        return f"{self.user.email} - {self.get_broker_display()}"


class PortfolioPosition(models.Model):
    broker_account = models.ForeignKey(
        BrokerAccount,
        on_delete=models.CASCADE,
        related_name="positions",
    )
    symbol = models.CharField(max_length=50)
    asset_class = models.CharField(max_length=50, blank=True, default="stock")
    quantity = models.FloatField(default=0.0)
    average_open_price = models.FloatField(default=0.0)
    current_price = models.FloatField(default=0.0, blank=True, null=True)
    currency = models.CharField(max_length=10, default="USD")
    opened_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("broker_account", "symbol")

    def __str__(self):
        return f"{self.symbol} ({self.quantity}) - {self.broker_account.broker}"


class Transaction(models.Model):
    class TransactionType(models.TextChoices):
        BUY = "buy", _("Buy")
        SELL = "sell", _("Sell")

    broker_account = models.ForeignKey(
        BrokerAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    symbol = models.CharField(max_length=50)
    type = models.CharField(max_length=10, choices=TransactionType.choices)
    quantity = models.FloatField()
    price = models.FloatField()
    amount = models.FloatField(
        help_text="Total value of transaction (usually qty * price)"
    )
    date = models.DateTimeField()
    external_id = models.CharField(
        max_length=100, blank=True, null=True, help_text="e.g. Position ID"
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.get_type_display()} {self.symbol} @ {self.date.date()}"
