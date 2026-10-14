# Changelog

## Phase 0 · Mise en place — 2026-10-11

PolitiClash part d'une copie du premier jeu (`soufflet`, gifles au tour par tour). Cette phase le vide de son combat au tour par tour et pose les fondations du jeu de combat en temps réel.

**Audit du code copié**

Le premier jeu était plus avancé que ne le supposait la roadmap : 7 phases terminées, 137 tests unitaires, un mode en ligne (PeerJS, salon à code de 4 lettres), une progression (XP, niveaux, tenues), sons et musique générés en code. Les sprites comptent 11 poses par perso, dont une vraie pose de garde et deux d'esquive.

| Élément | Sort |
| --- | --- |
| Phaser 3.90, TypeScript strict, Vite, Vitest, Playwright, PWA, écran « tourne ton téléphone » | Gardé |
| Chaîne d'images (`npm run assets`, `raw/` → `public/assets/` + `assets.json`) | Gardée ; dossiers renommés `fighters/` et `stages/bar/` |
| `logic/layout.ts` (placement de la scène), `logic/rng.ts` (aléatoire à graine) | Gardés |
| `ui/` (barres de vie, jauge de charge, chrono, losanges, boutons, zone sûre iPhone) | Gardé |
| `fx/` (effets, foule, commentateur, textes pré-rendus), `audio/` (sons, musique) | Gardés ; pas encore rebranchés sur un combat |
| `logic/progress.ts`, `config/progress.ts` (XP, niveaux, tenues) | Mis de côté, plus branchés. À reprendre ou retirer en phase 6 |
| `logic/slap.ts`, `match.ts`, `gesture.ts` (tours, jauge, swipe) | Retirés |
| `logic/ai.ts`, `simulate.ts`, `tests/sim/` | Retirés (réécrits en phase 3) |
| `net/` (4 fichiers), serveur PeerJS de test, dépendances `peerjs` et `peer`, salon HTML dans `index.html` | Retirés (réécrits en phase 7) |
| `scenes/FightScene.ts` (1 876 lignes) | Remplacée par une scène statique de 195 lignes |
| `scenes/TitleScene.ts` | Simplifiée : titre et bouton JOUER |
| Tests du tour par tour (unitaires et Playwright des phases 1 à 7) | Retirés |

Tout ce qui est retiré reste lisible dans l'historique du dépôt et dans `soufflet`.

**Nouveaux fichiers de configuration**

- `config/texts.ts` : **tous les textes** (titre, noms, noms courts, coups spéciaux, répliques du commentateur). C'est le fichier d'habillage du propriétaire ; aucun nom de personnage ailleurs dans le code.
- `config/balance.ts` : réécrit avec les valeurs de départ de la roadmap. Les **gabarits** (`lourd`, `rapide`) y sont des profils de jeu neutres, sans nom.
- `config/roster.ts` : liste des combattants ; chacun choisit un gabarit, une voix (cris graves ou aigus) et des boîtes de corps provisoires.
- `config/stages.ts` : liste des niveaux (le bar).
- `config/poses.ts` : table « action → image » pour les 19 actions du combat, avec les poses provisoires. La garde utilise déjà le vrai dessin.

**Réglages choisis**

- Les distances de la logique sont en px d'un écran logique de 844 × 390 (repère de la roadmap) ; l'affichage reste sur le monde Phaser de 720 de haut, largeur étendue.
- Gabarit `rapide` : valeurs de la roadmap (base 11, résistance 1,1), et non celles du premier jeu (16 et 1,0), qui avaient été réglées pour le tour par tour. L'équilibre sera refait par simulation en phase 3.
- Combat miroir : le second combattant porte une teinte bleutée.
- Les réglages sauvegardés sur l'appareil s'appellent maintenant `politiclash.*` : les deux jeux partagent le même site (`benjam67.github.io`) et ne doivent pas se marcher dessus.
- Accès direct par l'URL : `?scene=fight&p1=bernard|lola&p2=bernard|lola&stage=bar`.

**Renommage et adresse**

- Jeu renommé PolitiClash (titre, écran d'accueil, manifest PWA, `package.json`).
- Adresse du site : `/politiclash/` (c'était `/soufflet/`, le jeu copié ne se serait pas affiché).
- Icônes : toujours le visage de Bernard, à refaire quand les personnages définitifs existeront.

**Vérifications**

- `npm run build` sans erreur ; 48 tests unitaires (placement, progression, cohérence de la configuration : chaque combattant a un gabarit, des textes et une image pour chaque action).
- 7 tests Playwright sur mobile émulé 844 × 390 : scène statique, combat miroir, accueil et bouton JOUER, zone sûre iPhone, écran portrait, manifest. Aucune erreur console.
- Captures d'écran regardées : accueil et scène de combat corrects, rien de coupé.
- Poids du build : 1,25 Mo de code (dont Phaser 1,2 Mo, 319 Ko compressé) et 957 Ko d'images.

## Phase 1 · Temps réel et déplacements — 2026-10-11

**Fait**
- **Simulation à pas fixe** (`logic/fight.ts`) : 60 pas par seconde, indépendants de l'affichage. `step(état, entréesJ1, entréesJ2)` est une fonction pure : aucun appel à Phaser, à l'horloge ou au hasard, et que des entiers (positions en 1/256 de px logique). L'état est un objet simple, copiable, avec une empreinte de contrôle (`hashState`).
- **Entrée unique** (`logic/input.ts`) : `{ gauche, droite, haut, bas, gifle, grosseGifle, garde }`, compactable en un entier pour le réseau. Trois sources la produisent déjà : le clavier, le tactile et un adversaire provisoire qui se promène.
- **Déplacements** : marche avant et arrière, saut vertical, avant ou arrière (trajectoire calculée sans accumulation, direction fixée au décollage), accroupi, retournement automatique, corps qui ne se traversent pas au sol, bords du niveau, distance maximale entre les deux.
- **Caméra** (`logic/camera.ts`) : suit le milieu entre les deux combattants, s'arrête aux bords du niveau. Le niveau fait 2 écrans de large ; le décor du bar est répété en miroir sur les côtés en attendant sa version large.
- **Contrôles tactiles** (`ui/TouchControls.ts`) : stick virtuel à gauche, qui se place sous le pouce ; boutons Gifle, Grosse gifle et Garde à droite (lus dès maintenant, sans effet avant la phase 2). **Clavier** : flèches ou ZQSD, J, K, L.
- **Poses provisoires** branchées : marche (attente avec rebond), saut (attente déplacée), accroupi (attente écrasée).

**Réglages choisis** (`config/balance.ts`)
- Combattants à 60 % de la hauteur d'écran (66 % dans le premier jeu) et saut de 95 px : à 66 % et 120 px, la tête de Bernard sortait de l'écran en sautant.
- Marche arrière à 80 % de la vitesse avant ; vitesse horizontale en saut à 150 % de la marche (un saut vers l'avant au contact passe de l'autre côté).
- Bord du niveau à 140 px du combattant : sa silhouette n'est jamais coupée. Distance maximale entre les deux : 560 px, ce qui tient exactement sur un téléphone 19,5:9.
- Sur un écran moins large (16:9, tablette), la caméra recule juste assez pour garder les deux à l'écran. La logique, elle, ne dépend jamais de l'écran : indispensable pour le jeu en ligne.
- Après un saut par-dessus l'adversaire, les deux corps s'écartent en douceur (6 px par pas au plus) au lieu de se téléporter.
- Stick : zone morte de 20, saut à 38 vers le haut, accroupi à 34 vers le bas (unités d'un écran de 720 de haut). Le seuil du saut est plus grand pour ne pas sauter en marchant.

**Vérifications**
- 73 tests unitaires, dont : vitesses, murs, distance maximale, corps qui ne se traversent pas, durée et hauteur du saut, saut par-dessus avec retournement.
- **Déterminisme** : 10 000 pas d'entrées au hasard rejoués deux fois donnent exactement la même empreinte ; l'état survit à une copie JSON ; les règles de placement tiennent sur 10 000 pas.
- 12 tests Playwright sur mobile émulé : clavier, vrais événements tactiles (stick, puis deux doigts en même temps), adversaire qui se promène, retournement, caméra au bord du niveau, placement des contrôles. Aucune erreur console.
- **Performance** : le bac à sable de test n'a pas de carte graphique, le nombre d'images par seconde n'y veut rien dire. Mesure retenue à la place : temps de calcul d'une image (logique + préparation de l'affichage) avec processeur ralenti 4 fois : **1,5 ms en moyenne, 6,4 ms au pire**, pour 16,7 ms disponibles. Les 60 images par seconde réelles seront à confirmer sur un vrai téléphone au jalon 1.
- Captures regardées : marche, saut, accroupi, stick, boutons, bord du niveau.

**À surveiller au jalon 1**
- Les boutons de droite recouvrent en partie un combattant collé au bord droit de l'écran (ils sont translucides).

## Phase 2 · Coups et collisions — 2026-10-11

**Fait**
- **Coups** (`logic/fight.ts`) : gifle rapide, gifle accroupie, gifle aérienne (une par saut, active jusqu'à l'atterrissage), grosse gifle avec jauge (charge, zone dorée ×2, annulation sous 20 %, surchauffe : on se gifle soi-même). Chaque coup a sa préparation, son temps actif et sa récupération.
- **Collisions par rectangles** : rectangle de frappe par coup (`balance.ts`, avec une allonge par combattant dans `roster.ts`), rectangle vulnérable debout ou accroupi. Les hauteurs font le jeu : la gifle rapide et la grosse gifle passent au-dessus d'un adversaire accroupi ; la gifle accroupie et l'aérienne le touchent.
- **Garde** : bloque tout sauf la grosse gifle en zone dorée ; 10 % des dégâts passent. **Jauge de garde** affichée au-dessus de la tête : elle se vide à chaque coup bloqué et se recharge hors garde ; vide, la garde est brisée et le combattant est sonné 1 seconde.
- **Coup reçu** : figement, recul, arrêt sur image au contact, charge interrompue. **Mise à terre** par une grosse gifle forte, puis relevé, invulnérable pendant les deux. Deux coups au même instant se touchent tous les deux.
- **Match** : annonce du round, chrono de 60 s, K.O., fin du chrono (le plus de PV gagne, égalité possible), 2 rounds gagnants, **écran de résultat** (`scenes/ResultScene.ts`) avec revanche.
- **Mannequin** (`input/sources.ts`) : il avance, garde, gifle et charge au hasard, sans regarder le joueur. Il utilise la même entrée qu'un joueur.
- **Effets et sons rebranchés** : éclair d'impact, chiffres de dégâts, onomatopées, lignes de focus, gouttes et dents, tremblement d'écran, éclat blanc sur celui qui encaisse, foule, commentateur, sifflet, cris, annonces. La scène ne fait que réagir aux événements produits par la simulation.
- Jauge de charge du joueur à gauche ; tremblement du combattant pendant la charge.

**Réglages choisis** (`config/balance.ts`)
- PV comptés en dixièmes (un coup bloqué de 5 dégâts enlève 0,5 PV), toujours en entiers.
- **Mise à terre à partir de 14 dégâts** (la roadmap disait 25) : à 25, le gabarit `rapide` ne pouvait jamais mettre le `lourd` à terre (son meilleur critique fait 17). À 14, les deux gabarits y arrivent avec un critique.
- Jauge de garde : 100 points, un coup bloqué en retire `12 + 2 × dégâts` (22 pour une gifle rapide : la garde casse au 5ᵉ coup bloqué d'affilée), recharge de 14 points par seconde.
- Arrêt sur image : 50 ms pour une gifle rapide, 100 ms pour une grosse. Blocage : 60 % du temps de figement du coup.
- Allonge : 1,06 pour Bernard, 1 pour Lola.
- **Appui gardé en mémoire 100 ms** : une gifle demandée juste avant la fin du coup précédent part quand même. Sans ça, les enchaînements semblent « manger » des appuis.
- Le K.O. projette le vaincu en arrière, pour que le vainqueur ne le cache pas.
- Annonce de round : 1,9 s ; fin de round : 2,8 s.

**Corrigé en route**
- La simulation avance maintenant sur le **temps réel**, mesuré par le jeu. Le temps fourni par Phaser est lissé et plafonné : sur un appareil lent, le combat aurait tourné au ralenti (constaté dans le bac à sable de test, à moitié vitesse).
- Un « zéro négatif » dans le calcul du recul ne survivait pas à une copie de l'état : corrigé, et le test de copie le surveille.

**Vérifications**
- 110 tests unitaires : chaque coup (durées, dégâts, portée, une seule touche), grosse gifle (formule, zone dorée, annulation, surchauffe, mise à terre, invulnérabilité), garde (blocage, casse, recharge), échange de coups, annonce, chrono, K.O., double K.O., match en 2 rounds, appui en mémoire.
- 20 matchs mannequin contre mannequin : tous se terminent. Durée moyenne d'un round : 51 s (deux mannequins se battent mollement ; l'équilibre et le rythme se règlent en phase 3 avec la vraie IA).
- 19 tests Playwright sur mobile émulé, dont un match complet jusqu'à l'écran de résultat et la revanche, les boutons tactiles, la garde brisée, la surchauffe. Aucune erreur console.
- Temps de calcul d'une image, processeur ralenti 4 fois, en plein combat : 2,8 ms en moyenne, 10 ms au pire.
- Captures regardées : charge, impact critique, garde, K.O., résultat.

**Questions pour le jalon 1**
- Les contrôles sont-ils agréables au pouce (taille et place du stick et des boutons) ?
- La gifle fait-elle plaisir (impact, son, recul) ?
- Le rythme est-il bon (vitesse de marche, durée des coups, durée d'un round) ?
- Les boutons de droite gênent-ils quand un combattant est collé au bord droit ?

## Phase 3 · IA — 2026-10-11

**Jalon 1 validé** par le propriétaire (contrôles, plaisir de la gifle, rythme). Sa remarque : accroupi, le personnage « rétrécit ». C'est la pose provisoire (l'image d'attente écrasée) ; la vraie pose accroupie, et la gifle accroupie qui va avec, sont notées dans la liste des poses à dessiner.

**Fait**
- **IA** (`ai/ai.ts`) : elle produit des entrées, comme un joueur. Elle voit l'adversaire **avec un temps de réaction** (son état d'il y a quelques pas), jamais ses touches.
- Ce qu'elle sait faire : s'approcher, gifler (debout, accroupie, en sautant), viser la zone dorée, se mettre en garde ou s'accroupir en voyant partir un coup, **riposter après un blocage**, **enchaîner** quand sa gifle touche, punir un coup parti dans le vide, couper une charge, briser une garde avec une grosse gifle, se couvrir face à un adversaire qui gifle sans arrêt. Elle ne se gifle jamais elle-même.
- **Trois niveaux** :

| Niveau | Réaction | Se défend | Punit une ouverture | Précision de la zone dorée |
| --- | --- | --- | --- | --- |
| Facile | 0,43 s | 12 % | 25 % | ± 22 % |
| Normal | 0,25 s | 45 % | 60 % | ± 9 % |
| Difficile | 0,13 s | 80 % | 95 % | ± 3,5 % |

- **Simulation** (`ai/simulate.ts`, `npm run sim`) : 200 matchs IA contre IA par affiche, sans affichage, en alternant les côtés.
- **Démo** : `?autoplay=1` fait jouer deux IA.

**Équilibrage** (200 matchs par ligne)

| Affiche | Round moyen | Victoires |
| --- | --- | --- |
| Bernard / Lola, Facile | 32 s | 41 % / 60 % |
| Bernard / Lola, Normal | 33 s | 54 % / 47 % |
| Bernard / Lola, Difficile | 37 s | 51 % / 49 % |
| Bernard contre Bernard, Normal | 38 s | 53 % / 47 % |
| Lola contre Lola, Normal | 28 s | 51 % / 49 % |
| Normal contre Facile | | 97 % pour le Normal |
| Difficile contre Normal | | 98 % pour le Difficile |

Tous les matchs se terminent, aucun round ne va au chrono, et personne ne dépasse 60 % à niveau égal.

**Réglages choisis** pour y arriver (`config/balance.ts`, `config/roster.ts`)
- Gabarit `lourd` : marche 170 px/s (160 avant), zone dorée 79–91 % (80–90 avant), **allonge 1,15** (1,06 avant). Sa grande allonge est devenue sa vraie force.
- Gabarit `rapide` : résistance 1,13 (1,1 avant).
- Nouveau réglage `tempo` (vivacité des coups) par gabarit, laissé à 1 pour les deux : essayé, mais trop brutal. Une image de différence suffit à rendre les gifles bloquées de l'un punissables et pas celles de l'autre.

**Corrigé en route**
- **Garde brisée** : frappé pendant qu'il était sonné, un combattant gardait une jauge vide, et sa garde recassait au premier blocage, en boucle. La jauge repart maintenant pleine après une casse.
- Ce bug a été trouvé grâce à un test : un « joueur » qui se contente d'avancer et de marteler le bouton Gifle battait l'IA Difficile 20 fois sur 20. Après correction et quelques réflexes en plus : Facile 0 victoire sur 20, Normal 11, Difficile 20.

**Vérifications**
- 116 tests unitaires (IA : silence pendant l'annonce, approche, niveaux rangés, pas d'autogifle, match rejouable à l'identique, résultat contre le « marteleur »).
- `npm run sim` : 7 séries de 200 matchs, critères de la roadmap vérifiés automatiquement.

## Phase 4 · Choix du personnage et du niveau — 2026-10-11

**Fait**
- **Choix du personnage** (`scenes/CharacterSelectScene.ts`) : grille de 6 cases (les combattants disponibles et des cases « Bientôt »). Le joueur choisit son combattant, puis son adversaire ou « Au hasard », puis la difficulté. Retour possible à chaque étape.
- **Choix du lieu** (`scenes/StageSelectScene.ts`) : une vignette par décor, des cases « Bientôt », et « Au hasard ».
- **Parcours complet** : accueil → personnage → adversaire → difficulté → lieu → combat → résultat → revanche, autre combat ou accueil. « Autre combat » repropose le combattant et la difficulté du match précédent.
- **Combat miroir** permis (même combattant des deux côtés), le second avec une teinte bleutée.
- Niveau de l'IA rappelé sous le chrono pendant le combat.
- Les portraits et les vignettes sont découpés automatiquement dans les images existantes : rien de plus à dessiner pour un nouveau combattant ou un nouveau décor.

**Vérifications**
- 24 tests Playwright sur mobile émulé, dont tout le parcours au tactile, les retours en arrière, l'adversaire au hasard, le combat miroir, la démo IA contre IA jusqu'au résultat. Aucune erreur console.
- Captures regardées : choix du personnage, de l'adversaire, de la difficulté, du lieu, résultat.

**À noter pour le jalon 2**
- Le niveau Normal bat le Facile presque à tous les coups, et le Difficile bat le Normal de même : les marches entre niveaux sont hautes. À ajuster selon le ressenti du propriétaire.

## Phase 4 bis · Coups de pied et garde haute ou basse — 2026-10-11

Ajout demandé par le propriétaire pendant le jalon 2 : chaque combattant a une gifle, un coup de pied et un coup spécial ; pour bloquer, il faut choisir la bonne hauteur. Trois choix validés avec lui : le coup de pied remplace la gifle accroupie, la garde basse se fait avec Garde + stick vers le bas, et une garde à la mauvaise hauteur laisse passer le coup en entier.

**Fait**
- **Nouveau bouton « Pied »** (touche I au clavier), huitième entrée de l'objet d'entrée unique.
- **Coup de pied** (debout) : bas, plus lent et plus long que la gifle rapide, 7 dégâts. Il touche un adversaire accroupi ; on peut sauter par-dessus.
- **Balayette** (Pied en étant accroupi) : basse, 6 dégâts, elle passe sous les gifles hautes. Elle remplace la gifle accroupie. Accroupi + Gifle : on se relève pour donner la gifle rapide.
- **Garde haute et garde basse** : Garde seule bloque les gifles ; Garde + stick vers le bas bloque les coups de pied. On peut changer de hauteur sans lâcher le bouton. Mauvaise hauteur : le coup passe en entier, avec l'étiquette « MAUVAISE GARDE ! ».
- En garde basse, la tête reste à portée de gifle (seul l'accroupi sans garde passe sous les gifles). Sans cette règle, la garde basse aurait tout arrêté au sol.
- **Contrôles tactiles** : quatre boutons en arc autour du pouce droit (Gifle dans le coin, Pied à gauche, Garde au-dessus, Grosse gifle en diagonale).
- **IA** : elle donne des coups de pied, garde à la bonne hauteur quand elle voit partir le coup, saute parfois par-dessus, et frappe à l'autre hauteur un adversaire qui garde. Quand elle doit se couvrir sans avoir vu le coup, elle parie sur la hauteur du dernier coup adverse.
- Poses provisoires : l'ancienne pose d'esquive pour le coup de pied et la balayette, la garde écrasée pour la garde basse.
- **`GUIDE-DESSINS.md`** : la liste complète des poses (22 par personnage), les tailles, les planches et les règles des décors.

**Équilibrage refait** (200 matchs par ligne)

| Affiche | Round moyen | Victoires |
| --- | --- | --- |
| Bernard / Lola, Facile | 30 s | 55 % / 45 % |
| Bernard / Lola, Normal | 27 s | 44 % / 56 % |
| Bernard / Lola, Difficile | 32 s | 53 % / 47 % |
| Bernard contre Bernard, Normal | 31 s | 50 % / 50 % |
| Lola contre Lola, Normal | 24 s | 50 % / 50 % |

- Avec les coups de pied, la grande allonge de Bernard le rendait trop fort (88 % en Difficile). Réglages : allonge de Bernard ramenée à 1,08 ; gabarit `rapide` à base 12 et résistance 1,05.
- Contre le « marteleur » (un joueur qui avance et gifle sans arrêt) : Facile 0 victoire sur 20, Normal 3, Difficile 20. Le Normal se fait donc encore déborder par un joueur qui martèle : à surveiller au jalon 2.

**Vérifications**
- 126 tests unitaires, dont les coups de pied (portée, adversaire accroupi, saut par-dessus, balayette sous une gifle) et les gardes (bonne et mauvaise hauteur, gifle aérienne, changement de hauteur).
- 26 tests Playwright, dont le bouton Pied et la garde basse avec deux doigts.
- Captures regardées : coup de pied, garde basse, placement des quatre boutons.

---

# Historique du premier jeu (`soufflet`)

Conservé pour mémoire : il décrit le jeu au tour par tour dont PolitiClash est parti.

## Poses des coups spéciaux, accessoires et nouvelles tenues — 2026-10-13

Fournis par le propriétaire.

- **Nouvelles tenues** pour Manu Macs, Narine le Zen, Jordan et JLM : leurs deux planches ont été redécoupées (23 poses chacune, `scripts/decoupe-planches.py`). Ce sont aussi les planches au prompt corrigé (jambes moins écartées, marche à deux temps, coup de pied bas).
- **Poses des coups spéciaux** pour les six (`special1`, `special2`, `special3`). Elles sont découpées par un nouvel outil, `scripts/decoupe-speciaux.py`, qui recale l'échelle sur la pose d'attente de la 4e case et place les pieds sur ceux de la pose d'attente. Les planches sont en 2:1 et non en 3:2 : aucun problème, l'outil s'adapte. La cinématique les prend automatiquement.
- **Accessoires** : dans chaque planche, on ne garde qu'une case, comme demandé. Le caca vient de `use only poop.png`, la faucille et le marteau rouges de `don't use emoji.png`. Ils sont dans `raw/props/` et remplacent les projectiles provisoires.
- L'ancienne pose `special` (élan commun à tous) n'est plus chargée quand les trois vraies poses sont là : le chargement initial passe à 3,6 Mo.
- **Rapprochement des coups de près** : avec les vraies poses, plus larges, les deux personnages se chevauchaient. L'écart entre les corps passe de 45 à 62 px.
- **Vérifications** : 185 tests unitaires (un de plus par personnage : ses vraies poses sont utilisées), les six cinématiques photographiées en jeu, chargement initial 3,57 Mo, image calculée en 4,9 ms pendant un coup spécial (processeur ×4).

## Phase 5 · Style unique, barre Buzz et coups spéciaux — 2026-10-13

Décisions du 13 octobre (roadmap mise à jour, sections 3 et 7). `ROADMAP.md` remplacée par la version du projet ; `GUIDE-DESSINS.md` (version du 13 octobre) et `PROMPTS-SPECIAUX.md` ajoutés au dépôt.

**Un seul style de combat**
- Gabarits `lourd` et `rapide` retirés : un seul profil, `STYLE` dans `balance.ts` (marche 200 px/s, saut 600 ms, base 13, charge 1,2 s, zone dorée 78–90 %). Plus de résistance, plus de vivacité, même allonge pour tous.
- Coup bloqué : 10 % des dégâts, arrondis au PV, au moins 1 PV (`chipDamage`).
- Correction : accroupi, la boîte de corps des six combattants faisait 142 px de haut, alors que la grosse gifle frappe à partir de 141 px. Elle touchait donc un adversaire accroupi. Ramenée à 140 px.

**Barre Buzz** (la rage est retirée)
- Sous la barre de vie. Gains : coup léger qui touche +9, grosse gifle +14, zone dorée +25, esquive réussie +20 (accroupi sous une gifle, ou en l'air au-dessus d'un coup de pied, quand le coup est actif et aurait touché ; une fois par coup). Rien pour un coup bloqué ou reçu.
- Valeurs de départ de la roadmap (6 / 10 / 20 / 15) relevées : elles donnaient 0,6 à 1 coup spécial par round, sous l'objectif.
- Gardée d'un round à l'autre, remise à 0 au nouveau match.

**Bouton Buzz et cercle**
- Barre pleine : le bouton « Grosse gifle » devient jaune, brille et affiche « BUZZ ». Au clavier, toujours K.
- Maintenu : un cercle se remplit en 0,5 s, autour du bouton et autour du combattant (l'adversaire le voit, et peut le couper d'une gifle). Relâché ou touché avant la fin : annulé, la barre reste pleine. Le combattant ne bouge pas pendant le cercle.

**Cinématiques** (`src/config/specials.ts`, déroulé fixe en pas, partie de la simulation)
- Le coup touche toujours : 35 PV, met à terre et rend sonné. Le chrono s'arrête, le lanceur est intouchable, le décor s'assombrit.
- Coups de près (poudre, danse, pinte) : le lanceur se colle à l'adversaire en 130 ms (écart de 45 px entre les corps). Coups à distance (hurlement, lancer, tir) : il reste où il est, le projectile ou l'onde traverse l'écran.
- Signal (éclair, point d'exclamation, son sec) 8 pas avant l'impact. Garde appuyée dans les 6 pas qui suivent : 18 PV seulement. Appui trop tôt, trop tard, ou garde déjà tenue au signal : 35 PV.
- Durées : 100 à 108 pas (1,7 à 1,8 s). Barre remise à 0 à l'impact.

**Poses et accessoires : il n'y a plus qu'à les déposer**
- `npm run assets` relève les poses présentes dans `raw/fighters/<id>/` (dans `assets.json`). Dès que `special1.png` et `special3.png` sont là (avec le nouveau `special2.png`), la cinématique les prend, sans toucher au code.
- En attendant : armement (`windup`), puis les anciennes `special` et `special2`.
- Accessoires : `raw/props/caca.png` et `raw/props/faucille-marteau.png`, pris automatiquement par `npm run assets`. En attendant, projectiles provisoires dessinés en code.
- `npm run assets` vérifie aussi que toutes les poses d'un combattant ont la même taille d'image.

**Sonné**
- Après une garde brisée ou un coup de 25 PV ou plus (le coup spécial) : 3 s pendant lesquelles la vitesse de charge de la grosse gifle change tous les 8 pas, entre 70 et 130 %. Étoiles au-dessus de la tête.

**Effets et sons**
- Effets tracés en code : paillettes et explosion dorée, notes et étoiles, mousse et éclats de verre, anneaux d'onde de choc, projectile qui tournoie, petit nuage. Bandeau du nom du coup, réplique du commentateur, ralenti juste après l'impact (affichage seulement), tremblement, arrêt sur image. Trace de main rouge sur la joue après une grosse gifle.
- Sons : un par coup spécial (arpège scintillant, petit groove, glouglou, cri, outil qui tournoie, pet de dessin animé), un pour l'impact, le signal, la garde au bon moment, la barre pleine, le cercle.

**IA**
- Barre pleine : elle lance son coup spécial quand l'adversaire est loin ou occupé (Facile : n'importe quand).
- Elle coupe le cercle adverse d'une gifle quand elle le voit se remplir.
- Garde au bon moment : réussie 10 % (Facile), 35 % (Normal), 65 % (Difficile) du temps, comme un joueur qui a appris le rythme ; sinon trop tôt ou pas du tout.

**Textes provisoires** (`texts.ts`, à remplacer) : Poudre de perlimpinpin, Le Déhanché zen, La Tournée générale, Le Grand Lancer, Le Coup de gueule, Le Vent arrière, deux répliques chacun, et le mot « BUZZ ».

**Ménage**
- Bernard et Lola retirés du code, des images et des tests. Le visage des icônes est gardé dans `raw/icons/visage.png`.
- Progression (XP, niveaux, tenues), mise de côté depuis la phase 0 et entièrement liée à Bernard et Lola : retirée. Elle reste dans l'historique du dépôt si on la reprend en phase 6.

**Vérifications**
- 178 tests unitaires (dont 32 sur le Buzz, le cercle, les cinématiques, la garde au bon moment, le sonné ; déterminisme sur 10 000 pas avec coups spéciaux).
- Simulation (`npm run sim`, 200 matchs par affiche, 53 séries) : tous les matchs se terminent ; round moyen 21 à 27 s ; 1,05 à 1,35 coup spécial par round ; aucun combattant au-dessus de 57 % (le plus grand écart : 57 / 43 en Difficile entre deux coups à distance).
- Playwright (mobile en paysage) : nouveau fichier `phase5.spec.ts` (bouton Buzz au tactile, cercle annulé, barre remplie en giflant, les six cinématiques photographiées, garde au bon moment, démo IA, image calculée en 4,2 ms en moyenne pendant les coups spéciaux avec processeur ×4, chargement initial 3,3 Mo).
- Tests navigateur qui échouaient déjà : ils attendaient des images très brèves (une gifle de 350 ms) ou une caméra arrivée après un délai fixe, en sondant l'état ; sur une machine lente, le sondage les ratait. Ils guettent maintenant l'instant pas à pas.

## Phase 6 · Finition du solo — 2026-10-13

**Tutoriel** (`src/logic/tutorial.ts`, textes dans `texts.ts` → `TUTORIAL`)
- Au premier lancement, JOUER ouvre le tutoriel. Ensuite, JOUER mène directement au choix du combattant, et un bouton TUTORIEL sur l'accueil permet de le refaire. Bouton PASSER à tout moment. Accès direct : `?scene=tuto`.
- 7 exercices, joués dans un vrai combat au bar contre un partenaire d'entraînement : marcher, sauter et s'accroupir, gifler (2 fois), coup de pied (2 fois), grosse gifle, garde (bloquer 2 gifles), Buzz. Consigne au doigt ou au clavier selon l'appareil, barre de progrès, « BIEN ! » entre deux exercices, puis « TU ES PRÊT ! » avec l'astuce de la garde basse.
- Le partenaire ne bouge pas, sauf à l'exercice de garde, où il s'approche et gifle toutes les 1,3 s. Le chrono est arrêté, les PV sont remis quand ils passent sous la moitié : personne n'est K.O. La barre Buzz ne se remplit pas avant le dernier exercice, où elle est pleine d'office.
- Le moteur ne change pas : le tutoriel lit l'état et les événements de la simulation, comme l'affichage.

**Sauvegarde sur le téléphone** (`src/logic/save.ts`, clé `politiclash.save`)
- Tutoriel vu, dernier combattant choisi, dernière difficulté, dernier lieu, victoires et défaites contre l'IA par difficulté (la démo et les adversaires d'essai ne comptent pas).
- Le choix du combattant propose le dernier utilisé ; à l'écran des difficultés, la dernière est entourée, et chaque bouton affiche ses victoires et défaites. Le dernier lieu est entouré. L'accueil affiche le nombre de victoires.
- Sauvegarde absente, abîmée, d'une autre version ou navigation privée : le jeu repart d'une sauvegarde neuve, sans planter.

**Boîtes de collision réglées sur les vraies poses**
- Mesure des six jeux de poses (silhouette des images, ramenée en px du jeu) : hauteur debout 227 à 234 px (boîte : 230, inchangée) ; accroupi 140 à 156 px en comptant les cheveux (boîte : 140, inchangée, les gifles hautes passent juste au-dessus) ; main de la gifle rapide 112 à 136 px devant l'ancrage (allonge commune inchangée, comme le veut la roadmap).
- Largeur du corps : 26 → **38 px** de part et d'autre (42 accroupi). Les torses dessinés font ±48 à ±68 px : à 26, deux combattants au contact se chevauchaient de moitié. Simulation refaite : 53 séries sur 53 dans les critères (round moyen 23 à 27 s, 1,1 à 1,3 spécial par round, aucun combattant au-dessus de 57 %).
- Les boîtes restent les mêmes pour les six : les adapter à chaque dessin (Jordan accroupi est plus haut que les autres) donnerait un avantage ou un handicap qui ne tient qu'au dessin.

**Chargement**
- Au démarrage, seules les poses d'attente des six combattants sont chargées (portraits, accueil). Les 23 autres poses de chacun sont chargées au lancement du combat, avec une barre de chargement : environ 1 Mo pour deux combattants.
- Chargement initial : **3,57 Mo → 0,71 Mo**. La limite des 4 Mo ne bloque plus l'ajout d'un septième combattant.

**Vérifications**
- 212 tests unitaires (7 de plus : sauvegarde ; un joueur scripté finit le tutoriel dans l'ordre en moins d'une minute ; chrono arrêté et pas de K.O. pendant le tutoriel ; pas de Buzz avant le dernier exercice ; pause entre deux exercices).
- 43 tests navigateur, dont `phase6.spec.ts` : tutoriel complet au premier lancement puis plus proposé, bouton PASSER, sauvegarde retrouvée après rechargement. Captures regardées.
- Image calculée en 3,8 ms en moyenne (9,9 ms au pire) avec processeur ×4.
- Lancés à plusieurs en parallèle, quelques tests navigateur dépassent leurs délais sur la machine de test (trop lente) ; ils passent tous lancés un par un.

## Phase 7a · Socle réseau — 2026-10-14

Première étape de `ROADMAP-EN-LIGNE.md`. Rien de visible en jeu pour l'instant : c'est le moteur que les modes Entre amis (7b) et Partie rapide (7d) utiliseront. Aucun réseau réel n'est utilisé ; tout est essayé avec un faux réseau.

**Session en ligne** (`src/net/rollback.ts`, indépendante du transport et de Phaser)
- Les deux téléphones font tourner la même simulation et ne s'échangent que leurs entrées (un entier par pas).
- **Retard d'entrée** : 3 pas (50 ms) par défaut. `delayForPing` conseille de 3 à 6 pas selon le ping mesuré avant le match (à brancher en 7b).
- **Prédiction et retour en arrière** : sans nouvelles de l'adversaire, on suppose qu'il garde les mêmes touches ; si c'est faux, on reprend l'état gardé et on rejoue, **8 pas au plus**. Au-delà, le jeu attend.
- **Redondance** : chaque paquet renvoie toutes les entrées que l'autre n'a pas encore confirmées. Une perte ou un désordre ne demande aucune réémission.
- **Contrôle de désynchronisation** : toutes les secondes (60 pas confirmés), chacun envoie l'empreinte de son état. En cas d'écart, l'hôte envoie son état et l'invité s'y recale, puis rejoue jusqu'au pas actuel.
- **Horloges** : si un téléphone tourne un peu plus vite que l'autre, il attend une image de temps en temps.
- **Coupures** : jeu figé avec « instable » après 250 ms sans nouvelles (ou 250 ms d'attente), pause à 3 s, match perdu à 15 s. Ce que ça donne au vainqueur est décidé par chaque mode.
- **Annonces** : les effets (gifle, cris) partent tout de suite, une seule fois même si le pas est rejoué. Les annonces qui changent le cours du match (round, combat, K.O., fin du chrono, fin de round) attendent que leur pas soit confirmé : on n'annonce jamais un K.O. démenti. La fin du match n'est déclarée qu'une fois confirmée.

**Banc d'essai** (`src/net/fakePipe.ts`, `src/net/bench.ts`)
- Faux tuyau : latence, gigue (paquets dans le désordre), pertes, coupures. Les messages passent par du JSON comme sur le vrai réseau.
- Deux sessions reliées, chacune jouée par une IA qui ne voit que son propre écran (prédictions comprises). À la fin : même état des deux côtés, et même état que le match rejoué hors réseau avec les entrées échangées.

**Résultats** (`npm run sim`, 200 matchs IA contre IA par ligne, six combattants et trois niveaux mélangés)

| Réseau (par sens) | Retard | Terminés et identiques | Désync. | Plus long retour | Images en attente | Débit |
| --- | --- | --- | --- | --- | --- | --- |
| 100 ms | 3 pas | 200 / 200 | 0 | 5 pas | 0 % | 5,3 Ko/s |
| 150 ms | 4 pas | 200 / 200 | 0 | 8 pas | 0 % | 6,1 Ko/s |
| 200 ms + 5 % de pertes | 3 pas | 200 / 200 | 0 | 8 pas | 19 % | 6,4 Ko/s |
| 200 ms + 5 % de pertes | 4 pas | 200 / 200 | 0 | 8 pas | 11 % | 6,6 Ko/s |
| 200 ms + 5 % de pertes | 6 pas | 200 / 200 | 0 | 8 pas | 0,8 % | 6,9 Ko/s |

Environ 3 retours en arrière par seconde. À 200 ms par sens (400 ms d'aller-retour, un très mauvais réseau), un retard de 3 pas fait attendre le jeu une image sur cinq : d'où le retard choisi selon le ping, et l'avertissement « connexion faible » prévu au-delà de 150 ms.

**Charge** : avec 8 pas rejoués et une empreinte calculée **à chaque image** (pire cas, 20 fois plus que dans les matchs ci-dessus), processeur ralenti 4 fois, pendant un combat IA avec coups spéciaux : retour en arrière sous 0,1 ms par image, image entière 3,0 ms en moyenne (9,3 ms au pire). Essai : `?rollback=8`.

**Vérifications**
- 225 tests unitaires (13 de plus : faux tuyau ; réseau parfait, 100 ms, 200 ms et pertes ; annonces une seule fois ; état faussé chez l'invité détecté et recalé ; horloge 2 % plus rapide ; coupures de 2 s, 8 s et 20 s ; jeu bloqué à 8 pas sans adversaire ; retard appliqué ; retard selon le ping).
- Trouvé par les tests : avant d'avoir reçu le moindre paquet, le jeu croyait être en avance sur l'adversaire et sautait une image.
- Reste visible : 1 à 2 petits effets par match (« sonné », une gifle) prédits puis démentis par l'entrée réelle. Sans effet sur le combat.

## Premier jeu · Phase 0 · Mise en place — 2026-10-01

**Fait**
- Projet Phaser 3.90 + TypeScript (strict) + Vite, Vitest et Playwright (Chromium, mobile émulé 844 × 390 en paysage).
- Dépôt `benjam67/soufflet` (nom choisi par le propriétaire à la place de `slap-fighter`) ; le jeu est servi sous `/soufflet/`.
- Déploiement automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml` : tests unitaires, build, publication).
- PWA : `manifest.webmanifest` (plein écran, paysage), icônes générées à partir du visage de Bernard, plein écran + verrouillage paysage au premier toucher quand le navigateur le permet. Pas de service worker pour l'instant (évite les versions en cache pendant le développement).
- Écran « Tourne ton téléphone » en portrait (CSS pur, s'affiche avant même le chargement du jeu).
- Scène de combat statique : décor, 8 habitués, patron, Bernard à gauche, Lola à droite en miroir.

**Assets**
- `scripts/optimize-assets.mjs` (`npm run assets`) : sources PNG dans `raw/`, sorties WebP dans `public/assets/`, données de placement dans `src/config/assets.json`.
- Combattants : toutes les poses d'un perso recadrées sur la même boîte (union des poses) pour garder ancrage et ligne de pieds communs, puis réduites avec le **même facteur** pour Bernard et Lola (600/823, Bernard ≈ 600 px de haut).
- Total des assets : ~694 Ko. Build complet (Phaser compris) : ~2,2 Mo non compressé, ~1 Mo transféré.
- `decor.png` n'était pas fourni : décor provisoire dessiné en SVG (`raw/bar/decor-placeholder.svg`, 16:9). Il suffira de déposer `raw/bar/decor.png` et de relancer `npm run assets` ; ajuster alors `STAGE.decorFloorY` (ligne du sol en px dans l'image).

**Réglages choisis** (`src/config/balance.ts`, section `STAGE`)
- Monde Phaser de 720 px de haut, largeur étendue selon l'écran (`Scale.EXPAND`) : pas de bandes noires sur les téléphones 19,5:9 / 20:9.
- Silhouette des combattants à 66 % de la hauteur d'écran, pieds à 4,5 % du bas ; écart de 14 % de la largeur entre l'avant des deux persos.
- Habitués à 45 % de la taille des combattants, teinte assombrie `0xb3a49c` ; patron un peu plus grand, teinte `0xd4c6bd`.

**Note technique**
- Phaser retourne la texture dans son cadre sans déplacer l'origine : pour le perso en miroir, l'origine horizontale est `1 - originX`.

**Déploiement et vérification**
- GitHub Pages activé automatiquement via la branche `gh-pages` (l'API de réglage de Pages n'est pas accessible depuis la session) : la CI build, teste et pousse `dist/` sur `gh-pages` à chaque push sur `main`. Le commit déployé est lisible dans `version.txt`.
- Tests Playwright (3/3) passés en local sur le build de production, mobile émulé 844 × 390.
- `github.io` n'est pas joignable depuis le bac à sable de Claude : la version en ligne est vérifiée dans le navigateur du propriétaire (viewport 844 × 390) — scène chargée, aucune erreur console, ~1,1 Mo transférés.

## Premier jeu · Phase 1 · La gifle — 2026-10-01

**Fait**
- Logique pure dans `src/logic/` :
  - `slap.ts` : charge, zone dorée, surchauffe, facteurs V (vitesse) et P (angle), formule `D = B × C/100 × V × P × K × R_d` arrondie à l'entier (minimum 1 dès qu'une gifle part).
  - `gesture.ts` : machine à états du geste (appui → armement → swipe → gifle / surchauffe / annulation).
  - `layout.ts` : `computeStrike` calcule le pas en avant pour que la main (pose slap) atteigne l'avant du visage adverse.
- Contrôles tactiles : maintenir n'importe où pour armer, glisser vers l'adversaire sans lever le doigt. Positions mesurées en px CSS (les seuils de la roadmap sont en px écran).
- Interface : barres de vie inclinées à contour noir (nom + katakana, traîne rouge des dégâts récents), jauge de charge verticale à gauche (zone dorée encadrée de blanc, surchauffe rouge en haut, CHARGE… / PARFAIT ! / SURCHAUFFE !), chiffres de dégâts, étiquette « CRITIQUE ×2 ».
- Enchaînement : windup pendant la charge → swing 60 ms → slap avec pas en avant (70 ms) → contact et arrêt sur image 80 ms → hit + léger recul de la victime → retour en place → idle.
- Mode entraînement : Bernard gifle Lola en boucle ; K.O. → dazed/victory puis remise à 100 PV.

**Réglages et choix**
- Zone morte de 10 px avant de considérer que le swipe commence ; un swipe < 60 px ou dans le mauvais sens est annulé (le perso revient en idle, sans dégâts).
- Les écrans tactiles n'envoient pas d'événement tant que le doigt ne bouge pas : le début du swipe (et donc la charge figée) est pris au plus 16 ms avant le premier mouvement détecté.
- Enfoncement de la main dans le visage au contact : 22 px de texture (`STRIKE_OVERLAP`).
- Le contact se fait sur la pose idle de la victime, puis la pose hit (très penchée en arrière) arrive après l'arrêt sur image : la main touche bien la joue.

**Tests**
- 52 tests unitaires (formule, zone dorée, surchauffe, V, P, geste, placement, pas en avant).
- 8 tests Playwright (mobile 844 × 390, vrais événements tactiles via le protocole DevTools) : appui + swipe fait baisser les PV de Lola avec l'enchaînement de poses exact, critique dans la zone dorée, surchauffe (−8 PV sur Bernard), swipe trop court / à l'envers sans effet, aucune erreur console.
- Le test du critique s'auto-corrige d'un essai à l'autre (le navigateur de test livre les événements avec 100–200 ms de retard, la fenêtre dorée de Bernard ne dure que 140 ms).

## Premier jeu · Phase 2 · Le match — 2026-10-01 (jalon : test par le propriétaire)

**Fait**
- `src/logic/match.ts` : match pur (sans Phaser) — tours alternés, gifle, surchauffe, gifle molle au chrono (5 dégâts), K.O., rounds (2 gagnants, 3 au maximum), victoire. Le perdant d'un round commence le suivant.
- `src/logic/ai.ts` + `rng.ts` : IA « joueur moyen » reproductible (graine). Elle vise le centre de la zone dorée avec une erreur de timing en millisecondes (σ = 110 ms), comme un réflexe humain.
- `src/logic/simulate.ts` : simulation de matchs complets sans affichage ; `npm run sim` affiche un rapport d'équilibrage.
- Écran : mode 2 joueurs sur le même téléphone (mode par défaut), annonces ROUND 1 / ROUND FINAL / BAGARRE !, bandeau rouge incliné « À TOI, BERNARD ! », chrono du tour dans un losange central (rouge à la dernière seconde), losanges des rounds gagnés, K.O. !, « ROUND POUR … ! », écran de victoire (vainqueur en pleine lumière, score, boutons REVANCHE et ENTRAÎNEMENT).
- Gifle molle : le perso avance mollement, petit éclair, étiquette « GIFLE MOLLE… ».
- Paramètres d'URL : `?mode=training` (entraînement), `?autoplay=1` (démo IA contre IA), `?speed=N` (tout accélérer), `?seed=N` (IA reproductible).
- Aide « MAINTIENS pour armer · GLISSE vers … » affichée pendant les deux premiers tours du match.

**Équilibrage** (décidé seul, comme prévu par la roadmap)
- Avec les valeurs de départ, Bernard gagnait ~100 % des matchs simulés : il frappe plus fort (14 contre 11) et encaisse mieux (×0,85 contre ×1,1), et la jauge rapide de Lola ne compense rien.
- Réglage retenu, le plus petit qui garde l'identité des persos : **Lola base 11 → 16, résistance 1,1 → 1,0**. Bernard reste le plus résistant (×0,85) ; Lola devient la plus offensive, avec sa zone dorée plus large.
- Résultat (3 × 1000 matchs) : Bernard 51–53 % / Lola 47–49 %, ~100 s par match, ~29 tours, 2,6 rounds en moyenne, ~50 % de critiques, surchauffes ~0,1 %.

**Tests**
- 68 tests unitaires, dont le déroulé du match (tours, chrono, surchauffe, K.O., rounds, 2–0 et 1–1–décisif) et 200 matchs simulés : tous se terminent, équilibre dans 40–60 %, durée moyenne entre 45 s et 3 min.
- 11 tests Playwright, dont : Bernard gifle → bandeau « À TOI, LOLA ! » → Lola gifle vers la gauche ; chrono dépassé → gifle molle de 5 ; démo IA jusqu'à l'écran de victoire puis REVANCHE qui relance un match.

### Retours du jalon 2 — 2026-10-01
- Écran de victoire : le texte « ENTRAÎNEMENT » débordait du bouton avec la vraie police (Dela Gothic One, plus large que la police de secours). Les libellés des boutons sont maintenant réduits automatiquement pour tenir dans le bouton (290 × 66).
- Nouveau décor fourni (bar de village 4:3, 1024 × 768, ring en scotch octogonal) intégré à la place du décor provisoire. Ligne du sol calée sur le pied du comptoir (`STAGE.decorFloorY = 420`).

## Premier jeu · Phase 3 · Le spectacle — 2026-10-01 (jalon : test par le propriétaire)

**Fait**
- **Impact** (`src/fx/Fx.ts`) : éclair blanc et orange en étoile (3 variantes) avec étincelles, lignes de focus manga convergeant vers l'impact, onomatopée « バシッ！ » + « CLAAAC ! » (critique : « バシーン！ » + « CLAAAAAAC ! », gifle molle : « ペチ… » + « PLOC… », surchauffe : « ピシャ！ » + « PAF ! »), chiffre de dégâts, étiquettes CRITIQUE ×2 / EFFLEURÉE / RATÉE… / GIFLE MOLLE… / SURCHAUFFE !
- **Temps** : arrêt sur image de 80 ms au contact (tout se fige, y compris les animations), puis ralenti ×0,35 pendant ~0,4 s sur les gros coups (≥ 20 dégâts ou critique) et ×0,4 au K.O. ; tremblement de caméra dosé selon la puissance ; flash blanc plein écran sur les critiques et le K.O.
- **Réactions** : traces de main rouges qui s'accumulent sur la joue pendant le round (jusqu'à 6, effacées au round suivant), gouttes qui volent sur les gros coups, dents à partir de 25 dégâts, recul de la victime proportionnel à la puissance.
- **Foule** (`src/fx/Crowd.ts`) : chaque habitué respire à son rythme, saute et se dandine avec son propre retard quand ça claque (2 sauts sur les gros coups), s'affaisse en secouant la tête sur une gifle molle ou ratée. Le patron siffle chaque début de round et le K.O. (petit saut + bulle « PRRRT ! »).
- **Commentateur** : bandeau en bas d'écran, 30 phrases en 9 situations (début de match, critique, gros coup, normal, effleurée, ratée, gifle molle, surchauffe, K.O.), jamais deux fois de suite la même (`src/config/comments.ts`).
- **Sons** (`src/audio/sfx.ts`), tous générés en code avec Web Audio (0 octet à télécharger) : claque (dosée selon la puissance, grave en plus sur les critiques), souffle du bras, cri de la victime (grave pour Bernard, aigu pour Lola), sifflet à trille, clameur et huées de la foule, cloche de K.O., bips des 2 dernières secondes du chrono, musique en boucle façon générique d'anime (132 BPM, La mineur). Le son démarre au premier contact (règle des navigateurs). Bouton son en haut à droite, choix mémorisé (`localStorage`).

**Performance**
- Tous les textes à gros contour (annonces, bandeaux, onomatopées, phrases du commentateur, chiffres de 0 à 9) et les effets sont tracés une seule fois au chargement (`src/fx/bake.ts`) : aucun texte n'est retracé ni renvoyé au GPU pendant le combat. Le pourcentage de la jauge utilise ces chiffres pré-rendus.
- La jauge, le chrono et la traîne des barres de vie ne se redessinent que quand un pixel change.
- Mesure (processeur ralenti ×4, mobile émulé) : travail du jeu (logique, animations, effets) médiane < 1 ms, p95 6–7 ms, p99 ~10 ms par image, soit moins de la moitié du budget de 16,7 ms d'une image à 60 fps.
- Limite de la mesure : le bac à sable n'a pas de GPU, WebGL y est rastérisé en logiciel (≈ 8 images/s quoi qu'on affiche). Le temps de rendu mesuré ici n'est donc pas représentatif d'un téléphone ; le 60 fps réel est à confirmer sur ton téléphone.
- Chargement : 30 fichiers, 1,92 Mo décodés, 1,06 Mo transférés (< 3 Mo).
- Mesure sur un vrai GPU (navigateur du propriétaire, Apple M1, viewport 844 × 390, démo IA avec tous les effets) : **60 images/s stables, 2 000 images d'affilée, aucune au-dessus de 20 ms**.
- Chiffres pré-rendus espacés selon leur encre réelle (mesurée au chargement) : rendu identique quelle que soit la police disponible.
- Placement : chiffre de dégâts juste au-dessus de l'impact, onomatopée projetée derrière la victime (jamais sur le visage de celui qui gifle), dans les deux sens.

**Tests**
- 8 nouveaux tests Playwright (19 au total), avec captures prises en figeant la boucle du jeu à l'instant exact de l'effet : impact (éclair, focus, onomatopée, son, foule, commentateur), critique (flash, ralenti, gouttes et dents), traces de main qui s'accumulent, sifflet du patron et foule qui bouge, K.O., bouton son mémorisé, poids du chargement, performance.

### Retours du jalon 3 — 2026-10-01
- **Musique refaite** (`src/audio/music.ts`), sur la demande « fais une ambiance anime » : générique de combat façon anime 90s, 156 BPM, do majeur / la mineur.
  - Structure : intro (nappe + arpège, puis la batterie arrive), couplet de 8 mesures (La m – Fa – Sol – Do, montée sur Mi majeur), refrain de 8 mesures sur l'enchaînement « royal road » des génériques japonais (Fa – Sol – Mi m – La m, avec Mi majeur avant la résolution). Couplet + refrain en boucle.
  - Instruments : mélodie (deux dents de scie désaccordées + carré à l'octave, petit glissé d'attaque, vibrato qui arrive sur les notes tenues, écho en croche pointée), guitare saturée en accords de puissance (croches au refrain), basse qui pompe en octaves, nappe et arpège au couplet, batterie complète (grosse caisse, caisse claire, charleston, cymbale, roulements), réverbération.
  - Mixage mesuré instrument par instrument : la mélodie mène (≈ −21 dB), grosse caisse / basse / guitare juste en dessous. L'ancienne version avait une mélodie 17 dB sous la basse, d'où l'impression d'un bourdonnement sans air.
  - `npm run music -- fichier.wav` rend le morceau en fichier pour l'écouter hors du jeu.

## Premier jeu · Phase 4 · Mode solo — 2026-10-01

**Fait**
- IA à 3 niveaux (`src/logic/ai.ts`), qui joue avec exactement les mêmes règles que le joueur (même jauge, même zone dorée, même chrono, mêmes dégâts) : seule la précision « humaine » simulée change — erreur de relâchement (écart type en ms), vitesse et angle du swipe.
  - Facile : σ 130 ms, swipe 1,4 px/ms, angle σ 15°.
  - Normal : le « joueur moyen » (σ 110 ms, 1,5 px/ms, 14°).
  - Difficile : σ 105 ms, 1,6 px/ms, 13°.
- Mode solo : le joueur à gauche (Bernard), l'IA à droite (Lola) ; l'IA arme et gifle seule, les touchers pendant son tour sont ignorés. Étiquette « SOLO · FACILE / NORMAL / DIFFICILE ».
- Fin de match en solo : « VICTOIRE ! » ou « DÉFAITE… » (bandeau sombre) du point de vue du joueur ; REVANCHE au même niveau ; après une victoire, bouton NIVEAU SUIVANT (facile → normal → difficile).
- Accès : `?mode=solo&level=easy|normal|hard` (le choix du mode et du perso arrivera avec l'écran titre, phase 7).

**Calibrage** (critère de la roadmap, vérifié par simulation)
- Un match compte ~29 gifles : un petit écart de précision par gifle devient un gros écart de victoires. Des profils trop différents donnaient 0–3 % ou 90–99 % de victoires ; les valeurs retenues sont très proches du joueur moyen.
- Facile contre joueur moyen : 30–31 % de victoires, donc **~70 % de défaites**. Difficile contre joueur moyen : **60–62 % de victoires** (3 × 1000 matchs, persos, côtés et premier joueur alternés).

**Tests**
- 3 tests unitaires de plus (71) : facile perd 62–78 %, difficile gagne 52–68 % sur 1000 matchs, mêmes règles pour tous les profils.
- 3 tests Playwright de plus (22) : le joueur gifle puis l'IA répond seule avec une vraie gifle, touchers ignorés pendant son tour ; match complet perdu contre l'IA difficile → « DÉFAITE… » sans « NIVEAU SUIVANT » ; les 3 niveaux se lancent depuis l'URL.

## Premier jeu · Phase 5 · Mécaniques avancées — 2026-10-01

**Fait**
- **Rage** (`src/logic/match.ts`) : +1 par dégât reçu (gifle, gifle molle, surchauffe), plafonnée à 100, conservée d'un round à l'autre. Pleine, elle débloque la gifle spéciale au tour suivant du perso, puis retombe à 0 au lancement de la spéciale. Une gifle molle ou une surchauffe ne gaspille pas la spéciale.
- **Gifles spéciales** : Le Battoir (Bernard, une gifle énorme) et La Toupie (Lola, 3 gifles enchaînées à ×0,7). Annonce plein écran, flash rose, ralenti et tremblement renforcés ; La Toupie fait reculer la barre de vie coup par coup, avec un chiffre et une trace de main par gifle.
- **Sonné** : après un coup de 25 dégâts ou plus, la victime joue son prochain tour avec une jauge irrégulière — vitesse tirée au hasard entre −30 % et +30 %, nouvelle valeur toutes les ~260 ms avec raccords en douceur (`stunCurve`). Étoiles qui tournent au-dessus de la tête et étiquette « SONNÉ ! » jusqu'à la fin de son tour. L'IA subit la même jauge : elle vise sans connaître la courbe.
- **Interface** : jauge de rage fine sous la barre de vie (rouge, puis rose qui pulse + « RAGE MAX ! ») ; au tour du perso, aura rosée et étiquette « LE BATTOIR PRÊT ! » / « LA TOUPIE PRÊT ! ».
- Sons : montée « transformation » à la rage pleine et au lancement de la spéciale, gazouillis d'oiseaux quand un perso est sonné. 10 phrases de commentateur en plus (rage, Battoir, Toupie, sonné).

**Équilibrage**
- Avec les valeurs de la roadmap (Battoir ×1,8, Toupie 3 × 0,7 = ×2,1), Lola passait à 55–56 % de victoires. **Le Battoir passe à ×2,0** : Bernard 48–51 % / Lola 49–52 % sur 3 × 1000 matchs.
- En moyenne par match : ~3 spéciales, ~5,5 états sonnés, ~90 s, ~26 tours.
- Paliers de la jauge sonnée à 260 ms plutôt que plus courts : en dessous, les ±30 % se lissent et ne se sentent pas.

**Tests**
- 15 tests unitaires de plus (86) : rage (gain, plafond, déblocage, conservation), spéciales (dégâts exacts, rage à 0, pas de gaspillage), sonné (seuil de 25, durée d'un tour, bornes et douceur de la courbe, surchauffe selon la courbe), équilibre 40–60 % sur 200 matchs avec ces mécaniques.
- 4 tests Playwright de plus (26) : rage pleine → RAGE MAX et spéciale prête ; Le Battoir (annonce, dégâts, rage à 0) ; La Toupie (3 chiffres, 3 traces, total des dégâts) ; sonné (étoiles, vitesse de jauge mesurée image par image, état levé après le tour).

## Premier jeu · Phase 6 · Jeu en ligne — 2026-10-01 (jalon : test par le propriétaire)

**Fait**
- **Écran d'accueil** (`src/scenes/TitleScene.ts`, avancé de la phase 7 pour rendre le jalon testable sans lien spécial) : SOLO (puis FACILE / NORMAL / DIFFICILE), 2 JOUEURS, EN LIGNE, ENTRAÎNEMENT. Bouton maison en combat pour y revenir ; l'écran de fin propose REVANCHE et MENU.
- **Salon** (`src/net/lobby.ts`, interface HTML pour profiter du clavier du téléphone) : CRÉER UN SALON → code à 4 lettres (sans I ni O, pour le dicter sans erreur) + bouton PARTAGER LE LIEN (partage natif du téléphone, sinon copie) ; REJOINDRE → saisie du code. Le lien `?join=CODE` rejoint directement. Messages clairs : « Le code fait 4 lettres. », « Salon introuvable. Vérifie le code. ».
- **Connexion** (`src/net/session.ts`) : PeerJS / WebRTC, directe entre les deux téléphones, sans serveur de jeu à maintenir (seule la mise en relation passe par le serveur public de PeerJS). PeerJS est chargé seulement quand on va en ligne (le chargement initial ne grossit pas).
- **Protocole** (`src/net/protocol.ts`, `online.ts`) : un match est entièrement déterminé par la suite des actions (charge, vitesse, angle). Chaque téléphone joue ses tours, envoie son action, et les deux déroulent le même `Match`. L'hôte joue Bernard à gauche, l'invité Lola à droite. C'est le téléphone de celui qui joue qui décide du dépassement de chrono. L'autre téléphone voit l'adversaire armer (pose + jauge), même si l'action arrive pendant son propre bandeau.
- **Déconnexions et reprise** :
  - battement de cœur toutes les 1,5 s ; sans nouvelles pendant 5 s, bandeau « CONNEXION PERDUE… », chrono en pause, et reconnexion automatique ;
  - à chaque (re)connexion, les deux téléphones comparent leurs journaux d'actions et rejouent ce qui manque (`reconcile`) ;
  - le journal est sauvegardé à chaque action (`sessionStorage`) : si la page est rechargée (invité ou hôte), la partie reprend exactement où elle en était (`replayMatch`, annonce « REPRISE ! »).
- **Revanche** en ligne : un seul des deux appuie, les deux repartent.

**Corrigé au passage (trouvé par les tests à deux navigateurs)**
- Surchauffe et saccades : la surchauffe était vérifiée à chaque image, avant le traitement des mouvements du doigt en attente. Sur un appareil qui saccade, un swipe fait à temps pouvait devenir une surchauffe. Elle est maintenant constatée sur une image et appliquée à la suivante : les gestes déjà faits (datés à leur vrai moment) passent d'abord.

**Tests**
- 13 tests unitaires de plus (99) : code de salon, synchronisation des journaux (rattrapage, avance, revanche, divergence), reprise d'un match complet par son journal comparée étape par étape au match réel, surchauffe sous saccades.
- 6 tests Playwright de plus (32), avec un serveur de mise en relation local et **deux navigateurs** :
  - écran d'accueil et choix du niveau ; erreurs de salon ;
  - match complet en ligne : même vainqueur, mêmes rounds, mêmes PV, même nombre de tours des deux côtés ; l'un voit « VICTOIRE ! », l'autre « DÉFAITE… » ; revanche ;
  - chacun joue son tour au doigt : mêmes PV sur les deux téléphones à chaque tour, l'autre ne peut pas jouer à ta place ;
  - coupure de connexion en plein match → bandeau, reconnexion, même résultat final ;
  - page rechargée en plein match (invité, puis hôte) → reprise, même résultat final.
- Limite : ces tests passent par un serveur de mise en relation local. Le serveur public de PeerJS et la traversée des box / réseaux mobiles ne peuvent pas être essayés depuis le bac à sable : c'est l'objet du test du propriétaire.

## Mise à jour « moins prévisible » · esquive, feinte, spéciales volontaires, droit de réponse — 2026-10-02

Retour du propriétaire : le jeu est trop prévisible, celui qui ouvre la manche la gagne souvent.
Mesuré par simulation : celui qui ouvre gagnait **61,8 %** des manches.

**Fait**
- **Esquive** : celui qui reçoit glisse le doigt **vers l'arrière** au moment de l'impact. Correcte (jusqu'à 170 ms avant l'impact) : −30 % de dégâts ; parfaite (70 ms) : −60 % et +10 de rage. En avance ou en retard : rien, mais **aucune pénalité**. Un seul essai par gifle.
- **Feinte** : le swipe fait, tant que le doigt reste posé, la gifle est retenue (0,8 s au maximum, puis elle part toute seule). Le chrono du tour s'arrête pendant la feinte. Celui qui recule trop tôt a grillé son essai.
- La gifle met désormais **360 ms** à arriver une fois lâchée (pose d'élan, pas en avant) : c'est le temps de la voir venir.
- **Spéciales volontaires** : rage pleine, on **glisse vers le haut** pour déclencher sa spéciale (sinon la gifle reste normale et la rage est gardée).
  - *Le Battoir* : jauge plus lente (×0,8), zone dorée étroite (84–90 %), une gifle ×2.
  - *La Toupie* : après la première gifle, on re-glisse jusqu'à 2 fois en rythme (entre 0,18 s et 0,7 s après la précédente) ; chaque gifle placée compte (×0,8 chacune). Trop vite : le rythme est cassé.
- **Garde de rage** : rage pleine en défense, on **glisse vers le bas** → esquive parfaite garantie, toute la rage est dépensée (plus de spéciale).
- **État sonné adouci** : il faut toujours 25 dégâts d'un coup, mais une esquive fait passer la plupart des gros coups sous le seuil.
- **Droit de réponse** (`MATCH.rightOfReply`, activable/désactivable en une ligne) : si celui qui a ouvert la manche met l'autre K.O., ce dernier rend une dernière gifle avant de tomber — les deux jouent ainsi le même nombre de tours. Double K.O. : gagne celui qui est le moins « en dessous de zéro ».
- À deux sur le même téléphone, chacun joue sur **sa moitié d'écran** (un doigt gifle pendant que l'autre esquive).
- Visuels provisoires (pas de nouveaux dessins) : l'esquive est un recul du perso avec une teinte — bleu (correcte), or (parfaite), rose (garde de rage) — et une étiquette ; celui qui joue son droit de réponse est teinté de rouge. À remplacer par de vraies poses plus tard.
- IA : elle esquive, mord (ou non) aux feintes, feinte elle-même, déclenche ses spéciales et tient plus ou moins le rythme de La Toupie selon le niveau.
- En ligne (protocole v2) : chaque téléphone juge l'esquive de son propre joueur (pas de décalage dû au réseau), l'envoie à celui qui gifle, qui valide l'action ; le journal des actions reste la seule référence.
- L'esquive est jugée sur le temps du jeu (l'animation que le joueur voit), pas sur l'horloge : si le téléphone saccade, la fenêtre suit l'image.

**Résultats (3 × 1000 matchs simulés)**
- Manches gagnées par celui qui ouvre : 61,8 % → **49,5 %**. L'esquive seule ne donnait que ~58 % : c'est le droit de réponse qui supprime vraiment l'avantage.
- Bernard 50–53 % / Lola 47–50 %, ~114 s et ~32 tours par match, 45 % des gifles esquivées, ~3,2 spéciales et ~3,7 « sonnés » par match.
- Niveaux de l'IA recalibrés contre le joueur moyen : facile ~30 %, difficile ~62 %.

**Réglages** (`src/config/balance.ts`) : `DEFENSE` (fenêtres, réductions, temps de trajet, durée de feinte), `COMBO` (rythme de La Toupie), `MATCH.rightOfReply`, La Toupie ×0,7 → ×0,8 par gifle.

**Tests**
- 127 tests unitaires (esquive, garde de rage, geste d'esquive, feinte, spéciales volontaires, droit de réponse, double K.O., rejeu du journal, avantage de l'ouvreur ≈ 50 %).
- Playwright : nouveau fichier `esquive.spec.ts` (8 tests) ; spéciales et jeu en ligne mis à jour (les esquives passent bien par le réseau, journaux identiques des deux côtés).
- Les gestes à timing serré sont joués dans la page au rythme de l'horloge du jeu : le bac à sable de test est trop lent et irrégulier pour les jouer « en vrai ».

## Premier jeu · Phase 7 · Progression et menus — 2026-10-02

**Fait**
- **Choix du perso** (écran SOLO, bouton « PERSO : … ») : le joueur est à gauche, l'adversaire est l'autre perso. Vaut pour le solo, le 2 joueurs et l'entraînement ; en ligne, l'hôte reste Bernard. Accès direct : `?fighter=bernard|lola`.
- **XP en fin de match** (`src/config/progress.ts`) : 15 pour un match terminé, +10 par round gagné, + victoire contre l'IA (facile 30, normal 55, difficile 90) ou en ligne (60) ; 20 pour un match à deux sur le même téléphone. Rien pour la démo ni l'entraînement.
- **Niveaux** : 100, 250, 450, 700… XP (chaque niveau demande 50 XP de plus que le précédent), 10 niveaux.
- **Déblocages** : niveau 2 tenue Streetwear de Bernard, 3 Bar de nuit, 4 tenue Néon de Lola, 5 Bar au couchant, 6 tenue Bronze de Bernard, 7 tenue Ombre de Lola. **Provisoire** : faute de dessins, une tenue ou un bar est une teinte appliquée au perso ou au décor (`tint` dans `UNLOCKS`) ; il suffira d'y brancher les vraies images.
- **Vestiaire** (écran d'accueil) : choix de la tenue de chaque perso et du bar, annonce du prochain déblocage.
- Écran d'accueil : niveau et barre d'XP sous le titre. Écran de résultat : XP gagnée, barre de niveau, bandeau « DÉBLOQUÉ : … ».
- **Sauvegarde** dans `localStorage` (`slap.progress`) : XP, matchs, victoires, perso, tenues, bar. Une sauvegarde absente, abîmée ou incohérente (tenue pas encore débloquée) est remise d'aplomb sans planter.

**Tests**
- 137 tests unitaires (dont 10 sur la progression : paliers, XP, déblocages, choix, sauvegarde).
- Playwright `phase7.spec.ts` : titre → vestiaire → choix du perso → match gagné → résultat et XP → revanche → déblocage → rechargement (tout est conservé) → tenue enfilée, conservée après rechargement et visible en combat ; une défaite rapporte aussi de l'XP.

## iPhone : plein écran et zone sûre — 2026-10-02

Retour du propriétaire après une partie à deux : sur iPhone, le plein écran n'était pas bon. Le droit de réponse est validé.

- Safari sur iPhone n'a **pas** de plein écran pour les pages web : le seul vrai plein écran est l'ajout à l'écran d'accueil (Partager → « Sur l'écran d'accueil »). L'accueil du jeu l'explique quand on est dans Safari sur iPhone/iPad.
- **Zone sûre** (`src/ui/safe.ts`) : barres de vie, boutons, jauge, aide et bandeau du commentateur s'écartent de l'encoche et de la barre d'accueil ; le décor, lui, va jusqu'au bord. `?safe=gauche,droite,haut,bas` simule ces marges.
- Zoom bloqué (pincement, double appui) ; le jeu se recale quand les barres de Safari apparaissent ou disparaissent ; hauteur calée sur la zone réellement visible (`100dvh`).
- Non vérifiable depuis le bac à sable (pas d'iPhone) : testé avec des marges simulées, à confirmer sur l'appareil.

## Poses d'esquive et de garde — 2026-10-03

- Trois nouvelles poses par perso, fournies par le propriétaire : `dodge` (esquive), `dodge_perfect` (esquive parfaite), `guard` (garde de rage). Elles remplacent les teintes provisoires (bleu / or / rose).
- Les images générées n'étaient pas détourées (fond noir ou blanc) et deux d'entre elles contenaient un second personnage et des traits de vitesse : détourage par remplissage depuis les bords, on ne garde que le perso, les zones de fond enfermées (entre un bras et le corps) sont retirées. Chaque pose est ensuite posée sur le canevas du perso (1300 × 823 ou 908 × 772), pieds sur la ligne commune, à la même échelle que les autres.
- En jeu : la pose d'esquive apparaît dès que le joueur glisse vers l'arrière (et le perso se remet en place si c'était trop tôt) ; la garde de rage tient jusqu'à l'impact.

## Deux premiers combattants avec le jeu de poses complet — 2026-10-11

À la demande du propriétaire, pour essai : deux combattants fournis en planches (2 planches de 12 poses chacun) remplacent Bernard et Lola dans le jeu.

- **Images** : planches détourées (fond vert), découpées en 23 poses de 1300 × 820 px, pieds à 10 px du bas, la planche 2 recalée sur la planche 1 grâce à une pose de repère. Dossiers `raw/fighters/aviateur/` et `raw/fighters/tailleur/`.
- **Poses** : `poses.ts` connaît deux jeux d'images, le premier (11 poses, avec poses provisoires) et le jeu complet du guide (une vraie image par action, sans effet de remplacement). La marche alterne `walk1` et `walk2` tous les 10 pas. `special2` est fournie mais pas encore utilisée.
- **Gabarit** : `rapide` pour les deux, mêmes boîtes de corps (choix provisoire du propriétaire, pour tester). Simulation : 24 séries sur 24 dans les critères.
- **Bernard et Lola** : retirés de l'écran de sélection, de l'écran titre et du tirage au hasard (`PLAYABLE_IDS` dans `roster.ts`). Ils restent dans le moteur pour les tests, qui s'appuient sur eux (seuls porteurs du gabarit `lourd`) ; leurs images ne sont chargées que si l'URL les demande (`?p1=bernard&p2=lola`).
- **Textes** : noms repris des fichiers fournis ; nom du coup spécial et répliques provisoires, à écrire dans `texts.ts`.
- **À reprendre sur les dessins** : `walk1` et `walk2` sont presque identiques ; `kick` frappe à hauteur de hanche au lieu du genou.
- **Tests navigateur** : 3 tests de la phase 1 et 2 échouent dans le bac à sable, y compris sur la version précédente (attentes trop serrées sur une machine lente) ; à revoir.

## Quatre combattants de plus : la grille de sélection est pleine — 2026-10-11

- **Ajout** de `cadet`, `barbe`, `doyen` et `binocle` (23 poses chacun, mêmes planches et même traitement que les deux premiers), tous en gabarit `rapide` en attendant le choix du propriétaire. Les 6 cases de l'écran de sélection sont occupées.
- **Poids** : les jeux complets sont réduits à 0,74 (perso debout ~440 px) au lieu de 0,85, pour garder le chargement initial sous 4 Mo avec 6 combattants (3,1 Mo d'images de combattants). Au-delà de 6, il faudra charger les poses d'un combattant seulement quand il est choisi.
- **Dessins** : ces quatre planches utilisent le prompt corrigé (pose d'attente moins écartée, marche à deux temps distincts, coup de pied bas). Les deux premiers combattants gardent leurs anciennes planches.
- **Vérifications** : 150 tests unitaires, simulation 94 séries sur 94 dans les critères, parcours de sélection au tactile.

## Deux nouveaux lieux : l'Élysée et la place de la République — 2026-10-13

- **Décors larges** : images de 2992 × 1008 (environ 3 × 1), réduites à 2671 × 900 en WebP (`raw/stages/elysee/`, `raw/stages/republique/`). `npm run assets` traite maintenant chaque dossier de `raw/stages/` ; `assets.json` a une rubrique `stages`.
- **Affichage** : nouveau réglage `wide` dans `stages.ts`. Le décor couvre toute la largeur du niveau et défile avec la caméra, sans miroir. Largeur du niveau : 1,35 écran (au lieu de 2 pour le bar), ce qui laisse voir toute la hauteur de l'image, drapeau et statue compris.
- **Sol** : dans ces images, le sol commence vers 75 % (Élysée) et 79 % (République) de la hauteur, au lieu de 55 % pour le bar. On garde cette position plutôt que de couper le haut de l'image ; les combattants restent sur la pelouse ou les pavés.
- **Chargement** : les décors larges ne sont chargés qu'à l'écran du choix du lieu (ou au combat lancé par l'URL). Chargement initial inchangé : 3,57 Mo.
- **Textes** : noms « L'Élysée » et « La République » ; trois répliques qui parlaient du bar sont rendues neutres.

## Deux lieux de plus : l'Assemblée nationale et la place de la Bastille — 2026-10-13

- **Décors larges**, même traitement que l'Élysée et la République (2992 × 1008, niveau de 1,35 écran). Le sol commence à 72 % de la hauteur pour l'Assemblée et à 70 % pour la Bastille.
- **Choix du lieu** : la grille passe à 3 × 2 cases (5 lieux et une case « Bientôt »).
- **Commentateur** : quatre répliques qui parlaient du comptoir ou du patron sont rendues neutres.
- **Vérifications** : 205 tests unitaires et 39 tests navigateur passent. Chargement initial inchangé : 3,57 Mo.
