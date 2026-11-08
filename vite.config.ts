import { defineConfig } from 'vite';

// Adresses relatives : le même build marche à la racine (https://france-bagarre.fr/, Cloudflare)
// comme dans un sous-dossier (ancienne adresse GitHub Pages, …/politiclash/).
export default defineConfig({
  base: './',
  // Empreinte du commit publié (GitHub Actions) : comparée à version.txt pour repérer une ancienne version.
  define: { __BUILD__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev') },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // Deux pages : le jeu, et la page privée des statistiques (stats.html).
      input: { main: 'index.html', stats: 'stats.html' },
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
