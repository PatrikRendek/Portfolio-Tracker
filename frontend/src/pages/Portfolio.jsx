import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star, MoreVertical, TrendingUp, TrendingDown, Eye, Plus, Info, ChevronUp, ChevronDown } from 'lucide-react';
import PortfolioChart from '../components/PortfolioChart';
import StockDetailModal from '../components/StockDetailModal';
import { usePortfolio } from '../hooks/usePortfolio';
import { useAuth } from '../context/AuthContext';

export default function Portfolio() {
    const {
        positions,
        history,
        historySummary,
        allHistory,
        allHistorySummary,
        historyPeriod,
        loading,
        historyLoading,
        uploading,
        deleting,
        error,
        fetchPositions,
        fetchHistory,
        handleFileUpload,
        handleDeletePortfolio,
        handleAddToWatchlist
    } = usePortfolio();

    const { user, loading: authLoading } = useAuth();
    const [selectedStock, setSelectedStock] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'market_value', direction: 'desc' });

    const sortedPositions = useMemo(() => {
        let sortableItems = [...positions];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [positions, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    useEffect(() => {
        if (!authLoading && user) {
            fetchPositions();
            fetchHistory(historyPeriod || '6mo');
        }
    }, [authLoading, user, fetchPositions, fetchHistory, historyPeriod]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
            <PortfolioHeader
                positions={positions}
                history={history}
                uploading={uploading}
                deleting={deleting}
                onDelete={handleDeletePortfolio}
                onUpload={handleFileUpload}
            />

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 shadow-sm border border-red-100 dark:border-red-900/30">
                    {error}
                </div>
            )}

            {allHistorySummary && (
                <StatsOverview summary={allHistorySummary} history={allHistory} />
            )}

            {history.length > 0 && (
                <div className="bg-white dark:bg-dark-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-8 overflow-hidden">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Performance</h2>
                            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">vs S&P 500</div>
                        </div>
                        <PeriodSelector current={historyPeriod} onSelect={fetchHistory} loading={historyLoading} />
                    </div>
                    {historyLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-pulse rounded-full h-8 w-8 bg-blue-400"></div>
                        </div>
                    ) : (
                        <PortfolioChart data={history} benchmarkName="S&P 500" height={320} />
                    )}
                </div>
            )}

            {positions.length === 0 ? (
                <EmptyState />
            ) : (
                <PositionsTable
                    positions={sortedPositions}
                    onAddToWatchlist={handleAddToWatchlist}
                    onSelect={setSelectedStock}
                    sortConfig={sortConfig}
                    onSort={requestSort}
                />
            )}

            {selectedStock && (
                <StockDetailModal
                    symbol={selectedStock.symbol}
                    name={selectedStock.name}
                    logo={selectedStock.logo}
                    onClose={() => setSelectedStock(null)}
                />
            )}
        </div>
    );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function PortfolioHeader({ positions, history, uploading, deleting, onDelete, onUpload }) {
    const hasData = positions.length > 0 || history.length > 0;

    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 group">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                My Portfolio
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Live</span>
            </h1>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {hasData && (
                    <button
                        onClick={onDelete}
                        disabled={uploading || deleting}
                        className="btn-danger flex-1 md:flex-none flex items-center justify-center gap-2 text-sm font-bold shadow-lg"
                    >
                        {deleting ? <LoadingSpinner size="sm" /> : <TrashIcon />}
                        <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                    </button>
                )}
                <div className="flex gap-3 w-full md:w-auto">
                    <FileUploadButton broker="etoro" uploading={uploading} onUpload={onUpload} />
                    <FileUploadButton broker="xtb" uploading={uploading} onUpload={onUpload} />
                </div>
            </div>
        </div>
    );
}

function StatsOverview({ summary, history = [] }) {
    const latestHistoryPoint = history.length > 0 ? history[history.length - 1] : null;
    const periodLabel = 'MAX';
    const portfolioPct = latestHistoryPoint?.portfolio_pct ?? summary.portfolio?.all_time_pct ?? 0;
    const benchmarkPct = latestHistoryPoint?.benchmark_pct ?? summary.benchmark?.all_time_pct ?? 0;
    const safeBaseValue = (portfolioPct > -99.9)
        ? (summary.portfolio?.total_value || 0) / (1 + portfolioPct / 100)
        : (summary.portfolio?.total_invested || 0);
    const benchmarkValue = safeBaseValue * (1 + benchmarkPct / 100);

    const cards = [
        {
            title: 'My Portfolio',
            value: summary.portfolio?.total_value || 0,
            today: summary.portfolio?.today_change_abs || 0,
            todayPct: summary.portfolio?.today_change_pct || 0,
            allTime: portfolioPct,
            description: null
        },
        {
            title: 'What if investing in S&P 500',
            value: benchmarkValue,
            today: 0,
            todayPct: summary.benchmark?.today_change_pct || 0,
            allTime: benchmarkPct,
            isSimulation: true,
            description: 'MAX benchmark simulation aligned to the same performance basis as the ALL chart'
        },
        {
            title: 'What if not investing',
            value: summary.portfolio?.total_invested || 0,
            today: 0,
            todayPct: 0,
            allTime: 0,
            isSimulation: true,
            description: 'All-time original cost basis (cash invested)'
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {cards.map((card, idx) => (
                <div key={card.title} className={`bg-white dark:bg-dark-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md ${card.isSimulation ? 'opacity-90' : 'ring-2 ring-blue-500/10'}`}>
                    <div className="text-sm font-semibold text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-2">
                        {card.title}
                        {card.description && <span className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[10px] text-gray-400 cursor-help" title={card.description}>?</span>}
                    </div>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                        $ {card.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="space-y-1">
                        <div className={`text-xs font-bold ${card.todayPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {card.todayPct >= 0 ? '+' : ''}{card.todayPct.toFixed(2)}% TODAY
                        </div>
                        <div className="text-xs font-bold text-gray-400">
                            +0.00% YESTERDAY
                        </div>
                        <div className={`text-xs font-bold ${card.allTime >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {card.allTime >= 0 ? '+' : ''}{card.allTime.toFixed(2)}% {periodLabel}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function SortableHeader({ label, sortKey, sortConfig, onSort, align = "left" }) {
    const isActive = sortConfig.key === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            className={`px-3 py-4 text-${align} text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group`}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {label}
                <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                    {isActive && sortConfig.direction === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </span>
            </div>
        </th>
    );
}

function PositionsTable({ positions, onAddToWatchlist, onSelect, sortConfig, onSort }) {
    return (
        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-[1400px] w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-dark-900">
                        <tr>
                            <SortableHeader label="Ticker" sortKey="symbol" sortConfig={sortConfig} onSort={onSort} />
                            <SortableHeader label="Broker" sortKey="broker" sortConfig={sortConfig} onSort={onSort} align="center" />
                            <SortableHeader label="Allocation" sortKey="allocation_pct" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Last" sortKey="curr_price" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Avg Cost" sortKey="avg_cost" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Cost Basis" sortKey="cost_basis" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="1D Gain %" sortKey="day_gain_pct" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Unr. Gain %" sortKey="unrealized_gain_pct" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Unr. Gain $" sortKey="unrealized_gain_abs" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Market Value" sortKey="market_value" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Shares" sortKey="quantity" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <th className="px-3 py-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-800 divide-y divide-gray-100 dark:divide-gray-800">
                        {positions.map((pos) => (
                            <PositionRow
                                key={pos.symbol}
                                pos={pos}
                                onAddToWatchlist={onAddToWatchlist}
                                onClick={() => onSelect(pos)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function PositionRow({ pos, onAddToWatchlist, onClick }) {
    const isPositiveDay = pos.day_gain_pct >= 0;
    const isPositiveUnr = pos.unrealized_gain_pct >= 0;

    return (
        <tr
            onClick={onClick}
            className="hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors cursor-pointer group"
        >
            <td className="px-3 py-4 whitespace-nowrap">
                <div className="flex items-center gap-3">
                    {pos.logo ? (
                        <img src={pos.logo} alt={pos.symbol} className="w-8 h-8 rounded-lg object-contain bg-white shadow-sm p-0.5 border border-gray-100" />
                    ) : (
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs shadow-sm">
                            {pos.symbol.charAt(0)}
                        </div>
                    )}
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">{pos.symbol}</span>
                        {pos.name && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate max-w-[120px]">{pos.name}</span>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-center">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${pos.broker === 'etoro' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {pos.broker}
                </span>
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {pos.allocation_pct.toFixed(2)}%
                </div>
                <div className="w-16 h-1 bg-gray-100 dark:bg-dark-900 rounded-full ml-auto mt-1 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pos.allocation_pct, 100)}%` }}></div>
                </div>
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900 dark:text-white">
                ${pos.curr_price.toFixed(2)}
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right text-sm text-gray-600 dark:text-gray-400">
                ${pos.avg_cost.toFixed(2)}
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-700 dark:text-gray-300">
                ${pos.cost_basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className={`px-3 py-4 whitespace-nowrap text-right text-sm font-bold ${isPositiveDay ? 'text-green-600' : 'text-red-600'}`}>
                <div className="flex items-center justify-end gap-1">
                    {isPositiveDay ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositiveDay ? '+' : ''}{pos.day_gain_pct.toFixed(2)}%
                </div>
            </td>
            <td className={`px-3 py-4 whitespace-nowrap text-right text-sm font-bold ${isPositiveUnr ? 'text-green-600' : 'text-red-600'}`}>
                {isPositiveUnr ? '+' : ''}{pos.unrealized_gain_pct.toFixed(2)}%
            </td>
            <td className={`px-3 py-4 whitespace-nowrap text-right text-sm font-bold ${isPositiveUnr ? 'text-green-600' : 'text-red-600'}`}>
                {isPositiveUnr ? '+' : ''}${Math.abs(pos.unrealized_gain_abs).toFixed(2)}
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900 dark:text-white">
                ${pos.market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                {pos.quantity.toFixed(4)}
            </td>
            <td className="px-3 py-4 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddToWatchlist(pos); }}
                        className="p-1.5 text-gray-400 hover:text-yellow-400 transition-colors rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/10"
                    >
                        <Star size={16} />
                    </button>
                </div>
            </td>
        </tr>
    );
}


function PeriodSelector({ current, onSelect, loading }) {
    const periods = [
        { label: '1M', value: '1mo' },
        { label: '3M', value: '3mo' },
        { label: '6M', value: '6mo' },
        { label: '1Y', value: '1y' },
        { label: 'ALL', value: 'max' }
    ];
    return (
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-dark-700/50 rounded-xl">
            {periods.map(p => (
                <button
                    key={p.value}
                    onClick={() => onSelect(p.value)}
                    disabled={loading}
                    className={`px-3 py-1.5 text-xs rounded-lg font-bold transition-all ${current === p.value
                        ? 'bg-white dark:bg-dark-400 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}

function FileUploadButton({ broker, uploading, onUpload }) {
    const isEtoro = broker === 'etoro';
    const active = uploading === broker;
    const styles = isEtoro
        ? "from-emerald-500 to-teal-600 shadow-emerald-500/20"
        : "from-blue-500 to-indigo-600 shadow-blue-500/20";

    return (
        <label className={`flex-1 md:flex-none bg-gradient-to-r ${styles} text-white font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-all shadow-lg text-sm flex items-center justify-center gap-2 active:scale-95 ${uploading ? 'opacity-75' : ''}`}>
            {active ? <LoadingSpinner size="sm" /> : <UploadIcon />}
            {active ? 'Analyzing...' : isEtoro ? 'eToro' : 'XTB'}
            <input
                type="file"
                accept={isEtoro ? ".xlsx,.xls" : ".xlsx,.xls,.csv"}
                className="hidden"
                onChange={(e) => onUpload(e, broker)}
                disabled={uploading}
            />
        </label>
    );
}

function EmptyState() {
    return (
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-12 text-center shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="w-16 h-16 bg-gray-50 dark:bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-1.414 1.414a1 1 0 01-.707.293h-4.242a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 006.586 13H4" />
                </svg>
            </div>
            <p className="text-gray-900 dark:text-white text-lg font-semibold italic">No positions found.</p>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Import your eToro or XTB statement to get started.</p>
        </div>
    );
}

// ─── Icons & Utils ──────────────────────────────────────────────────────────

function TrashIcon() { return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>; }
function UploadIcon() { return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>; }
function LoadingSpinner({ size }) {
    const s = size === 'sm' ? 'h-4 w-4' : 'h-8 w-8';
    return (
        <svg className={`animate-spin ${s} text-current`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );
}
