import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { useTheme } from '../context/ThemeContext';

Chart.register(...registerables);

export default function PortfolioChart({ data, benchmarkName = 'S&P 500', height = 300 }) {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!chartRef.current || !data || data.length === 0) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));

        const isMultiYear = data.length > 365;
        const labels = sortedData.map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                year: isMultiYear ? 'numeric' : undefined,
                day: 'numeric'
            });
        });

        // Absolute dollar values — no normalization artifacts
        const portfolioVals = sortedData.map(d => d.portfolio_pct ?? 0);
        const benchmarkVals = sortedData.map(d => d.benchmark_pct ?? null);

        const mainColor = '#00e676';
        const benchmarkColor = theme === 'dark' ? '#9e9e9e' : '#757575';
        const isDark = theme === 'dark';

        // Gradient fill for portfolio
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(0, 230, 118, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 230, 118, 0.0)');

        const fmtPct = (v) => `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'My Portfolio',
                        data: portfolioVals,
                        borderColor: mainColor,
                        borderWidth: 2,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: mainColor,
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                        yAxisID: 'y',
                    },
                    {
                        label: benchmarkName,
                        data: benchmarkVals,
                        borderColor: benchmarkColor,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointHoverBackgroundColor: benchmarkColor,
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                        yAxisID: 'y',
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
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: isDark ? '#e0e0e0' : '#333',
                            font: { family: 'Inter', size: 12 },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(26, 31, 58, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        titleColor: isDark ? '#fff' : '#1a1a2e',
                        bodyColor: isDark ? '#e0e0e0' : '#333',
                        borderColor: isDark ? 'rgba(124, 77, 255, 0.3)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1,
                        cornerRadius: 12,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                const label = ctx.dataset.label || '';
                                const val = ctx.parsed.y;
                                return `${label}: ${val >= 0 ? '+' : ''}${fmtPct(val)}`;
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
                            callback: (v) => `${v > 0 ? '+' : ''}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}%`,
                            font: { size: 11, family: 'Inter' },
                        },
                    },
                },
            },
        });

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
        };
    }, [data, benchmarkName, theme, height]);

    return (
        <div style={{ height }}>
            <canvas ref={chartRef} />
        </div>
    );
}
