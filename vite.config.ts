import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindConfig = path.resolve(projectRoot, 'tailwind.config.js');

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: tailwindConfig }),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
