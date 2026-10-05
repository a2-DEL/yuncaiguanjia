/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: {
    // 关闭 preflight，避免重置 antd 组件默认样式
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#EAF1FE',
          100: '#D2E2FD',
          200: '#A9C6FB',
          300: '#7FA9F8',
          400: '#3D7AF0',
          500: '#1B5FE3',
          600: '#164FCB',
          700: '#0E4BC0',
          800: '#0B3C99',
          900: '#082E73',
        },
        ink: {
          900: '#1F2937',
          700: '#374151',
          500: '#6B7280',
          300: '#9CA3AF',
        },
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(20, 30, 60, 0.06)',
        'card-hover': '0 8px 28px 0 rgba(20, 30, 60, 0.12)',
        float: '0 12px 40px 0 rgba(20, 30, 60, 0.16)',
      },
      borderRadius: {
        xl2: '14px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'fade-in': 'fade-in 0.3s ease-out both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
