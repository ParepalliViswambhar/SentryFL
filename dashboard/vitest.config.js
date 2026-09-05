import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false, // Disable CSS processing to avoid ESM issues
    pool: 'forks',
    fileParallelism: false,
    deps: {
      inline: [
        /@mui\//,
        /@emotion\//,
        /@csstools\//,
        /@asamuzakjp\//,
      ],
    },
  },
});
