// L'objet d'entrée unique : le joueur (clavier, tactile), l'IA et plus tard le joueur distant
// produisent tous la même chose à chaque pas de simulation. La logique ne sait pas d'où ça vient.

// L'ordre fixe le bit de chaque touche : on n'ajoute qu'à la fin.
export const INPUT_KEYS = ['gauche', 'droite', 'haut', 'bas', 'gifle', 'grosseGifle', 'garde', 'pied'] as const;
export type InputKey = (typeof INPUT_KEYS)[number];
export type InputFrame = Record<InputKey, boolean>;

export const noInput = (): InputFrame => ({ gauche: false, droite: false, haut: false, bas: false, gifle: false, grosseGifle: false, garde: false, pied: false });

/** Entrées compactées en un entier (un bit par touche) : pour le réseau et les enregistrements. */
export function encodeInput(i: InputFrame): number {
  let n = 0;
  INPUT_KEYS.forEach((k, b) => {
    if (i[k]) n |= 1 << b;
  });
  return n;
}

export function decodeInput(n: number): InputFrame {
  const i = noInput();
  INPUT_KEYS.forEach((k, b) => {
    i[k] = (n & (1 << b)) !== 0;
  });
  return i;
}

/** Réunit plusieurs sources (clavier + tactile) : une touche est enfoncée si elle l'est quelque part. */
export function mergeInputs(...list: Partial<InputFrame>[]): InputFrame {
  const out = noInput();
  for (const i of list) for (const k of INPUT_KEYS) if (i[k]) out[k] = true;
  return out;
}
