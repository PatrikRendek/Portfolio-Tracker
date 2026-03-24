import { TrendingUp, TrendingDown, Plus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StockCard({ stock, onAddWatchlist, isInWatchlist, index = 0 }) {
    const navigate = useNavigate();
    const change = stock.close && stock.open ? ((stock.close - stock.open) / stock.open) * 100 : 0;
    const isPositive = change >= 0;

    return (
        <div
            className="glass-card p-5 cursor-pointer group animate-fade-in-up"
            style={{ animationDelay: `${index * 0.08}s` }}
            onClick={() => navigate(`/stock/${stock.symbol}`)}
        >
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        {stock.logo ? (
                            <img src={stock.logo} alt={stock.symbol} className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
                        ) : (
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white
              ${isPositive ? 'bg-gradient-to-br from-green-400 to-cyan-400' : 'bg-gradient-to-br from-red-400 to-pink-400'}`}>
                                {stock.symbol?.slice(0, 2)}
                            </div>
                        )}
                        <h3 className="font-bold text-sm dark:text-white text-gray-900">{stock.symbol}</h3>
                    </div>
                    <p className="text-xs dark:text-gray-500 text-gray-400 truncate max-w-[120px]">
                        {stock.exchange || 'Exchange'}
                    </p>
                </div>
                {onAddWatchlist && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddWatchlist(stock);
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300
              ${isInWatchlist
                                ? 'bg-accent-green/20 text-accent-green'
                                : 'dark:bg-dark-500 bg-gray-100 dark:text-gray-400 text-gray-500 hover:bg-accent-purple/20 hover:text-accent-purple'
                            }`}
                    >
                        {isInWatchlist ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                )}
            </div>

            {/* Price */}
            <div className="mb-3">
                <span className="text-2xl font-bold dark:text-white text-gray-900">
                    ${stock.close?.toFixed(2) || '—'}
                </span>
            </div>

            {/* Change */}
            <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold
          ${isPositive
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'}`}>
                    {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositive ? '+' : ''}{change.toFixed(2)}%
                </div>
                <span className="text-xs dark:text-gray-500 text-gray-400">
                    Vol: {stock.volume ? (stock.volume / 1e6).toFixed(1) + 'M' : '—'}
                </span>
            </div>

            {/* Bottom gradient line */}
            <div className={`mt-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500
        ${isPositive ? 'bg-gradient-to-r from-green-400 to-cyan-400' : 'bg-gradient-to-r from-red-400 to-pink-400'}`} />
        </div>
    );
}
