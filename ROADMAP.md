# PolitiClash – Roadmap de développement

Version du 11 octobre 2026 (mise à jour après la phase 0).

Ce document contient tout le contexte nécessaire pour qu'une nouvelle discussion code, teste et déploie le jeu en autonomie. Il remplace la roadmap du premier jeu (`soufflet`, gifles au tour par tour), dont il reprend la stack, les assets et la méthode.

> **État** : la phase 0 est faite. Le code copié a été audité et cette roadmap a été recalée sur ce qui existe réellement (voir `CHANGELOG.md`). En cas d'écart, c'est le code qui fait foi et la roadmap s'adapte.

## 1. Contexte et objectif

Objectif : transformer le jeu de gifles au tour par tour en **vrai jeu de combat en temps réel**, avec déplacements, choix du personnage et choix du niveau.

- **Pitch** : des femmes et des hommes politiques français, de tous les partis, règlent leurs comptes à coups de gifles. Ils se déplacent, sautent, s'accroupissent, se protègent et se giflent en temps réel. Ton absurde et exagéré, dans la tradition française de la caricature. Tous les bords sont représentés et tous en prennent pour leur grade.
- **Mise au point du moteur** : tant que le combat n'est pas validé, on garde Bernard, Lola et le bar du premier jeu. L'habillage politique (personnages, décors) arrive ensuite, sans toucher au moteur.
- **Plateforme** : jeu web (PWA) en mode paysage, jouable sur iOS et Android depuis un navigateur. Jouable aussi au clavier sur ordinateur (indispensable pour les tests).
- **Modes** : d'abord **solo contre l'IA**. Dès que le solo fonctionne bien, **deux joueurs en ligne**. Pas de mode deux joueurs sur le même téléphone.
- **Équipe** : un seul développeur, en vibecoding. Claude code, teste et déploie en autonomie ; le propriétaire du projet ne teste qu'aux jalons indiqués.
- **Priorité** : le plaisir de la gifle avant tout. Chaque phase doit rester jouable et déployée.
- **Hors périmètre** : publication sur les stores, monétisation, comptes utilisateurs, mode deux joueurs en local.

### Qui fait quoi : le moteur et l'habillage

Le jeu sépare strictement le **moteur** de l'**habillage**.

| | Claude | Le propriétaire du projet |
| --- | --- | --- |
| Moteur : déplacements, coups, garde, IA, écrans, jeu en ligne | ✔ | |
| **Gabarits** de combattants : des profils de jeu neutres, sans nom ni visage (le lourd qui frappe fort, la rapide fragile, le défenseur…), équilibrés par simulation | ✔ | |
| Mécaniques des coups spéciaux, sans habillage (« un coup qui traverse la garde », « trois gifles enchaînées ») | ✔ | |
| Décors en tant que lieux (hémicycle, plateau télé, marché…) : intégration technique | ✔ | |
| Dessins des personnages et des décors | | ✔ |
| Noms, surnoms, noms des coups spéciaux, répliques du commentateur | | ✔ |
| Choix de quel personnage reçoit quel gabarit | | ✔ |

Claude n'écrit et ne dessine aucune caricature de personne réelle. Tout l'habillage tient dans **un fichier de textes** (`src/config/texts.ts`) et **un dossier d'images** (`raw/`), que le propriétaire remplit lui-même sans toucher au reste du code. Le reste du code ne contient aucun nom de personnage.

## 2. Dépôt et point de départ

- **Dépôt** : `benjam67/politiclash`, public. Il a été créé par import du dépôt du premier jeu, `benjam67/soufflet`.
- **Le dépôt `soufflet` ne doit jamais être modifié.** Il reste en ligne tel quel à son adresse.
- **Adresse du jeu** : https://benjam67.github.io/politiclash/
- **Déploiement** : à chaque push sur `main`, GitHub Actions lance les tests, construit le jeu et le publie sur la branche `gh-pages`, que GitHub Pages sert (Settings → Pages → branche `gh-pages`).

### Ce qui est conservé du premier jeu (constaté à l'audit)

| Élément | Sort |
| --- | --- |
| Phaser 3 + TypeScript + Vite, GitHub Pages, PWA, écran « tourne ton téléphone » | Conservé tel quel |
| Sprites de Bernard et Lola (11 poses chacun, dont garde et esquive), décor du bar, patron, 8 habitués | Conservés, complétés par de nouvelles poses |
| Conventions d'ancrage, d'échelle et de miroir des sprites | Conservées |
| Scènes Boot et Title | Conservées, simplifiées (il n'y avait pas de scène Result : le résultat s'affichait dans la scène de combat) |
| Interface (barres de vie, jauge de charge, chrono, losanges de rounds, bandeaux, onomatopées) et effets (impact, tremblement, particules, foule, commentateur) | Conservés, à rebrancher sur le nouveau combat |
| Sons et musique générés en code | Conservés |
| Progression (XP, niveaux, tenues) | Mise de côté, sans branchement ; à reprendre ou retirer en phase 6 |
| Vitest, Playwright, chaîne d'images (`npm run assets`) | Conservés |
| `balance.ts` | Réécrit avec les valeurs du combat en temps réel |
| `src/logic/` (tours, jauge, swipe) | **Supprimé** en phase 0, réécrit à partir de la phase 1 (restent le placement et le générateur aléatoire) |
| Scène Fight et contrôles tactiles | **Réécrits** (scène statique en phase 0) |
| IA et simulation de matchs | **Supprimées**, réécrites en phase 3 |
| `src/net/` (PeerJS, salon à code, fondé sur un journal de tours) | **Supprimé**, réécrit en phase 7. L'ancien code reste lisible dans l'historique et dans `soufflet` |

### Structure du dépôt

```
politiclash/
  raw/                    images sources (PNG) : c'est ici qu'on dépose les dessins
    fighters/<perso>/     une image par pose
    stages/<niveau>/      décor et figurants
  public/assets/          images optimisées, produites par `npm run assets`
  src/
    config/
      texts.ts            TOUS les textes : titre, noms, coups spéciaux, répliques
      balance.ts          toutes les valeurs de réglage, dont les gabarits
      roster.ts           liste des combattants (gabarit, voix, boîtes de collision)
      stages.ts           liste des niveaux (image, ligne de sol, largeur)
      poses.ts            table « action → image », avec poses provisoires
      assets.json         mesures des images, écrit par `npm run assets`
    logic/                règles pures, sans Phaser, déterministes
    input/                tactile, clavier, IA, réseau : une seule interface
    ai/                   IA (produit des entrées, comme un joueur)
    scenes/               Boot, Title, CharacterSelect, StageSelect, Fight, Result
    ui/                   barres de vie, jauges, chrono, bandeaux, contrôles tactiles
    fx/                   impact, tremblement, particules, foule
    audio/                sons et musique générés en code
    net/                  jeu en ligne (phase 7)
  tests/unit/             Vitest
  tests/e2e/              Playwright
  ROADMAP.md              ce document
  CHANGELOG.md
```

## 3. Règles du jeu

Un match se joue en 2 rounds gagnants (3 au maximum). Chaque round : 100 PV par combattant et 60 secondes au chrono. À la fin du chrono, celui qui a le plus de PV gagne le round.

### Déplacements

- **Marcher** vers l'avant et vers l'arrière.
- **Sauter** (vertical, avant, arrière).
- **S'accroupir** : fait passer les gifles debout au-dessus de la tête.
- Les combattants **se font toujours face** (retournement automatique quand ils se croisent) et ne peuvent pas se traverser au sol.
- Le niveau est plus large que l'écran (environ 2 écrans). La caméra suit le milieu entre les deux combattants ; ils ne peuvent pas s'éloigner de plus d'un écran.

### Coups

| Coup | Commande | Rôle |
| --- | --- | --- |
| Gifle rapide | Appui sur « Gifle » | Rapide, peu de dégâts, sert à interrompre |
| Grosse gifle | Maintenir « Grosse gifle », relâcher pour frapper | Reprend la jauge du premier jeu : charge, zone dorée, surchauffe |
| Gifle accroupie | « Gifle » en étant accroupi | Touche un adversaire accroupi |
| Gifle aérienne | « Gifle » en l'air | Touche un adversaire accroupi, punit les grosses gifles en charge |
| Gifle spéciale | « Grosse gifle » avec la rage pleine | Selon le gabarit : une gifle énorme, ou trois gifles enchaînées |

**Grosse gifle, héritage du premier jeu :**
- La jauge monte de 0 à 100 % tant que le bouton est maintenu. Le combattant ne peut pas se déplacer pendant la charge et reste vulnérable.
- Relâcher dans la **zone dorée** donne un coup critique (×2) qui **brise la garde**.
- **Surchauffe** : rester à 100 % plus de 150 ms, et le combattant se gifle lui-même (8 dégâts).
- Relâcher sous 20 % de charge annule le coup.

### Défense

- **Garde** : maintenir « Garde ». Bloque les gifles, sauf une grosse gifle en zone dorée. Un coup bloqué inflige 10 % de ses dégâts.
- **Jauge de garde** : chaque coup bloqué la vide un peu ; elle se recharge hors garde. Vide, la garde est brisée et le combattant est sonné 1 seconde.
- **Accroupi** : esquive la gifle rapide debout et la grosse gifle.

### Dégâts

```
Gifle rapide, accroupie, aérienne :  D = dégâts du coup × R_d
Grosse gifle :                       D = B × (C / 100) × K × R_d
```

- B = base du perso, C = charge en %, K = 2 en zone dorée sinon 1, R_d = résistance de celui qui reçoit.

### Gabarits de départ (valeurs de départ, à régler)

Un gabarit est un profil de jeu neutre. Chaque combattant en reçoit un (choix du propriétaire, dans `roster.ts`). D'autres gabarits s'ajouteront en phase 8 (le défenseur, le technicien fragile, celui qui se relève toujours…).

Les distances sont en pixels pour un écran logique de 844 × 390 : la logique travaille dans ce repère, l'affichage convertit vers la taille réelle (monde Phaser de 720 de haut, largeur étendue).

| Gabarit | Style | Vitesse de marche | Durée du saut | Base B | Charge 0 → 100 % | Zone dorée | Résistance R_d | Mécanique de la spéciale | Porté pour l'instant par |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lourd` | Lent, frappe fort, encaisse | 160 px/s | 650 ms | 14 | 1,4 s | 80–90 % | 0,85 | Une gifle ×1,8 | Big Bernard |
| `rapide` | Rapide, mobile, fragile | 230 px/s | 550 ms | 11 | 1,0 s | 76–92 % | 1,1 | 3 gifles à ×0,7 | Lola Tornade |

### Durées des coups (valeurs de départ, à régler)

| Coup | Préparation | Coup actif | Récupération | Dégâts | Adversaire figé |
| --- | --- | --- | --- | --- | --- |
| Gifle rapide | 100 ms | 70 ms | 180 ms | 5 | 250 ms |
| Gifle accroupie | 130 ms | 70 ms | 220 ms | 6 | 250 ms |
| Gifle aérienne | 120 ms | jusqu'à l'atterrissage | 150 ms | 7 | 300 ms |
| Grosse gifle (après relâchement) | 60 ms | 90 ms | 350 ms | selon formule | 450 ms, recul important |

Une grosse gifle de 14 dégâts ou plus **met l'adversaire à terre** ; il se relève après 800 ms, invulnérable au sol et pendant le relevé. *(Valeur de départ : 25, hors d'atteinte pour le gabarit `rapide` ; ramenée à 14 en phase 2.)*

### Mécaniques avancées (phase 5)

- **Rage** : +1 point par dégât reçu, 100 maximum. Pleine, elle transforme la prochaine grosse gifle en gifle spéciale, puis retombe à 0.
- **Sonné** : après une garde brisée, ou un coup de 25 dégâts ou plus : pendant 3 secondes, la jauge de grosse gifle de la victime monte de façon irrégulière (vitesse ±30 %).
- **KO** : à 0 PV, pose « dazed » pour le perdant, « victory » pour le gagnant.

Toutes ces valeurs vivent dans `src/config/balance.ts` et `src/config/roster.ts`, pour être réglées sans toucher à la logique. Aucun texte affiché n'y figure : les noms sont dans `src/config/texts.ts`.

## 4. Contrôles

### Tactile (mobile, paysage)

- **Moitié gauche de l'écran** : stick virtuel. Gauche et droite pour marcher, haut pour sauter, bas pour s'accroupir.
- **Moitié droite** : trois boutons, « Gifle », « Grosse gifle » (à maintenir), « Garde » (à maintenir).
- Les contrôles ne doivent jamais masquer les combattants ni les barres de vie.

### Clavier (ordinateur et tests)

- Flèches ou ZQSD : déplacements, saut, accroupi.
- J : gifle, K : grosse gifle, L : garde.

### Une seule interface d'entrée

Le joueur, l'IA et plus tard le joueur distant produisent tous le même objet d'entrée à chaque pas de simulation :

```
{ gauche, droite, haut, bas, gifle, grosseGifle, garde }
```

La logique ne sait pas d'où viennent les entrées. C'est ce qui permet de tester par simulation et de brancher le jeu en ligne sans réécrire le combat.

## 5. Contraintes techniques du combat

Ces règles s'appliquent dès la phase 1. Elles conditionnent le jeu en ligne de la phase 7 : les ignorer obligerait à tout réécrire.

- **Pas fixe** : la logique avance à 60 pas par seconde, indépendamment de la fréquence d'affichage.
- **Fonction pure** : `step(état, entréesJ1, entréesJ2) → nouvel état`. Aucun appel à Phaser, à l'horloge ou à `Math.random` dans `src/logic/`.
- **Déterminisme** : générateur aléatoire à graine stocké dans l'état ; pas de fonctions trigonométriques dans la logique ; valeurs entières dès que possible. Deux exécutions avec les mêmes entrées donnent exactement le même état.
- **État sérialisable** : l'état complet du combat est un objet simple, copiable et comparable (empreinte de contrôle).
- **Collisions par rectangles** : chaque pose a une boîte de corps, une boîte vulnérable et, pour les coups, une boîte de frappe. Elles sont décrites dans `roster.ts`.
- **Affichage séparé** : la scène Fight lit l'état et l'affiche (pose, position, effets). Elle ne décide de rien.

## 6. Direction artistique

Style anime de baston des années 90, comique et exagéré, identique au premier jeu. Les personnages politiques sont dessinés par le propriétaire dans ce même style, en caricature. La référence visuelle de l'interface et des effets reste la [maquette Slap Fighter](https://claude.ai/artifact/993HtiDhMQQGK2257KPoG2).

Les animations fonctionnent par **changement de pose**, sans animation fluide : une pose par action, deux à quatre pour la marche. De petits mouvements codés (rebond, étirement, pas en avant, tremblement) donnent la vie.

## 7. Assets

### Conventions (inchangées)

- Tous les combattants sont dessinés **tournés vers la droite**. Celui de droite est affiché en miroir horizontal.
- **Point d'ancrage** : centre horizontal de l'image, pieds à 10 px au-dessus du bas de l'image.
- **Même facteur d'échelle** pour tous les combattants, afin de garder leur rapport de taille.
- Toutes les poses d'un perso ont **la même taille d'image et la même ligne de pieds**. On change de texture sans recalage.
- Fond transparent. Optimisation : environ 600 px de haut, format WebP.

### Poses existantes (Bernard et Lola, 11 chacun)

Attente (`idle`), armement (`windup`), élan (`swing`), gifle (`slap`), coup reçu (`hit`), sonné (`dazed`), victoire (`victory`), autogifle (`selfslap`), esquive (`dodge`), esquive parfaite (`dodge_perfect`), garde (`guard`).

La **garde est donc déjà dessinée** ; il n'y a qu'une seule pose de coup reçu (pas de version « lourde »).

### Poses à fournir par le propriétaire du projet

Un nouveau combattant demande les 11 poses existantes, plus celles du tableau. Pour Bernard et Lola, seules celles du tableau manquent. Dans l'ordre de priorité :

| Priorité | Pose | Nombre d'images |
| --- | --- | --- |
| 1 | Accroupi | 1 |
| 1 | Saut | 1 (montée et descente partagées) |
| 1 | Marche | 2 au minimum, 4 dans l'idéal |
| 2 | Gifle rapide | 1 |
| 2 | Gifle accroupie | 1 |
| 2 | Gifle aérienne | 1 |
| 2 | À terre | 1 |
| 3 | Coup reçu lourd | 1 |
| 3 | Relevé | 1 |
| 3 | Gifle spéciale | 1 à 2 |

Soit 11 à 15 images en plus des 11 de base.

### Poses provisoires : le code n'attend pas les dessins

Le fichier `src/config/poses.ts` associe chaque action à une image. Tant qu'une pose n'est pas fournie, une pose existante la remplace :

| Action | Pose provisoire |
| --- | --- |
| Marche | Attente, avec un léger rebond |
| Saut | Attente, déplacée vers le haut |
| Accroupi | Attente, écrasée verticalement |
| Gifle rapide, accroupie, aérienne, spéciale | Gifle |
| Coup reçu lourd | Coup reçu, incliné |
| À terre, relevé | Sonné, incliné |

Quand une vraie pose arrive : déposer le PNG dans `raw/fighters/<perso>/`, l'ajouter à la liste des poses, lancer `npm run assets` et modifier une ligne dans `poses.ts`.

### Niveaux

- Un niveau est une image de décor d'environ **2 écrans de large**, avec la ligne de sol à la même hauteur pour tous les niveaux.
- **Niveau 1 : le bar**, en version élargie. En attendant, le décor actuel est étiré ou répété sur les bords.
- Niveaux suivants à fournir, sur le thème politique : l'hémicycle, le plateau télé d'un débat, le marché en campagne électorale, le Salon de l'agriculture.
- Le patron et les habitués restent en fond de scène dans le bar, comme dans le premier jeu (environ 45 % de la taille des combattants, légèrement assombris). Chaque nouveau décor peut avoir ses propres figurants (députés, public du plateau, badauds du marché).

### Futurs combattants : l'habillage politique

Les combattants définitifs sont des caricatures de personnalités politiques françaises, sous de faux noms, tous partis confondus. Ils sont entièrement fournis par le propriétaire :

1. **Les dessins** : un dossier `raw/fighters/<identifiant>/` avec le jeu de poses. L'identifiant est un mot neutre en minuscules.
2. **Les textes** : une entrée dans `src/config/texts.ts` (nom, nom court, nom du coup spécial, répliques).
3. **Le gabarit** : une ligne dans `src/config/roster.ts` qui dit quel profil de jeu il reçoit.

Claude fournit les gabarits, vérifie l'équilibre par simulation et règle les boîtes de collision sur les dessins. L'écran de sélection est prévu pour 6 combattants, avec des cases « Bientôt » pour ceux qui manquent.

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
- **Tests unitaires (Vitest)** : déplacements, saut, collisions, chaque coup (préparation, coup actif, récupération), garde, jauge de garde, grosse gifle (zone dorée, surchauffe), mise à terre, chrono, fin de round et de match, rage, sonné.
- **Test de déterminisme** : rejouer deux fois la même séquence d'entrées sur 10 000 pas et vérifier que l'empreinte de l'état final est identique.
- **Simulation de matchs** : mode `?autoplay=1` où deux IA s'affrontent. Lancer 200 matchs sans affichage : un match se termine toujours, la durée moyenne d'un round est comprise entre 20 et 50 secondes, aucun perso au-dessus de 60 % de victoires à niveau d'IA égal.
- **Tests Playwright sur mobile émulé** : téléphone en paysage (844 × 390, tactile). Simuler stick et boutons, vérifier que le perso se déplace, que les PV baissent, que les poses changent et qu'il n'y a **aucune erreur dans la console**.
- **Contrôle visuel** : captures d'écran Playwright aux moments clés (sélection du perso, sélection du niveau, marche, saut, garde, impact, mise à terre, fin de round). Les regarder pour repérer persos coupés, contrôles qui masquent l'action, textes illisibles.
- **Performance** : chargement initial de moins de 4 Mo ; une image calculée en moins de 8 ms sur mobile émulé avec ralentissement du processeur ×4 (soit de la marge pour 60 images par seconde).

### Quand s'arrêter pour demander

Uniquement aux 3 jalons, ou en cas de choix qui ne peut pas être annulé facilement. Les réglages d'équilibrage se décident seuls et sont notés dans le changelog.

## 9. Roadmap

9 phases. Le solo complet est prêt à la fin de la phase 6, le jeu en ligne à la fin de la phase 7. Une phase n'est validée que lorsque ses critères passent.

### Phase 0 · Mise en place ✔

**Faite le 11 octobre 2026** (détail dans `CHANGELOG.md`).

- Dépôt `politiclash` créé par import de `soufflet`. Rien de modifié dans `soufflet`.
- **Code copié audité** : ce qui existe réellement, ce qui est gardé et ce qui est retiré est noté dans `CHANGELOG.md`.
- Logique au tour par tour, contrôles au swipe, ancienne IA et ancien code réseau retirés.
- `texts.ts`, `roster.ts`, `stages.ts` et `poses.ts` en place avec Bernard, Lola et le bar ; gabarits dans `balance.ts`.
- Jeu renommé (titre, manifest PWA), adresse du site corrigée.
- *Validé quand* : le site en ligne affiche la scène de combat statique (décor, Bernard, Lola) sans erreur, et les tests conservés passent.

### Phase 1 · Temps réel et déplacements ✔

**Faite le 11 octobre 2026** (détail dans `CHANGELOG.md`).

- Boucle de logique à pas fixe, fonction `step` pure et déterministe, état sérialisable.
- Interface d'entrée unique ; contrôles clavier et tactiles (stick et boutons).
- Marche, saut, accroupi, retournement automatique, collision entre combattants, limites du niveau, caméra.
- Poses provisoires pour toutes les actions.
- *Validé quand* : les deux combattants se déplacent au clavier et au tactile, le test de déterminisme passe, 60 images par seconde sur mobile émulé. *(Le bac à sable de test n'ayant pas de carte graphique, on y mesure le temps de calcul d'une image, processeur ralenti 4 fois ; les 60 images par seconde réelles se vérifient sur téléphone au jalon 1.)*

### Phase 2 · Coups et collisions ✔

**Faite le 11 octobre 2026** (détail dans `CHANGELOG.md`). En attente du jalon 1.

- Boîtes de frappe et boîtes vulnérables par pose.
- Gifle rapide, gifle accroupie, gifle aérienne, grosse gifle avec jauge (zone dorée, surchauffe).
- Garde, jauge de garde, garde brisée, coup reçu, recul, mise à terre et relevé.
- PV, KO, chrono, rounds, fin de match, écran Result.
- Adversaire provisoire : un mannequin qui avance, garde et gifle au hasard.
- Effets d'impact et onomatopées rebranchés.
- *Validé quand* : un match complet se joue contre le mannequin, tous les tests unitaires des coups passent.
- **Jalon 1 : le propriétaire joue.** Questions à lui poser : les contrôles sont-ils agréables au pouce ? La gifle fait-elle plaisir ? Le rythme est-il bon ?

### Phase 3 · IA

- IA qui produit des entrées comme un joueur, avec un temps de réaction (elle ne lit pas les entrées du joueur à l'instant même).
- Trois niveaux : Facile (lente, garde peu), Normal, Difficile (punit les grosses gifles ratées, vise la zone dorée).
- Mode `?autoplay=1` et simulation de 200 matchs.
- *Validé quand* : la simulation respecte les critères de durée et d'équilibre, et l'IA Facile perd contre une suite d'entrées simple scriptée.

### Phase 4 · Choix du personnage et du niveau

- Scène **CharacterSelect** : grille de 6 cases, les combattants disponibles jouables, cases « Bientôt » pour les autres. Le joueur choisit son perso, puis son adversaire (ou « Au hasard »), puis la difficulté.
- Scène **StageSelect** : vignettes des niveaux disponibles, option « Au hasard ».
- Enchaînement Title → CharacterSelect → StageSelect → Fight → Result → revanche ou retour au choix.
- Combat miroir autorisé (même perso des deux côtés), avec une teinte différente pour le second.
- *Validé quand* : tout le parcours se fait au tactile sans erreur, captures d'écran correctes.
- **Jalon 2 : le propriétaire joue.** Le solo est jouable de bout en bout.

### Phase 5 · Mécaniques avancées et sensations

- Rage et gifles spéciales (une mécanique par gabarit), sonné.
- Ralenti et tremblement sur les gros coups, arrêt sur image à l'impact, traces de main, foule qui réagit.
- Sons : gifles, garde, foule, annonces de round.
- *Validé quand* : tests unitaires de la rage et du sonné, équilibre toujours sous 60 % en simulation.

### Phase 6 · Finition du solo

- Tutoriel court au premier lancement (se déplacer, gifler, charger, garder).
- Sauvegarde locale : difficulté choisie, victoires, dernier perso utilisé.
- Intégration des vraies poses et des vrais décors déjà fournis, réglage des boîtes de collision sur ces poses.
- Passe de performance et de taille de chargement.
- *Validé quand* : toutes les vérifications passent sur la version en ligne.

### Phase 7 · Deux joueurs en ligne

- Connexion directe entre deux téléphones avec **PeerJS** et un code de salon (le premier jeu le faisait déjà : son salon et son écran de code peuvent servir de modèle).
- Synchronisation par **échange des entrées** avec un petit retard d'entrée fixe (3 à 4 pas) : les deux téléphones font tourner la même simulation déterministe.
- Détection de désynchronisation par comparaison régulière des empreintes d'état ; en cas d'écart, resynchronisation sur l'état de l'hôte.
- Parcours en ligne : créer ou rejoindre un salon, chacun choisit son perso, l'hôte choisit le niveau, revanche.
- Gestion des coupures : pause, tentative de reconnexion, puis abandon propre.
- Si le retard d'entrée fixe ne suffit pas à rendre le jeu fluide, passer à une synchronisation avec retour en arrière (rollback), rendue possible par l'état sérialisable.
- Tests Playwright avec deux navigateurs connectés, et avec une latence simulée de 100 ms.
- *Validé quand* : deux navigateurs jouent un match complet sans désynchronisation, y compris avec 100 ms de latence.
- **Jalon 3 : le propriétaire joue en ligne avec un ami.**

> **Risque connu** : une connexion directe entre deux téléphones échoue sur certains réseaux mobiles sans serveur relais (TURN). Si le cas se présente au jalon 3, il faudra choisir un service relais, gratuit ou payant. C'est un choix à soumettre au propriétaire.

### Phase 8 · Contenu : l'habillage politique

- Nouveaux gabarits neutres, pour que chaque combattant ait un style propre.
- Nouveaux combattants, au rythme des dessins et des textes fournis par le propriétaire : ajout dans `roster.ts`, réglage des boîtes de collision, passage en simulation.
- Nouveaux niveaux, au rythme des décors fournis : ajout dans `stages.ts`.
- Bernard, Lola et le bar peuvent alors être retirés ou gardés en bonus, au choix du propriétaire.
- *Validé quand* : chaque ajout garde l'équilibre sous 60 % en simulation.

## 10. Ce que le propriétaire du projet doit fournir

| Quand | Quoi |
| --- | --- |
| Après le premier envoi | Activer GitHub Pages sur le dépôt (Settings → Pages → branche `gh-pages`) |
| Dès que possible, sans bloquer le code | Les nouvelles poses de Bernard et Lola, priorité 1 puis 2 puis 3 |
| Avant le jalon 2 si possible | Un décor en version large (2 écrans) |
| Quand le moteur est validé | Les dessins des personnages politiques et des décors, leurs textes dans `texts.ts`, et le gabarit choisi pour chacun |

## 11. Instruction du projet Claude

```
Ce projet développe « PolitiClash », un jeu de combat de gifles en temps réel avec des
caricatures de personnalités politiques françaises, dans le dépôt GitHub benjam67/politiclash.
Il part d'une copie du dépôt soufflet, qui ne doit jamais être modifié.
Le document ROADMAP.md fait référence : règles, contraintes techniques, méthode, phases.
Claude code le moteur et des gabarits neutres ; l'habillage (dessins, noms, répliques) est
fait par moi dans src/config/texts.ts et raw/.
Claude code, teste et déploie en autonomie. Je ne joue qu'aux 3 jalons (fin des phases 2, 4 et 7).
Réponds-moi en français, simplement, sans jargon technique.
```
