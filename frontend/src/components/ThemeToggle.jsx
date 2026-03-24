import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300
        dark:bg-dark-600 dark:hover:bg-dark-500 dark:text-accent-cyan
        bg-gray-100 hover:bg-gray-200 text-accent-purple"
            aria-label="Toggle theme"
        >
            <div className="transition-transform duration-500" style={{ transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(180deg)' }}>
                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            </div>
        </button>
    );
}
