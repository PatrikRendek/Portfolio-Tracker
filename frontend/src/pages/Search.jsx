import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import StockCard from '../components/StockCard';
import { stockApi, watchlistApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Search() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const { user } = useAuth();
    const [results, setResults] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (query) doSearch(query);
    }, [query]);

    useEffect(() => {
        if (user) {
            watchlistApi.getAll()
                .then(data => setWatchlist(Array.isArray(data) ? data : data.results || []))
                .catch(() => { });
        }
    }, [user]);

    const doSearch = async (q) => {
        setLoading(true);
        try {
            // Search tickers and get EOD data for results
            const tickerData = await stockApi.search(q);
            const tickers = tickerData.data || [];

            if (tickers.length > 0) {
                const symbols = tickers.slice(0, 10).map(t => t.symbol).join(',');
                const eodData = await stockApi.getEodLatest(symbols).catch(() => ({ data: [] }));
                // Merge ticker info with EOD data
                const merged = tickers.slice(0, 10).map(ticker => {
                    const eod = (eodData.data || []).find(e => e.symbol === ticker.symbol);
                    return { ...ticker, ...(eod || {}) };
                });
                setResults(merged);
            } else {
                setResults([]);
            }
        } catch (err) {
            console.error(err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAddWatchlist = async (stock) => {
        if (!user) return;
        try {
            await watchlistApi.add(stock.symbol, stock.name || stock.symbol);
            const wl = await watchlistApi.getAll();
            setWatchlist(Array.isArray(wl) ? wl : wl.results || []);
        } catch (err) {
            console.error(err);
        }
    };

    const watchlistSymbols = watchlist.map((w) => w.symbol);

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <div className="text-[11px] uppercase tracking-[0.24em] text-gray-400 dark:text-slate-500 font-bold mb-3">Search</div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-2">Search Results</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">{query ? `Showing results for "${query}"` : 'Search for stocks above'}</p>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="rounded-2xl border border-gray-100 bg-white h-36 animate-pulse dark:border-[#202832] dark:bg-[#0a0e13]" />
                    ))}
                </div>
            ) : results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.map((stock, i) => (
                        <StockCard
                            key={stock.symbol}
                            stock={stock}
                            index={i}
                            onAddWatchlist={user ? handleAddWatchlist : null}
                            isInWatchlist={watchlistSymbols.includes(stock.symbol)}
                        />
                    ))}
                </div>
            ) : query ? (
                <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                    <div className="w-14 h-14 rounded-2xl bg-[#22324a] border border-[#314766] flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <SearchIcon size={24} className="text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">No results found</h3>
                    <p className="text-gray-500 dark:text-slate-400">Try searching with a different ticker or name</p>
                </div>
            ) : null}
        </div>
    );
}
