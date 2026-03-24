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
        const labels = sortedData.map((d) => {
            const date = new Date(d.date);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                year: isMultiYear ? 'numeric' : undefined,
                day: 'numeric'
            });
        });

        const portfolioVals = sortedData.map((d) => d.portfolio_pct ?? 0);
        const benchmarkVals = sortedData.map((d) => d.benchmark_pct ?? null);

        const isDark = theme === 'dark';
        const portfolioColor = '#22c55e';
        const benchmarkColor = '#7ba7d9';
        const textColor = isDark ? '#cbd5e1' : '#334155';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.10)' : 'rgba(51, 65, 85, 0.08)';

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.24)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

        const fmtPct = (v) => `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Portfolio',
                        data: portfolioVals,
                        borderColor: portfolioColor,
                        borderWidth: 2.5,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.18,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointHoverBackgroundColor: portfolioColor,
                        pointHoverBorderColor: isDark ? '#020617' : '#ffffff',
                        pointHoverBorderWidth: 2,
                    },
                    {
                        label: benchmarkName,
                        data: benchmarkVals,
                        borderColor: benchmarkColor,
                        borderWidth: 2,
                        borderDash: [4, 6],
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.18,
                        pointRadius: 0,
                        pointHoverRadius: 3,
                        pointHoverBackgroundColor: benchmarkColor,
                        pointHoverBorderColor: isDark ? '#020617' : '#ffffff',
                        pointHoverBorderWidth: 2,
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
                            color: textColor,
                            font: { family: 'ui-monospace, SFMono-Regular, Menlo, monospace', size: 12, weight: '700' },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 7,
                            boxHeight: 7,
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(10, 14, 19, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                        titleColor: isDark ? '#f8fafc' : '#0f172a',
                        bodyColor: textColor,
                        borderColor: isDark ? '#202832' : '#cbd5e1',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 10,
                        displayColors: true,
                        callbacks: {
                            label: (tooltipItem) => {
                                const label = tooltipItem.dataset.label || '';
                                const val = tooltipItem.parsed.y;
                                return `${label}: ${val >= 0 ? '+' : ''}${fmtPct(val)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: {
                            color: gridColor,
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? '#64748b' : '#475569',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8,
                            font: { size: 11, family: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
                        },
                    },
                    y: {
                        grid: {
                            color: gridColor,
                            drawBorder: false,
                        },
                        ticks: {
                            color: isDark ? '#64748b' : '#475569',
                            callback: (v) => `${v > 0 ? '+' : ''}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}%`,
                            font: { size: 11, family: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
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
