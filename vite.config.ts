import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {defineConfig} from 'vite';

// Generate a unique build hash for version checking
const buildHash = crypto.randomBytes(8).toString('hex');

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'version-json',
        writeBundle() {
          // Write version.json to dist/ after build for update detection
          fs.writeFileSync(
            path.resolve(__dirname, 'dist/version.json'),
            JSON.stringify({ hash: buildHash, time: new Date().toISOString() })
          );
        },
      },
    ],
    define: {
      __BUILD_HASH__: JSON.stringify(buildHash),
    },
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
            'vendor-ui': ['react', 'react-dom', 'sonner', 'lucide-react'],
          },
        },
      },
    },
    server: {
      hmr: true,
    },
  };
});
