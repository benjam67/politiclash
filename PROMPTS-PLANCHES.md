# PolitiClash – Prompts des planches de poses

Deux planches de 12 cases (4 colonnes × 3 lignes) par personnage. Version du 11 octobre 2026, validée sur quatre personnages.

- **Image jointe** : la référence du personnage (en pied, dans le style du jeu). Pour la planche 2, joindre aussi la planche 1 validée.
- **Format** : 2:1, la plus grande taille possible (3840 × 1920 ou plus).
- **Personnage féminin** : remplacer « his » par « her » dans la case 5 de la planche 2.
- **Ensuite** : `python3 scripts/decoupe-planches.py <dossier des 2 planches> raw/fighters/<identifiant> apercu.jpg`, puis ajouter l'identifiant dans `scripts/optimize-assets.mjs`, `src/config/poses.ts`, `roster.ts`, `sprites.ts` et `texts.ts`, et lancer `npm run assets`.

## Planche 1 : déplacements, gardes et coups rapides

```
Character sprite sheet for a 2D fighting game, using the exact same character as the reference image: identical face, hair, glasses or accessories, outfit, colours, body proportions, and the same illustration style and line work.

Layout: a strict regular grid of 4 columns and 3 rows, 12 equal cells, no borders, no grid lines, no numbers, no text. One pose per cell, the whole body inside its cell with empty margin around, nothing cropped, nothing overlapping a neighbouring cell.

Rules for every pose:
- The character faces the RIGHT side of the image (side or three-quarter view turned to the right).
- Exactly the same scale in all 12 cells: the head has the same size everywhere. Do not shrink the character when a limb is extended or when crouching.
- Feet on the same baseline within each row, near the bottom of the cell. Jumping poses are also drawn low in the cell.
- Body centred in its cell; only an extended arm or leg may reach toward the right.
- Flat uniform pure green background (#00FF00), no ground, no shadows, no motion lines, no effects.

Poses, left to right, top to bottom:
1. Standing fighting stance, feet about shoulder-width apart (a narrow stance, not a wide lunge), knees slightly bent, hands held low and ready.
2. Walking forward, mid-stride: the leg nearest to the viewer is in front, the far leg is behind.
3. Walking forward, opposite step of pose 2: the leg nearest to the viewer is now behind, the far leg is in front. Poses 2 and 3 must be clearly different.
4. Jumping, airborne, both knees tucked up under the body.
5. Crouching very low and compact, both feet flat on the ground, head at half of standing height.
6. Standing high guard, both forearms crossed in front of the face.
7. Low guard, knees bent, one forearm and the front shin protecting the legs, head still visible and unprotected.
8. Quick short open-hand slap, arm half extended forward at face height.
9. Jumping with knees tucked, one open hand slapping forward and downward.
10. Standing on one leg, low kick: the other leg extended forward and angled DOWN, the foot no higher than the opponent's knee, well below the hip.
11. Crouching very low, one leg extended straight forward along the ground in a sweep kick.
12. Wind-up for a huge slap: torso twisted back, one open hand pulled far behind the body.
```

## Planche 2 : grosse gifle, coups reçus et fin de combat

```
Character sprite sheet for a 2D fighting game, second sheet of the same set. Use the exact same character as the reference image, and match the first sprite sheet exactly: identical face, hair, glasses or accessories, outfit, colours, body proportions, illustration style, line work and character scale.

Layout: a strict regular grid of 4 columns and 3 rows, 12 equal cells, no borders, no grid lines, no numbers, no text. One pose per cell, the whole body inside its cell with empty margin around, nothing cropped, nothing overlapping a neighbouring cell.

Rules for every pose:
- The character faces the RIGHT side of the image (side or three-quarter view turned to the right).
- Exactly the same scale in all 12 cells: the head has the same size everywhere. Do not shrink the character when a limb is extended or when lying down.
- Feet on the same baseline within each row, near the bottom of the cell.
- Body centred in its cell; only an extended arm or leg may reach toward the right.
- Flat uniform pure green background (#00FF00), no ground, no shadows, no motion lines, no effects.

Poses, left to right, top to bottom:
1. Mid-swing of a huge slap: the open hand whipping forward from behind, body rotating.
2. Huge slap at full extension: lunging, one arm fully extended forward at face height, open hand.
3. Most spectacular special attack: leaping lunge with one giant open-hand slap extended forward, dramatic body twist.
4. Second beat of the special attack: follow-through, arm swung across the body, torso fully rotated.
5. Slapping his own cheek with his own open hand, head knocked sideways, surprised.
6. Just slapped in the face: head snapped to the side, body recoiling backward.
7. Hit very hard: head thrown back, body lifted off the ground and flying backward.
8. Lying flat on the back on the ground, body horizontal, head to the left, feet to the right, arms spread.
9. Getting up: one knee and one hand on the ground, pushing up.
10. Dizzy and staggering: standing with wobbly knees, arms hanging, head tilted.
11. Victory: standing proud, one fist raised high.
12. Standing fighting stance, feet about shoulder-width apart (a narrow stance, not a wide lunge), knees slightly bent, hands held low and ready (same as the first pose of sheet one).
```

Les cases de la planche 2 correspondent aux poses n° 13 à 22 du guide, avec deux ajouts : la case 4 est l'option `special2`, la case 12 reprend `idle` et sert de repère d'échelle entre les deux planches.
