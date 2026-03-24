import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, Calendar, Hash } from 'lucide-react';
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-dark-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-dark-900/50">
                    <div className="flex items-center gap-4">
                        {logo ? (
                            <img src={logo} alt={name} className="w-12 h-12 rounded-xl border border-gray-100 dark:border-gray-700 bg-white shadow-sm" />
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xl">
                                {symbol[0]}
                            </div>
                        )}
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{symbol}</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-full transition-colors text-gray-400"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {/* Period Selector & Chart */}
                    <div className="mb-8 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-gray-50/30 dark:bg-dark-900/20 p-4">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-dark-800 rounded-xl">
                                {['1mo', '3mo', '6mo', '1y', 'max'].map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${period === p
                                                ? 'bg-white dark:bg-dark-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        {p.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {chartLoading ? (
                            <div className="h-48 flex items-center justify-center">
                                <div className="animate-pulse flex gap-2">
                                    <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce"></div>
                                    <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce delay-75"></div>
                                    <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce delay-150"></div>
                                </div>
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
                            <div className="h-48 flex items-center justify-center text-gray-400 italic text-sm">
                                No historical chart data available.
                            </div>
                        )}
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <Calendar size={18} className="text-blue-500" />
                        Transaction History
                    </h3>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 text-red-500">{error}</div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700">
                            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                <thead className="bg-gray-50 dark:bg-dark-900">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Shares</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Total Value</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-dark-800 divide-y divide-gray-100 dark:divide-gray-800">
                                    {transactions.map((tx, idx) => (
                                        <tr
                                            key={idx}
                                            className={`hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors cursor-default ${hoveredTxDate === tx.date ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                                                }`}
                                            onMouseEnter={() => setHoveredTxDate(tx.date)}
                                            onMouseLeave={() => setHoveredTxDate(null)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                                {new Date(tx.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${tx.type === 'buy' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-red-100 text-red-700 dark:bg-red-900/30'
                                                    }`}>
                                                    {tx.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                {tx.quantity.toFixed(4)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                                ${tx.price.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
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
