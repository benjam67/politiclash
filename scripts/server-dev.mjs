// Serveur du jeu en local pour les tests (vrai Worker et vrai Durable Object, dans le moteur de Cloudflare
// lancé par Wrangler), sur 127.0.0.1:8787. À la place du relais de Cloudflare, il donne le relais local
// (scripts/peer-server.mjs, 127.0.0.1:3478) : aucune clé, rien ne sort de la machine.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ice = [{ urls: ['turn:127.0.0.1:3478?transport=udp'], username: 'essai', credential: 'motdepasse' }];
writeFileSync(new URL('../server/.dev.vars', import.meta.url), `TEST_ICE='${JSON.stringify(ice)}'\n`);
const p = spawn('npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1', '--show-interactive-dev-session=false', '--log-level', 'warn'], {
  cwd: new URL('../server/', import.meta.url),
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => p.kill(sig));
p.on('exit', (code) => process.exit(code ?? 0));
