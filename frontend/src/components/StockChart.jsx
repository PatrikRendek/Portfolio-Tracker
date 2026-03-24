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
        if (isPositive) {
            gradient.addColorStop(0, 'rgba(0, 230, 118, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 230, 118, 0.0)');
        } else {
            gradient.addColorStop(0, 'rgba(255, 82, 82, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 82, 82, 0.0)');
        }

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: symbol,
                        data: prices,
                        borderColor: isPositive ? '#00e676' : '#ff5252',
                        borderWidth: 2,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: isPositive ? '#00e676' : '#ff5252',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                    },
                    {
                        label: 'Trades',
                        data: markerData,
                        showLine: false,
                        pointStyle: 'circle',
                        pointRadius: (ctx) => (ctx.dataIndex === highlightedIdxRef.current ? 12 : 6),
                        pointBackgroundColor: (ctx) => (ctx.dataIndex === highlightedIdxRef.current ? '#fff' : '#00e676'),
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointHoverRadius: 14,
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
                        backgroundColor: isDark ? 'rgba(26, 31, 58, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        titleColor: isDark ? '#fff' : '#1a1a2e',
                        bodyColor: isDark ? '#e0e0e0' : '#333',
                        borderColor: isDark ? 'rgba(124, 77, 255, 0.3)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1,
                        cornerRadius: 12,
                        padding: 12,
                        displayColors: false,
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
                            color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                            maxRotation: 0,
                            maxTicksLimit: 8,
                            font: { size: 11, family: 'Inter' },
                        },
                    },
                    y: {
                        grid: {
                            color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                            callback: (v) => `$${v}`,
                            font: { size: 11, family: 'Inter' },
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
