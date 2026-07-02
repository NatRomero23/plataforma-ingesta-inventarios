import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy hacia el backend para desarrollo.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
