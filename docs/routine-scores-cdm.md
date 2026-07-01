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
3. écrit `score_a`, `score_b`, `status = 'finished'` et `winner_team` (l'équipe
   qualifiée, y compris en cas de qualification aux tirs au but) ;
4. propage le vainqueur dans le match suivant (`next_match_id` / `next_slot`) et
   ouvre les pronostics des matchs dont les deux équipes sont désormais connues.

La logique complète est dans le slash-command
[`.claude/commands/remplir-scores-cdm.md`](../.claude/commands/remplir-scores-cdm.md).
Elle est **idempotente** : la relancer ne réécrit jamais un score déjà saisi et
ne casse rien.

## Détails importants

- **Score enregistré** = score à la fin du temps réglementaire + prolongation, hors
  tirs au but. Un match nul qualifié aux t.a.b. est donc saisi comme un nul (ex.
  `1-1`), et c'est `winner_team` qui indique qui passe.
- La routine **n'invente jamais** un score : si le résultat n'est pas confirmé de
  façon fiable (match encore en cours, prolongation, doute), elle passe le match et
  le reprend à l'exécution suivante.
- Elle ne touche qu'à la table `v7_knockout_matches`.

## Mise en place du déclencheur planifié (Claude Code on the web)

Pour couvrir tout le tournoi (jusqu'au 19 juillet 2026), crée un **déclencheur
planifié** dans Claude Code on the web plutôt qu'un cron interne à une session (qui
expire au bout de 7 jours et dépend d'un environnement éphémère) :

1. Ouvre ce dépôt dans Claude Code on the web.
2. Crée une **session planifiée / trigger récurrent** avec :
   - **Fréquence** : toutes les 30 minutes (ex. `*/30 * * * *`). Les matchs
     s'enchaînant toutes les quelques heures, ce rythme suffit largement.
   - **Environnement** : celui de ce dépôt, avec le connecteur **Supabase** et la
     **recherche web** activés.
   - **Prompt** : `/remplir-scores-cdm`
     (ou, à défaut de slash-command dans la session planifiée, colle le contenu de
     `.claude/commands/remplir-scores-cdm.md`).
3. Laisse tourner jusqu'à la finale, puis supprime le déclencheur.

Doc de référence : https://code.claude.com/docs/en/claude-code-on-the-web

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
