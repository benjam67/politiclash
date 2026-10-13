# PolitiClash – Roadmap de développement

Version du 13 octobre 2026 (style de combat unique, barre Buzz et coups spéciaux propres à chaque personnage).

Ce document contient tout le contexte nécessaire pour qu'une nouvelle discussion code, teste et déploie le jeu en autonomie. Il remplace la roadmap du premier jeu (`soufflet`, gifles au tour par tour), dont il reprend la stack, les assets et la méthode.

> **État** : phases 0 à 4 bis faites, six combattants intégrés le 11 octobre. Les décisions du 13 octobre (un seul style de combat, barre Buzz, coups spéciaux uniques, voir sections 3 et 7) **ne sont pas encore codées** : elles le seront en phase 5. En cas d'écart, c'est le code qui fait foi et la roadmap s'adapte.

## 1. Contexte et objectif

Objectif : transformer le jeu de gifles au tour par tour en **vrai jeu de combat en temps réel**, avec déplacements, choix du personnage et choix du niveau.

- **Pitch** : des femmes et des hommes politiques français, de tous les partis, règlent leurs comptes à coups de gifles. Ils se déplacent, sautent, s'accroupissent, se protègent et se giflent en temps réel. Ton absurde et exagéré, dans la tradition française de la caricature. Tous les bords sont représentés et tous en prennent pour leur grade.
- **Un seul style de combat** : tous les combattants se déplacent et frappent de la même façon. Seul leur **coup spécial** les distingue.
- **Plateforme** : jeu web (PWA) en mode paysage, jouable sur iOS et Android depuis un navigateur. Jouable aussi au clavier sur ordinateur (indispensable pour les tests).
- **Modes** : d'abord **solo contre l'IA**. Dès que le solo fonctionne bien, **deux joueurs en ligne**. Pas de mode deux joueurs sur le même téléphone.
- **Équipe** : un seul développeur, en vibecoding. Claude code, teste et déploie en autonomie ; le propriétaire du projet ne teste qu'aux jalons indiqués.
- **Priorité** : le plaisir de la gifle avant tout. Chaque phase doit rester jouable et déployée.
- **Hors périmètre** : publication sur les stores, monétisation, comptes utilisateurs, mode deux joueurs en local.

### Qui fait quoi : le moteur et l'habillage

Le jeu sépare strictement le **moteur** de l'**habillage**.

| | Claude | Le propriétaire du projet |
| --- | --- | --- |
| Moteur : déplacements, coups, garde, barre Buzz, IA, écrans, jeu en ligne | ✔ | |
| Réglages du style de combat commun, équilibrés par simulation | ✔ | |
| Programmation des cinématiques des coups spéciaux | ✔ | |
| Prompts de génération des planches, à partir des idées et des références du propriétaire | ✔ | |
| Décors en tant que lieux (hémicycle, plateau télé, marché…) : intégration technique | ✔ | |
| Choix des personnalités, idée de chaque coup spécial | | ✔ |
| Génération ou dessin des personnages, des décors et des accessoires | | ✔ |
| Noms, surnoms, noms des coups spéciaux, répliques du commentateur | | ✔ |

Les personnalités, les idées de coups, les noms et les répliques viennent du propriétaire. Claude n'invente aucune caricature et écarte ce qui prêterait un délit ou un fait précis inventé à une personne réelle (décision du 13 octobre : le déclencheur du spécial de Manu Macs a été changé pour cette raison). Tout l'habillage tient dans **un fichier de textes** (`src/config/texts.ts`) et **un dossier d'images** (`raw/`). Le reste du code ne contient aucun nom de personnage.

## 2. Dépôt et point de départ

- **Dépôt** : `benjam67/politiclash`, public. Il a été créé par import du dépôt du premier jeu, `benjam67/soufflet`.
- **Le dépôt `soufflet` ne doit jamais être modifié.** Il reste en ligne tel quel à son adresse.
- **Adresse du jeu** : https://benjam67.github.io/politiclash/
- **Déploiement** : à chaque push sur `main`, GitHub Actions lance les tests, construit le jeu et le publie sur la branche `gh-pages`, que GitHub Pages sert.

### Combattants intégrés (11 octobre 2026)

| Nom affiché | Identifiant | Coup spécial (voir section 7) |
| --- | --- | --- |
| Manu Macs | `aviateur` | Poudre de perlimpinpin et explosion dorée |
| Narine le Zen | `tailleur` | Petite danse et coup de hanche |
| Baby | `cadet` | Pinte bue cul sec et cassée sur la tête |
| Bompardiou | `barbe` | Faucille et marteau lancés |
| JLM | `doyen` | Hurlement |
| Jordan | `binocle` | Dos tourné, tir par les fesses |

Les six ont leurs 23 poses communes. Ils tournent pour l'instant avec l'ancien gabarit `rapide`. Bernard et Lola ne sont plus proposés dans le jeu ; ils restent dans le code pour les tests, à retirer quand les tests seront réécrits.

### Ce qui est conservé du premier jeu (constaté à l'audit)

| Élément | Sort |
| --- | --- |
| Phaser 3 + TypeScript + Vite, GitHub Pages, PWA, écran « tourne ton téléphone » | Conservé tel quel |
| Conventions d'ancrage, d'échelle et de miroir des sprites | Conservées |
| Scènes Boot et Title | Conservées, simplifiées |
| Interface (barres de vie, jauge de charge, chrono, losanges de rounds, bandeaux, onomatopées) et effets (impact, tremblement, particules, foule, commentateur) | Conservés, rebranchés sur le nouveau combat |
| Sons et musique générés en code | Conservés |
| Progression (XP, niveaux, tenues) | Mise de côté, sans branchement ; à reprendre ou retirer en phase 6 |
| Vitest, Playwright, chaîne d'images (`npm run assets`) | Conservés |
| `src/logic/`, scène Fight, contrôles tactiles, IA, `src/net/` | Réécrits |

### Structure du dépôt

```
politiclash/
  raw/                    images sources (PNG) : c'est ici qu'on dépose les dessins
    fighters/<perso>/     une image par pose
    props/                accessoires des coups spéciaux (projectiles)
    stages/<niveau>/      décor et figurants
  public/assets/          images optimisées, produites par `npm run assets`
  src/
    config/
      texts.ts            TOUS les textes : titre, noms, coups spéciaux, répliques
      balance.ts          toutes les valeurs de réglage
      roster.ts           liste des combattants (coup spécial, voix, boîtes de collision)
      specials.ts         déroulé des cinématiques des coups spéciaux
      stages.ts           liste des niveaux (image, ligne de sol, largeur)
      poses.ts            table « action → image », avec poses provisoires
      assets.json         mesures des images, écrit par `npm run assets`
    logic/                règles pures, sans Phaser, déterministes
    input/                tactile, clavier, IA, réseau : une seule interface
    ai/                   IA (produit des entrées, comme un joueur)
    scenes/               Boot, Title, CharacterSelect, StageSelect, Fight, Result
    ui/                   barres de vie, barre Buzz, jauges, chrono, bandeaux, contrôles tactiles
    fx/                   impact, tremblement, particules, foule, effets des spéciaux
    audio/                sons et musique générés en code
    net/                  jeu en ligne (phase 7)
  tests/unit/             Vitest
  tests/e2e/              Playwright
  ROADMAP.md              ce document
  CHANGELOG.md
```

## 3. Règles du jeu

Un match se joue en 2 rounds gagnants (3 au maximum). Chaque round : 100 PV par combattant et 60 secondes au chrono. Les PV repartent à 100 à chaque round. À la fin du chrono, celui qui a le plus de PV gagne le round.

### Déplacements

- **Marcher** vers l'avant et vers l'arrière.
- **Sauter** (vertical, avant, arrière).
- **S'accroupir** : fait passer les gifles debout au-dessus de la tête.
- Les combattants **se font toujours face** (retournement automatique quand ils se croisent) et ne peuvent pas se traverser au sol.
- Le niveau est plus large que l'écran (environ 2 écrans). La caméra suit le milieu entre les deux combattants ; ils ne peuvent pas s'éloigner de plus d'un écran.

### Coups

Chaque combattant a les mêmes gifles et coups de pied, plus un coup spécial qui lui est propre. Les gifles sont **hautes**, les coups de pied sont **bas** : c'est ce qui décide de la garde à tenir.

| Coup | Commande | Hauteur | Dégâts | Rôle |
| --- | --- | --- | --- | --- |
| Gifle rapide | Appui sur « Gifle » | Haute | 5 | Rapide, sert à interrompre. Passe au-dessus d'un adversaire accroupi |
| Grosse gifle | Maintenir « Grosse gifle », relâcher pour frapper | Haute | selon la charge, 13 à pleine charge, 21 à 23 en zone dorée | Charge, zone dorée, surchauffe |
| Gifle aérienne | « Gifle » en l'air | Haute | 7 | Touche un adversaire accroupi, punit les grosses gifles en charge |
| Coup de pied | Appui sur « Pied » | Bas | 7 | Plus lent, plus long. Touche un adversaire accroupi ; on peut sauter par-dessus |
| Balayette | « Pied » en étant accroupi | Bas | 6 | Passe sous les gifles hautes |
| Coup spécial | Maintenir « Buzz » (le bouton « Grosse gifle » quand la barre Buzz est pleine) | Imblocable | 35 (18 avec une garde au bon moment) | Cinématique propre à chaque personnage, voir « Barre Buzz et coup spécial » |
| Autogifle | Surchauffe de la grosse gifle | – | 8, à soi-même | Punit la charge trop longue |

**Grosse gifle, héritage du premier jeu :**
- La jauge monte de 0 à 100 % tant que le bouton est maintenu. Le combattant ne peut pas se déplacer pendant la charge et reste vulnérable.
- Relâcher dans la **zone dorée** donne un coup critique (×2) qui **brise la garde**.
- **Surchauffe** : rester à 100 % plus de 150 ms, et le combattant se gifle lui-même (8 dégâts).
- Relâcher sous 20 % de charge annule le coup.

### Défense

- **Garde haute** : maintenir « Garde ». Bloque les gifles, sauf une grosse gifle en zone dorée.
- **Garde basse** : maintenir « Garde » en tenant le stick vers le bas. Bloque les coups de pied.
- **Mauvaise hauteur** : le coup passe en entier, comme sans garde. En garde basse, la tête reste à portée de gifle.
- Un coup bloqué inflige 10 % de ses dégâts, **arrondis, avec un minimum de 1 PV** (une gifle rapide bloquée retire 1 PV).
- **Jauge de garde** : chaque coup bloqué la vide un peu ; elle se recharge hors garde. Vide, la garde est brisée et le combattant est sonné 1 seconde.
- **Accroupi** (sans garde) : esquive la gifle rapide et la grosse gifle, mais prend les coups de pied.
- **Coup spécial** : ne se bloque pas. Une garde mise au bon moment réduit seulement ses dégâts (voir plus bas).

### Dégâts

```
Gifles, coups de pied :   D = dégâts du coup
Grosse gifle :            D = B × (C / 100) × K
Coup bloqué :             D = arrondi(10 % des dégâts), au moins 1
```

- B = base de la grosse gifle, C = charge en %, K = 2 en zone dorée sinon 1.
- La résistance R_d des anciens gabarits disparaît : elle vaut 1 pour tout le monde.

### Un seul style de combat

Les gabarits `lourd` et `rapide` sont fusionnés en un seul profil, commun à tous. Valeurs de départ (moyenne des deux gabarits), à régler par simulation :

| Réglage | Valeur |
| --- | --- |
| Vitesse de marche | 200 px/s |
| Durée du saut | 600 ms |
| Base B de la grosse gifle | 13 |
| Charge 0 → 100 % | 1,2 s |
| Zone dorée | 78–90 % |
| Allonge | identique pour tous |

Les distances sont en pixels pour un écran logique de 844 × 390 : la logique travaille dans ce repère, l'affichage convertit vers la taille réelle (monde Phaser de 720 de haut, largeur étendue). Seules les boîtes de collision peuvent varier d'un personnage à l'autre, pour coller à leurs dessins.

### Durées des coups

| Coup | Préparation | Coup actif | Récupération | Dégâts | Adversaire figé |
| --- | --- | --- | --- | --- | --- |
| Gifle rapide | 100 ms | 70 ms | 180 ms | 5 | 250 ms |
| Gifle aérienne | 120 ms | jusqu'à l'atterrissage | 150 ms | 7 | 300 ms |
| Coup de pied | 150 ms | 80 ms | 230 ms | 7 | 280 ms |
| Balayette | 130 ms | 70 ms | 250 ms | 6 | 250 ms |
| Grosse gifle (après relâchement) | 60 ms | 90 ms | 350 ms | selon formule | 450 ms, recul important |

Une grosse gifle de 14 dégâts ou plus **met l'adversaire à terre** (en pratique : la zone dorée) ; il se relève après 800 ms, invulnérable au sol et pendant le relevé.

### Barre Buzz et coup spécial (phase 5)

La barre Buzz remplace la rage. Elle récompense celui qui attaque et esquive bien, pas celui qui encaisse.

**La barre**
- Petite barre sous la barre de vie, de 0 à 100.
- Gains (valeurs de départ, à régler pour obtenir **un ou deux spéciaux par round**) :

| Action | Gain |
| --- | --- |
| Gifle rapide, gifle aérienne, coup de pied ou balayette qui touche | +6 |
| Grosse gifle qui touche | +10 |
| Grosse gifle en zone dorée | +20 |
| Esquive réussie : s'accroupir sous une gifle, sauter par-dessus un coup de pied, pendant que le coup est actif et à portée | +15 |
| Coup bloqué en garde | 0 |
| Coup reçu | 0 |

- **D'un round à l'autre** : la barre se garde (décision du 13 octobre). Elle repart à 0 seulement au début d'un nouveau match.

**Le déclenchement**
- Barre pleine : le bouton « Grosse gifle » change de couleur, brille et affiche « Buzz ». La grosse gifle n'est plus disponible tant que le spécial n'est pas utilisé.
- Le joueur maintient le bouton : un cercle se remplit autour, en 0,5 s. Pendant ce temps, il ne peut pas bouger.
- Relâché avant la fin : rien ne se passe, la barre reste pleine.
- Touché pendant que le cercle se remplit : le cercle s'annule, la barre reste pleine.
- Cercle complet : la cinématique du coup spécial se lance.

**La cinématique**
- Le coup spécial **touche toujours** : une fois lancé, il ne peut ni être évité ni bloqué.
- Les personnages dont le spécial frappe de près (Narine le Zen, Baby, Manu Macs) **se collent automatiquement à l'adversaire** au début de la cinématique. Ceux qui frappent à distance (JLM, Bompardiou, Jordan) restent où ils sont.
- Le chrono s'arrête pendant la cinématique. Le lanceur est invulnérable.
- **Dégâts : 35 PV.** Le coup met à terre et rend sonné.
- **Garde au bon moment** : un signal (éclair et son sec) précède l'impact. Si la victime met la garde dans les 100 ms (6 pas) qui suivent le signal, elle ne perd que 18 PV. Trop tôt ou trop tard : 35 PV.
- Après l'impact, la barre Buzz retombe à 0 et la grosse gifle redevient disponible.
- La cinématique fait partie de la simulation (durée fixe en pas, pas d'animation qui décide de quoi que ce soit), pour rester synchrone en ligne.

### Autres mécaniques (phase 5)

- **Sonné** : après une garde brisée, ou un coup de 25 dégâts ou plus (dont le coup spécial) : pendant 3 secondes, la jauge de grosse gifle de la victime monte de façon irrégulière (vitesse ±30 %).
- **KO** : à 0 PV, pose « dazed » pour le perdant, « victory » pour le gagnant.

Toutes ces valeurs vivent dans `src/config/balance.ts`, `src/config/roster.ts` et `src/config/specials.ts`, pour être réglées sans toucher à la logique. Aucun texte affiché n'y figure : les noms et le mot « Buzz » sont dans `src/config/texts.ts`.

## 4. Contrôles

### Tactile (mobile, paysage)

- **Moitié gauche de l'écran** : stick virtuel. Gauche et droite pour marcher, haut pour sauter, bas pour s'accroupir.
- **Moitié droite** : quatre boutons, « Gifle », « Pied », « Grosse gifle » (à maintenir ; devient « Buzz » quand la barre est pleine), « Garde » (à maintenir ; avec le stick vers le bas : garde basse).
- Les contrôles ne doivent jamais masquer les combattants ni les barres de vie.

### Clavier (ordinateur et tests)

- Flèches ou ZQSD : déplacements, saut, accroupi.
- J : gifle, I : pied, K : grosse gifle et Buzz, L : garde.

### Une seule interface d'entrée

Le joueur, l'IA et plus tard le joueur distant produisent tous le même objet d'entrée à chaque pas de simulation :

```
{ gauche, droite, haut, bas, gifle, grosseGifle, garde, pied }
```

La logique ne sait pas d'où viennent les entrées. Le Buzz n'ajoute pas d'entrée : c'est `grosseGifle` maintenu avec la barre pleine.

## 5. Contraintes techniques du combat

Ces règles s'appliquent dès la phase 1. Elles conditionnent le jeu en ligne de la phase 7 : les ignorer obligerait à tout réécrire.

- **Pas fixe** : la logique avance à 60 pas par seconde, indépendamment de la fréquence d'affichage.
- **Fonction pure** : `step(état, entréesJ1, entréesJ2) → nouvel état`. Aucun appel à Phaser, à l'horloge ou à `Math.random` dans `src/logic/`.
- **Déterminisme** : générateur aléatoire à graine stocké dans l'état ; pas de fonctions trigonométriques dans la logique ; valeurs entières dès que possible. Deux exécutions avec les mêmes entrées donnent exactement le même état.
- **État sérialisable** : l'état complet du combat est un objet simple, copiable et comparable (empreinte de contrôle).
- **Collisions par rectangles** : chaque pose a une boîte de corps, une boîte vulnérable et, pour les coups, une boîte de frappe. Elles sont décrites dans `roster.ts`.
- **Affichage séparé** : la scène Fight lit l'état et l'affiche (pose, position, effets). Elle ne décide de rien. Les cinématiques des spéciaux suivent la même règle : la logique avance la cinématique pas à pas, l'affichage montre les poses et les effets.

## 6. Direction artistique

Style anime de baston des années 90, comique et exagéré, identique au premier jeu. Les personnages politiques sont générés par le propriétaire dans ce même style, en caricature. La référence visuelle de l'interface et des effets reste la [maquette Slap Fighter](https://claude.ai/artifact/993HtiDhMQQGK2257KPoG2).

Les animations fonctionnent par **changement de pose**, sans animation fluide : une pose par action, deux à quatre pour la marche, trois pour un coup spécial. De petits mouvements codés (rebond, étirement, pas en avant, tremblement) et les effets du jeu (paillettes, explosion, onde de choc, éclats de verre) donnent la vie.

## 7. Assets

### Conventions (inchangées)

- Tous les combattants sont dessinés **tournés vers la droite**. Celui de droite est affiché en miroir horizontal. Exceptions : quelques poses de coup spécial (dos tourné, face au joueur), indiquées dans `GUIDE-DESSINS.md`.
- **Point d'ancrage** : centre horizontal de l'image, pieds à 10 px au-dessus du bas de l'image.
- **Même facteur d'échelle** pour tous les combattants, afin de garder leur rapport de taille.
- Toutes les poses d'un perso ont **la même taille d'image et la même ligne de pieds**. On change de texture sans recalage.
- Fond transparent. Optimisation : environ 440 px de haut (réduit le 11 octobre pour tenir sous 4 Mo avec six combattants), format WebP.

### Poses

La liste complète des poses, les tailles, les planches et les règles pour les décors sont dans **`GUIDE-DESSINS.md`**. Les prompts des planches des coups spéciaux sont dans **`PROMPTS-SPECIAUX.md`**.

- **Poses communes** : 21 par personnage. Les six combattants les ont déjà.
- **Poses du coup spécial** : 3 par personnage (`special1`, `special2`, `special3`), propres à chacun. Elles remplacent les anciennes poses `special` et `special2`, identiques pour tous.
- **Accessoires** : 2 images séparées, dans `raw/props/` : le projectile de Jordan et la faucille et le marteau de Bompardiou.
- Manu Macs et Narine le Zen ont encore leurs anciennes planches (jambes très écartées, marche peu animée, coup de pied haut). À refaire avec le prompt corrigé si possible.

### Les six coups spéciaux

| Perso | Portée | Déroulé | Poses | Effets tracés par le jeu |
| --- | --- | --- | --- | --- |
| Narine le Zen | Près | Petite danse (une main à la taille, l'autre bras à l'horizontale, avant-bras vers le ciel), puis coup de hanche | danse 1, danse 2, coup de hanche | Étoiles, recul |
| Baby | Près | Sort une pinte, la boit cul sec, la casse sur la tête de l'adversaire | pinte en main, boit, frappe | Mousse, éclats de verre |
| Manu Macs | Près | Souffle de la poudre de perlimpinpin, se tourne face au joueur bras levés, explosion | poudre dans la main, souffle, bras levés face au joueur | Nuage de paillettes dorées, explosion dorée |
| JLM | Distance | Inspire, puis hurle sur l'adversaire | inspire, hurle, hurle bras écartés | Onde de choc, adversaire repoussé |
| Bompardiou | Distance | Lance une faucille et un marteau | élan, lancer, fier | Projectile qui tournoie (image fournie) |
| Jordan | Distance | Se retourne dos à l'adversaire et tire par les fesses | se retourne, penché dos tourné, se redresse | Projectile (image fournie), petit nuage |

Les noms des coups spéciaux et les répliques du commentateur restent à écrire par le propriétaire dans `texts.ts`.

### Poses provisoires : le code n'attend pas les dessins

Le fichier `src/config/poses.ts` associe chaque action à une image. Tant qu'une pose n'est pas fournie, une pose existante la remplace. Pour les coups spéciaux, en attendant leurs trois poses, la cinématique utilise les anciennes poses `special` et `special2`.

Quand une vraie pose arrive : déposer le PNG dans `raw/fighters/<perso>/`, l'ajouter à la liste des poses, lancer `npm run assets` et modifier une ligne dans `poses.ts`.

### Niveaux

- Un niveau est une image de décor d'environ **2 écrans de large**, avec la ligne de sol à la même hauteur pour tous les niveaux.
- **Niveau 1 : le bar**, en version élargie. En attendant, le décor actuel est répété en miroir sur les bords.
- Niveaux suivants à fournir, sur le thème politique : l'hémicycle, le plateau télé d'un débat, le marché en campagne électorale, le Salon de l'agriculture.
- Chaque décor peut avoir ses propres figurants (députés, public du plateau, badauds du marché).

### Nouveaux combattants

1. **Les dessins** : un dossier `raw/fighters/<identifiant>/` avec les 21 poses communes et les 3 poses du spécial. L'identifiant est un mot neutre en minuscules.
2. **Les textes** : une entrée dans `src/config/texts.ts` (nom, nom court, nom du coup spécial, répliques).
3. **Le coup spécial** : son déroulé, décrit par le propriétaire, programmé dans `specials.ts`.

La grille de sélection a 6 cases, toutes occupées. Un septième combattant demandera une grille plus grande et le chargement des images d'un combattant seulement quand il est choisi (le chargement initial est à la limite des 4 Mo).

Deux précautions, qui relèvent du propriétaire : taper sur tous les bords, comme le veut la tradition ; et, avant une diffusion large, demander un avis juridique (l'exception de caricature existe en droit français, mais elle a des limites).

## 8. Méthode de travail et tests

Claude enchaîne les phases seul et vérifie lui-même chaque étape. Le propriétaire du projet ne joue qu'à **3 jalons** : fin de la phase 2, fin de la phase 4 et fin de la phase 7.

### À chaque phase

1. Coder la phase, avec des commits réguliers sur `main`.
2. Faire passer **toutes** les vérifications ci-dessous.
3. Pousser, attendre le déploiement GitHub Pages et vérifier que la version en ligne se charge.
4. Noter dans `CHANGELOG.md` ce qui a été fait et les réglages choisis.
5. Passer à la phase suivante sans attendre, sauf aux jalons.

### Vérifications automatiques

- **Build et types** : `npm run build` sans erreur, TypeScript strict.
- **Tests unitaires (Vitest)** : déplacements, saut, collisions, chaque coup (préparation, coup actif, récupération), garde, jauge de garde, arrondi des coups bloqués, grosse gifle (zone dorée, surchauffe), mise à terre, chrono, fin de round et de match, barre Buzz (gains, esquive réussie), cercle du Buzz (annulation au relâchement et sur coup reçu), cinématique (touche toujours, rapprochement des spéciaux de près, garde au bon moment), sonné.
- **Test de déterminisme** : rejouer deux fois la même séquence d'entrées sur 10 000 pas, avec des coups spéciaux, et vérifier que l'empreinte de l'état final est identique.
- **Simulation de matchs** : mode `?autoplay=1` où deux IA s'affrontent. Lancer 200 matchs sans affichage : un match se termine toujours, la durée moyenne d'un round est comprise entre 20 et 50 secondes, un ou deux spéciaux par round en moyenne, aucun perso au-dessus de 60 % de victoires à niveau d'IA égal.
- **Tests Playwright sur mobile émulé** : téléphone en paysage (844 × 390, tactile). Simuler stick et boutons, vérifier que le perso se déplace, que les PV baissent, que les poses changent et qu'il n'y a **aucune erreur dans la console**.
- **Contrôle visuel** : captures d'écran Playwright aux moments clés (sélection, marche, saut, garde, impact, mise à terre, bouton Buzz et cercle, chaque cinématique, fin de round).
- **Performance** : chargement initial de moins de 4 Mo ; une image calculée en moins de 8 ms sur mobile émulé avec ralentissement du processeur ×4.

### Quand s'arrêter pour demander

Uniquement aux 3 jalons, ou en cas de choix qui ne peut pas être annulé facilement. Les réglages d'équilibrage se décident seuls et sont notés dans le changelog.

## 9. Roadmap

9 phases. Le solo complet est prêt à la fin de la phase 6, le jeu en ligne à la fin de la phase 7. Une phase n'est validée que lorsque ses critères passent.

### Phase 0 · Mise en place ✔

**Faite le 11 octobre 2026.** Dépôt créé, code copié audité, logique au tour par tour retirée, fichiers de configuration en place, jeu renommé.

### Phase 1 · Temps réel et déplacements ✔

**Faite le 11 octobre 2026.** Boucle à pas fixe, fonction `step` pure et déterministe, contrôles clavier et tactiles, marche, saut, accroupi, collisions, caméra.

### Phase 2 · Coups et collisions ✔

**Faite le 11 octobre 2026. Jalon 1 validé** : contrôles, plaisir de la gifle et rythme jugés bons. Remarque : accroupi, le personnage « rétrécissait » (pose provisoire), réglé par les vraies poses.

### Phase 3 · IA ✔

**Faite le 11 octobre 2026.** Trois niveaux, mode `?autoplay=1`, simulation de 200 matchs.

### Phase 4 · Choix du personnage et du niveau ✔

**Faite le 11 octobre 2026.** Parcours Title → CharacterSelect → StageSelect → Fight → Result. En attente du jalon 2.

### Phase 4 bis · Coups de pied et garde haute ou basse ✔

**Faite le 11 octobre 2026**, à la demande du propriétaire.

### Phase 5 · Style unique, barre Buzz et coups spéciaux

- Fusion des gabarits en un seul style de combat ; arrondi des coups bloqués (minimum 1 PV).
- Barre Buzz sous la barre de vie, gains sur les coups qui touchent et les esquives réussies.
- Bouton « Buzz » et cercle de déclenchement, annulable.
- Six cinématiques de coups spéciaux, qui touchent toujours : rapprochement automatique pour les spéciaux de près, projectiles et ondes pour ceux à distance, garde au bon moment.
- Sonné. Rage retirée.
- Ralenti et tremblement sur les gros coups, arrêt sur image à l'impact, traces de main, foule qui réagit.
- Sons : gifles, garde, foule, annonces de round, un son par coup spécial.
- IA : remplit sa barre, lance son spécial, tente la garde au bon moment selon son niveau.
- *Validé quand* : tests unitaires du Buzz, des cinématiques et du sonné ; équilibre toujours sous 60 % en simulation, un ou deux spéciaux par round.

### Phase 6 · Finition du solo

- Tutoriel court au premier lancement (se déplacer, gifler, charger, garder, lancer le Buzz).
- Sauvegarde locale : difficulté choisie, victoires, dernier perso utilisé.
- Intégration des poses des spéciaux et des vrais décors déjà fournis, réglage des boîtes de collision.
- Passe de performance et de taille de chargement.
- *Validé quand* : toutes les vérifications passent sur la version en ligne.

### Phase 7 · Deux joueurs en ligne

- Connexion directe entre deux téléphones avec **PeerJS** et un code de salon.
- Synchronisation par **échange des entrées** avec un petit retard d'entrée fixe (3 à 4 pas) : les deux téléphones font tourner la même simulation déterministe.
- Détection de désynchronisation par comparaison régulière des empreintes d'état ; en cas d'écart, resynchronisation sur l'état de l'hôte.
- Parcours en ligne : créer ou rejoindre un salon, chacun choisit son perso, l'hôte choisit le niveau, revanche.
- Gestion des coupures : pause, tentative de reconnexion, puis abandon propre.
- Si le retard d'entrée fixe ne suffit pas, passer à une synchronisation avec retour en arrière (rollback).
- Tests Playwright avec deux navigateurs connectés, et avec une latence simulée de 100 ms.
- *Validé quand* : deux navigateurs jouent un match complet sans désynchronisation, y compris avec 100 ms de latence.
- **Jalon 3 : le propriétaire joue en ligne avec un ami.**

> **Risque connu** : une connexion directe entre deux téléphones échoue sur certains réseaux mobiles sans serveur relais (TURN). Si le cas se présente au jalon 3, il faudra choisir un service relais, gratuit ou payant. C'est un choix à soumettre au propriétaire.

### Phase 8 · Contenu

- Six combattants déjà intégrés le 11 octobre.
- Nouveaux combattants et nouveaux niveaux, au rythme des dessins fournis (grille agrandie et chargement à la demande au-delà de 6).
- *Validé quand* : chaque ajout garde l'équilibre sous 60 % en simulation.

## 10. Ce que le propriétaire du projet doit fournir

| Quand | Quoi |
| --- | --- |
| Avant la phase 6 si possible | Les 3 poses du coup spécial de chaque combattant, et les 2 accessoires (voir `PROMPTS-SPECIAUX.md`) |
| Quand il veut | Les noms des coups spéciaux et les répliques, dans `texts.ts` |
| Si possible | Les planches corrigées de Manu Macs et Narine le Zen |
| Avant le jalon 2 si possible | Un décor en version large (2 écrans) |

## 11. Instruction du projet Claude

```
Ce projet développe « PolitiClash », un jeu de combat de gifles en temps réel avec des
caricatures de personnalités politiques françaises, dans le dépôt GitHub benjam67/politiclash.
Il part d'une copie du dépôt soufflet, qui ne doit jamais être modifié.
Le document ROADMAP.md fait référence : règles, contraintes techniques, méthode, phases.
Claude code le moteur ; l'habillage (dessins, noms, répliques, idées de coups spéciaux)
vient de moi, dans src/config/texts.ts et raw/.
Claude code, teste et déploie en autonomie. Je ne joue qu'aux 3 jalons (fin des phases 2, 4 et 7).
Réponds-moi en français, simplement, sans jargon technique.
```
