import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import StockDetail from './pages/StockDetail';
import Watchlist from './pages/Watchlist';
import Search from './pages/Search';
import Portfolio from './pages/Portfolio';

export default function App() {
    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <ThemeProvider>
                <AuthProvider>
                    <div className="min-h-screen bg-gray-50 transition-colors duration-300 dark:bg-[#050811]">
                        <Navbar />
                        <main>
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/login" element={<Login />} />
                                <Route path="/register" element={<Register />} />
                                <Route path="/stock/:symbol" element={<StockDetail />} />
                                <Route path="/search" element={<Search />} />
                                <Route
                                    path="/watchlist"
                                    element={
                                        <ProtectedRoute>
                                            <Watchlist />
                                        </ProtectedRoute>
                                    }
                                />
                                <Route
                                    path="/portfolio"
                                    element={
                                        <ProtectedRoute>
                                            <Portfolio />
                                        </ProtectedRoute>
                                    }
                                />
                            </Routes>
                        </main>
                    </div>
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}
