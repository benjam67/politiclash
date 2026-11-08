import { defineConfig } from 'vite';

// Adresses relatives : le même build marche à la racine (https://france-bagarre.fr/, Cloudflare)
// comme dans un sous-dossier (ancienne adresse GitHub Pages, …/politiclash/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Phaser dans un fichier à part : mis en cache d'une version à l'autre.
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
