import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: {
    target: ['es2020', 'safari15'],
    rolldownOptions: {
      input: { main: 'index.html', crownthorn: 'crownthorn-preview.html' },
      output: { manualChunks: (id) => id.replaceAll('\\', '/').includes('/node_modules/three/') ? 'three' : undefined },
    },
  },
});
