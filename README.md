# PolitiClash

Jeu de combat de gifles en temps réel, façon jeu de baston anime des années 90, jouable sur mobile (PWA, paysage). Les combattants définitifs seront des caricatures de personnalités politiques françaises, tous partis confondus.

**Jouer** : https://benjam67.github.io/politiclash/

- Feuille de route : [ROADMAP.md](ROADMAP.md)
- Avancement et réglages : [CHANGELOG.md](CHANGELOG.md)

## État

Phases 0 à 2 terminées : un match complet se joue contre un mannequin (déplacements, gifles, grosse gifle à jauge, garde, K.O., rounds, écran de résultat). La vraie IA arrive en phase 3, le choix du personnage et du niveau en phase 4.

## Comment jouer

| | Tactile | Clavier |
| --- | --- | --- |
| Se déplacer, sauter, s'accroupir | Stick à gauche | Flèches ou ZQSD |
| Gifle (debout, accroupi ou en l'air) | GIFLE | J |
| Grosse gifle : maintenir, relâcher dans la zone dorée | GROSSE GIFLE | K |
| Garde | GARDE | L |

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
npm run music -- sortie.wav   # rend la musique en fichier
```

Accès direct au combat : `?scene=fight&p1=bernard|lola&p2=bernard|lola&stage=bar`, plus `&foe=idle|wander` (adversaire immobile ou qui se promène), `&intro=0` (sans l'annonce) et `&touch=1` (contrôles tactiles sur ordinateur).
