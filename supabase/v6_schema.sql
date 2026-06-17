
-- V6 TEST - Phases finales
-- À exécuter dans le même projet Supabase que la V5.
-- Ces tables sont préfixées v6_ pour ne pas toucher aux tables actuelles.

create table if not exists v6_knockout_matches (
  id text primary key,
  api_match_id text unique,
  stage text not null,
  team_a text not null,
  team_b text not null,
  kickoff_at timestamptz,
  status text default 'scheduled',
  score_a integer,
  score_b integer,
  is_open boolean default false,
  display_order integer default 0,
  updated_at timestamptz default now()
);

create table if not exists v6_knockout_predictions (
  id bigserial primary key,
  employee_id bigint references employees(id) on delete cascade,
  match_id text references v6_knockout_matches(id) on delete cascade,
  score_a integer not null,
  score_b integer not null,
  stage text not null,
  locked boolean default true,
  submitted_at timestamptz default now(),
  unique(employee_id, match_id)
);

create table if not exists v6_prediction_locks (
  id bigserial primary key,
  employee_id bigint references employees(id) on delete cascade,
  stage text not null,
  locked boolean default true,
  locked_at timestamptz default now(),
  unique(employee_id, stage)
);

create table if not exists v6_sync_logs (
  id bigserial primary key,
  status text not null,
  message text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table v6_knockout_matches enable row level security;
alter table v6_knockout_predictions enable row level security;
alter table v6_prediction_locks enable row level security;
alter table v6_sync_logs enable row level security;

drop policy if exists "Public read v6 matches" on v6_knockout_matches;
create policy "Public read v6 matches" on v6_knockout_matches for select using (true);

drop policy if exists "Public read v6 predictions" on v6_knockout_predictions;
create policy "Public read v6 predictions" on v6_knockout_predictions for select using (true);

drop policy if exists "Public read v6 locks" on v6_prediction_locks;
create policy "Public read v6 locks" on v6_prediction_locks for select using (true);

drop policy if exists "Public read v6 sync logs" on v6_sync_logs;
create policy "Public read v6 sync logs" on v6_sync_logs for select using (true);

-- Matchs de test facultatifs
insert into v6_knockout_matches
(id, api_match_id, stage, team_a, team_b, kickoff_at, status, score_a, score_b, is_open, display_order)
values
('V6TEST-1', 'manual-test-1', '16e de finale', 'France', 'Maroc', now() + interval '3 days', 'scheduled', null, null, true, 1),
('V6TEST-2', 'manual-test-2', '16e de finale', 'Espagne', 'Belgique', now() + interval '3 days', 'scheduled', null, null, true, 2),
('V6TEST-3', 'manual-test-3', '16e de finale', 'Angleterre', 'Croatie', now() + interval '4 days', 'scheduled', null, null, true, 3)
on conflict (id) do nothing;
