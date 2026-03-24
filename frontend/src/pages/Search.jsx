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

    const watchlistSymbols = watchlist.map(w => w.symbol);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold dark:text-white text-gray-900 mb-2">
                    Search Results
                </h1>
                <p className="dark:text-gray-400 text-gray-600">
                    {query ? `Showing results for "${query}"` : 'Search for stocks above'}
                </p>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="glass-card p-5 h-36 animate-shimmer" />
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
                <div className="glass-card p-12 text-center">
                    <SearchIcon size={48} className="mx-auto mb-4 dark:text-gray-600 text-gray-300" />
                    <h3 className="text-xl font-bold dark:text-white text-gray-900 mb-2">No results found</h3>
                    <p className="dark:text-gray-400 text-gray-600">Try searching with a different ticker or name</p>
                </div>
            ) : null}
        </div>
    );
}
