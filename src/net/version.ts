// Version publiée du jeu (phase 7e) : le build connaît l'empreinte de son commit (`__BUILD__`, posée par Vite
// d'après GITHUB_SHA), et le site publie celle de la dernière version dans `version.txt`. Si elles diffèrent,
// ce téléphone a une ancienne version en cache : pas de Primaire ouverte avant d'avoir rechargé la page
// (un seul réglage différent désynchroniserait le match). Hors build publié (`dev`), pas de contrôle.
declare const __BUILD__: string;

/** Essais : `?build=…` remplace l'empreinte du build (pour simuler une ancienne version). */
export function buildId(search: string = typeof location === 'undefined' ? '' : location.search): string {
  const forced = new URLSearchParams(search).get('build');
  if (forced) return forced;
  return typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
}

const SHA = /^[0-9a-f]{7,40}$/;

/** Vrai seulement si l'on est sûr que ce jeu n'est pas la dernière version publiée. */
export async function isOutdated(fetcher: typeof fetch = fetch): Promise<boolean> {
  const mine = buildId();
  if (mine === 'dev') return false;
  try {
    const r = await fetcher(`version.txt?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const latest = (await r.text()).trim();
    return SHA.test(latest) && latest !== mine;
  } catch {
    return false;
  }
}
