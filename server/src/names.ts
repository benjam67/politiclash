// Noms du classement : pseudos libres, filtrés. Partagé par le serveur (qui décide) et le jeu (qui prévient
// tout de suite). Le filtre ne peut pas tout attraper : un bouton « Signaler » complète (3 signalements de
// joueurs différents, et le nom est remplacé par « Joueur #… »).

export const NAME_MAX = 14;

/** Mots refusés s'ils forment un mot entier (courts : on évite « con » dans « Constant », « pute » dans « député »). */
const WORDS = [
  'con', 'cons', 'conne', 'connes', 'pd', 'pede', 'fdp', 'ntm', 'tg', 'nique', 'niquer', 'bite', 'bites', 'cul', 'pute', 'putes', 'viol', 'violeur', 'nazi', 'nazis',
  'raton', 'ratons', 'retard', 'retards', 'negro', 'negros', 'pedale', 'pedales', 'tamere',
  'zob', 'teub', 'chatte', 'sexe', 'sex', 'porn', 'porno', 'fuck', 'shit', 'dick', 'cock', 'cunt', 'tits', 'slut', 'whore', 'rape', 'nig', 'kkk', 'ss', 'hitler', 'isis', 'daech',
];

/**
 * Morceaux refusés n'importe où dans le nom, une fois les séparateurs retirés. Seulement des morceaux qu'aucun
 * mot ordinaire ne contient : « nique » est dans « Unique » et « Dominique », « negro » dans « Monténégro »,
 * « pedale » dans « pédaler » ; ceux-là ne sont refusés que comme mots entiers (liste ci-dessus).
 */
const PARTS = [
  'connard', 'connasse', 'salope', 'salaud', 'encule', 'enculer', 'putain', 'batard', 'enfoire', 'couille', 'branleur', 'branlette', 'nichon', 'tapette', 'gouine',
  'negre', 'bougnoul', 'bicot', 'youpin', 'niquetamere', 'tamere', 'sodomi', 'pornhub', 'xvideo', 'fuck', 'bitch', 'pussy', 'nigger',
  'nigga', 'faggot', 'hitler', 'heilhitler', 'siegheil', 'pedophil', 'pedopor', 'suicide', 'terroris', 'jihad', 'djihad',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '€': 'e', '!': 'i' };

/** Minuscules, sans accents, chiffres « déguisés » remplacés par des lettres, lettres répétées réduites. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0134578@$€!]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1+/g, '$1');
}

/** Nettoie un nom saisi : caractères invisibles retirés, espaces réduits, 14 caractères au plus. */
export function tidyName(input: string): string {
  return [...input.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').replace(/\s+/g, ' ').trim()]
    .slice(0, NAME_MAX)
    .join('')
    .trim();
}

/**
 * Clé d'unicité d'un nom : deux noms de même clé sont « le même » (« Le Boss », « lé böss », « Le B0ss »,
 * « LeBoss » ou « le-boss ») : un seul joueur peut le porter, sinon on pourrait se faire passer pour un autre.
 */
export function nameKey(name: string): string {
  return normalizeName(tidyName(name)).replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
}

/** Vrai si le nom est acceptable pour le classement public. */
export function nameAllowed(name: string): boolean {
  // Au moins deux vraies lettres (avant de remplacer les chiffres « déguisés »).
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return false;
  const n = normalizeName(name);
  const tokens = n.split(/[^a-z]+/).filter(Boolean);
  if (tokens.some((t) => WORDS.includes(t))) return false;
  const squashed = n.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  if (PARTS.some((p) => squashed.includes(p.replace(/(.)\1+/g, '$1')))) return false;
  // Un mot court refusé écrit lettre par lettre (« p.u.t.e », « c o n ») : les lettres seules mises bout à bout.
  const singles = n.split(/[^a-z]+/).filter((t) => t.length === 1).join('');
  if (singles.length >= 2 && WORDS.some((w) => w.length >= 2 && singles.includes(w))) return false;
  return true;
}

/** Nom affiché pour un joueur sans nom (ou dont le nom a été masqué) : « Joueur #1234 », stable. */
export function anonymousName(rid: string): string {
  let h = 0;
  for (let i = 0; i < rid.length; i++) h = (Math.imul(h, 31) + rid.charCodeAt(i)) >>> 0;
  return `Joueur #${(h % 9000) + 1000}`;
}
