import { useEffect, useState, useMemo } from 'react';
import { Star, TrendingUp, TrendingDown, ChevronUp, ChevronDown } from 'lucide-react';
import PortfolioChart from '../components/PortfolioChart';
import StockDetailModal from '../components/StockDetailModal';
import { usePortfolio } from '../hooks/usePortfolio';
import { useAuth } from '../context/AuthContext';

export default function Portfolio() {
    const {
        positions,
        history,
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
        const sortableItems = [...positions];
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
                <div className="bg-white dark:bg-[#0a0e13] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-[#202832] mb-6 overflow-hidden">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 tracking-wide">Performance</h2>
                            <div className="text-sm text-gray-500 dark:text-slate-400 font-medium uppercase tracking-[0.18em]">vs S&amp;P 500</div>
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
                <>
                    <DeskInsights positions={positions} summary={allHistorySummary} />
                    <PositionsTable
                        positions={sortedPositions}
                        onAddToWatchlist={handleAddToWatchlist}
                        onSelect={setSelectedStock}
                        sortConfig={sortConfig}
                        onSort={requestSort}
                    />
                </>
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

function PortfolioHeader({ positions, history, uploading, deleting, onDelete, onUpload }) {
    const hasData = positions.length > 0 || history.length > 0;

    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6 group">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 tracking-tight flex items-center gap-3">
                My Portfolio
                <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-[0.18em]">Live</span>
            </h1>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {hasData && (
                    <button
                        onClick={onDelete}
                        disabled={uploading || deleting}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl border border-red-400/30 bg-red-500/10 text-red-500 hover:bg-red-500/15 transition-colors"
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
    const safeBaseValue = portfolioPct > -99.9
        ? (summary.portfolio?.total_value || 0) / (1 + portfolioPct / 100)
        : (summary.portfolio?.total_invested || 0);
    const benchmarkValue = safeBaseValue * (1 + benchmarkPct / 100);
    const deltaVsBenchmark = (summary.portfolio?.total_value || 0) - benchmarkValue;
    const invested = summary.portfolio?.total_invested || 0;
    const stats = [
        { label: 'Total Value', value: summary.portfolio?.total_value || 0, tone: 'text-white' },
        { label: 'Invested', value: invested, tone: 'text-slate-200' },
        { label: 'Return', value: portfolioPct, tone: portfolioPct >= 0 ? 'text-emerald-400' : 'text-red-400', isPct: true },
        { label: 'S&P 500 Alt', value: benchmarkValue, tone: 'text-slate-200' },
        { label: 'Delta vs Bench', value: deltaVsBenchmark, tone: deltaVsBenchmark >= 0 ? 'text-emerald-400' : 'text-red-400', signed: true },
        { label: 'Cash If Idle', value: invested, tone: 'text-slate-400' },
    ];

    return (
        <div className="mb-8 rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#202832] dark:bg-[#0a0e13] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr_1fr]">
                <div className="px-6 py-6 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-[#202832]">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 dark:text-slate-500 font-bold mb-3">Portfolio</div>
                    <div className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
                        ${Number(summary.portfolio?.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <DeskKpi label="Today" value={summary.portfolio?.today_change_pct || 0} isPct />
                        <DeskKpi label={periodLabel} value={portfolioPct} isPct />
                        <DeskKpi label="Vs S&P" value={portfolioPct - benchmarkPct} isPct />
                    </div>
                </div>
                <div className="px-6 py-6 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-[#202832]">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-gray-500 dark:text-slate-500 font-bold mb-3">
                        Benchmark Alt
                        <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-slate-700 flex items-center justify-center text-[10px] text-gray-400 dark:text-slate-500 cursor-help" title="MAX benchmark simulation aligned to the same performance basis as the ALL chart">?</span>
                    </div>
                    <div className="text-4xl font-bold tracking-tight text-gray-900 dark:text-slate-100 mb-4">
                        ${Number(benchmarkValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <DeskKpi label="Today" value={summary.benchmark?.today_change_pct || 0} isPct />
                        <DeskKpi label={periodLabel} value={benchmarkPct} isPct />
                    </div>
                </div>
                <div className="px-6 py-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 dark:text-slate-500 font-bold mb-3">Desk Snapshot</div>
                    <div className="space-y-3">
                        {stats.map((item) => (
                            <div key={item.label} className="flex items-baseline justify-between gap-4">
                                <span className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500 font-semibold">{item.label}</span>
                                <span className={`text-sm font-bold ${item.tone}`}>
                                    {item.isPct
                                        ? `${item.value >= 0 ? '+' : ''}${Number(item.value).toFixed(2)}%`
                                        : formatSignedCurrency(item.value, item.signed)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DeskKpi({ label, value, isPct = false }) {
    const positive = Number(value) >= 0;
    return (
        <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500 font-semibold mb-1">{label}</div>
            <div className={`text-sm font-bold ${positive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {positive ? '+' : ''}{Number(value).toFixed(2)}{isPct ? '%' : ''}
            </div>
        </div>
    );
}

function DeskInsights({ positions, summary }) {
    const best = [...positions].sort((a, b) => b.unrealized_gain_abs - a.unrealized_gain_abs)[0];
    const worst = [...positions].sort((a, b) => a.unrealized_gain_abs - b.unrealized_gain_abs)[0];
    const topWeight = [...positions].sort((a, b) => b.allocation_pct - a.allocation_pct)[0];
    const insights = [
        { label: 'Best', value: best ? `${best.symbol}  ${best.unrealized_gain_abs >= 0 ? '+' : '-'}$${Math.abs(best.unrealized_gain_abs).toFixed(2)}` : 'N/A' },
        { label: 'Worst', value: worst ? `${worst.symbol}  ${worst.unrealized_gain_abs >= 0 ? '+' : '-'}$${Math.abs(worst.unrealized_gain_abs).toFixed(2)}` : 'N/A' },
        { label: 'Top Weight', value: topWeight ? `${topWeight.symbol}  ${topWeight.allocation_pct.toFixed(2)}%` : 'N/A' },
        { label: 'Simple ROI', value: `${(summary?.portfolio?.simple_roi_pct || 0) >= 0 ? '+' : ''}${(summary?.portfolio?.simple_roi_pct || 0).toFixed(2)}%` },
    ];

    return (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {insights.map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-slate-500 font-semibold mb-2">{item.label}</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-slate-100">{item.value}</div>
                </div>
            ))}
        </div>
    );
}

function SortableHeader({ label, sortKey, sortConfig, onSort, align = 'left' }) {
    const isActive = sortConfig.key === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            className={`px-4 py-4 text-${align} text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em] cursor-pointer hover:text-blue-600 dark:hover:text-slate-200 transition-colors group`}
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
        <div className="bg-white dark:bg-[#0a0e13] rounded-2xl shadow-sm border border-gray-100 dark:border-[#202832]">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-[1200px] w-full divide-y divide-gray-100 dark:divide-[#202832]">
                    <thead className="bg-gray-50 dark:bg-[#0d1218] sticky top-0">
                        <tr>
                            <SortableHeader label="Ticker" sortKey="symbol" sortConfig={sortConfig} onSort={onSort} />
                            <SortableHeader label="Allocation" sortKey="allocation_pct" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Last" sortKey="curr_price" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Avg Cost" sortKey="avg_cost" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="1D Gain %" sortKey="day_gain_pct" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Unr. Gain $" sortKey="unrealized_gain_abs" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Market Value" sortKey="market_value" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <SortableHeader label="Shares" sortKey="quantity" sortConfig={sortConfig} onSort={onSort} align="right" />
                            <th className="px-4 py-4 text-right text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-[#0a0e13] divide-y divide-gray-100 dark:divide-[#202832]">
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
        <tr onClick={onClick} className="hover:bg-gray-50 dark:hover:bg-[#0f151d] transition-colors cursor-pointer group">
            <td className="px-4 py-4 whitespace-nowrap min-w-[240px]">
                <div className="flex items-center gap-3">
                    {pos.logo ? (
                        <img src={pos.logo} alt={pos.symbol} className="w-8 h-8 rounded-md object-contain bg-white shadow-sm p-0.5 border border-gray-100" />
                    ) : (
                        <div className="w-8 h-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-xs shadow-sm">
                            {pos.symbol.charAt(0)}
                        </div>
                    )}
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors tracking-wide">{pos.symbol}</span>
                        <span className="text-[10px] text-gray-500 dark:text-slate-500 font-medium truncate max-w-[160px] uppercase tracking-[0.08em]">
                            {pos.name || pos.broker}
                        </span>
                    </div>
                </div>
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300">{pos.allocation_pct.toFixed(2)}%</div>
                <div className="w-20 h-1.5 bg-gray-100 dark:bg-[#101722] rounded-full ml-auto mt-1 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pos.allocation_pct, 100)}%` }} />
                </div>
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900 dark:text-slate-100">
                ${pos.curr_price.toFixed(2)}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-600 dark:text-slate-400">
                ${pos.avg_cost.toFixed(2)}
            </td>
            <td className={`px-4 py-4 whitespace-nowrap text-right text-sm font-bold ${isPositiveDay ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                <div className="flex items-center justify-end gap-1">
                    {isPositiveDay ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositiveDay ? '+' : ''}{pos.day_gain_pct.toFixed(2)}%
                </div>
            </td>
            <td className={`px-4 py-4 whitespace-nowrap text-right text-sm font-bold ${isPositiveUnr ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositiveUnr ? '+' : ''}${Math.abs(pos.unrealized_gain_abs).toFixed(2)}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900 dark:text-slate-100">
                ${pos.market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-600 dark:text-slate-400">
                {pos.quantity.toFixed(4)}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right">
                <button
                    onClick={(e) => { e.stopPropagation(); onAddToWatchlist(pos); }}
                    className="p-1.5 text-gray-400 hover:text-yellow-400 transition-colors rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/10"
                >
                    <Star size={16} />
                </button>
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
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-[#111723] rounded-xl border border-gray-200 dark:border-[#202832]">
            {periods.map((p) => (
                <button
                    key={p.value}
                    onClick={() => onSelect(p.value)}
                    disabled={loading}
                    className={`px-3 py-1.5 text-xs rounded-lg font-bold transition-all ${current === p.value
                        ? 'bg-white dark:bg-[#1a2330] text-blue-600 dark:text-slate-100 shadow-sm'
                        : 'text-gray-500 dark:text-slate-500 hover:text-gray-900 dark:hover:text-slate-200'
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
        ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400/20'
        : 'bg-blue-600 hover:bg-blue-500 border-blue-400/20';

    return (
        <label className={`flex-1 md:flex-none ${styles} border text-white font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-all text-sm flex items-center justify-center gap-2 active:scale-95 ${uploading ? 'opacity-75' : ''}`}>
            {active ? <LoadingSpinner size="sm" /> : <UploadIcon />}
            {active ? 'Analyzing...' : isEtoro ? 'eToro' : 'XTB'}
            <input
                type="file"
                accept={isEtoro ? '.xlsx,.xls' : '.xlsx,.xls,.csv'}
                className="hidden"
                onChange={(e) => onUpload(e, broker)}
                disabled={uploading}
            />
        </label>
    );
}

function EmptyState() {
    return (
        <div className="bg-white dark:bg-[#0a0e13] rounded-2xl p-12 text-center shadow-sm border border-gray-100 dark:border-[#202832]">
            <div className="w-16 h-16 bg-gray-50 dark:bg-[#111723] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3.586a1 1 0 00-.707.293l-1.414 1.414a1 1 0 01-.707.293h-4.242a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 006.586 13H4" />
                </svg>
            </div>
            <p className="text-gray-900 dark:text-white text-lg font-semibold italic">No positions found.</p>
            <p className="text-gray-500 dark:text-slate-400 mt-2">Import your eToro or XTB statement to get started.</p>
        </div>
    );
}

function formatSignedCurrency(value, signed = false) {
    const amount = Number(value) || 0;
    const absFormatted = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!signed) {
        return `$${absFormatted}`;
    }
    return `${amount >= 0 ? '+' : '-'}$${absFormatted}`;
}

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
