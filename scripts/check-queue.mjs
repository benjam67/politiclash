// Vérifie que la file d'attente en ligne répond (utilisé après le déploiement du serveur) :
// connexion WebSocket depuis la page du jeu, présentation, et réception du nombre de joueurs en ligne.
// Usage : node scripts/check-queue.mjs https://france-bagarre.ben-aub.workers.dev
const base = process.argv[2];
const url = `${base.replace(/^http/, 'ws')}/queue`;
const ws = new WebSocket(url, { headers: { Origin: 'https://benjam67.github.io' } });
const timer = setTimeout(() => {
  console.error('File d’attente : pas de réponse en 15 s.');
  process.exit(1);
}, 15_000);
ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 'verification', pseudo: 0 }));
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.t === 'count') {
    console.log(`File d’attente : en ligne, ${m.online} connecté(s).`);
    clearTimeout(timer);
    ws.close();
    process.exit(0);
  }
};
ws.onerror = (e) => {
  console.error('File d’attente : erreur', e.message ?? e);
  process.exit(1);
};
