import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: {
    target: ['es2020', 'safari15'],
    rolldownOptions: {
      input: { main: 'index.html', crownthorn: 'crownthorn-preview.html', bossSkills: 'boss-skills-preview.html', relicEffects: 'relic-effects-preview.html', buildChain: 'build-chain-preview.html', eliteQuake: 'elite-quake-preview.html', treasure: 'treasure-preview.html', woodThrust: 'wood-thrust-preview.html' },
      output: { manualChunks: (id) => id.replaceAll('\\', '/').includes('/node_modules/three/') ? 'three' : undefined },
    },
  },
});
