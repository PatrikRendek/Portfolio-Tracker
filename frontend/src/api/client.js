const API_BASE = '/api';

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

async function request(url, options = {}) {
    const config = {
        headers: {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            'X-CSRFToken': getCookie('csrftoken'),
            ...options.headers,
        },
        credentials: 'include',
        ...options,
    };

    const response = await fetch(`${API_BASE}${url}`, config);
    if (!response.ok) {
        let errorMsg = 'Something went wrong';
        try {
            const data = await response.json();
            const rawError = data.detail || data.error || errorMsg;

            if (Array.isArray(rawError)) {
                errorMsg = rawError[0];
            } else if (typeof rawError === 'object' && rawError !== null) {
                // If it's a {field: ['error']} object, take the first error value
                const values = Object.values(rawError);
                errorMsg = Array.isArray(values[0]) ? values[0][0] : values[0];
            } else {
                errorMsg = rawError;
            }
        } catch (e) { }
        throw new Error(String(errorMsg));
    }

    if (response.status === 204) return null;
    return await response.json();
}

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
    login: (email, password) =>
        request('/auth/login/', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),
    register: (email, password, first_name, last_name) =>
        request('/auth/register/', {
            method: 'POST',
            body: JSON.stringify({ email, password, first_name, last_name }),
        }),
    logout: () => request('/auth/logout/', { method: 'POST' }),
    getUser: () => request('/auth/user/'),
};

// ─── Stocks ──────────────────────────────────────────────────────
export const stockApi = {
    getEod: (symbols, dateFrom, dateTo, limit = 100) => {
        let url = `/stocks/eod/?symbols=${symbols}&limit=${limit}`;
        if (dateFrom) url += `&date_from=${dateFrom}`;
        if (dateTo) url += `&date_to=${dateTo}`;
        return request(url);
    },
    getEodLatest: (symbols) => request(`/stocks/eod/latest/?symbols=${symbols}`),
    search: (query) => request(`/stocks/search/?q=${query}`),
    getDetail: (symbol, period = '1mo') => request(`/stocks/${symbol}/?period=${period}`),
};

// ─── Watchlist ───────────────────────────────────────────────────
export const watchlistApi = {
    getAll: () => request('/watchlist/'),
    add: (symbol, name) =>
        request('/watchlist/', {
            method: 'POST',
            body: JSON.stringify({ symbol, name }),
        }),
    remove: (id) =>
        request(`/watchlist/${id}/`, { method: 'DELETE' }),
};

// ─── Portfolio ───────────────────────────────────────────────────
export const portfolioApi = {
    getPositions: () => request(`/portfolio/positions/?_t=${Date.now()}`),
    deletePortfolio: () => request('/portfolio/positions/', { method: 'DELETE' }),
    getHistory: (period = '6mo') => request(`/portfolio/history/?period=${period}&_t=${Date.now()}`),
    uploadXtb: (formData) =>
        request('/portfolio/xtb/upload/', {
            method: 'POST',
            body: formData,
        }),
    uploadEtoro: (formData) =>
        request('/portfolio/etoro/upload/', {
            method: 'POST',
            body: formData,
        }),
};
