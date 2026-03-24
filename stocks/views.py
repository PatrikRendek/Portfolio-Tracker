from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.contrib.auth import login, logout
from rest_framework.authentication import SessionAuthentication
from django.core.cache import cache
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Watchlist, Transaction
from .services import (
    FinnhubClient,
    user_create,
    user_authenticate,
    watchlist_create,
    watchlist_delete,
    parse_xtb_excel,
    parse_etoro_excel,
    get_portfolio_history,
    delete_user_portfolio,
)
from .selectors import watchlist_list, get_portfolio_positions_detailed


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # To not perform the csrf check previously happening.


# ─── Auth APIs ────────────────────────────────────────────────────────────


class UserRegisterApi(APIView):
    permission_classes = [AllowAny]

    class InputSerializer(serializers.Serializer):
        email = serializers.EmailField()
        password = serializers.CharField()
        first_name = serializers.CharField(required=False, allow_blank=True)
        last_name = serializers.CharField(required=False, allow_blank=True)

    class OutputSerializer(serializers.Serializer):
        id = serializers.IntegerField()
        email = serializers.EmailField()
        first_name = serializers.CharField()

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = user_create(**serializer.validated_data)
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return Response(
                self.OutputSerializer(user).data, status=status.HTTP_201_CREATED
            )
        except ValidationError as e:
            return Response(
                {"error": str(e.detail[0])}, status=status.HTTP_400_BAD_REQUEST
            )


class UserLoginApi(APIView):
    permission_classes = [AllowAny]

    class InputSerializer(serializers.Serializer):
        email = serializers.EmailField()
        password = serializers.CharField()

    class OutputSerializer(serializers.Serializer):
        id = serializers.IntegerField()
        email = serializers.EmailField()
        first_name = serializers.CharField()

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = user_authenticate(request, **serializer.validated_data)
            login(request, user)
            return Response(self.OutputSerializer(user).data)
        except ValidationError as e:
            return Response(
                {"error": str(e.detail[0])}, status=status.HTTP_401_UNAUTHORIZED
            )


class UserLogoutApi(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"message": "Logged out"})


class UserCurrentApi(APIView):
    permission_classes = [IsAuthenticated]

    class OutputSerializer(serializers.Serializer):
        id = serializers.IntegerField()
        email = serializers.EmailField()
        first_name = serializers.CharField()
        last_name = serializers.CharField()

    def get(self, request):
        return Response(self.OutputSerializer(request.user).data)


# ─── Watchlist APIs ───────────────────────────────────────────────────────


class WatchlistListCreateApi(APIView):
    permission_classes = [IsAuthenticated]

    class InputSerializer(serializers.Serializer):
        symbol = serializers.CharField(max_length=20)
        name = serializers.CharField(max_length=255)

    class OutputSerializer(serializers.Serializer):
        id = serializers.IntegerField()
        symbol = serializers.CharField()
        name = serializers.CharField()
        added_at = serializers.DateTimeField()

    def get(self, request):
        watchlists = watchlist_list(user=request.user)
        return Response(self.OutputSerializer(watchlists, many=True).data)

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            watchlist = watchlist_create(user=request.user, **serializer.validated_data)
            return Response(
                self.OutputSerializer(watchlist).data, status=status.HTTP_201_CREATED
            )
        except ValidationError as e:
            return Response(
                {"error": str(e.detail[0])}, status=status.HTTP_400_BAD_REQUEST
            )


class WatchlistDeleteApi(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk_or_symbol):
        # Frontend passes ID for direct deletion
        try:
            wl = Watchlist.objects.get(id=pk_or_symbol, user=request.user)
            watchlist_delete(user=request.user, symbol=wl.symbol)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Watchlist.DoesNotExist:
            return Response(
                {"error": "Watchlist item not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except ValidationError as e:
            return Response(
                {"error": str(e.detail[0])}, status=status.HTTP_400_BAD_REQUEST
            )


# ─── MarketStack Proxy APIs ───────────────────────────────────────────────


class StockEodApi(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        symbols = request.query_params.get("symbols", "")
        if not symbols:
            return Response(
                {"error": "symbols parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            client = FinnhubClient()
            data = client.get_eod(
                symbols=symbols,
                date_from=request.query_params.get("date_from"),
                date_to=request.query_params.get("date_to"),
                limit=int(request.query_params.get("limit", 100)),
            )
            return Response(data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class StockEodLatestApi(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        symbols = request.query_params.get("symbols", "")
        if not symbols:
            return Response(
                {"error": "symbols parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            client = FinnhubClient()
            data = client.get_eod_latest(symbols=symbols)
            return Response(data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class StockSearchApi(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"error": "q parameter is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        cache_key = f"stock_search_{query.lower()}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)

        try:
            client = FinnhubClient()
            data = client.search_tickers(query=query)
            # Cache for 1 hour
            cache.set(cache_key, data, 3600)
            return Response(data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class StockDetailApi(APIView):
    permission_classes = [AllowAny]

    def get(self, request, symbol):
        try:
            client = FinnhubClient()
            period_str = request.query_params.get("period", "1mo")

            eod_data = client.get_ticker_eod(
                symbol=symbol.upper(),
                period=period_str,
            )
            return Response(eod_data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


# ─── Portfolio APIs ───────────────────────────────────────────────────────


class PortfolioPositionsApi(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = get_portfolio_positions_detailed(request.user)
        return Response(data)

    def delete(self, request):
        delete_user_portfolio(user=request.user)
        return Response({"message": "Portfolio cleared"}, status=status.HTTP_200_OK)


class StockTransactionsApi(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        txs = Transaction.objects.filter(
            broker_account__user=request.user, symbol=symbol
        ).order_by("-date")

        data = [
            {
                "date": t.date,
                "type": t.type,
                "quantity": float(t.quantity),
                "price": float(t.price),
                "amount": float(t.amount),
            }
            for t in txs
        ]

        return Response(data)


class PortfolioUploadXTBApi(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result = parse_xtb_excel(request.user, file_obj)
            return Response(result)
        except ValidationError as e:
            return Response({"error": e.detail}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PortfolioUploadEtoroApi(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        file_obj = request.FILES["file"]
        try:
            result = parse_etoro_excel(request.user, file_obj)
            return Response(result)
        except ValidationError as e:
            return Response({"error": e.detail}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PortfolioHistoryApi(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        benchmark = request.query_params.get("benchmark", "^GSPC")
        period = request.query_params.get("period", "6mo")

        history_data = get_portfolio_history(
            request.user, benchmark=benchmark, period=period
        )
        if "error" in history_data:
            return Response({"error": history_data["error"]}, status=400)
        return Response(history_data)
