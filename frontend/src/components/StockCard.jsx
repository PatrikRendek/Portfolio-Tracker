import { TrendingUp, TrendingDown, Plus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StockCard({ stock, onAddWatchlist, isInWatchlist, index = 0 }) {
    const navigate = useNavigate();
    const change = stock.close && stock.open ? ((stock.close - stock.open) / stock.open) * 100 : 0;
    const isPositive = change >= 0;
    const lastPrice = Number.isFinite(stock.close) ? `$${stock.close.toFixed(2)}` : '-';
    const volumeLabel = stock.volume ? `${(stock.volume / 1e6).toFixed(1)}M` : '-';

    return (
        <div
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm cursor-pointer transition-colors hover:bg-gray-50 dark:border-[#202832] dark:bg-[#0a0e13] dark:hover:bg-[#0f151d]"
            style={{ animationDelay: `${index * 0.08}s` }}
            onClick={() => navigate(`/stock/${stock.symbol}`)}
        >
            <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                    {stock.logo ? (
                        <img src={stock.logo} alt={stock.symbol} className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-gray-100" />
                    ) : (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white bg-[#22324a] border border-[#314766]">
                            {stock.symbol?.slice(0, 2)}
                        </div>
                    )}
                    <div>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-slate-100 tracking-wide">{stock.symbol}</h3>
                        <p className="text-[11px] text-gray-500 dark:text-slate-500 uppercase tracking-[0.12em] truncate max-w-[140px]">
                            {stock.name || stock.exchange || 'Market'}
                        </p>
                    </div>
                </div>
                {onAddWatchlist && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddWatchlist(stock);
                        }}
                        className={`h-8 w-8 rounded-lg inline-flex items-center justify-center border transition-colors ${isInWatchlist
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-400/20'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 dark:bg-[#111723] dark:text-slate-400 dark:border-[#202832] dark:hover:bg-[#182131]'
                        }`}
                    >
                        {isInWatchlist ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                )}
            </div>

            <div className="mb-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500 font-bold mb-2">Last</div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{lastPrice}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
                <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${isPositive
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-400/20'
                    : 'bg-red-500/10 text-red-500 border-red-400/20'
                }`}>
                    {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositive ? '+' : ''}{change.toFixed(2)}%
                </div>
                <span className="text-xs text-gray-500 dark:text-slate-500">
                    Vol {volumeLabel}
                </span>
            </div>
        </div>
    );
}
