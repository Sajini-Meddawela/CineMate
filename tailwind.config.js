const path = require('node:path');

const resolveContentPath = (pattern) =>
  path.resolve(__dirname, pattern).replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    resolveContentPath('./index.html'),
    resolveContentPath('./src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};