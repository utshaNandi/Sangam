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
        },
        ivory: '#F8F3E6',
        charcoal: '#171717',
        warmMuted: '#858174',
        warmBorder: '#D8D1C3',
        pastelPink: '#EFA9D1',
        pastelYellow: '#F3D75E',
        pastelGreen: '#A9BD78',
        pastelBlue: '#B7C9EA',
        paleBlush: '#F5E5EE',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        serif: ['ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
      }
    },
  },
  plugins: [],
}