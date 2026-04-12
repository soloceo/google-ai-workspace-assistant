import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'google-genai': ['@google/genai'],
            'vendor-ui': ['react', 'react-dom', 'motion', 'sonner', 'lucide-react'],
          },
        },
      },
    },
    server: {
      hmr: true,
    },
  };
});
