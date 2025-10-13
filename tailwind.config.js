/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        'brand-primary': '#2563eb', // blue-600
        'brand-primary-dark': '#1d4ed8', // blue-700
        'brand-secondary': '#475569', // slate-600
        'brand-secondary-dark': '#334155', // slate-700
        'brand-accent': '#94a3b8', // slate-400
        'brand-text-primary': '#1e293b', // slate-800
        'brand-text-secondary': '#64748b', // slate-500
        'brand-bg-body': '#e2e8f0', // slate-200
      }
    }
  },
  plugins: [],
}