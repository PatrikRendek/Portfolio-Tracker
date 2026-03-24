import { useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { useTheme } from '../context/ThemeContext';

Chart.register(...registerables);

export default function StockChart({ data, symbol, height = 300, transactions = [], highlightedDate = null }) {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const highlightedIdxRef = useRef(-1);
    const { theme } = useTheme();

    // Memoize static data
    const { sortedData, labels, prices, markerData } = useMemo(() => {
        const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Dynamic date formatting based on time span
        const firstDate = new Date(sorted[0]?.date);
        const lastDate = new Date(sorted[sorted.length - 1]?.date);
        const diffYears = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365);

        const lbls = sorted.map(d => {
            const date = new Date(d.date);
            if (diffYears > 1.2) {
                // For long spans, show Month + Full Year (e.g. Oct 2021)
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
            if (diffYears > 0.5) {
                // For mid-spans, show Month + Year (e.g. Oct 23)
                return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        const prcs = sorted.map(d => d.close);

        const mData = new Array(lbls.length).fill(null);
        transactions.forEach(tx => {
            const txDate = new Date(tx.date).setHours(0, 0, 0, 0);
            let closestIdx = -1;
            let minDiff = Infinity;
            sorted.forEach((d, idx) => {
                const dDate = new Date(d.date).setHours(0, 0, 0, 0);
                const diff = Math.abs(txDate - dDate);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = idx;
                }
            });
            if (minDiff <= 3 * 24 * 60 * 60 * 1000 && closestIdx !== -1) {
                mData[closestIdx] = prcs[closestIdx];
            }
        });

        return { sortedData: sorted, labels: lbls, prices: prcs, markerData: mData };
    }, [data, transactions]);

    // Update highlighted index ref independently
    useEffect(() => {
        let newIdx = -1;
        if (highlightedDate) {
            const hDate = new Date(highlightedDate).setHours(0, 0, 0, 0);
            let minDiff = Infinity;
            sortedData.forEach((d, idx) => {
                const dDate = new Date(d.date).setHours(0, 0, 0, 0);
                const diff = Math.abs(hDate - dDate);
                if (diff < minDiff) {
                    minDiff = diff;
                    newIdx = idx;
                }
            });
            if (minDiff > 3 * 24 * 60 * 60 * 1000) newIdx = -1;
        }
        highlightedIdxRef.current = newIdx;

        // ONLY update if chart exists and has been fully initialized
        // This prevents the 'ownerDocument' error during destruction/re-creation
        if (chartInstance.current && chartInstance.current.ctx) {
            try {
                chartInstance.current.update('none');
            } catch (err) {
                console.warn('Silent chart update failed:', err);
            }
        }
    }, [highlightedDate]); // Removed sortedData dependency to avoid race with main setup effect

    // Re-create chart only on data layout or theme change 
    useEffect(() => {
        if (!chartRef.current || labels.length === 0) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');

        // Spike-resistant trend detection
        // If the first point is a massive outlier (> 50% jump from next point), use the second point for coloring
        let startPrice = prices[0];
        if (prices.length > 2) {
            const firstChange = Math.abs((prices[0] - prices[1]) / prices[1]);
            if (firstChange > 0.5) startPrice = prices[1];
        }

        const isPositive = prices.length >= 2 && prices[prices.length - 1] >= startPrice;
        const isDark = theme === 'dark';

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        const positiveLine = '#22c55e';
        const negativeLine = '#ef4444';
        const markerColor = '#22324a';
        if (isPositive) {
            gradient.addColorStop(0, 'rgba(34, 197, 94, 0.24)');
            gradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
        } else {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        }

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: symbol,
                        data: prices,
                        borderColor: isPositive ? positiveLine : negativeLine,
                        borderWidth: 2,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.32,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: isPositive ? positiveLine : negativeLine,
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                    },
                    {
                        label: 'Trades',
                        data: markerData,
                        showLine: false,
                        pointStyle: 'circle',
                        pointRadius: (ctx) => (ctx.dataIndex === highlightedIdxRef.current ? 11 : 5),
                        pointBackgroundColor: (ctx) => (ctx.dataIndex === highlightedIdxRef.current ? '#fff' : markerColor),
                        pointBorderColor: isDark ? '#d7e1ee' : '#fff',
                        pointBorderWidth: 2,
                        pointHoverRadius: 12,
                        pointHoverBackgroundColor: '#fff',
                    }
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(10, 14, 19, 0.96)' : 'rgba(255, 255, 255, 0.96)',
                        titleColor: isDark ? '#f8fafc' : '#0f172a',
                        bodyColor: isDark ? '#cbd5e1' : '#334155',
                        borderColor: isDark ? 'rgba(37, 48, 65, 1)' : 'rgba(226, 232, 240, 1)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 10,
                        displayColors: false,
                        titleFont: { size: 11, family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace' },
                        bodyFont: { size: 11, family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace' },
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.datasetIndex === 1) return `TRADE AT: $${ctx.parsed.y.toFixed(2)}`;
                                return `PRICE: $${ctx.parsed.y.toFixed(2)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: {
                            color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? '#64748b' : '#64748b',
                            maxRotation: 0,
                            maxTicksLimit: 8,
                            font: { size: 11, family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace' },
                        },
                    },
                    y: {
                        grid: {
                            color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? '#64748b' : '#64748b',
                            callback: (v) => `$${v}`,
                            font: { size: 11, family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace' },
                        },
                    },
                },
            },
        });

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
        };
    }, [labels, prices, markerData, symbol, theme, height]);

    return (
        <div style={{ height }}>
            <canvas ref={chartRef} />
        </div>
    );
}
