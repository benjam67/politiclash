# PolitiClash

Jeu de combat de gifles en temps réel, façon jeu de baston anime des années 90, jouable sur mobile (PWA, paysage). Les combattants définitifs seront des caricatures de personnalités politiques françaises, tous partis confondus.

**Jouer** : https://benjam67.github.io/politiclash/

- Feuille de route : [ROADMAP.md](ROADMAP.md)
- Avancement et réglages : [CHANGELOG.md](CHANGELOG.md)
- Poses, tailles et règles des décors : [GUIDE-DESSINS.md](GUIDE-DESSINS.md)

## État

Phases 0 à 4 terminées : le solo se joue de bout en bout. On choisit son combattant, son adversaire, la difficulté (IA Facile, Normal, Difficile) et le lieu, puis on se bat en 2 rounds gagnants. Restent les gifles spéciales et la rage (phase 5), la finition (phase 6) et le jeu en ligne (phase 7).

## Comment jouer

| | Tactile | Clavier |
| --- | --- | --- |
| Se déplacer, sauter, s'accroupir | Stick à gauche | Flèches ou ZQSD |
| Gifle (haute), debout ou en l'air | GIFLE | J |
| Coup de pied (bas) ; accroupi : balayette | PIED | I |
| Grosse gifle : maintenir, relâcher dans la zone dorée | GROSSE GIFLE | K |
| Garde haute, contre les gifles | GARDE | L |
| Garde basse, contre les coups de pied | GARDE + stick vers le bas | L + flèche bas |

## Habillage : textes et images

Tout ce qui donne un visage et un nom aux combattants se trouve à deux endroits, et nulle part ailleurs :

- **`src/config/texts.ts`** : titre du jeu, noms, noms des coups spéciaux, répliques du commentateur.
- **`raw/`** : les dessins (PNG). `raw/fighters/<perso>/<pose>.png` pour les combattants, `raw/stages/<niveau>/` pour les décors. Après un changement : `npm run assets`.

Le profil de jeu de chaque combattant (son « gabarit ») se choisit dans `src/config/roster.ts`.

## Développement

```bash
npm install
npm run dev        # serveur local
npm test           # tests unitaires (Vitest)
npm run test:e2e   # tests Playwright sur mobile émulé (build + preview)
BASE_URL=https://benjam67.github.io/politiclash/ npm run test:e2e   # contre la version en ligne
npm run assets     # régénère public/assets/ depuis raw/
npm run sim        # équilibrage : 200 matchs IA contre IA par affiche
npm run music -- sortie.wav   # rend la musique en fichier
```

Accès direct au combat : `?scene=fight&p1=bernard|lola&p2=bernard|lola&stage=bar&level=easy|normal|hard`. Démo IA contre IA : `?autoplay=1`. Pour les essais : `&foe=idle|wander|dummy` (adversaire d'essai à la place de l'IA), `&intro=0` (sans l'annonce), `&touch=1` (contrôles tactiles sur ordinateur).
