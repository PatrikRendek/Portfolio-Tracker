import { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import axios from 'axios';
import StockChart from './StockChart';

export default function StockDetailModal({ symbol, name, logo, onClose }) {
    const [transactions, setTransactions] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(true);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('6mo');
    const [hoveredTxDate, setHoveredTxDate] = useState(null);

    useEffect(() => {
        const fetchTxs = async () => {
            try {
                const res = await axios.get(`/api/portfolio/transactions/${symbol}/`);
                setTransactions(res.data);
            } catch (err) {
                console.error('Error fetching transactions:', err);
                setError('Failed to load transaction history.');
            } finally {
                setLoading(false);
            }
        };

        const fetchChart = async () => {
            setChartLoading(true);
            try {
                const res = await axios.get(`/api/stocks/${symbol}/?period=${period}`);
                setChartData(res.data.eod || []);
            } catch (err) {
                console.error('Error fetching chart data:', err);
            } finally {
                setChartLoading(false);
            }
        };

        fetchTxs();
        fetchChart();
    }, [symbol, period]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl dark:border-[#202832] dark:bg-[#0a0e13] flex flex-col">
                <div className="p-6 border-b border-gray-100 dark:border-[#202832] flex justify-between items-center bg-gray-50 dark:bg-[#0f151d]">
                    <div className="flex items-center gap-4">
                        {logo ? (
                            <img src={logo} alt={name} className="w-12 h-12 rounded-xl border border-gray-200 dark:border-[#202832] bg-white shadow-sm" />
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-[#22324a] border border-[#314766] flex items-center justify-center text-white font-bold text-xl">
                                {symbol[0]}
                            </div>
                        )}
                        <div>
                            <div className="text-[11px] uppercase tracking-[0.22em] text-gray-400 dark:text-slate-500 font-bold mb-1">Position Detail</div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{symbol}</h2>
                            <p className="text-sm text-gray-500 dark:text-slate-400">{name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors dark:border-[#202832] dark:text-slate-400 dark:hover:bg-[#111723]"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#202832] dark:bg-[#0f151d]">
                        <div className="flex justify-between items-center mb-4">
                            <PeriodToggle current={period} onSelect={setPeriod} />
                        </div>

                        {chartLoading ? (
                            <div className="h-48 flex items-center justify-center">
                                <div className="w-8 h-8 border-2 border-[#22324a] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : chartData.length > 0 ? (
                            <StockChart
                                data={chartData}
                                symbol={symbol}
                                height={240}
                                transactions={transactions}
                                highlightedDate={hoveredTxDate}
                            />
                        ) : (
                            <div className="h-48 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                                No historical chart data available.
                            </div>
                        )}
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                        <Calendar size={18} className="text-[#22324a] dark:text-slate-300" />
                        Transaction History
                    </h3>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-[#22324a] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 text-red-500">{error}</div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-[#202832]">
                            <table className="min-w-full divide-y divide-gray-100 dark:divide-[#202832]">
                                <thead className="bg-gray-50 dark:bg-[#0f151d]">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Date</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Type</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Shares</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Price</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-[0.22em]">Total Value</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-[#0a0e13] divide-y divide-gray-100 dark:divide-[#202832]">
                                    {transactions.map((tx, idx) => (
                                        <tr
                                            key={idx}
                                            className={`transition-colors cursor-default hover:bg-gray-50 dark:hover:bg-[#0f151d] ${
                                                hoveredTxDate === tx.date ? 'bg-gray-50 dark:bg-[#111723]' : ''
                                            }`}
                                            onMouseEnter={() => setHoveredTxDate(tx.date)}
                                            onMouseLeave={() => setHoveredTxDate(null)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-slate-300">
                                                {new Date(tx.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] ${
                                                    tx.type === 'buy'
                                                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-400/20'
                                                        : 'bg-red-500/10 text-red-500 border border-red-400/20'
                                                }`}>
                                                    {tx.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-100">
                                                {tx.quantity.toFixed(4)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-slate-300">
                                                ${tx.price.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-slate-100">
                                                ${tx.amount.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PeriodToggle({ current, onSelect }) {
    const periods = ['1mo', '3mo', '6mo', '1y', 'max'];

    return (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200 dark:bg-[#111723] dark:border-[#202832]">
            {periods.map((period) => (
                <button
                    key={period}
                    onClick={() => onSelect(period)}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${
                        current === period
                            ? 'bg-white text-[#22324a] shadow-sm dark:bg-[#1a2330] dark:text-slate-100'
                            : 'text-gray-500 hover:text-gray-900 dark:text-slate-500 dark:hover:text-slate-200'
                    }`}
                >
                    {period.toUpperCase()}
                </button>
            ))}
        </div>
    );
}
