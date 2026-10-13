# PolitiClash – Guide des dessins

Tout ce qu'il faut pour dessiner (ou générer) un personnage ou un décor qui s'emboîte dans le jeu sans retouche.

Version du 13 octobre 2026 (poses des coups spéciaux propres à chaque personnage).

## 1. Les coups du jeu, en bref

| Coup | Hauteur | Se bloque avec |
| --- | --- | --- |
| Gifle rapide | Haute | Garde haute |
| Grosse gifle (à charger) | Haute | Garde haute, sauf en zone dorée |
| Gifle aérienne | Haute | Garde haute |
| Coup de pied | Bas | Garde basse |
| Balayette (coup de pied accroupi) | Bas | Garde basse |
| Coup spécial (Buzz) | – | Ne se bloque pas ; une garde au bon moment réduit les dégâts |

Les gifles visent le visage, les coups de pied visent les jambes. C'est ce que les poses doivent montrer.

## 2. Un personnage : 21 poses communes et 3 poses de coup spécial

### Les 21 poses communes

| # | Fichier | Pose | Ce qu'on doit voir |
| --- | --- | --- | --- |
| 1 | `idle.png` | Attente | Debout, pieds à largeur d'épaules, mains basses. C'est la pose de référence pour la taille |
| 2 | `walk1.png` | Marche, temps 1 | La jambe la plus proche du spectateur devant |
| 3 | `walk2.png` | Marche, temps 2 | La jambe la plus proche du spectateur derrière |
| 4 | `jump.png` | Saut | En l'air, jambes repliées |
| 5 | `crouch.png` | Accroupi | Ramassé, tête à mi-hauteur de la pose debout, pieds au sol |
| 6 | `guard.png` | Garde haute | Debout, bras croisés devant le visage |
| 7 | `guard_low.png` | Garde basse | Fléchi, bras ou tibia qui protège les jambes. La tête reste visible et exposée |
| 8 | `quick.png` | Gifle rapide | Petite gifle sèche, bras à moitié tendu, à hauteur de visage |
| 9 | `air_slap.png` | Gifle aérienne | En l'air comme le n° 4, main qui frappe vers l'avant et le bas |
| 10 | `kick.png` | Coup de pied | Debout sur une jambe, l'autre tendue vers l'avant, pied pas plus haut que le genou |
| 11 | `crouch_kick.png` | Balayette | Accroupi comme le n° 5, une jambe tendue au ras du sol |
| 12 | `windup.png` | Armement de la grosse gifle | Bras en arrière, il charge |
| 13 | `swing.png` | Élan | Le bras part |
| 14 | `slap.png` | Grosse gifle | Bras tendu au maximum, à hauteur de visage |
| 15 | `selfslap.png` | Autogifle | Il se gifle lui-même |
| 16 | `hit.png` | Coup reçu | Tête tournée par la gifle |
| 17 | `hit_heavy.png` | Coup reçu lourd | Tête en arrière, corps qui décolle |
| 18 | `down.png` | À terre | Allongé sur le dos, tête vers l'arrière |
| 19 | `getup.png` | Relevé | Un genou ou une main au sol, il se redresse |
| 20 | `dazed.png` | Sonné | Debout, il titube |
| 21 | `victory.png` | Victoire | Il fête |
| option | `walk3.png`, `walk4.png` | Marche, temps 3 et 4 | Pour une marche plus fluide |

### Les 3 poses du coup spécial

Chaque personnage a son propre coup spécial, joué comme une courte cinématique en trois images : `special1.png`, `special2.png`, `special3.png`. Elles remplacent les anciennes poses `special` et `special2`, identiques pour tous. Les prompts de chaque personnage sont dans **`PROMPTS-SPECIAUX.md`**.

| Perso | `special1` | `special2` | `special3` |
| --- | --- | --- | --- |
| Narine le Zen | Danse, temps 1 | Danse, temps 2 | Coup de hanche |
| Baby | Pinte en main | Boit cul sec | Casse la pinte |
| Manu Macs | Poudre dans la main | Souffle la poudre | Face au joueur, bras levés |
| JLM | Inspire | Hurle | Hurle, bras écartés |
| Bompardiou | Élan, faucille et marteau en main | Lancer | Fier, bras croisés |
| Jordan | Se retourne | Penché, dos à l'adversaire | Se redresse |

### Les accessoires (images séparées)

| Fichier | Pour | Ce qu'on doit voir |
| --- | --- | --- |
| `raw/props/caca.png` | Jordan | Le projectile, seul, style dessin animé |
| `raw/props/faucille-marteau.png` | Bompardiou | La faucille et le marteau croisés, seuls |

Le jeu dessine lui-même le reste : paillettes, explosion, onde de choc, mousse, éclats de verre.

### Où en sont les six combattants

- **Poses communes** : les six ont leurs 21 poses (planches du 11 octobre).
- **Manu Macs et Narine le Zen** : anciennes planches, à refaire si possible (jambes trop écartées, marche peu animée, coup de pied trop haut).
- **Poses du spécial** : à générer pour les six, avec les deux accessoires.

## 3. Règles pour les images d'un personnage

- **Tourné vers la droite**, toujours. Le jeu fait le miroir tout seul. Deux exceptions, dans les poses du spécial : Jordan dos à l'adversaire (`special2`), Manu Macs face au joueur (`special3`).
- **Même taille d'image pour toutes les poses d'un personnage.** Tu choisis la taille, mais tu ne la changes plus.
- **Pieds à 10 px du bas de l'image**, au même endroit sur toutes les poses au sol.
- **Corps centré** dans l'image, comme sur `idle`. Un bras ou une jambe tendus peuvent dépasser vers la droite, pas le corps.
- **Même échelle** d'une pose à l'autre, et d'un personnage à l'autre : la tête garde la même taille partout.
- **Poses en l'air** (`jump`, `air_slap`) : dessinées à la même hauteur que les autres, pieds vers le bas de l'image. C'est le jeu qui soulève le personnage.
- **Fond transparent**, en PNG. À défaut, un fond uni d'une couleur absente du personnage (vert ou magenta vif).
- **Pas d'effets dans les dessins** : ni traits de vitesse, ni explosion, ni onde. Le jeu les ajoute.

## 4. Tailles

| | Hauteur du personnage debout | Taille d'une case (largeur × hauteur) |
| --- | --- | --- |
| Minimum | 550 px | 900 × 600 px |
| Idéal | 750 px | 1300 × 820 px |

La case est plus large que haute : le bras tendu, la jambe tendue et surtout le personnage allongé prennent de la place sur les côtés.

## 5. Planches de plusieurs poses

Les planches sont acceptées : elles sont découpées à la réception.

| Planche | Grille | Usage |
| --- | --- | --- |
| Format 2:1 | 4 colonnes × 3 lignes | Poses communes, 2 planches par personnage |
| Format 3:2 | 2 colonnes × 2 lignes | Coup spécial : 3 poses et une pose d'attente de repère pour l'échelle |
| Format 2:1 | 2 colonnes × 1 ligne | Les deux accessoires |

### Conditions pour qu'une planche soit utilisable

- **Grille régulière** : toutes les cases de la même taille, sans décalage.
- **Chaque pose entièrement dans sa case**, avec un peu de marge. Rien qui déborde chez la voisine.
- **Même échelle sur toutes les poses.** C'est le vrai risque : les générateurs dessinent souvent le personnage plus petit quand il a un membre tendu ou qu'il est allongé. Demander explicitement la même taille de tête partout.
- **Pieds sur une même ligne dans chaque rangée**, pour les poses au sol.
- **Fond uni vert vif (#00FF00)**. Un fond dégradé ou texturé laisse des franges.
- **Ordre des poses** : celui indiqué dans le prompt.
- **Une pose d'attente de repère** dans chaque planche qui n'est pas la première : elle sert à recaler l'échelle.

### Ce qui se rattrape, et ce qui ne se rattrape pas

| Se rattrape | Ne se rattrape pas |
| --- | --- |
| Pieds mal alignés, corps décentré | Proportions qui changent d'une pose à l'autre |
| Tailles d'image différentes | Tenue ou visage qui changent |
| Petite différence d'échelle (recalage sur la pose de repère) | Membre coupé par le bord de la case |

## 6. Un nouveau décor

Le niveau fait 2 écrans de large.

| | Décor large (recommandé) | Décor simple |
| --- | --- | --- |
| Taille | 4000 × 1000 px environ (4 fois plus large que haut) | 1600 × 1000 px environ |
| Ce que fait le jeu | Il fait défiler l'image avec les combattants | Il répète l'image en miroir sur les côtés, comme le bar aujourd'hui |
| Résultat | Un vrai lieu, différent à gauche et à droite | Correct, mais on voit la répétition |

Le jeu affiche aujourd'hui le décor simple. Le décor large demande une petite adaptation, faite à la réception du premier.

### Règles pour un décor

- **Vue de face**, à hauteur d'homme, comme le bar.
- **Le sol occupe la moitié basse de l'image.** La ligne où le sol rejoint le fond (pied du mur, du comptoir, des gradins) est à environ 55 % de la hauteur en partant du haut, horizontale, à la même hauteur sur toute la largeur.
- **Sol dégagé** : ni meuble ni personnage au premier plan, c'est là que les combattants se déplacent.
- **Rien d'important tout en haut** (les 10 % du haut sont sous les barres de vie et la barre Buzz) ni dans les coins du bas (stick et boutons).
- **Pas de texte lisible sur un décor simple** : en miroir, il apparaît à l'envers. Sur un décor large, pas de problème.
- **Bords qui se raccordent sur un décor simple** : pas d'objet coupé net au bord gauche ou droit.
- **Format** : PNG ou JPG, sans transparence.

### Les figurants (en option)

- **Peints dans le décor** : plus simple, mais ils restent immobiles.
- **En images séparées** : 8 figurants et 1 personnage central (un président de séance, un présentateur…). De face ou de trois quarts, en pied, fond transparent, environ 450 px de haut, pieds en bas de l'image.

## 7. Ce qu'il n'y a pas à dessiner

- Les portraits de l'écran de sélection : découpés dans `idle.png`.
- Les vignettes des lieux : découpées dans le décor.
- Les effets (impacts, onomatopées, chiffres, paillettes, explosions, ondes, éclats) : tracés par le jeu.

## 8. Où déposer les fichiers

| Quoi | Où |
| --- | --- |
| Planches générées | `generated/<nom du personnage>/` sur ton Mac, puis préviens-moi |
| Poses d'un personnage, une fois découpées | `raw/fighters/<identifiant>/` |
| Accessoires des spéciaux | `raw/props/` |
| Décor et figurants | `raw/stages/<identifiant>/` |
| Nom, nom court, nom du coup spécial, répliques | `src/config/texts.ts` |
