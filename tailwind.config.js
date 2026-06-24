/** @type {import('tailwindcss').Config} */
// Palette mirrors src/theme.ts (EFG-inspired private-banking style). The
// semantic brand-* token names are kept so existing classNames recolor in place.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'brand-primary': '#8C3A38',        // Deep maroon red (emphasis)
        'brand-primary-dark': '#6E2A28',   // Darker red (hover)
        'brand-secondary': '#52616A',      // Slate
        'brand-secondary-dark': '#3A4248', // Dark slate
        'brand-accent': '#A9B8BE',         // Light blue-grey (mist)
        'brand-text-primary': '#2B3338',   // Charcoal
        'brand-text-secondary': '#6B7780', // Slate grey
        'brand-bg-body': '#F4F5F4',        // Cool off-white
        // Extended EFG-style tokens
        'efg-steel': '#7E8C9A',
        'efg-sand': '#C9C7BB',
        'efg-line': '#E4E6E4',
        'status-green': '#3F7A5E',
        'status-amber': '#B8862E',
        'status-red': '#A33A33',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(43 51 56 / 0.04), 0 1px 3px 0 rgb(43 51 56 / 0.06)',
      },
    }
  },
  plugins: [],
}
