# PolitiClash – Roadmap du jeu en ligne

Version du 13 octobre 2026. Ce document **remplace la phase 7** de `ROADMAP.md`. Le reste de la roadmap (règles, contraintes techniques, méthode de travail, vérifications) s'applique sans changement.

## 1. Les deux modes

| | **Entre amis** | **Partie rapide** |
| --- | --- | --- |
| Pour qui | Deux personnes qui se connaissent | N'importe qui contre n'importe qui |
| Comment on se trouve | Un code de salon à 4 lettres, ou un lien envoyé par message | Le joueur appuie sur « Partie rapide » et attend un adversaire |
| Choix du niveau | L'hôte choisit | Au hasard |
| Choix du perso | Libre, sans limite de temps | Libre, 15 secondes maximum |
| Revanche | Oui, si les deux acceptent | Oui, si les deux acceptent ; sinon retour à la file |
| Ce qu'il faut en plus du jeu | Presque rien (service de mise en relation) | Un petit serveur toujours allumé (file d'attente) et un relais |

Ordre de travail : **Entre amis d'abord**. Il valide tout le moteur réseau avec peu de risques. La Partie rapide se construit ensuite par-dessus.

## 2. Ce qui est commun aux deux modes

Le combat est déjà prêt pour le jeu en ligne : la simulation est déterministe, l'état est copiable et comparable, et les entrées viennent toutes de la même interface (section 5 de `ROADMAP.md`). Le principe :

- Les deux téléphones font tourner **la même simulation** et ne s'échangent **que les entrées** (les touches appuyées à chaque pas).
- Un **petit retard d'entrée** (3 à 4 pas, soit 50 à 70 ms) laisse le temps aux entrées d'arriver.
- **Retour en arrière (rollback)** : quand une entrée arrive en retard, le jeu devine, puis corrige en rejouant les derniers pas. Dans la roadmap actuelle, c'était une option. Ici, il devient **obligatoire pour la Partie rapide**, où les adversaires peuvent être loin ou sur un réseau mobile moyen. Il est fait dès le socle, pour servir aussi au mode Entre amis.
- **Contrôle de désynchronisation** : toutes les secondes, les deux téléphones comparent l'empreinte de leur état. En cas d'écart, l'invité se recale sur l'état de l'hôte.
- **Cinématiques des coups spéciaux** : elles font déjà partie de la simulation, donc rien de particulier. Seule précaution : la « garde au bon moment » (fenêtre de 100 ms) doit être jugée par la simulation, jamais par l'affichage local.

### Coupures

- Moins de 3 secondes sans nouvelles : le jeu se fige avec « Connexion instable… ».
- De 3 à 15 secondes : pause et tentative de reconnexion.
- Au-delà : fin du match. En Partie rapide, celui qui reste gagne ; en Entre amis, match annulé.

### Ce que voit l'adversaire

- **Aucun chat libre.** Seulement 4 à 6 réactions toutes prêtes (« Aïe ! », « Encore ! », « Bien joué », etc.), dont le texte vient de `texts.ts`. C'est le choix le plus sûr avec des inconnus, et le public de ce genre de jeu compte beaucoup de mineurs.
- Un **pseudo** : en Entre amis, choisi librement ; en Partie rapide, **tiré au hasard** parmi une liste fournie dans `texts.ts` (ex. « Député du 7e rang »), pour éviter les pseudos insultants sans avoir à les filtrer.
- Un bouton **« Couper les réactions »** de l'adversaire.

## 3. Phases

### Phase 7a · Socle réseau ✔

**Faite le 14 octobre 2026** (détail et mesures dans `CHANGELOG.md`). 600 matchs par le faux tuyau, aucune désynchronisation ; retour en arrière sous 0,1 ms par image avec processeur ×4. Ajouté en route : le retard d'entrée est choisi selon le ping (3 à 6 pas), à mesurer avant le match en 7b.


- Échange des entrées, retard d'entrée, retour en arrière jusqu'à 8 pas.
- Contrôle de désynchronisation et recalage.
- Gestion des coupures (section 2).
- Banc d'essai sans réseau réel : deux simulations reliées par un faux tuyau qui ajoute de la latence, des pertes et du désordre.
- *Validé quand* : 200 matchs entre deux IA reliées par le faux tuyau (100 ms, puis 200 ms et 5 % de pertes) se terminent tous sans désynchronisation ; le retour en arrière tient sous 8 ms par image avec ralentissement du processeur ×4.

### Phase 7b · Mode Entre amis

- Écran « Jouer en ligne » → « Entre amis » → « Créer un salon » ou « Rejoindre ».
- Code de 4 lettres sans lettres ambiguës (pas de O, 0, I, 1), et **lien d'invitation** `…/politiclash/?salon=ABCD` à partager par message (bouton de partage du téléphone).
- Mise en relation des deux téléphones par un service de mise en relation (PeerJS). Si la connexion directe échoue, passage par un relais (voir phase 7c ; en attendant, message clair « connexion impossible sur ce réseau, essaie en Wi-Fi »).
- Salon : chacun choisit son perso, l'hôte choisit le niveau, les deux appuient sur « Prêt ».
- Revanche, changement de perso, retour au menu.
- Tests Playwright avec deux navigateurs connectés, avec et sans 100 ms de latence simulée.
- *Validé quand* : deux navigateurs jouent un match complet sans désynchronisation, y compris à 100 ms de latence ; le lien d'invitation ouvre directement le bon salon.
- **Jalon 3 : le propriétaire joue en ligne avec un ami** (inchangé).

### Phase 7c · Serveur et relais ⚠ choix du propriétaire

La Partie rapide a besoin de deux choses que GitHub Pages ne fournit pas, car il ne sert que des fichiers :

1. **Un petit serveur toujours allumé** qui tient la file d'attente et met les joueurs en relation.
2. **Un relais** (TURN) pour les réseaux mobiles qui bloquent la connexion directe. Pour le mode Entre amis, il est utile ; pour la Partie rapide, il est indispensable : on ne peut pas demander à un inconnu de « réessayer en Wi-Fi ».

Le relais a un second avantage : en passant par lui, **l'adresse IP d'un joueur n'est jamais transmise à l'autre**. En connexion directe, chacun voit l'adresse IP de l'adversaire, ce qui ne pose pas de problème entre amis mais en pose avec des inconnus. Recommandation : en Partie rapide, **toujours passer par le relais**.

Familles de solutions, à comparer au moment du choix (offres gratuites, limites et prix à vérifier à ce moment-là) :

| Solution | Serveur de file d'attente | Relais | Remarque |
| --- | --- | --- | --- |
| Service « tout compris » de type Cloudflare (Workers + relais) | Oui | Oui | Un seul fournisseur, peu d'entretien |
| Base de données temps réel (type Supabase ou Firebase) + relais séparé | Oui | Non, à ajouter | Simple à brancher, deux fournisseurs |
| Petit serveur loué (VPS) | Oui | Oui, à installer | Le plus souple, mais il faut l'entretenir |

Claude prépare une comparaison chiffrée à jour au début de cette phase. **Le propriétaire choisit** (c'est un choix difficile à annuler et qui peut coûter de l'argent), puis crée le compte : Claude ne crée aucun compte et n'entre aucun moyen de paiement.

- *Validé quand* : le serveur répond en ligne, le relais fonctionne depuis un téléphone en 4G, et le mode Entre amis l'utilise en secours.

### Phase 7d · Mode Partie rapide

- Écran « Partie rapide » : « Recherche d'un adversaire… », avec le **nombre de joueurs en ligne** et un bouton « Annuler ».
- **File d'attente** : le serveur associe les deux joueurs qui attendent depuis le plus longtemps, en préférant une latence faible entre eux. Après 20 secondes, il accepte une latence plus forte.
- **Personne en vue après 45 secondes** : proposition « Jouer contre l'IA en attendant ? ». Si un adversaire arrive pendant ce match, une notification propose de le rejoindre à la fin. L'IA est **toujours annoncée comme IA** : on ne fait pas passer un robot pour un joueur.
- Choix du perso en 15 secondes (perso au hasard si le temps est écoulé), niveau tiré au hasard **par la simulation** (graine partagée), pour que les deux téléphones aient le même.
- Revanche si les deux acceptent dans les 10 secondes ; sinon, retour à la file.
- **Abandons** : quitter en cours de match compte comme une défaite. Pas de sanction en plus (pas de comptes, donc rien à sanctionner durablement).
- Tests : 20 faux joueurs qui entrent et sortent de la file au hasard ; chaque joueur finit apparié ou sort proprement, personne n'est apparié deux fois.
- *Validé quand* : deux navigateurs qui ne partagent aucun code se trouvent et jouent un match complet par le relais ; les tests de la file passent ; aucune adresse IP de l'adversaire n'apparaît dans les échanges du navigateur.

### Phase 7e · Robustesse et triche

- **Triche** : comme chacun ne transmet que ses entrées et que les deux simulations se surveillent, un tricheur ne peut pas s'inventer des PV ou une barre Buzz pleine sans provoquer une désynchronisation. En Partie rapide, une désynchronisation répétée met fin au match sans vainqueur.
- **Versions différentes** : un joueur dont le jeu n'est pas à jour ne peut pas être apparié ; il voit « Mets le jeu à jour » (rechargement de la page). Indispensable, car un seul réglage différent dans `balance.ts` désynchronise tout.
- **Limite d'usage** du serveur : pas plus de quelques demandes par minute et par appareil, pour éviter qu'un robot ne sature la file.
- **Suivi minimal** : nombre de matchs joués, taux de désynchronisation et de coupures, temps d'attente moyen. Aucune donnée personnelle.
- *Validé quand* : un faux client tricheur est détecté ; un client d'une ancienne version est refusé ; le suivi affiche des chiffres cohérents après 50 matchs de test.

### Phase 7f · Ouverture au public ⚠ choix du propriétaire

- **Avis juridique avant l'ouverture de la Partie rapide** : la roadmap le prévoyait avant une diffusion large, et c'est ce mode qui rend la diffusion large. Points à faire relire : l'exception de caricature, et les données des joueurs (même sans comptes, le serveur voit passer des adresses IP ; une courte page d'information sur la vie privée sera nécessaire).
- Bouton **« Signaler »** sur l'écran de fin de match, qui enregistre seulement le pseudo tiré et l'heure.
- Ouverture progressive : d'abord un lien partagé à un petit cercle, puis public.
- *Validé quand* : le propriétaire a donné son accord pour l'ouverture.

## 4. Classement (plus tard, en option)

Sans comptes utilisateurs (hors périmètre), pas de vrai classement. On peut garder sur le téléphone : victoires en ligne, série en cours, perso favori. Un classement public demanderait des comptes : à décider plus tard.

## 5. Risques connus

| Risque | Ce qu'on fait |
| --- | --- |
| Trop peu de joueurs : la file reste vide | Compteur de joueurs en ligne, proposition de match contre l'IA, et le mode Entre amis pour recruter |
| Réseau mobile trop lent | Retour en arrière, relais, et avertissement « connexion faible » avant le match si la latence dépasse 150 ms |
| Coût du serveur et du relais si le jeu marche bien | Suivi de l'usage ; seuil d'alerte fixé avec le propriétaire en phase 7c |
| Mise à jour du jeu pendant que des gens jouent | Contrôle de version (phase 7e) |

## 6. Jalons et décisions du propriétaire

| Quand | Quoi |
| --- | --- |
| Fin de la phase 7b | **Jalon 3** : match en ligne avec un ami |
| Début de la phase 7c | Choisir le service de serveur et de relais, créer le compte |
| Avant la phase 7d | Fournir dans `texts.ts` : liste de pseudos au hasard, textes des réactions |
| Phase 7f | Avis juridique, feu vert pour l'ouverture |
