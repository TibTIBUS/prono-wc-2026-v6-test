---
description: Remplit automatiquement dans Supabase le score des matchs de Coupe du monde 2026 qui viennent de se terminer (table v7_knockout_matches), en récupérant le vrai résultat sur le web, puis fait avancer le bracket.
---

# Routine — Remplissage des scores CDM 2026 (phases finales)

Tu es lancé pour tenir à jour les résultats des matchs à élimination directe de la
Coupe du monde 2026 dans Supabase, car l'API football est devenue payante. Tu dois
récupérer toi-même le **vrai score** des matchs terminés et l'écrire dans la base.

## Contexte technique

- **Projet Supabase** : `prono-wc2026`, project_id = `hozudzxzoiqyexfyhcjv`.
- **Table à mettre à jour** : `public.v7_knockout_matches`.
- Colonnes utiles : `id`, `stage`, `team_a`, `team_b`, `kickoff_at` (UTC),
  `status`, `score_a`, `score_b`, `winner_team`, `next_match_id`, `next_slot`.
- Les noms d'équipes sont en **français** (ex. `Afrique du Sud`, `Pays-Bas`,
  `Côte d'Ivoire`, `Angleterre`). Les `stage` sont :
  `16e de finale`, `8e de finale`, `Quart de finale`, `Demi-finale`, `Finale`.
- Outils nécessaires : le connecteur **Supabase** (MCP) et la **recherche web**.

## Étape 1 — Trouver les matchs à remplir

Exécute cette requête SQL (via le connecteur Supabase, project_id ci-dessus) :

```sql
select id, stage, team_a, team_b, kickoff_at, status
from public.v7_knockout_matches
where team_a is not null
  and team_b is not null
  and (score_a is null or score_b is null)
  and kickoff_at < now() - interval '2 hours'
order by kickoff_at;
```

- Le tampon de `2 hours` évite de chercher un résultat pendant qu'un match est
  encore en cours (temps réglementaire + prolongations éventuelles).
- **Si la requête ne renvoie aucune ligne : il n'y a rien à faire.** Termine en
  disant qu'aucun match n'était en attente de score, et arrête-toi là.

## Étape 2 — Récupérer le vrai résultat (recherche web)

Pour **chaque** match renvoyé, cherche le résultat officiel sur le web. Exemple de
requête : `Coupe du monde 2026 <stage> résultat <team_a> <team_b> score`.

Règles impératives :

- **N'invente JAMAIS un score.** N'écris un résultat que s'il est confirmé par une
  source fiable et à jour (FIFA, Eurosport, L'Équipe, Flashscore, France Info…).
- Assure-toi que le match est bien **terminé** (mention « terminé », « fin de
  match », « après prolongation », « t.a.b. »). S'il est encore en cours ou si tu
  n'es pas certain du score, **passe ce match** (tu le reprendras à la prochaine
  exécution) et signale-le dans ton compte-rendu. Ne devine pas.
- **Score à enregistrer = score à la fin du TEMPS RÉGLEMENTAIRE (90 min + arrêts de
  jeu) UNIQUEMENT. On NE compte NI la prolongation NI les tirs au but.**
  - ⚠️ Attention : le score « à la une » affiché par les sites inclut souvent la
    prolongation (mention `a.p.` / `after extra time`) ou les t.a.b. (`t.a.b.` /
    `pen.`). Si le match est allé en prolongation ou aux t.a.b., il était forcément
    **à égalité à la fin des 90 min** : va chercher dans le résumé / la chronologie
    le score **à la mi-temps de fin de match, soit à 90'** (avant prolongation), et
    c'est CE score-là qu'il faut enregistrer.
  - Exemples : Belgique–Sénégal fini 3-2 après prolongation mais 2-2 à 90' →
    `score_a = 2`, `score_b = 2`. Un 1-1 qualifié aux t.a.b. → `score_a = 1`,
    `score_b = 1`.
- `team_a` correspond à la première équipe de la ligne, `team_b` à la seconde :
  respecte bien l'ordre des colonnes de la table, pas l'ordre du titre trouvé en ligne.

## Étape 3 — Écrire le score dans Supabase

Pour chaque match confirmé, fais un UPDATE. Détermine le **vainqueur qualifié**
(`winner_team`) — l'équipe qui passe réellement au tour suivant : vainqueur au
score de 90', OU, si le score à 90' est un nul, le vainqueur **en prolongation ou
aux tirs au but** :

```sql
update public.v7_knockout_matches
set score_a = <score_a>,
    score_b = <score_b>,
    status = 'finished',
    winner_team = '<équipe qualifiée>',
    updated_at = now()
where id = '<id_du_match>'
  and score_a is null;   -- garde-fou d'idempotence : n'écrase pas un score déjà saisi
```

- Renseigner `winner_team` est **obligatoire dès que le score enregistré est un nul**
  (match décidé en prolongation ou aux tirs au but) : sinon le bracket ne peut pas
  savoir qui avance. Pour les matchs tranchés dans le temps réglementaire, tu peux le
  renseigner aussi : c'est cohérent et sans risque.

## Étape 4 — Faire avancer le bracket (propagation du vainqueur)

Après avoir saisi les scores, propage les vainqueurs vers le match suivant. Ces deux
requêtes sont **idempotentes** (tu peux les relancer sans risque) :

```sql
-- 1) Place chaque vainqueur dans le bon créneau du match suivant
update public.v7_knockout_matches nxt
set team_a = coalesce(case when src.next_slot = 'team_a' then src.win end, nxt.team_a),
    team_b = coalesce(case when src.next_slot = 'team_b' then src.win end, nxt.team_b),
    updated_at = now()
from (
  select next_match_id, next_slot,
         case
           when score_a > score_b then team_a
           when score_b > score_a then team_b
           else winner_team
         end as win
  from public.v7_knockout_matches
  where status in ('finished','complete','completed')
    and next_match_id is not null
    and next_slot in ('team_a','team_b')
) src
where nxt.id = src.next_match_id
  and src.win is not null;

-- 2) Ouvre les pronostics des matchs dont les deux équipes sont désormais connues
update public.v7_knockout_matches
set is_open = true,
    status  = case when status = 'pending' then 'scheduled' else status end,
    updated_at = now()
where team_a is not null and team_b is not null and is_open = false;
```

## Étape 5 — Compte-rendu

Termine par un résumé court :
- les matchs remplis (avec le score et le vainqueur retenu) ;
- les matchs passés faute de résultat fiable (à réessayer plus tard) ;
- les créneaux du tour suivant qui ont été renseignés/ouverts.

Ne fais **aucune** modification hors de la table `v7_knockout_matches`. N'écris un
score que lorsqu'il est confirmé par une source fiable.
