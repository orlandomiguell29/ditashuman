import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El backend corre en otro origen (localhost:4000). En desarrollo se usa
    // proxy para no exponer la API en el bundle ni lidiar con CORS extra.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
