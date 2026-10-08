/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0F172A',
          800: '#1E293B'
        },
        electric: {
          500: '#3B82F6',
          600: '#2563EB'
        },
        cyan: {
          400: '#22D3EE'
        }
      }
    },
  },
  plugins: [],
}
