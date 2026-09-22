/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Tells Tailwind to scan your components and pages
  ],
  theme: {
    extend: {
      colors: {
        sangam: {
          bg: '#F4EEE2',
          text: '#3E2723',
          woodTop: '#DCA766',
          woodFront: '#966031',
        }
      },
      fontFamily: {
        serif: ['ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
      }
    },
  },
  plugins: [],
}