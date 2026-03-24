import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, TrendingUp, User, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import { stockApi } from '../api/client';

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
            if (query.length > 1) {
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
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <nav className="sticky top-0 z-50 backdrop-blur-xl border-b transition-colors duration-300
      dark:bg-dark-800/80 dark:border-dark-500/30
      bg-white/80 border-gray-200/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-accent flex items-center justify-center
              group-hover:shadow-glow-purple transition-shadow duration-300">
                            <TrendingUp size={20} className="text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-accent-purple to-accent-cyan bg-clip-text text-transparent">
                            StockPulse
                        </span>
                    </Link>

                    {/* Search */}
                    <div className="hidden md:flex flex-1 max-w-md mx-8 relative" ref={searchRef}>
                        <form onSubmit={handleSearch} className="w-full">
                            <div className="relative w-full">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 dark:text-gray-500 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search stocks... (e.g. AAPL, MSFT)"
                                    className="input-field pl-10 py-2.5 text-sm"
                                    onFocus={() => searchQuery.length > 1 && setShowResults(true)}
                                />
                                {isSearching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-accent-purple border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>
                        </form>

                        {/* Autocomplete Dropdown */}
                        {showResults && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 w-full mt-2 glass-card overflow-hidden shadow-2xl z-50 animate-fade-in-up">
                                <div className="max-h-80 overflow-y-auto">
                                    {searchResults.map((result) => (
                                        <button
                                            key={result.symbol}
                                            onClick={() => handleSelectResult(result.symbol)}
                                            className="w-full text-left px-4 py-3 hover:bg-dark-600/50 flex flex-col gap-0.5 transition-colors border-b border-white/5 last:border-0"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold dark:text-white text-gray-900">{result.symbol}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-500 text-gray-400 font-medium">
                                                    {result.type || 'Stock'}
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-400 truncate w-full">{result.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right */}
                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        {user ? (
                            <div className="hidden md:flex items-center gap-3">
                                <Link to="/portfolio" className="btn-outline text-sm px-4 py-2">
                                    Portfolio
                                </Link>
                                <Link to="/watchlist" className="btn-outline text-sm px-4 py-2">
                                    Watchlist
                                </Link>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center">
                                        <User size={16} className="text-white" />
                                    </div>
                                    <span className="text-sm font-medium dark:text-gray-300 text-gray-700">
                                        {user.first_name || user.email?.split('@')[0]}
                                    </span>
                                </div>
                                <button onClick={handleLogout} className="p-2 rounded-lg dark:hover:bg-dark-600 hover:bg-gray-100 transition-colors">
                                    <LogOut size={18} className="dark:text-gray-400 text-gray-600" />
                                </button>
                            </div>
                        ) : (
                            <div className="hidden md:flex items-center gap-2">
                                <Link to="/login" className="btn-outline text-sm px-4 py-2">
                                    Sign In
                                </Link>
                                <Link to="/register" className="btn-gradient text-sm px-4 py-2">
                                    Sign Up
                                </Link>
                            </div>
                        )}
                        {/* Mobile menu toggle */}
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="md:hidden p-2 rounded-lg dark:text-gray-400 text-gray-600"
                        >
                            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>

                {/* Mobile menu */}
                {mobileOpen && (
                    <div className="md:hidden pb-4 space-y-3 animate-fade-in-up">
                        <div className="relative" ref={searchRef}>
                            <form onSubmit={handleSearch}>
                                <div className="relative">
                                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 dark:text-gray-500 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search stocks..."
                                        className="input-field pl-10 py-2.5 text-sm"
                                        onFocus={() => searchQuery.length > 1 && setShowResults(true)}
                                    />
                                    {isSearching && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-accent-purple border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                </div>
                            </form>

                            {/* Mobile Autocomplete Dropdown */}
                            {showResults && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 w-full mt-1 glass-card overflow-hidden shadow-2xl z-50 animate-fade-in-up">
                                    <div className="max-h-60 overflow-y-auto">
                                        {searchResults.map((result) => (
                                            <button
                                                key={result.symbol}
                                                onClick={() => handleSelectResult(result.symbol)}
                                                className="w-full text-left px-4 py-3 hover:bg-dark-600/50 flex flex-col gap-0.5 transition-colors border-b border-white/5 last:border-0"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold dark:text-white text-gray-900">{result.symbol}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-500 text-gray-400 font-medium">
                                                        {result.type || 'Stock'}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-400 truncate w-full">{result.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {user ? (
                            <div className="space-y-2">
                                <Link to="/portfolio" className="block w-full text-center btn-outline text-sm py-2"
                                    onClick={() => setMobileOpen(false)}>
                                    Portfolio
                                </Link>
                                <Link to="/watchlist" className="block w-full text-center btn-outline text-sm py-2"
                                    onClick={() => setMobileOpen(false)}>
                                    Watchlist
                                </Link>
                                <button onClick={handleLogout} className="block w-full text-center btn-gradient text-sm py-2">
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Link to="/login" className="block w-full text-center btn-outline text-sm py-2"
                                    onClick={() => setMobileOpen(false)}>
                                    Sign In
                                </Link>
                                <Link to="/register" className="block w-full text-center btn-gradient text-sm py-2"
                                    onClick={() => setMobileOpen(false)}>
                                    Sign Up
                                </Link>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
}
