import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Star, ArrowRight } from 'lucide-react';
import StockCard from '../components/StockCard';
import StockChart from '../components/StockChart';
import PortfolioChart from '../components/PortfolioChart';
import { stockApi, watchlistApi, portfolioApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const TRENDING_SYMBOLS = 'SPY,AAPL,MSFT,GOOGL,AMZN,TSLA,META,NVDA,NFLX';

export default function Dashboard() {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [stocks, setStocks] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [portfolioHistory, setPortfolioHistory] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [watchlistData, setWatchlistData] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
    const [portfolioPeriod, setPortfolioPeriod] = useState('6mo');
    const [stockPeriod, setStockPeriod] = useState('1mo');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPublicData();
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
            loadUserData();
        }
    }, [user, authLoading]);

    const loadPublicData = async () => {
        setLoading(true);
        try {
            const [eodData, chartResponse] = await Promise.all([
                stockApi.getEodLatest(TRENDING_SYMBOLS).catch(() => ({ data: [] })),
                stockApi.getDetail(selectedSymbol).catch(() => ({ eod: [] })),
            ]);
            setStocks(eodData.data || []);
            setChartData(chartResponse.eod || []);
        } catch (err) {
            console.error('Failed to load public data:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadUserData = async () => {
        try {
            const [wl, portRes] = await Promise.all([
                watchlistApi.getAll().catch(() => []),
                portfolioApi.getHistory(portfolioPeriod).catch(() => ({ history: [] }))
            ]);
            const wlArray = Array.isArray(wl) ? wl : wl.results || [];
            setWatchlist(wlArray);
            setPortfolioHistory(portRes.history || []);

            if (wlArray.length > 0) {
                const symbols = wlArray.map((w) => w.symbol).join(',');
                const eodRes = await stockApi.getEodLatest(symbols).catch(() => ({ data: [] }));
                setWatchlistData(eodRes.data || []);
            } else {
                setWatchlistData([]);
            }
        } catch (err) {
            console.error('Failed to load user data:', err);
        }
    };

    const handleAddWatchlist = async (stock) => {
        if (!user) return;
        try {
            await watchlistApi.add(stock.symbol, stock.name || stock.symbol);
            const wl = await watchlistApi.getAll().catch(() => []);
            setWatchlist(Array.isArray(wl) ? wl : wl.results || []);
        } catch (err) {
            console.error('Failed to add to watchlist:', err);
        }
    };

    const loadChart = async (symbol, period = stockPeriod) => {
        setSelectedSymbol(symbol);
        setStockPeriod(period);
        try {
            const response = await stockApi.getDetail(symbol, period);
            setChartData(response.eod || []);
        } catch (err) {
            console.error('Failed to load chart:', err);
        }
    };

    const loadPortfolioChart = async (period) => {
        if (!user) return;
        setPortfolioPeriod(period);
        try {
            const res = await portfolioApi.getHistory(period);
            setPortfolioHistory(res.history || []);
        } catch (err) {
            console.error('Failed to load portfolio history:', err);
        }
    };

    const watchlistSymbols = watchlist.map((w) => w.symbol);
    const spyStock = stocks.find((s) => s.symbol === 'SPY');
    const spyChange = spyStock && spyStock.open ? ((spyStock.close - spyStock.open) / spyStock.open) * 100 : 0;
    const statsSource = (user && watchlistData.length > 0) ? watchlistData : stocks.filter((s) => s.symbol !== 'SPY');
    const totalStocks = statsSource.length;
    const avgChange = user
        ? (statsSource.reduce((acc, stock) => {
            if (stock.close && stock.open) {
                return acc + ((stock.close - stock.open) / stock.open) * 100;
            }
            return acc;
        }, 0) / (totalStocks || 1))
        : spyChange;
    const gainers = statsSource.filter((stock) => stock.close > stock.open).length;
    const topPerformer = [...statsSource].sort((a, b) => {
        const aChange = a.open ? (a.close - a.open) / a.open : 0;
        const bChange = b.open ? (b.close - b.open) / b.open : 0;
        return bChange - aChange;
    })[0];
    const displayStocks = (user && watchlistData.length > 0 ? watchlistData : stocks).slice(0, 8);

    const deskStats = [
        { label: user ? 'Tracked' : 'Trending', value: totalStocks, detail: user ? 'active names' : 'market leaders' },
        { label: user ? 'Avg Move' : 'S&P 500', value: `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`, detail: user ? 'daily change' : 'today change' },
        { label: user ? 'Gainers' : 'Leader', value: user ? gainers : (topPerformer?.symbol || 'N/A'), detail: user ? 'up today' : 'top performer' },
        { label: user ? 'Watchlist' : 'Account', value: user ? watchlist.length : 'Create', detail: user ? 'saved names' : 'track faster' },
    ];

    return (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-2">
                    {user ? `Welcome back, ${user.first_name || 'Trader'}` : 'Market Overview'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                    {user ? 'Monitor portfolio context, benchmark performance and your active watchlist from one screen.' : 'Track the market, inspect price history and start building your own desk.'}
                </p>
            </div>

            <div className="mb-8 rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#202832] dark:bg-[#0a0e13] overflow-hidden">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100 dark:divide-[#202832]">
                    {deskStats.map((item, index) => (
                        <div
                            key={item.label}
                            className={`px-5 py-5 ${!user && index === 3 ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#111723]' : ''}`}
                            onClick={() => { if (!user && index === 3) navigate('/register'); }}
                        >
                            <div className="text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-slate-500 font-bold mb-2">{item.label}</div>
                            <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{item.value}</div>
                            <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{item.detail}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.9fr] gap-6">
                <div className="space-y-6">
                    {user && portfolioHistory.length > 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 tracking-wide">Portfolio Performance</h2>
                                    <div className="text-sm text-gray-500 dark:text-slate-400 uppercase tracking-[0.18em]">vs benchmark</div>
                                </div>
                                <PeriodToggle current={portfolioPeriod} onSelect={loadPortfolioChart} />
                            </div>
                            <PortfolioChart data={portfolioHistory} height={320} />
                        </div>
                    )}

                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 tracking-wide">{selectedSymbol}</h2>
                                <div className="text-sm text-gray-500 dark:text-slate-400 uppercase tracking-[0.18em]">price history</div>
                            </div>
                            <div className="flex flex-col items-start lg:items-end gap-2">
                                <div className="flex flex-wrap gap-2">
                                    {['AAPL', 'MSFT', 'GOOGL', 'TSLA'].map((sym) => (
                                        <button
                                            key={sym}
                                            onClick={() => loadChart(sym, stockPeriod)}
                                            className={`px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ${selectedSymbol === sym
                                                ? 'bg-[#22324a] text-white border-[#314766]'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-[#202832] dark:text-slate-400 dark:hover:bg-[#111723]'
                                            }`}
                                        >
                                            {sym}
                                        </button>
                                    ))}
                                </div>
                                <PeriodToggle current={stockPeriod} onSelect={(value) => loadChart(selectedSymbol, value)} />
                            </div>
                        </div>
                        {chartData.length > 0 ? (
                            <StockChart data={chartData} symbol={selectedSymbol} height={320} />
                        ) : (
                            <div className="h-80 flex items-center justify-center text-gray-400 dark:text-slate-500">
                                {loading ? <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : 'No chart data available'}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                                {user && watchlistData.length > 0 ? 'My Watchlist' : 'Trending Stocks'}
                            </h2>
                            <button
                                onClick={() => navigate(user ? '/watchlist' : '/search')}
                                className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:opacity-80 transition-opacity font-bold"
                            >
                                View All <ArrowRight size={14} />
                            </button>
                        </div>
                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="rounded-2xl border border-gray-100 bg-white h-36 animate-pulse dark:border-[#202832] dark:bg-[#0a0e13]" />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {displayStocks.map((stock, i) => (
                                    <StockCard
                                        key={stock.symbol + i}
                                        stock={stock}
                                        index={i}
                                        onAddWatchlist={user ? handleAddWatchlist : null}
                                        isInWatchlist={watchlistSymbols.includes(stock.symbol)}
                                    />
                                ))}
                                {user && watchlistData.length === 0 && (
                                    <div className="col-span-full py-12 text-center rounded-3xl border border-dashed border-gray-200 bg-white dark:border-[#202832] dark:bg-[#0a0e13]">
                                        <div className="w-12 h-12 rounded-xl bg-[#22324a] border border-[#314766] flex items-center justify-center mx-auto mb-3">
                                            <Star size={20} className="text-white" />
                                        </div>
                                        <p className="text-gray-900 dark:text-slate-100 font-semibold">Your watchlist is empty</p>
                                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-4">Add a few names to start monitoring them here.</p>
                                        <button onClick={() => navigate('/search')} className="px-4 py-2.5 rounded-xl bg-[#22324a] hover:bg-[#2a3d5a] text-white text-sm font-bold transition-colors">
                                            Explore Markets
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                        <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-4">Market Pulse</h3>
                        <div className="grid grid-cols-2 gap-4 text-center">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-5 dark:border-[#202832] dark:bg-[#0f151d]">
                                <div className="text-2xl font-bold text-emerald-500">{statsSource.filter((s) => s.close > s.open).length}</div>
                                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500 mt-1">{user ? 'Up Today' : 'Gaining'}</div>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-5 dark:border-[#202832] dark:bg-[#0f151d]">
                                <div className="text-2xl font-bold text-red-500">{statsSource.filter((s) => s.close < s.open).length}</div>
                                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500 mt-1">{user ? 'Down Today' : 'Declining'}</div>
                            </div>
                        </div>
                    </div>

                    {user && watchlist.length > 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-900 dark:text-slate-100">Watchlist</h3>
                                <span className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 font-medium dark:border-[#202832] dark:bg-[#111723] dark:text-slate-400">
                                    {watchlist.length}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {watchlist.slice(0, 5).map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer dark:border-[#202832] dark:bg-[#0f151d] dark:hover:bg-[#111723]"
                                        onClick={() => loadChart(item.symbol)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#22324a] flex items-center justify-center text-xs font-bold text-white border border-[#314766]">
                                                {item.symbol?.slice(0, 2)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{item.symbol}</p>
                                                <p className="text-xs text-gray-500 dark:text-slate-500">{item.name || 'Stock'}</p>
                                            </div>
                                        </div>
                                        <ArrowRight size={14} className="text-gray-400 dark:text-slate-500" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div
                        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors dark:border-[#202832] dark:bg-[#0a0e13] dark:hover:bg-[#111723]"
                        onClick={() => window.open(`https://www.google.com/search?q=${selectedSymbol}+stock+news`, '_blank')}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-[#22324a] border border-[#314766] flex items-center justify-center shadow-sm">
                                <TrendingUp size={22} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 dark:text-slate-100">{selectedSymbol} News</p>
                                <p className="text-sm text-gray-500 dark:text-slate-400">Open latest headlines and analyst commentary</p>
                            </div>
                            <div className="ml-auto w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center dark:border-[#202832]">
                                <ArrowRight size={16} className="text-gray-500 dark:text-slate-400" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PeriodToggle({ current, onSelect }) {
    return (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200 dark:bg-[#111723] dark:border-[#202832]">
            {[
                { label: '1M', value: '1mo' },
                { label: '3M', value: '3mo' },
                { label: '6M', value: '6mo' },
                { label: '1Y', value: '1y' },
                { label: 'ALL', value: 'max' }
            ].map((p) => (
                <button
                    key={p.value}
                    onClick={() => onSelect(p.value)}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${current === p.value
                        ? 'bg-white text-[#22324a] shadow-sm dark:bg-[#1a2330] dark:text-slate-100'
                        : 'text-gray-500 hover:text-gray-900 dark:text-slate-500 dark:hover:text-slate-200'
                    }`}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}
