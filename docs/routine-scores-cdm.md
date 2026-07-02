# Routine automatique — Scores CDM 2026 (phases finales)

Cette routine remplit toute seule, dans Supabase (`v7_knockout_matches`), le score
des matchs à élimination directe de la Coupe du monde 2026 dès qu'ils sont terminés,
puis fait avancer le tableau final (bracket). Elle existe parce que l'API football
est devenue payante pendant la compétition.

## Comment ça marche

À chaque exécution, une session Claude (avec le connecteur **Supabase** et la
**recherche web** activés) :

1. cherche dans `v7_knockout_matches` les matchs dont le coup d'envoi remonte à plus
   de 2 h mais dont le score est encore vide ;
2. récupère le vrai résultat de chacun sur le web (sources fiables : FIFA,
   Eurosport, L'Équipe, Flashscore…) ;
3. écrit `score_a`, `score_b` (score à 90 min), `status = 'finished'` et
   `winner_team` (l'équipe réellement qualifiée, y compris via prolongation ou
   tirs au but) ;
4. propage le vainqueur dans le match suivant (`next_match_id` / `next_slot`) et
   ouvre les pronostics des matchs dont les deux équipes sont désormais connues.

La logique complète est dans le slash-command
[`.claude/commands/remplir-scores-cdm.md`](../.claude/commands/remplir-scores-cdm.md).
Elle est **idempotente** : la relancer ne réécrit jamais un score déjà saisi et
ne casse rien.

## Détails importants

- **Score enregistré = score à la fin du temps réglementaire (90 min) UNIQUEMENT**,
  sans la prolongation ni les tirs au but. Un match allé en prolongation / t.a.b.
  était à égalité à 90', il est donc saisi comme un nul (ex. Belgique–Sénégal 3-2
  a.p. mais 2-2 à 90' → enregistré `2-2`), et c'est `winner_team` qui indique
  l'équipe réellement qualifiée.
- La routine **n'invente jamais** un score : si le résultat n'est pas confirmé de
  façon fiable (match encore en cours, prolongation, doute), elle passe le match et
  le reprend à l'exécution suivante.
- Elle ne touche qu'à la table `v7_knockout_matches`.

## Mise en place de la routine planifiée (Claude Code on the web)

Pour couvrir tout le tournoi (jusqu'au 19 juillet 2026), utilise une **Routine**
(fonctionnalité « Routines » de Claude Code on the web), plutôt qu'un cron interne à
une session (qui expire au bout de 7 jours et dépend d'un environnement éphémère).
Une Routine tourne sur l'infrastructure cloud d'Anthropic, même navigateur fermé.

Étapes (interface web) :

1. Va sur **https://claude.ai/code/routines** et clique **New routine**.
2. **Nom + prompt** : nomme-la (ex. « Scores CDM 2026 ») et mets comme prompt :
   `/remplir-scores-cdm`
   (le slash-command est cloné avec le dépôt depuis `.claude/commands/`. En cas de
   souci, colle à la place tout le contenu de
   `.claude/commands/remplir-scores-cdm.md`.)
3. **Repositories** : ajoute ce dépôt (`prono-wc-2026-v6-test`).
4. **Environment** : laisse **Default** (accès réseau *Trusted*). Le trafic des
   connecteurs MCP passe par Anthropic, donc Supabase fonctionne sans réglage
   réseau supplémentaire. Si des recherches web venaient à être bloquées, édite
   l'environnement et passe **Network access** à *Full* (ou ajoute les domaines).
5. **Select a trigger** → **Schedule** → fréquence **Hourly** (toutes les heures).
   ⚠️ L'intervalle minimum d'une Routine est **1 heure** — plus court est refusé.
   C'est suffisant : les matchs sont espacés de plusieurs heures, et un score sera
   saisi au plus tard ~1 h après la fin du match.
6. **Connectors** : vérifie que le connecteur **Supabase** est bien coché (tous tes
   connecteurs sont inclus par défaut ; retire ceux qui sont inutiles).
7. Clique **Create**. Pour tester tout de suite, ouvre la routine et clique
   **Run now**.
8. Laisse tourner jusqu'à la finale, puis supprime la routine (icône corbeille).

Alternative CLI : `/schedule` dans une session, puis `/schedule list`,
`/schedule update`, `/schedule run` pour gérer/tester.

Docs de référence :
- Routines : https://code.claude.com/docs/en/routines
- Claude Code on the web : https://code.claude.com/docs/en/claude-code-on-the-web

## Lancement manuel

Tu peux exécuter la routine à tout moment en tapant `/remplir-scores-cdm` dans une
session Claude connectée à Supabase. Utile juste après un match pour saisir le score
sans attendre le prochain déclenchement.

## Sécurité (à noter)

La table `v7_knockout_matches` a le Row Level Security (RLS) **désactivé** : avec la
clé publique (anon), n'importe qui peut lire/écrire toutes les lignes. Ce n'est pas
lié à cette routine (qui passe par la clé service role côté serveur), mais c'est à
corriger un jour. Voir la fin de ce document pour le SQL d'activation — à ne
déployer qu'avec des policies adaptées, sinon l'accès public au classement sera
bloqué.
