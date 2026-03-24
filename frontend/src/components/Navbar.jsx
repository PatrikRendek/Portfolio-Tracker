import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, TrendingUp, User, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import { stockApi } from '../api/client';

function SearchBox({
    mobile = false,
    searchRef,
    searchQuery,
    setSearchQuery,
    searchResults,
    showResults,
    setShowResults,
    isSearching,
    handleSearch,
    handleSelectResult
}) {
    return (
        <div className={`relative ${mobile ? '' : 'w-full'}`} ref={searchRef}>
            <form onSubmit={handleSearch}>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="SEARCH STOCKS, ETFS, TICKERS"
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-blue-500 dark:border-[#253041] dark:bg-[#0b1220] dark:text-white dark:placeholder:text-slate-500"
                        onFocus={() => searchQuery.length > 0 && setShowResults(true)}
                    />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>
            </form>

            {showResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 rounded-xl overflow-hidden shadow-2xl z-50 border border-gray-200 bg-white dark:border-[#253041] dark:bg-[#0f1722]">
                    <div className="max-h-80 overflow-y-auto">
                        {searchResults.map((result) => (
                            <button
                                key={result.symbol}
                                onClick={() => handleSelectResult(result.symbol)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#182131] transition-colors border-b border-gray-100 dark:border-[#253041] last:border-0"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-900 dark:text-white tracking-wide">{result.symbol}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium uppercase tracking-[0.15em] dark:bg-[#111723] dark:text-slate-500">
                                        {result.type || 'Stock'}
                                    </span>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-slate-500 truncate w-full block mt-1">{result.description}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const searchRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timer = setTimeout(async () => {
            const query = searchQuery.trim();
            if (query.length > 0) {
                setIsSearching(true);
                try {
                    const data = await stockApi.search(query);
                    setSearchResults(data.data || []);
                    setShowResults(true);
                } catch (err) {
                    console.error('Search failed:', err);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSelectResult = (symbol) => {
        navigate(`/stock/${symbol}`);
        setSearchQuery('');
        setShowResults(false);
        setMobileOpen(false);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
            setShowResults(false);
            setMobileOpen(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const navBtn = 'h-10 inline-flex items-center px-4 rounded-xl border text-sm font-semibold transition-colors';
    const navBtnNeutral = `${navBtn} border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-[#253041] dark:text-slate-200 dark:bg-[#111723] dark:hover:bg-[#182131]`;
    const accentBlock = 'bg-[#22324a] border-[#314766]';

    const searchProps = {
        searchRef,
        searchQuery,
        setSearchQuery,
        searchResults,
        showResults,
        setShowResults,
        isSearching,
        handleSearch,
        handleSelectResult
    };

    return (
        <nav className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/94 backdrop-blur-xl dark:border-[#1f2937] dark:bg-[#111827]/96">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16 gap-4">
                    <Link to="/" className="flex items-center gap-3 min-w-fit">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm ${accentBlock}`}>
                            <TrendingUp size={18} className="text-white" />
                        </div>
                        <span className="text-base font-bold text-gray-900 dark:text-white tracking-wide">StockPulse</span>
                    </Link>

                    <div className="hidden md:flex flex-1 max-w-xl">
                        <SearchBox {...searchProps} />
                    </div>

                    <div className="hidden md:flex items-center gap-2">
                        <ThemeToggle />
                        {user ? (
                            <>
                                <Link to="/portfolio" className={navBtnNeutral}>
                                    Portfolio
                                </Link>
                                <Link to="/watchlist" className={navBtnNeutral}>
                                    Watchlist
                                </Link>
                                <div className="h-10 flex items-center gap-2 px-3 rounded-xl border border-gray-200 bg-white dark:border-[#253041] dark:bg-[#111723]">
                                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${accentBlock}`}>
                                        <User size={13} className="text-white" />
                                    </div>
                                    <span className="text-sm font-semibold text-gray-800 dark:text-white">
                                        {user.first_name || user.email?.split('@')[0]}
                                    </span>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="h-10 inline-flex items-center px-4 rounded-xl bg-red-500/10 text-red-500 border border-red-400/20 text-sm font-semibold hover:bg-red-500/15 transition-colors"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <LogOut size={14} />
                                        Sign Out
                                    </span>
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className={navBtnNeutral}>
                                    Sign In
                                </Link>
                                <Link to="/register" className="h-10 inline-flex items-center px-4 rounded-xl bg-[#22324a] text-white border border-[#314766] text-sm font-semibold hover:bg-[#2a3d5a] transition-colors">
                                    Create Account
                                </Link>
                            </>
                        )}
                    </div>

                    <div className="md:hidden flex items-center gap-2">
                        <ThemeToggle />
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 dark:text-slate-200 dark:border-[#253041] dark:bg-[#111723]"
                        >
                            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </div>

                {mobileOpen && (
                    <div className="md:hidden pb-4 space-y-3">
                        <SearchBox {...searchProps} mobile />
                        {user ? (
                            <div className="space-y-2">
                                <Link to="/portfolio" className={`block w-full text-center ${navBtnNeutral}`} onClick={() => setMobileOpen(false)}>
                                    Portfolio
                                </Link>
                                <Link to="/watchlist" className={`block w-full text-center ${navBtnNeutral}`} onClick={() => setMobileOpen(false)}>
                                    Watchlist
                                </Link>
                                <button onClick={handleLogout} className="block w-full text-center h-10 rounded-xl bg-red-500/10 text-red-500 border border-red-400/20 text-sm font-semibold">
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Link to="/login" className={`block w-full text-center ${navBtnNeutral}`} onClick={() => setMobileOpen(false)}>
                                    Sign In
                                </Link>
                                <Link to="/register" className="block w-full text-center h-10 leading-10 rounded-xl bg-[#22324a] text-white border border-[#314766] text-sm font-semibold" onClick={() => setMobileOpen(false)}>
                                    Create Account
                                </Link>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
}
