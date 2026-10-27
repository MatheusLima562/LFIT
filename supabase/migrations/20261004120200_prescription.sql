-- =============================================================================
-- 2.8 — Prescrição comum ao resumo do item e às séries detalhadas:
-- unidade + quantidade (mín–máx), intensidade (%1RM/RPE/RIR), velocidade (preset) OU
-- cadência, pausa mín–máx. Item: substitutos (até 3) e dica (substitui "observação").
-- Aditivo: as colunas antigas (reps, rest_seconds, rpe_target, notes) ficam e continuam
-- preenchidas pelo save_training_plan até a interface migrar; remoção numa migration futura.
-- =============================================================================

create type public.quantity_unit as enum ('reps', 'failure', 'seconds', 'minutes', 'meters', 'km', 'arrivals');
create type public.intensity_type as enum ('pct_1rm', 'rpe', 'rir');
create type public.speed_preset as enum ('slow', 'moderate', 'fast', 'explosive');

-- Mesmas colunas e regras nas duas tabelas.
do $$
declare
  t text;
begin
  foreach t in array array['plan_workout_items', 'plan_item_sets'] loop
    execute format($f$
      alter table public.%1$I
        add column quantity_unit public.quantity_unit not null default 'reps',
        add column quantity_min numeric(8, 2),
        add column quantity_max numeric(8, 2),
        add column quantity_note text check (length(quantity_note) <= 40),
        add column intensity_type public.intensity_type,
        add column intensity_value numeric(5, 1),
        add column speed public.speed_preset,
        add column rest_min integer check (rest_min between 0 and 900),
        add column rest_max integer check (rest_max between 0 and 900),
        add constraint %1$s_quantity_check check (
          case
            when quantity_unit = 'failure' then quantity_min is null and quantity_max is null
            else (quantity_min is null or quantity_min >= 0)
              and (quantity_max is null or (quantity_min is not null and quantity_max >= quantity_min))
              and (quantity_unit not in ('reps', 'arrivals')
                   or ((quantity_min is null or quantity_min = trunc(quantity_min))
                       and (quantity_max is null or quantity_max = trunc(quantity_max))))
          end
        ),
        add constraint %1$s_intensity_check check (
          (intensity_type is null) = (intensity_value is null)
          and case intensity_type
            when 'pct_1rm' then intensity_value between 1 and 120
            when 'rpe' then intensity_value between 1 and 10
            when 'rir' then intensity_value between 0 and 10
            else true
          end
        ),
        add constraint %1$s_rest_range_check check (rest_max is null or (rest_min is not null and rest_max >= rest_min))
    $f$, t);
  end loop;
end;
$$;

-- Séries passam a ter cadência própria (velocidade OU cadência, nunca os dois).
alter table public.plan_item_sets add column tempo text check (tempo ~ '^[0-9Xx]{4}$');
alter table public.plan_workout_items
  add constraint plan_workout_items_speed_or_tempo check (speed is null or tempo is null),
  add column tip text check (length(tip) <= 1000);
alter table public.plan_item_sets add constraint plan_item_sets_speed_or_tempo check (speed is null or tempo is null);

-- -----------------------------------------------------------------------------
-- Migração dos dados existentes
-- -----------------------------------------------------------------------------
-- "10" → 10 · "8–12" → 8/12 · "até a falha" → failure · "20–30 s" → segundos · "8 por lado" → 8 + nota.
create function private.parse_quantity(p text)
returns table (unit public.quantity_unit, qmin numeric, qmax numeric, note text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
  v_unit public.quantity_unit := 'reps';
  v_rest text;
begin
  if p is null or trim(p) = '' then
    return query select 'reps'::public.quantity_unit, null::numeric, null::numeric, null::text;
    return;
  end if;
  if trim(p) ~* '^(até a falha|ate a falha|falha)$' then
    return query select 'failure'::public.quantity_unit, null::numeric, null::numeric, null::text;
    return;
  end if;
  m := regexp_match(trim(p), '^(\d+(?:[.,]\d+)?)\s*(?:[–-]\s*(\d+(?:[.,]\d+)?))?\s*(.*)$');
  if m is null then
    return query select 'reps'::public.quantity_unit, null::numeric, null::numeric, left(trim(p), 40);
    return;
  end if;
  v_rest := trim(m[3]);
  if v_rest ~* '^(s|seg|segundos?)(\s|$)' then v_unit := 'seconds'; v_rest := regexp_replace(v_rest, '^(s|seg|segundos?)\s*', '', 'i');
  elsif v_rest ~* '^(min|minutos?)(\s|$)' then v_unit := 'minutes'; v_rest := regexp_replace(v_rest, '^(min|minutos?)\s*', '', 'i');
  elsif v_rest ~* '^km(\s|$)' then v_unit := 'km'; v_rest := regexp_replace(v_rest, '^km\s*', '', 'i');
  elsif v_rest ~* '^(m|metros?)(\s|$)' then v_unit := 'meters'; v_rest := regexp_replace(v_rest, '^(m|metros?)\s*', '', 'i');
  elsif v_rest ~* '^(reps?|repetições|repeticoes)(\s|$)' then v_rest := regexp_replace(v_rest, '^(reps?|repetições|repeticoes)\s*', '', 'i');
  end if;
  return query select
    v_unit,
    replace(m[1], ',', '.')::numeric,
    case when m[2] is null then null else replace(m[2], ',', '.')::numeric end,
    left(nullif(v_rest, ''), 40);
end;
$$;

update public.plan_workout_items i set
  (quantity_unit, quantity_min, quantity_max, quantity_note) = (
    select q.unit,
      case when q.unit in ('reps', 'arrivals') then trunc(q.qmin) else q.qmin end,
      case when q.qmax is null then null when q.unit in ('reps', 'arrivals') then trunc(q.qmax) else q.qmax end,
      q.note
    from private.parse_quantity(i.reps) q
  ),
  intensity_type = case when i.rpe_target is not null then 'rpe'::public.intensity_type end,
  intensity_value = i.rpe_target,
  rest_min = i.rest_seconds,
  tip = i.notes;

update public.plan_item_sets s set
  (quantity_unit, quantity_min, quantity_max, quantity_note) = (
    select q.unit,
      case when q.unit in ('reps', 'arrivals') then trunc(q.qmin) else q.qmin end,
      case when q.qmax is null then null when q.unit in ('reps', 'arrivals') then trunc(q.qmax) else q.qmax end,
      q.note
    from private.parse_quantity(s.reps) q
  ),
  rest_min = s.rest_seconds;

-- -----------------------------------------------------------------------------
-- Substitutos (até 3 por item, para quando faltar equipamento)
-- -----------------------------------------------------------------------------
create table public.plan_item_substitutes (
  item_id uuid not null,
  organization_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position smallint not null check (position between 0 and 2),
  primary key (item_id, exercise_id),
  unique (item_id, position),
  foreign key (item_id, organization_id) references public.plan_workout_items (id, organization_id) on delete cascade
);
create index plan_item_substitutes_exercise_idx on public.plan_item_substitutes (exercise_id);
create index plan_item_substitutes_item_org_idx on public.plan_item_substitutes (item_id, organization_id);

alter table public.plan_item_substitutes enable row level security;
create policy plan_item_substitutes_select on public.plan_item_substitutes
  for select to authenticated
  using (exists (
    select 1 from public.plan_workout_items i
    join public.plan_workouts w on w.id = i.workout_id
    where i.id = item_id and private.can_access_plan(w.plan_id)
  ));
-- Escrita só pela RPC save_training_plan.
grant select on public.plan_item_substitutes to authenticated;

revoke execute on function private.parse_quantity(text) from public, anon, authenticated;
