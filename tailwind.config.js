/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sangam: {
          bg: '#F4EEE2',
          text: '#3E2723',
          woodTop: '#DCA766',
          woodFront: '#966031',
        },
        theme: {
          primary: 'var(--theme-primary)',
          bg: 'var(--theme-bg)',
        }
      },
      fontFamily: {
        serif: ['ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
      }
    },
  },
  plugins: [],
}