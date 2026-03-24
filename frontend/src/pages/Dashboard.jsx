import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, BarChart3, Star, Zap, ArrowRight } from 'lucide-react';
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
                const symbols = wlArray.map(w => w.symbol).join(',');
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

    const watchlistSymbols = watchlist.map(w => w.symbol);

    const spyStock = stocks.find(s => s.symbol === 'SPY');
    const spyChange = spyStock && spyStock.open ? ((spyStock.close - spyStock.open) / spyStock.open) * 100 : 0;

    const statsSource = (user && watchlistData.length > 0) ? watchlistData : stocks.filter(s => s.symbol !== 'SPY');
    const totalStocks = statsSource.length;
    const avgChange = user ? (statsSource.reduce((acc, stock) => {
        if (stock.close && stock.open) {
            return acc + ((stock.close - stock.open) / stock.open) * 100;
        }
        return acc;
    }, 0) / (totalStocks || 1)) : spyChange;
    const gainers = statsSource.filter(stock => stock.close > stock.open).length;
    const topPerformer = [...statsSource].sort((a, b) => {
        const aChange = a.open ? (a.close - a.open) / a.open : 0;
        const bChange = b.open ? (b.close - b.open) / b.open : 0;
        return bChange - aChange;
    })[0];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold dark:text-white text-gray-900 mb-2">
                    {user ? `Welcome back, ${user.first_name || 'Trader'}` : 'Market Overview'}
                </h1>
                <p className="dark:text-gray-400 text-gray-600">
                    Track your favorite stocks in real-time
                </p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="glass-card p-5 group">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center">
                            <TrendingUp size={20} className="text-white" />
                        </div>
                        <span className="text-xs dark:text-gray-500 text-gray-400">Tracking</span>
                    </div>
                    <p className="text-2xl font-bold dark:text-white text-gray-900">{totalStocks}</p>
                    <p className="text-sm dark:text-gray-500 text-gray-400">{user ? 'Active Stocks' : 'Trending Assets'}</p>
                </div>

                <div className="glass-card p-5 group">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-green to-accent-cyan flex items-center justify-center">
                            <BarChart3 size={20} className="text-white" />
                        </div>
                        <span className="text-xs dark:text-gray-500 text-gray-400">Avg</span>
                    </div>
                    <p className={`text-2xl font-bold ${avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                    </p>
                    <p className="text-sm dark:text-gray-500 text-gray-400">
                        {user ? 'Daily Performance' : 'S&P 500 Index'}
                    </p>
                </div>

                <div className="glass-card p-5 group">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center">
                            <Zap size={20} className="text-white" />
                        </div>
                        <span className="text-xs dark:text-gray-500 text-gray-400">{user ? 'Today' : 'Best'}</span>
                    </div>
                    {user ? (
                        <>
                            <p className="text-2xl font-bold text-green-400">{gainers}</p>
                            <p className="text-sm dark:text-gray-500 text-gray-400">Gainers</p>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-bold dark:text-white text-gray-900">{topPerformer?.symbol || 'N/A'}</p>
                            <p className="text-sm dark:text-gray-500 text-gray-400">Top Performer</p>
                        </>
                    )}
                </div>

                <div
                    className={`glass-card p-5 group cursor-pointer transition-all ${!user ? 'hover:scale-[1.05] border-2 border-accent-purple/50 bg-accent-purple/5' : ''}`}
                    onClick={() => !user ? navigate('/register') : navigate('/watchlist')}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center ${!user ? 'from-accent-magenta to-accent-purple shadow-glow-purple scale-110' : 'from-accent-magenta to-accent-purple'}`}>
                            {user ? <Star size={20} className="text-white" /> : <TrendingUp size={20} className="text-white" />}
                        </div>
                        <span className="text-xs dark:text-gray-500 text-gray-400">{user ? 'Saved' : 'Free Account'}</span>
                    </div>
                    <p className="text-2xl font-bold dark:text-white text-gray-900">{user ? watchlist.length : 'Register Now'}</p>
                    <p className="text-sm dark:text-gray-500 text-gray-400">{user ? 'Watchlist' : 'Start tracking today'}</p>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Area (Left 2/3) */}
                <div className="lg:col-span-2 space-y-6">
                    {user && portfolioHistory.length > 0 && (
                        <div className="glass-card p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold dark:text-white text-gray-900">Portfolio Performance</h2>
                                </div>
                                <div className="flex gap-1.5 p-1 bg-gray-100/50 dark:bg-dark-600/30 rounded-lg">
                                    {[
                                        { label: '1M', value: '1mo' },
                                        { label: '3M', value: '3mo' },
                                        { label: '6M', value: '6mo' },
                                        { label: '1Y', value: '1y' },
                                        { label: 'ALL', value: 'max' }
                                    ].map(p => (
                                        <button
                                            key={p.value}
                                            onClick={() => loadPortfolioChart(p.value)}
                                            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${portfolioPeriod === p.value
                                                ? 'bg-white dark:bg-dark-500 text-blue-500 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                                }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <PortfolioChart data={portfolioHistory} height={320} />
                        </div>
                    )}

                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold dark:text-white text-gray-900">{selectedSymbol}</h2>
                                <p className="text-sm dark:text-gray-400 text-gray-500">Price History</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-2">
                                    {['AAPL', 'MSFT', 'GOOGL', 'TSLA'].map(sym => (
                                        <button
                                            key={sym}
                                            onClick={() => loadChart(sym, stockPeriod)}
                                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all duration-300
                      ${selectedSymbol === sym
                                                    ? 'bg-gradient-accent text-white shadow-glow-purple'
                                                    : 'dark:bg-dark-500 bg-gray-100 dark:text-gray-400 text-gray-600 hover:bg-accent-purple/20'}`}
                                        >
                                            {sym}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-1.5 p-1 bg-gray-100/50 dark:bg-dark-600/30 rounded-lg">
                                    {[
                                        { label: '1M', value: '1mo' },
                                        { label: '3M', value: '3mo' },
                                        { label: '6M', value: '6mo' },
                                        { label: '1Y', value: '1y' },
                                        { label: 'ALL', value: 'max' }
                                    ].map(p => (
                                        <button
                                            key={p.value}
                                            onClick={() => loadChart(selectedSymbol, p.value)}
                                            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${stockPeriod === p.value
                                                ? 'bg-white dark:bg-dark-500 text-accent-purple shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                                }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {chartData.length > 0 ? (
                            <StockChart data={chartData} symbol={selectedSymbol} height={320} />
                        ) : (
                            <div className="h-80 flex items-center justify-center dark:text-gray-500 text-gray-400">
                                {loading ? (
                                    <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    'No chart data available'
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bottom Section (Watchlist or Trending) */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold dark:text-white text-gray-900">
                                {user && watchlistData.length > 0 ? 'My Watchlist' : 'Trending Stocks'}
                            </h2>
                            <button
                                onClick={() => navigate(user ? '/watchlist' : '/search')}
                                className="flex items-center gap-1 text-sm text-accent-cyan hover:text-accent-purple transition-colors font-bold"
                            >
                                View All <ArrowRight size={14} />
                            </button>
                        </div>
                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="glass-card p-5 h-36 animate-shimmer" />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {(user && watchlistData.length > 0 ? watchlistData : stocks).slice(0, 8).map((stock, i) => (
                                    <StockCard
                                        key={stock.symbol + i}
                                        stock={stock}
                                        index={i}
                                        onAddWatchlist={user ? handleAddWatchlist : null}
                                        isInWatchlist={watchlistSymbols.includes(stock.symbol)}
                                        onClick={() => loadChart(stock.symbol)}
                                    />
                                ))}
                                {user && watchlistData.length === 0 && (
                                    <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-dark-900/40 rounded-3xl border border-dashed border-gray-200 dark:border-dark-500">
                                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Star size={20} className="text-blue-500" />
                                        </div>
                                        <p className="text-gray-900 dark:text-white font-semibold">Your watchlist is empty</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">Add your favorite stocks to track them here.</p>
                                        <button
                                            onClick={() => navigate('/search')}
                                            className="btn-gradient text-xs py-2 px-4"
                                        >
                                            Explore Markets
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar (Right 1/3) */}
                <div className="space-y-6">
                    {/* Watchlist Today Summary */}
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold dark:text-white text-gray-900">{user ? 'Watchlist Status' : 'Market Pulse'}</h3>
                        </div>
                        <div className="mb-4 text-center py-2">
                            <div className="flex items-center justify-center gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-400">
                                        {statsSource.filter(s => s.close > s.open).length}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-500">{user ? 'Up Today' : 'Gaining'}</div>
                                </div>
                                <div className="w-px h-8 bg-gray-100 dark:bg-dark-500"></div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-red-400">
                                        {statsSource.filter(s => s.close < s.open).length}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-500">{user ? 'Down Today' : 'Declining'}</div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-2 p-3 dark:bg-dark-500/30 bg-gray-50 rounded-xl border border-gray-100 dark:border-gray-800">
                            <p className="text-[11px] dark:text-gray-400 text-gray-600 italic text-center">
                                {watchlistSymbols.length > 0 ? `Monitoring ${watchlistSymbols.length} assets` : "Add stocks to your watchlist to see daily summary here"}
                            </p>
                        </div>
                    </div>

                    {/* Recently Added / Sidebar Watchlist */}
                    {user && watchlist.length > 0 && (
                        <div className="glass-card p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold dark:text-white text-gray-900">Watchlist</h3>
                                <span className="text-xs px-2 py-1 rounded-lg dark:bg-dark-500 bg-gray-100 dark:text-accent-cyan text-accent-purple font-medium">
                                    {watchlist.length}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {watchlist.slice(0, 5).map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg dark:hover:bg-dark-500 hover:bg-gray-50 transition-colors cursor-pointer"
                                        onClick={() => loadChart(item.symbol)}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-accent flex items-center justify-center text-xs font-bold text-white">
                                                {item.symbol?.slice(0, 2)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium dark:text-white text-gray-900">{item.symbol}</p>
                                                <p className="text-xs dark:text-gray-500 text-gray-400">{item.name || 'Stock'}</p>
                                            </div>
                                        </div>
                                        <ArrowRight size={14} className="dark:text-gray-500 text-gray-400" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Dynamic News Link */}
                    <div
                        className="glass-card p-5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                        onClick={() => window.open(`https://www.google.com/search?q=${selectedSymbol}+stock+news`, '_blank')}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-cyan to-accent-blue flex flex-col items-center justify-center">
                                <TrendingUp size={24} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold dark:text-white text-gray-900">{selectedSymbol} News</p>
                                <p className="text-sm dark:text-gray-400 text-gray-600">Check latest analyst updates</p>
                            </div>
                            <div className="ml-auto w-10 h-10 rounded-full bg-gradient-accent flex items-center justify-center cursor-pointer group-hover:shadow-glow-cyan transition-all">
                                <ArrowRight size={18} className="text-white" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
