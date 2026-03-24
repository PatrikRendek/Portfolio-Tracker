import { useState, useEffect } from 'react';
import { Trash2, Star, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { watchlistApi } from '../api/client';

export default function Watchlist() {
    const navigate = useNavigate();
    const [watchlist, setWatchlist] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWatchlist();
    }, []);

    const loadWatchlist = async () => {
        setLoading(true);
        try {
            const data = await watchlistApi.getAll();
            setWatchlist(Array.isArray(data) ? data : data.results || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (id) => {
        try {
            await watchlistApi.remove(id);
            setWatchlist((wl) => wl.filter((w) => w.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50">Watchlist</h1>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">Saved names, ready to inspect or move into your portfolio workflow.</p>
                </div>
                <div className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 dark:border-[#202832] dark:bg-[#0a0e13] dark:text-slate-100">
                    {watchlist.length} tracked
                </div>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-20 rounded-2xl border border-gray-100 bg-white animate-pulse dark:border-[#202832] dark:bg-[#0a0e13]" />
                    ))}
                </div>
            ) : watchlist.length > 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden dark:border-[#202832] dark:bg-[#0a0e13]">
                    <div className="grid grid-cols-[1.4fr_1fr_auto] px-5 py-4 text-[10px] uppercase tracking-[0.22em] font-bold text-gray-500 dark:text-slate-500 border-b border-gray-100 dark:border-[#202832]">
                        <span>Ticker</span>
                        <span>Added</span>
                        <span className="text-right">Actions</span>
                    </div>
                    {watchlist.map((item) => (
                        <div
                            key={item.id}
                            className="grid grid-cols-[1.4fr_1fr_auto] items-center gap-4 px-5 py-4 border-b border-gray-100 dark:border-[#202832] last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#0f151d]"
                            onClick={() => navigate(`/stock/${item.symbol}`)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#22324a] flex items-center justify-center text-sm font-bold text-white border border-[#314766]">
                                    {item.symbol?.slice(0, 2)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-slate-100 tracking-wide">{item.symbol}</h3>
                                    <p className="text-xs text-gray-500 dark:text-slate-500 uppercase tracking-[0.08em]">{item.name || 'Stock'}</p>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-slate-400">
                                {new Date(item.added_at).toLocaleDateString()}
                            </p>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors dark:hover:bg-red-500/10"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <ArrowRight size={16} className="text-gray-400 dark:text-slate-500" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                                    <div className="w-14 h-14 rounded-2xl bg-[#22324a] border border-[#314766] flex items-center justify-center mx-auto mb-4 shadow-sm">
                                        <Star size={24} className="text-white" />
                                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">No names saved yet</h3>
                    <p className="text-gray-500 dark:text-slate-400 mb-6">Search for tickers and build your watchlist first.</p>
                    <button onClick={() => navigate('/')} className="px-5 py-3 rounded-xl bg-[#22324a] hover:bg-[#2a3d5a] text-white font-bold transition-colors">
                        Browse Markets
                    </button>
                </div>
            )}
        </div>
    );
}
