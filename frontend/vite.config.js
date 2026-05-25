import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ['src/main.jsx'],
    include: [
      '@emotion/react',
      '@emotion/styled',
      '@mui/icons-material',
      '@mui/material',
      'react',
      'react-dom',
    ],
  },
  server: {
    fs: {
      strict: true,
      allow: ['.'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
