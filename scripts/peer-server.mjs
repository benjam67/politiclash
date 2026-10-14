// Serveur de mise en relation PeerJS local, pour les tests à deux navigateurs
// (en production, le jeu utilise le serveur public de PeerJS).
import { PeerServer } from 'peer';

const port = Number(process.env.PEER_PORT ?? 9000);
PeerServer({ port, host: '127.0.0.1', path: '/politiclash' });
console.log(`serveur de mise en relation : 127.0.0.1:${port}/politiclash`);
