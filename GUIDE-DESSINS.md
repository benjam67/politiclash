# PolitiClash – Guide des dessins

Tout ce qu'il faut pour dessiner (ou générer) un personnage ou un décor qui s'emboîte dans le jeu sans retouche.

Version du 11 octobre 2026.

## 1. Les coups du jeu, en bref

| Coup | Hauteur | Se bloque avec |
| --- | --- | --- |
| Gifle rapide | Haute | Garde haute |
| Grosse gifle (à charger) | Haute | Garde haute, sauf en zone dorée |
| Gifle aérienne | Haute | Garde haute |
| Coup de pied | Bas | Garde basse |
| Balayette (coup de pied accroupi) | Bas | Garde basse |
| Gifle spéciale | Haute | À venir (phase 5) |

Les gifles visent le visage, les coups de pied visent les jambes. C'est ce que les poses doivent montrer.

## 2. Un nouveau personnage : 22 images obligatoires, 3 en option

| # | Fichier | Pose | Ce qu'on doit voir |
| --- | --- | --- | --- |
| 1 | `idle.png` | Attente | Debout, en garde basse. C'est la pose de référence pour la taille |
| 2 | `walk1.png` | Marche, temps 1 | Un pied devant |
| 3 | `walk2.png` | Marche, temps 2 | L'autre pied devant |
| 4 | `jump.png` | Saut | En l'air, jambes repliées |
| 5 | `crouch.png` | Accroupi | Ramassé, tête à mi-hauteur de la pose debout, pieds au sol |
| 6 | `guard.png` | Garde haute | Debout, bras croisés devant le visage |
| 7 | `guard_low.png` | Garde basse | Fléchi, bras ou tibia qui protège les jambes. La tête reste visible et exposée |
| 8 | `quick.png` | Gifle rapide | Petite gifle sèche, bras à moitié tendu, à hauteur de visage |
| 9 | `air_slap.png` | Gifle aérienne | En l'air comme le n° 4, main qui frappe vers l'avant et le bas |
| 10 | `kick.png` | Coup de pied | Debout sur une jambe, l'autre tendue vers l'avant, à hauteur de tibia ou de genou |
| 11 | `crouch_kick.png` | Balayette | Accroupi comme le n° 5, une jambe tendue au ras du sol |
| 12 | `windup.png` | Armement de la grosse gifle | Bras en arrière, il charge |
| 13 | `swing.png` | Élan | Le bras part |
| 14 | `slap.png` | Grosse gifle | Bras tendu au maximum, à hauteur de visage |
| 15 | `special.png` | Gifle spéciale | Sa pose la plus spectaculaire |
| 16 | `selfslap.png` | Autogifle | Il se gifle lui-même |
| 17 | `hit.png` | Coup reçu | Tête tournée par la gifle |
| 18 | `hit_heavy.png` | Coup reçu lourd | Tête en arrière, corps qui décolle |
| 19 | `down.png` | À terre | Allongé sur le dos, tête vers l'arrière |
| 20 | `getup.png` | Relevé | Un genou ou une main au sol, il se redresse |
| 21 | `dazed.png` | Sonné | Debout, il titube |
| 22 | `victory.png` | Victoire | Il fête |
| option | `walk3.png`, `walk4.png` | Marche, temps 3 et 4 | Pour une marche plus fluide |
| option | `special2.png` | Gifle spéciale, 2ᵉ temps | Élan ou fin du geste |

### Ce qui manque à Bernard et Lola : 13 images chacun

Ils ont déjà : `idle`, `guard`, `windup`, `swing`, `slap`, `selfslap`, `hit`, `dazed`, `victory`.

À dessiner, par ordre de priorité :

| Priorité | Fichiers |
| --- | --- |
| 1 (on les voit tout le temps) | `crouch`, `jump`, `walk1`, `walk2`, `kick`, `crouch_kick`, `guard_low` |
| 2 | `quick`, `air_slap`, `down` |
| 3 | `hit_heavy`, `getup`, `special` |

En attendant, le jeu utilise des images de remplacement : l'image d'attente écrasée pour l'accroupi, l'ancienne pose d'esquive pour le coup de pied, la garde écrasée pour la garde basse.

## 3. Règles pour les images d'un personnage

- **Tourné vers la droite**, toujours. Le jeu fait le miroir tout seul.
- **Même taille d'image pour toutes les poses d'un personnage.** Tu choisis la taille, mais tu ne la changes plus.
- **Pieds à 10 px du bas de l'image**, au même endroit sur toutes les poses au sol.
- **Corps centré** dans l'image, comme sur `idle`. Un bras ou une jambe tendus peuvent dépasser vers la droite, pas le corps.
- **Même échelle** d'une pose à l'autre, et d'un personnage à l'autre : la tête garde la même taille partout.
- **Poses en l'air** (`jump`, `air_slap`) : dessinées à la même hauteur que les autres, pieds vers le bas de l'image. C'est le jeu qui soulève le personnage.
- **Fond transparent**, en PNG. À défaut, un fond uni d'une couleur absente du personnage (vert ou magenta vif).

## 4. Tailles

| | Hauteur du personnage debout | Taille d'une case (largeur × hauteur) |
| --- | --- | --- |
| Minimum | 550 px | 900 × 600 px |
| Idéal | 750 px | 1300 × 820 px |

La case est plus large que haute : le bras tendu, la jambe tendue et surtout le personnage allongé prennent de la place sur les côtés.

Pour mémoire, les images actuelles font 1300 × 823 px pour Bernard et 908 × 772 px pour Lola.

## 5. Planches de plusieurs poses

Les planches sont acceptées : elles sont découpées à la réception.

| Planche | Grille | Taille d'une case | Poses par planche |
| --- | --- | --- | --- |
| 2048 × 2048 px | 2 colonnes × 3 lignes | 1024 × 682 px | 6 |
| 4096 × 2048 px | 4 colonnes × 3 lignes | 1024 × 682 px | 12 |
| 4096 × 4096 px | 4 colonnes × 6 lignes | 1024 × 682 px | 24 (le personnage complet : 22 poses et 2 cases libres) |

### Conditions pour qu'une planche soit utilisable

- **Grille régulière** : toutes les cases de la même taille, sans décalage.
- **Chaque pose entièrement dans sa case**, avec un peu de marge. Rien qui déborde chez la voisine.
- **Même échelle sur toutes les poses.** C'est le vrai risque : les générateurs dessinent souvent le personnage plus petit quand il a un membre tendu ou qu'il est allongé. Demander explicitement la même taille de tête partout.
- **Pieds sur une même ligne dans chaque rangée**, pour les poses au sol.
- **Fond transparent ou uni** (voir section 3). Un fond dégradé ou texturé laisse des franges.
- **Tourné vers la droite** sur toutes les poses.
- **Ordre des poses** : celui du tableau de la section 2 (n° 1 à 22, de gauche à droite puis de haut en bas), ou un autre ordre à préciser à l'envoi.

### Ce qui se rattrape, et ce qui ne se rattrape pas

| Se rattrape | Ne se rattrape pas |
| --- | --- |
| Pieds mal alignés, corps décentré | Proportions qui changent d'une pose à l'autre |
| Tailles d'image différentes | Tenue ou visage qui changent |
| Petite différence d'échelle (recalage sur la taille de la tête, approximatif) | Membre coupé par le bord de la case |

**Conseil** : commencer par une planche de 6 poses pour un seul personnage (`idle`, `walk1`, `walk2`, `crouch`, `jump`, `guard`) et l'envoyer pour vérification, avant de générer le reste.

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
- **Rien d'important tout en haut** (les 10 % du haut sont sous les barres de vie) ni dans les coins du bas (stick et boutons).
- **Pas de texte lisible sur un décor simple** : en miroir, il apparaît à l'envers. Sur un décor large, pas de problème.
- **Bords qui se raccordent sur un décor simple** : pas d'objet coupé net au bord gauche ou droit.
- **Format** : PNG ou JPG, sans transparence.

### Les figurants (en option)

Dans le bar, le patron et les 8 habitués sont des images séparées, que le jeu fait respirer et sauter quand ça claque.

- **Peints dans le décor** : plus simple, mais ils restent immobiles.
- **En images séparées** : 8 figurants et 1 personnage central (un président de séance, un présentateur…). De face ou de trois quarts, en pied, fond transparent, environ 450 px de haut, pieds en bas de l'image.

## 7. Ce qu'il n'y a pas à dessiner

- Les portraits de l'écran de sélection : découpés dans `idle.png`.
- Les vignettes des lieux : découpées dans le décor.
- Les effets (impacts, onomatopées, chiffres) : tracés par le jeu.

## 8. Où déposer les fichiers

| Quoi | Où |
| --- | --- |
| Poses d'un personnage | `raw/fighters/<identifiant>/` (identifiant : un mot neutre en minuscules) |
| Décor et figurants | `raw/stages/<identifiant>/` |
| Nom, nom court, coup spécial, répliques | `src/config/texts.ts` |
| Gabarit du personnage (lourd ou rapide pour l'instant) | `src/config/roster.ts` |

Les images peuvent aussi être envoyées dans la discussion du projet, en précisant à quel personnage ou décor elles appartiennent : elles sont alors rangées, découpées, et les zones de contact sont réglées sur les dessins.
