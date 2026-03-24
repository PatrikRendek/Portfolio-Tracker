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
    const [logo, setLogo] = useState('');
    const [inWatchlist, setInWatchlist] = useState(false);
    const [period, setPeriod] = useState('6mo');
    const upperSymbol = symbol?.toUpperCase() || '';

    useEffect(() => {
        loadPublicData();
    }, [symbol, period]);

    useEffect(() => {
        if (!authLoading && user) {
            checkWatchlistStatus();
        } else if (!authLoading && !user) {
            setInWatchlist(false);
        }
    }, [user, authLoading, symbol]);

    const loadPublicData = async () => {
        setLoading(true);
        try {
            const response = await stockApi.getDetail(upperSymbol, period);
            setData(response.eod || []);
            setLogo(response.logo || '');
        } catch (err) {
            setData([]);
            setLogo('');
        } finally {
            setLoading(false);
        }
    };

    const checkWatchlistStatus = async () => {
        try {
            const wl = await watchlistApi.getAll().catch(() => []);
            const watchlist = Array.isArray(wl) ? wl : wl.results || [];
            setInWatchlist(watchlist.some((item) => item.symbol === upperSymbol));
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
                const item = list.find((w) => w.symbol === upperSymbol);
                if (item) await watchlistApi.remove(item.id);
            } else {
                await watchlistApi.add(upperSymbol, upperSymbol);
            }
            setInWatchlist((current) => !current);
        } catch (err) {
            console.error(err);
        }
    };

    const latest = data[0];
    const change = latest ? ((latest.close - latest.open) / latest.open) * 100 : 0;
    const isPositive = change >= 0;

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 mb-6 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
                <ArrowLeft size={16} /> Back
            </button>

            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
                <div className="flex items-start gap-4">
                    {logo ? (
                        <img src={logo} alt={symbol} className="w-14 h-14 rounded-2xl object-contain bg-white p-1.5 border border-gray-200 dark:border-[#202832] shadow-sm" />
                    ) : (
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white bg-[#22324a] border border-[#314766]">
                            {symbol?.slice(0, 2).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-gray-400 dark:text-slate-500 font-bold mb-2">Stock Detail</div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 tracking-wide">{upperSymbol}</h1>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">End-of-day price history and session range.</p>
                    </div>
                </div>

                <button
                    onClick={toggleWatchlist}
                    className={`h-10 inline-flex items-center gap-2 px-4 rounded-xl border text-sm font-semibold transition-colors ${
                        inWatchlist
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-400/20'
                            : 'bg-[#22324a] text-white border-[#314766] hover:bg-[#2a3d5a]'
                    }`}
                >
                    {inWatchlist ? <><Check size={16} /> In Watchlist</> : <><Plus size={16} /> Add to Watchlist</>}
                </button>
            </div>

            {latest && (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                    <StatCard label="Close" value={`$${latest.close?.toFixed(2)}`} />
                    <StatCard
                        label="Change"
                        value={`${isPositive ? '+' : ''}${change.toFixed(2)}%`}
                        tone={isPositive ? 'positive' : 'negative'}
                        icon={isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    />
                    <StatCard label="High" value={`$${latest.high?.toFixed(2)}`} tone="positive" />
                    <StatCard label="Low" value={`$${latest.low?.toFixed(2)}`} tone="negative" />
                </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-8 dark:border-[#202832] dark:bg-[#0a0e13]">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 tracking-wide">Price History</h2>
                        <div className="text-sm text-gray-500 dark:text-slate-400 uppercase tracking-[0.18em]">Session data</div>
                    </div>
                    <PeriodToggle current={period} onSelect={setPeriod} disabled={loading} />
                </div>

                {loading ? (
                    <div className="h-80 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-[#22324a] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : data.length > 0 ? (
                    <StockChart data={data} symbol={upperSymbol} height={400} />
                ) : (
                    <div className="h-80 flex items-center justify-center text-gray-400 dark:text-slate-500">
                        No data available
                    </div>
                )}
            </div>

            {data.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden dark:border-[#202832] dark:bg-[#0a0e13]">
                    <div className="p-5 border-b border-gray-100 dark:border-[#202832]">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Historical Data</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-[#0f151d]">
                                    <th className="text-left px-4 py-4 text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Date</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Open</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">High</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Low</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Close</th>
                                    <th className="text-right px-4 py-4 text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Volume</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.slice(0, 20).map((row, i) => (
                                    <tr key={i} className="border-t border-gray-100 dark:border-[#202832] hover:bg-gray-50 dark:hover:bg-[#0f151d] transition-colors">
                                        <td className="px-4 py-3.5 text-gray-700 dark:text-slate-300">{new Date(row.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3.5 text-right text-gray-700 dark:text-slate-300">${row.open?.toFixed(2)}</td>
                                        <td className="px-4 py-3.5 text-right text-emerald-500">${row.high?.toFixed(2)}</td>
                                        <td className="px-4 py-3.5 text-right text-red-500">${row.low?.toFixed(2)}</td>
                                        <td className="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-slate-100">${row.close?.toFixed(2)}</td>
                                        <td className="px-4 py-3.5 text-right text-gray-600 dark:text-slate-400">{formatVolume(row.volume)}</td>
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

function StatCard({ label, value, tone = 'neutral', icon = null }) {
    const toneClass = tone === 'positive'
        ? 'text-emerald-500'
        : tone === 'negative'
            ? 'text-red-500'
            : 'text-gray-900 dark:text-slate-100';

    return (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
            <div className="text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-slate-500 font-bold mb-2">{label}</div>
            <div className={`text-3xl font-bold flex items-center gap-2 ${toneClass}`}>
                {icon}
                <span>{value}</span>
            </div>
        </div>
    );
}

function PeriodToggle({ current, onSelect, disabled }) {
    const periods = [
        { label: '1M', value: '1mo' },
        { label: '3M', value: '3mo' },
        { label: '6M', value: '6mo' },
        { label: '1Y', value: '1y' },
        { label: 'ALL', value: 'max' }
    ];

    return (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200 dark:bg-[#111723] dark:border-[#202832]">
            {periods.map((p) => (
                <button
                    key={p.value}
                    onClick={() => onSelect(p.value)}
                    disabled={disabled}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${
                        current === p.value
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

function formatVolume(volume) {
    if (!volume) return '-';
    return `${(volume / 1e6).toFixed(1)}M`;
}
