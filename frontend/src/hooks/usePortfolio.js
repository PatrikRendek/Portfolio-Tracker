import { useState, useCallback } from 'react';
import { portfolioApi, watchlistApi } from '../api/client';

export function usePortfolio() {
    const [positions, setPositions] = useState([]);
    const [history, setHistory] = useState([]);
    const [historySummary, setHistorySummary] = useState(null);
    const [allHistory, setAllHistory] = useState([]);
    const [allHistorySummary, setAllHistorySummary] = useState(null);
    const [historyPeriod, setHistoryPeriod] = useState('6mo');
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [uploading, setUploading] = useState(null); // 'xtb' or 'etoro'
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState(null);

    const fetchPositions = useCallback(async () => {
        try {
            const res = await portfolioApi.getPositions();
            setPositions(res);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to load portfolio');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async (period) => {
        setHistoryLoading(true);
        try {
            const requests = [portfolioApi.getHistory(period)];
            if (period === 'all') {
                requests.push(Promise.resolve(null));
            } else {
                requests.push(portfolioApi.getHistory('all'));
            }

            const [res, allRes] = await Promise.all(requests);
            setHistory(res.history || []);
            setHistorySummary(res.summary || null);
            if (period === 'all') {
                setAllHistory(res.history || []);
                setAllHistorySummary(res.summary || null);
            } else if (allRes) {
                setAllHistory(allRes.history || []);
                setAllHistorySummary(allRes.summary || null);
            }
            setHistoryPeriod(period);
        } catch (err) {
            console.error(err);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const handleFileUpload = useCallback(async (e, broker = 'xtb') => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setUploading(broker);
        setError(null);
        try {
            if (broker === 'etoro') {
                await portfolioApi.uploadEtoro(formData);
            } else {
                await portfolioApi.uploadXtb(formData);
            }
            await fetchPositions();
            // Default to 6mo if it was never set, otherwise use current
            setHistoryPeriod(prev => {
                fetchHistory(prev || '6mo');
                return prev || '6mo';
            });
        } catch (err) {
            console.error(err);
            setError(err.message || `Failed to upload ${broker.toUpperCase()} file`);
        } finally {
            setUploading(null);
            if (e.target) e.target.value = null;
        }
    }, [fetchPositions, fetchHistory]);

    const handleDeletePortfolio = useCallback(async () => {
        if (!window.confirm("Are you sure you want to delete all portfolio data?")) return;
        setDeleting(true);
        setError(null);
        try {
            await portfolioApi.deletePortfolio();
            await fetchPositions();
            setHistory([]);
            setHistorySummary(null);
            setAllHistory([]);
            setAllHistorySummary(null);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to delete portfolio');
        } finally {
            setDeleting(false);
        }
    }, [fetchPositions]);

    const handleAddToWatchlist = useCallback(async (pos) => {
        try {
            await watchlistApi.add(pos.symbol, pos.name || pos.symbol);
            alert(`${pos.symbol} has been added to the watchlist!`);
        } catch (err) {
            alert('Failed to add to watchlist. It might already be there.');
        }
    }, []);

    return {
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
    };
}
