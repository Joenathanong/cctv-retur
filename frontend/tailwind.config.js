/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          card: '#1a1d27',
          border: '#2a2d3a',
          muted: '#252836'
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb'
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444'
      }
    }
  },
  plugins: []
};
