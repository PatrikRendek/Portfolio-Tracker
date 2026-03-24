/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                dark: {
                    900: '#06080f',
                    800: '#0a0e27',
                    700: '#111638',
                    600: '#1a1f3a',
                    500: '#252b4a',
                    400: '#2f365a',
                },
                accent: {
                    cyan: '#00e5ff',
                    purple: '#7c4dff',
                    magenta: '#e040fb',
                    green: '#00e676',
                    blue: '#448aff',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            backgroundImage: {
                'gradient-accent': 'linear-gradient(135deg, #7c4dff, #00e5ff)',
                'gradient-card': 'linear-gradient(135deg, #1a1f3a, #252b4a)',
                'gradient-btn': 'linear-gradient(135deg, #7c4dff, #e040fb)',
                'gradient-success': 'linear-gradient(135deg, #00e676, #00e5ff)',
            },
            boxShadow: {
                'glow-cyan': '0 0 20px rgba(0, 229, 255, 0.3)',
                'glow-purple': '0 0 20px rgba(124, 77, 255, 0.3)',
                'card': '0 8px 32px rgba(0, 0, 0, 0.3)',
                'card-light': '0 4px 16px rgba(0, 0, 0, 0.08)',
            },
        },
    },
    plugins: [],
}
