import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="h-10 w-10 rounded-xl flex items-center justify-center border transition-all duration-300
            bg-gray-50 hover:bg-gray-100 text-[#22324a] border-gray-200
            dark:bg-[#111723] dark:hover:bg-[#182131] dark:text-[#d7e1ee] dark:border-[#253041]"
            aria-label="Toggle theme"
        >
            <div className="transition-transform duration-500" style={{ transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(180deg)' }}>
                {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
            </div>
        </button>
    );
}
