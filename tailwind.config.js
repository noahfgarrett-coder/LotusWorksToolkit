/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // LotusWorks brand
        'lotus-orange': {
          DEFAULT: '#F47B20',
          50: '#FFF3E0',
          100: '#FFE0B2',
          200: '#FFCC80',
          300: '#FFB74D',
          400: '#FFA726',
          500: '#F47B20',
          600: '#E06D15',
          700: '#C75F10',
          800: '#9A3412',
          900: '#7C2D12',
        },
        'lotus-blue': {
          DEFAULT: '#0077B6',
          50: '#E3F2FD',
          100: '#BBDEFB',
          200: '#90CAF9',
          300: '#64B5F6',
          400: '#42A5F5',
          500: '#0077B6',
          600: '#0369A1',
          700: '#0055A4',
          800: '#003459',
          900: '#00171F',
        },
        // Dark mode surfaces
        dark: {
          base: '#0A0A0F',
          elevated: '#12121A',
          surface: '#1A1A24',
          hover: '#22222E',
          active: '#2A2A38',
        },
        // Semantic
        success: {
          DEFAULT: '#22C55E',
          bg: 'rgba(34, 197, 94, 0.15)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: 'rgba(245, 158, 11, 0.15)',
        },
        danger: {
          DEFAULT: '#EF4444',
          bg: 'rgba(239, 68, 68, 0.15)',
        },
        info: {
          DEFAULT: '#3B82F6',
          bg: 'rgba(59, 130, 246, 0.15)',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      boxShadow: {
        'dark-sm': '0 2px 8px rgba(0, 0, 0, 0.4)',
        'dark-md': '0 4px 16px rgba(0, 0, 0, 0.5)',
        'dark-lg': '0 8px 32px rgba(0, 0, 0, 0.6)',
        'dark-xl': '0 16px 48px rgba(0, 0, 0, 0.7)',
        'glow-orange': '0 0 20px rgba(244, 123, 32, 0.3)',
        'glow-blue': '0 0 20px rgba(0, 119, 182, 0.25)',
      },
    },
  },
  plugins: [],
}
