import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Check, TrendingUp, TrendingDown } from 'lucide-react';
import StockChart from '../components/StockChart';
import { stockApi, watchlistApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function StockDetail() {
    const { symbol } = useParams();
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [logo, setLogo] = useState("");
    const [inWatchlist, setInWatchlist] = useState(false);
    const [period, setPeriod] = useState('6mo');

    useEffect(() => {
        loadPublicData();
    }, [symbol, period]);

    useEffect(() => {
        if (!authLoading && user) {
            checkWatchlistStatus();
        } else if (!authLoading && !user) {
            setInWatchlist(false); // Clear watchlist status if user logs out
        }
    }, [user, authLoading, symbol]);

    const loadPublicData = async () => {
        setLoading(true);
        try {
            const response = await stockApi.getDetail(symbol.toUpperCase(), period);
            setData(response.eod || []);
            setLogo(response.logo || "");
        } catch (err) {
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const checkWatchlistStatus = async () => {
        try {
            const wl = await watchlistApi.getAll().catch(() => []);
            const watchlist = Array.isArray(wl) ? wl : wl.results || [];
            setInWatchlist(watchlist.some(item => item.symbol === symbol.toUpperCase()));
        } catch (err) {
            console.error('Failed to check watchlist status:', err);
        }
    };

    const toggleWatchlist = async () => {
        if (!user) return navigate('/login');
        try {
            if (inWatchlist) {
                const wl = await watchlistApi.getAll();
                const list = Array.isArray(wl) ? wl : wl.results || [];
                const item = list.find(w => w.symbol === symbol.toUpperCase());
                if (item) await watchlistApi.remove(item.id);
            } else {
                await watchlistApi.add(symbol.toUpperCase(), symbol.toUpperCase());
            }
            setInWatchlist(!inWatchlist);
        } catch (err) {
            console.error(err);
        }
    };

    const latest = data[0];
    const change = latest ? ((latest.close - latest.open) / latest.open) * 100 : 0;
    const isPositive = change >= 0;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Back */}
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 mb-6 text-sm dark:text-gray-400 text-gray-600 hover:text-accent-purple transition-colors"
            >
                <ArrowLeft size={16} /> Back
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-8 animate-fade-in-up">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        {logo ? (
                            <img src={logo} alt={symbol} className="w-12 h-12 rounded-xl object-contain bg-white p-1 shadow-sm" />
                        ) : (
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white
              ${isPositive ? 'bg-gradient-to-br from-green-400 to-cyan-400' : 'bg-gradient-to-br from-red-400 to-pink-400'}`}>
                                {symbol?.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h1 className="text-3xl font-bold dark:text-white text-gray-900">{symbol?.toUpperCase()}</h1>
                            <p className="text-sm dark:text-gray-400 text-gray-500">End-of-Day Data</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleWatchlist}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-300
              ${inWatchlist
                                ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                                : 'btn-gradient'}`}
                    >
                        {inWatchlist ? <><Check size={16} /> In Watchlist</> : <><Plus size={16} /> Add to Watchlist</>}
                    </button>
                </div>
            </div>

            {/* Price Stats */}
            {latest && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <div className="glass-card p-4 text-center">
                        <p className="text-xs dark:text-gray-500 text-gray-400 mb-1">Close</p>
                        <p className="text-xl font-bold dark:text-white text-gray-900">${latest.close?.toFixed(2)}</p>
                    </div>
                    <div className="glass-card p-4 text-center">
                        <p className="text-xs dark:text-gray-500 text-gray-400 mb-1">Change</p>
                        <p className={`text-xl font-bold flex items-center justify-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {isPositive ? '+' : ''}{change.toFixed(2)}%
                        </p>
                    </div>
                    <div className="glass-card p-4 text-center">
                        <p className="text-xs dark:text-gray-500 text-gray-400 mb-1">High</p>
                        <p className="text-xl font-bold text-green-400">${latest.high?.toFixed(2)}</p>
                    </div>
                    <div className="glass-card p-4 text-center">
                        <p className="text-xs dark:text-gray-500 text-gray-400 mb-1">Low</p>
                        <p className="text-xl font-bold text-red-400">${latest.low?.toFixed(2)}</p>
                    </div>
                </div>
            )}

            {/* Chart */}
            <div className="glass-card p-6 mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-lg font-bold dark:text-white text-gray-900">Price History</h2>
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
                                onClick={() => setPeriod(p.value)}
                                disabled={loading}
                                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${period === p.value
                                    ? 'bg-white dark:bg-dark-500 text-accent-purple shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                {loading ? (
                    <div className="h-80 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : data.length > 0 ? (
                    <StockChart data={data} symbol={symbol?.toUpperCase()} height={400} />
                ) : (
                    <div className="h-80 flex items-center justify-center dark:text-gray-500 text-gray-400">
                        No data available
                    </div>
                )}
            </div>

            {/* Data Table */}
            {data.length > 0 && (
                <div className="glass-card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                    <div className="p-5 border-b dark:border-dark-400 border-gray-200">
                        <h2 className="text-lg font-bold dark:text-white text-gray-900">Historical Data</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="dark:bg-dark-700 bg-gray-50">
                                    <th className="text-left p-3 font-medium dark:text-gray-400 text-gray-600">Date</th>
                                    <th className="text-right p-3 font-medium dark:text-gray-400 text-gray-600">Open</th>
                                    <th className="text-right p-3 font-medium dark:text-gray-400 text-gray-600">High</th>
                                    <th className="text-right p-3 font-medium dark:text-gray-400 text-gray-600">Low</th>
                                    <th className="text-right p-3 font-medium dark:text-gray-400 text-gray-600">Close</th>
                                    <th className="text-right p-3 font-medium dark:text-gray-400 text-gray-600">Volume</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.slice(0, 20).map((row, i) => (
                                    <tr key={i} className="border-t dark:border-dark-500 border-gray-100 dark:hover:bg-dark-600 hover:bg-gray-50 transition-colors">
                                        <td className="p-3 dark:text-gray-300 text-gray-700">
                                            {new Date(row.date).toLocaleDateString()}
                                        </td>
                                        <td className="p-3 text-right dark:text-gray-300 text-gray-700">${row.open?.toFixed(2)}</td>
                                        <td className="p-3 text-right text-green-400">${row.high?.toFixed(2)}</td>
                                        <td className="p-3 text-right text-red-400">${row.low?.toFixed(2)}</td>
                                        <td className="p-3 text-right font-medium dark:text-white text-gray-900">${row.close?.toFixed(2)}</td>
                                        <td className="p-3 text-right dark:text-gray-400 text-gray-600">
                                            {row.volume ? (row.volume / 1e6).toFixed(1) + 'M' : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
