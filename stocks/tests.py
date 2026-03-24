from unittest.mock import patch
from datetime import timedelta

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from .models import BrokerAccount, PortfolioPosition, Transaction
from .services import get_portfolio_history, parse_xtb_excel


class ParseXtbExcelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="xtb@example.com",
            email="xtb@example.com",
            password="secret123",
        )

    def _open_positions_sheet(self, rows):
        return pd.DataFrame(
            [["Symbol", "Volume", "Open price", "Open time"], *rows]
        )

    def _cash_operations_sheet(self, rows):
        return pd.DataFrame(
            [["Type", "Instrument", "Comment", "Time", "Amount"], *rows]
        )

    def _cash_operations_sheet_with_symbol(self, rows):
        return pd.DataFrame(
            [["Type", "Symbol", "Comment", "Time", "Amount"], *rows]
        )

    @patch("stocks.services.pd.read_excel")
    def test_cash_operations_accumulate_multiple_buys_for_same_symbol(self, mock_read_excel):
        open_positions_sheet = self._open_positions_sheet(
            [["AAPL.US", "4", "105", "2024-01-01 10:00:00"]]
        )
        cash_sheet = self._cash_operations_sheet(
            [
                ["Stock purchase", "AAPL.US", "OPEN BUY 2 @ 100,00", "2024-01-01 10:00:00", "-200"],
                ["Stock purchase", "AAPL.US", "OPEN BUY 3 @ 110,00", "2024-01-02 10:00:00", "-330"],
                ["Stock sale", "AAPL.US", "CLOSE BUY 1 @ 120,00", "2024-01-03 10:00:00", "120"],
            ]
        )
        mock_read_excel.return_value = {
            "Open Positions": open_positions_sheet,
            "Cash Operations": cash_sheet,
        }

        result = parse_xtb_excel(self.user, file_obj=object())

        self.assertEqual(result["status"], "success")
        position = PortfolioPosition.objects.get(
            broker_account__user=self.user,
            broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            symbol="AAPL",
        )
        self.assertEqual(float(position.quantity), 4.0)
        self.assertEqual(
            Transaction.objects.filter(
                broker_account__user=self.user,
                broker_account__broker=BrokerAccount.BrokerChoices.XTB,
                symbol="AAPL",
            ).count(),
            3,
        )

    @patch("stocks.services.pd.read_excel")
    def test_open_positions_do_not_create_duplicate_transactions(self, mock_read_excel):
        open_positions_sheet = self._open_positions_sheet(
            [["AAPL.US", "5", "100", "2024-01-01 10:00:00"]]
        )
        cash_sheet = self._cash_operations_sheet(
            [
                ["Stock purchase", "AAPL.US", "OPEN BUY 2 @ 100,00", "2024-01-01 10:00:00", "-200"],
                ["Stock purchase", "AAPL.US", "OPEN BUY 3 @ 110,00", "2024-01-02 10:00:00", "-330"],
            ]
        )
        mock_read_excel.return_value = {
            "Open Positions": open_positions_sheet,
            "Cash Operations": cash_sheet,
        }

        parse_xtb_excel(self.user, file_obj=object())

        position = PortfolioPosition.objects.get(
            broker_account__user=self.user,
            broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            symbol="AAPL",
        )
        self.assertEqual(float(position.quantity), 5.0)
        self.assertEqual(
            Transaction.objects.filter(
                broker_account__user=self.user,
                broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            ).count(),
            2,
        )

    @patch("stocks.services.pd.read_excel")
    def test_xtb_dividends_and_withholding_tax_are_imported_from_type_column(self, mock_read_excel):
        open_positions_sheet = self._open_positions_sheet(
            [["PPG.US", "1", "100", "2024-01-01 10:00:00"]]
        )
        cash_sheet = self._cash_operations_sheet_with_symbol(
            [
                ["DIVIDENT", "PPG.US", "PPG.US USD 0.6800/ SHR", "2024-03-01 10:00:00", "0.25"],
                ["Withholding Tax", "PPG.US", "PPG.US USD WHT 15%", "2024-03-01 10:00:00", "-0.04"],
            ]
        )
        mock_read_excel.return_value = {
            "Open Positions": open_positions_sheet,
            "Cash Operations": cash_sheet,
        }

        parse_xtb_excel(self.user, file_obj=object())

        position = PortfolioPosition.objects.get(
            broker_account__user=self.user,
            broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            symbol="PPG",
        )
        self.assertAlmostEqual(float(position.total_dividends), 0.21, places=8)
        self.assertEqual(
            list(
                Transaction.objects.filter(
                    broker_account__user=self.user,
                    broker_account__broker=BrokerAccount.BrokerChoices.XTB,
                    symbol="PPG",
                )
                .order_by("date")
                .values_list("type", flat=True)
            ),
            ["dividend", "tax"],
        )

    @patch("stocks.services.pd.read_excel")
    def test_xtb_dividends_support_localized_amount_column_names(self, mock_read_excel):
        open_positions_sheet = self._open_positions_sheet(
            [["MBG.DE", "2", "60", "2024-01-01 10:00:00"]]
        )
        cash_sheet = pd.DataFrame(
            [
                ["Type", "Instrument", "Comment", "Time", "Čistá suma"],
                ["DIVIDENT", "MBG.DE", "MBG.DE EUR 4.3000/ SHR", "2024-03-01 10:00:00", "8,60"],
                ["Withholding Tax", "MBG.DE", "MBG.DE EUR WHT 26.375%", "2024-03-01 10:00:00", "-2,27"],
            ]
        )
        mock_read_excel.return_value = {
            "Open Positions": open_positions_sheet,
            "Cash Operations": cash_sheet,
        }

        parse_xtb_excel(self.user, file_obj=object())

        position = PortfolioPosition.objects.get(
            broker_account__user=self.user,
            broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            symbol="MBG.DE",
        )
        self.assertAlmostEqual(float(position.total_dividends), 6.33, places=8)


class PortfolioHistoryDividendTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="history@example.com",
            email="history@example.com",
            password="secret123",
        )
        self.account = BrokerAccount.objects.create(
            user=self.user,
            broker=BrokerAccount.BrokerChoices.XTB,
        )

    @patch("stocks.services._fetch_history_market_data")
    def test_dividends_and_taxes_are_reflected_in_portfolio_history_value(self, mock_fetch_history_market_data):
        now = timezone.now()
        buy_date = now - timedelta(days=5)
        dividend_date = now - timedelta(days=3)

        Transaction.objects.create(
            broker_account=self.account,
            symbol="AAPL",
            type=Transaction.TransactionType.BUY,
            quantity=1,
            price=100,
            amount=100,
            date=buy_date,
        )
        Transaction.objects.create(
            broker_account=self.account,
            symbol="AAPL",
            type=Transaction.TransactionType.DIVIDEND,
            quantity=0,
            price=0,
            amount=10,
            date=dividend_date,
        )
        Transaction.objects.create(
            broker_account=self.account,
            symbol="AAPL",
            type=Transaction.TransactionType.TAX,
            quantity=0,
            price=0,
            amount=-2,
            date=dividend_date,
        )

        idx = pd.date_range(start=(buy_date - timedelta(days=1)).date(), periods=7, freq="D")
        mock_fetch_history_market_data.return_value = pd.DataFrame(
            {
                "AAPL": [100.0] * len(idx),
                "^GSPC": [100.0] * len(idx),
            },
            index=idx,
        )

        result = get_portfolio_history(self.user, period="1mo")

        self.assertEqual(result["status"], "success")
        self.assertAlmostEqual(result["history"][-1]["portfolio_value"], 108.0, places=2)
        self.assertAlmostEqual(result["summary"]["portfolio"]["total_value"], 108.0, places=2)
