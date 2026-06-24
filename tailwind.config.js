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
        'brand-primary': '#c0504d', // A brighter, more distinct Red
        'brand-primary-dark': '#8C4D4D', // The previous "Deep Red"
        'brand-secondary': '#59473C', // Brown
        'brand-secondary-dark': '#45372e', // Darker Brown
        'brand-accent': '#B8A898', // Tan
        'brand-text-primary': '#262626', // Charcoal
        'brand-text-secondary': '#7F7F7F', // Medium Grey
        'brand-bg-body': '#F5F2EF', // Off-white/Light Tan
      }
    }
  },
  plugins: [],
}