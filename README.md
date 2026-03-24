# Portfolio-Tracker - Portfolio Dashboard

**Live Demo**: [https://stockpulse-mx3c.onrender.com/](https://stockpulse-mx3c.onrender.com/)

High-performance portfolio tracking application built with a Django/PostgreSQL backend and a React (Vite) frontend. It features real-time historical data, interactive trade visualization, and seamless importing from eToro and XTB.

## Key Features

- **Interactive Portfolio Analytics**: High-performance charts (Chart.js) with real-time detail drill-downs.
- **Debounced Autocomplete Search**: Real-time stock discovery in the navbar with loading indicators and direct navigation.
- **Backend Redis Optimization**: 1-hour caching of search results and market data to ensure sub-second response times.
- **Automatic Market Context**: Context-aware dashboard showing S&P 500 (SPY) for guests and personalized data for members.
- **Trade Syncing**: Automatically highlights trade entry points on historical charts when hovering over transactions.
- **Smart Brokers**: Multi-region support for eToro (Excel) and XTB (CSV) imports with automatic date anomaly detection.
- **Premium UI**: Glassmorphism design system with full Dark/Light mode support.

## Technology Stack

- **Backend**: Python 3.12, Django 5.2, Django REST Framework, Redis (Caching)
- **Frontend**: React 20, Vite, Tailwind CSS, Chart.js, Lucide-React
- **Database**: PostgreSQL 16 (Production) / SQLite (Local Dev)
- **Deployment**: Ready for Render, Docker Compose for local development

## Getting Started (Local)

1. **Pre-requisites**: Docker & Docker Desktop installed.
2. **Environment**:
   - Copy `.env.example` to `.env`
   - Fill in `FINNHUB_API_KEY` and Google OAuth credentials if needed.
3. **Launch**:
   ```bash
   docker-compose up --build
   ```
4. **Access**:
   - Frontend: `http://localhost:5173`
   - API: `http://localhost:8000`

## Broker Importing

1. **eToro**: Export your "Account Statement" in Excel format. Upload in the Portfolio section.
   - *Note: System includes a "Future Date Heuristic" to correctly handle DD/MM vs MM/DD ambiguities.*
2. **XTB**: Export Activity as CSV and upload.

## Deployment (Render)

The project includes a `render.yaml` for one-click deployment.
- Ensure the following environment variables are set in Render:
  - `SECRET_KEY`
  - `FINNHUB_API_KEY`
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

---

