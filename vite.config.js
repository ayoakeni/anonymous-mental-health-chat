import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 3000,
    open: true,
  },

  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Group big libraries into their own chunks for better caching
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'firebase-vendor';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('lodash') || id.includes('dayjs') || id.includes('emoji-picker-react')) {
              return 'utils-vendor';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});