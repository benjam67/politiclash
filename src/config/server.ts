// Adresse du serveur du jeu (Cloudflare Worker, dossier `server/`). Vide : pas de serveur, le jeu se
// contente de la connexion directe (et du service public de PeerJS pour la mise en relation).
// Essais : `?server=http://127.0.0.1:8787` remplace cette adresse ; `?server=` (vide) la coupe.
export const SERVER_URL = 'https://france-bagarre.ben-aub.workers.dev';

export function serverUrl(search: string = typeof location === 'undefined' ? '' : location.search): string {
  const q = new URLSearchParams(search);
  // Si le réglage apparaît plusieurs fois, c'est le dernier qui compte (les tests en ajoutent un par-dessus).
  return (q.has('server') ? (q.getAll('server').pop() ?? '') : SERVER_URL).replace(/\/+$/, '');
}
