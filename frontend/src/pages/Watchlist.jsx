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
            setWatchlist(wl => wl.filter(w => w.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold dark:text-white text-gray-900">Watchlist</h1>
                    <p className="dark:text-gray-400 text-gray-600 text-sm mt-1">Your saved stocks</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl dark:bg-dark-600 bg-gray-100">
                    <Star size={16} className="text-accent-purple" />
                    <span className="text-sm font-medium dark:text-white text-gray-900">{watchlist.length}</span>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="glass-card p-5 h-20 animate-shimmer" />
                    ))}
                </div>
            ) : watchlist.length > 0 ? (
                <div className="space-y-3">
                    {watchlist.map((item, i) => (
                        <div
                            key={item.id}
                            className="glass-card p-5 flex items-center justify-between cursor-pointer animate-fade-in-up"
                            style={{ animationDelay: `${i * 0.05}s` }}
                            onClick={() => navigate(`/stock/${item.symbol}`)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center text-sm font-bold text-white">
                                    {item.symbol?.slice(0, 2)}
                                </div>
                                <div>
                                    <h3 className="font-bold dark:text-white text-gray-900">{item.symbol}</h3>
                                    <p className="text-sm dark:text-gray-400 text-gray-500">{item.name || 'Stock'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <p className="text-xs dark:text-gray-500 text-gray-400">
                                    Added {new Date(item.added_at).toLocaleDateString()}
                                </p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                                    className="p-2 rounded-lg dark:hover:bg-red-500/10 hover:bg-red-50 text-red-400 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <ArrowRight size={16} className="dark:text-gray-500 text-gray-400" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="glass-card p-12 text-center">
                    <Star size={48} className="mx-auto mb-4 dark:text-gray-600 text-gray-300" />
                    <h3 className="text-xl font-bold dark:text-white text-gray-900 mb-2">No stocks saved yet</h3>
                    <p className="dark:text-gray-400 text-gray-600 mb-6">Search for stocks and add them to your watchlist</p>
                    <button onClick={() => navigate('/')} className="btn-gradient">
                        Browse Stocks
                    </button>
                </div>
            )}
        </div>
    );
}
