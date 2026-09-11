/** @type {import('tailwindcss').Config} */
// Palette mirrors src/theme.ts (EFG-inspired private-banking style). The
// semantic brand-* token names are kept so existing classNames recolor in
// place — every token resolves to a CSS variable (RGB triplet defined in
// src/index.css for :root and .dark), which is what makes the dark mode a
// pure CSS switch: no per-page class changes.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'brand-primary': 'rgb(var(--brand-primary) / <alpha-value>)',        // deep maroon red (emphasis)
        'brand-primary-dark': 'rgb(var(--brand-primary-dark) / <alpha-value>)',
        'brand-secondary': 'rgb(var(--brand-secondary) / <alpha-value>)',    // slate
        'brand-secondary-dark': 'rgb(var(--brand-secondary-dark) / <alpha-value>)',
        'brand-accent': 'rgb(var(--brand-accent) / <alpha-value>)',          // mist
        'brand-text-primary': 'rgb(var(--brand-text-primary) / <alpha-value>)',
        'brand-text-secondary': 'rgb(var(--brand-text-secondary) / <alpha-value>)',
        'brand-bg-body': 'rgb(var(--brand-bg-body) / <alpha-value>)',
        // Extended EFG-style tokens
        'efg-steel': 'rgb(var(--efg-steel) / <alpha-value>)',
        'efg-sand': 'rgb(var(--efg-sand) / <alpha-value>)',
        'efg-line': 'rgb(var(--efg-line) / <alpha-value>)',
        'status-green': 'rgb(var(--status-green) / <alpha-value>)',
        'status-amber': 'rgb(var(--status-amber) / <alpha-value>)',
        'status-red': 'rgb(var(--status-red) / <alpha-value>)',
      },
      boxShadow: {
        // Layered, very soft — reads as "paper on a desk" rather than a box.
        card: '0 1px 2px 0 rgb(43 51 56 / 0.04), 0 2px 6px -1px rgb(43 51 56 / 0.05), 0 6px 16px -6px rgb(43 51 56 / 0.05)',
        'card-hover': '0 2px 4px 0 rgb(43 51 56 / 0.05), 0 6px 14px -3px rgb(43 51 56 / 0.08), 0 14px 32px -12px rgb(43 51 56 / 0.10)',
      },
    }
  },
  plugins: [],
}
