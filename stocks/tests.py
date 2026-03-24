from unittest.mock import patch

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase

from .models import BrokerAccount, PortfolioPosition, Transaction
from .services import parse_xtb_excel


class ParseXtbExcelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="xtb@example.com",
            email="xtb@example.com",
            password="secret123",
        )

    @patch("stocks.services.pd.read_excel")
    def test_cash_operations_accumulate_multiple_buys_for_same_symbol(self, mock_read_excel):
        cash_sheet = pd.DataFrame(
            [
                ["Instrument", "Comment", "Time"],
                ["AAPL.US", "OPEN BUY 2 @ 100,00", "2024-01-01 10:00:00"],
                ["AAPL.US", "OPEN BUY 3 @ 110,00", "2024-01-02 10:00:00"],
                ["AAPL.US", "CLOSE BUY 1 @ 120,00", "2024-01-03 10:00:00"],
            ]
        )
        mock_read_excel.return_value = {"Cash Operations": cash_sheet}

        result = parse_xtb_excel(self.user, file_obj=object())

        self.assertEqual(result["status"], "success")
        position = PortfolioPosition.objects.get(
            broker_account__user=self.user,
            broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            symbol="AAPL",
        )
        self.assertEqual(position.quantity, 4.0)
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
        open_positions_sheet = pd.DataFrame(
            [
                ["Symbol", "Volume", "Open price", "Open time"],
                ["AAPL.US", "5", "100", "2024-01-01 10:00:00"],
            ]
        )
        cash_sheet = pd.DataFrame(
            [
                ["Instrument", "Comment", "Time"],
                ["AAPL.US", "OPEN BUY 2 @ 100,00", "2024-01-01 10:00:00"],
                ["AAPL.US", "OPEN BUY 3 @ 110,00", "2024-01-02 10:00:00"],
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
        self.assertEqual(position.quantity, 5.0)
        self.assertEqual(
            Transaction.objects.filter(
                broker_account__user=self.user,
                broker_account__broker=BrokerAccount.BrokerChoices.XTB,
            ).count(),
            2,
        )
