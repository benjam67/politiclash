// Serveurs locaux pour les tests à deux navigateurs (en production : service public de PeerJS, et
// serveur du jeu sur Cloudflare) :
//   - mise en relation PeerJS sur 127.0.0.1:9000/politiclash ;
//   - faux serveur du jeu sur 127.0.0.1:9001 : /ice rend une liste sans relais (pas de relais en local),
//     /calls dit combien de fois /ice a été demandé ;
//   - relais local (TURN) sur 127.0.0.1:3478, et un second faux serveur du jeu sur 127.0.0.1:9002 dont /ice
//     donne ce relais : avec `?relay=1`, on vérifie que la connexion passe vraiment par un relais.
import http from 'node:http';
import { PeerServer } from 'peer';
import Turn from 'node-turn';

const port = Number(process.env.PEER_PORT ?? 9000);
PeerServer({ port, host: '127.0.0.1', path: '/politiclash' });

let calls = 0;
http
  .createServer((req, res) => {
    const cors = { 'access-control-allow-origin': req.headers.origin ?? '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' };
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (req.url === '/ice' && req.method === 'POST') {
      calls += 1;
      return res.writeHead(200, cors).end(JSON.stringify({ iceServers: [{ urls: ['stun:127.0.0.1:3478'] }], ttl: 3600 }));
    }
    if (req.url === '/calls') return res.writeHead(200, cors).end(JSON.stringify({ calls }));
    if (req.url === '/health') return res.writeHead(200, cors).end(JSON.stringify({ ok: true }));
    res.writeHead(404, cors).end('{}');
  })
  .listen(port + 1, '127.0.0.1');
console.log(`mise en relation : 127.0.0.1:${port}/politiclash ; faux serveur du jeu : 127.0.0.1:${port + 1}`);

new Turn({ listeningIps: ['127.0.0.1'], relayIps: ['127.0.0.1'], listeningPort: 3478, authMech: 'long-term', credentials: { essai: 'motdepasse' }, debugLevel: 'OFF' }).start();
http
  .createServer((req, res) => {
    const cors = { 'access-control-allow-origin': req.headers.origin ?? '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' };
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (req.url === '/ice' && req.method === 'POST') {
      return res.writeHead(200, cors).end(JSON.stringify({ iceServers: [{ urls: ['turn:127.0.0.1:3478?transport=udp'], username: 'essai', credential: 'motdepasse' }], ttl: 3600 }));
    }
    res.writeHead(404, cors).end('{}');
  })
  .listen(port + 2, '127.0.0.1');
