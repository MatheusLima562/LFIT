-- =============================================================================
-- Fase 2 — Biblioteca de exercícios, condições de saúde e planos de treino.
--
-- Escopo "global" = organization_id nulo (dados de referência do produto, só
-- via migration). Escopo da organização = organization_id preenchido.
-- Planos de treino unificam aluno e modelo: student_id nulo = modelo.
-- =============================================================================

create type public.contraindication_level as enum ('avoid', 'caution');
create type public.plan_status as enum ('draft', 'active', 'archived');
create type public.load_unit as enum ('kg', 'lb');
create type public.set_type as enum ('warmup', 'work', 'drop');

-- Grupos musculares aceitos (rótulos em messages/pt-BR.ts).
create function private.valid_muscle_groups(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p <@ array[
    'peitoral', 'dorsais', 'trapezio', 'ombros', 'biceps', 'triceps', 'antebracos', 'abdomen',
    'lombar', 'gluteos', 'quadriceps', 'posteriores', 'panturrilhas', 'adutores', 'abdutores', 'corpo_inteiro'
  ]::text[]
$$;
grant execute on function private.valid_muscle_groups(text[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Condições de saúde (catálogo global + condições próprias da organização)
-- -----------------------------------------------------------------------------
create table public.health_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  -- Chave estável só para o catálogo global (ex.: 'lombar').
  key text unique check (key ~ '^[a-z_]+$'),
  name text not null check (length(trim(name)) between 2 and 80),
  description text check (length(description) <= 300),
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is null) = (key is not null))
);
create unique index health_conditions_scope_name_unique on public.health_conditions (
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(private.immutable_unaccent(name))
);

-- Condição usada por uma org precisa ser global ou da própria org.
create function private.assert_condition_scope(p_condition_id uuid, p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.health_conditions c
    where c.id = p_condition_id
      and (c.organization_id is null or c.organization_id = p_org)
  ) then
    raise exception 'INVALID_CONDITION' using errcode = 'P0001';
  end if;
end;
$$;

-- Vínculo grupo especial ↔ condição (ativa o alerta no montador).
create table public.special_group_conditions (
  group_id uuid not null,
  condition_id uuid not null references public.health_conditions (id) on delete cascade,
  organization_id uuid not null,
  primary key (group_id, condition_id),
  foreign key (group_id, organization_id) references public.special_groups (id, organization_id) on delete cascade
);
create index special_group_conditions_condition_idx on public.special_group_conditions (condition_id);

-- -----------------------------------------------------------------------------
-- Exercícios
-- -----------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  muscle_groups text[] not null default '{}' check (private.valid_muscle_groups(muscle_groups)),
  equipment text check (length(equipment) <= 80),
  instructions text check (length(instructions) <= 2000),
  video_url text check (video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/'),
  -- "Personalizar" um exercício global cria uma cópia da org apontando para a origem.
  source_exercise_id uuid references public.exercises (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exercises_scope_name_unique on public.exercises (
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(private.immutable_unaccent(name))
) where archived_at is null;
create index exercises_search_trgm_idx on public.exercises
  using gin (private.immutable_unaccent(lower(name)) extensions.gin_trgm_ops);
create index exercises_org_idx on public.exercises (organization_id);

-- Contraindicações: regra global (org nula, só via migration) ou camada da organização.
create table public.exercise_contraindications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  condition_id uuid not null references public.health_conditions (id) on delete cascade,
  level public.contraindication_level not null,
  note text check (length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exercise_contraindications_unique on public.exercise_contraindications (
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), exercise_id, condition_id
);
create index exercise_contraindications_exercise_idx on public.exercise_contraindications (exercise_id);

-- Regras de escopo: global só com exercício e condição globais; da org só com
-- exercício global ou da própria org e condição global ou da própria org.
create function private.validate_contraindication_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exercise_org uuid;
  v_condition_org uuid;
begin
  select organization_id into v_exercise_org from public.exercises where id = new.exercise_id;
  select organization_id into v_condition_org from public.health_conditions where id = new.condition_id;
  if new.organization_id is null then
    if v_exercise_org is not null or v_condition_org is not null then
      raise exception 'INVALID_CONDITION' using errcode = 'P0001';
    end if;
  elsif (v_exercise_org is not null and v_exercise_org <> new.organization_id)
     or (v_condition_org is not null and v_condition_org <> new.organization_id) then
    raise exception 'INVALID_CONDITION' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger exercise_contraindications_scope
before insert or update on public.exercise_contraindications
for each row execute function private.validate_contraindication_scope();

create function private.validate_group_condition_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_condition_scope(new.condition_id, new.organization_id);
  return new;
end;
$$;

create trigger special_group_conditions_scope
before insert or update on public.special_group_conditions
for each row execute function private.validate_group_condition_scope();

-- Arquivar condição própria: só o owner.
create function private.health_conditions_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at and not private.is_owner() and (select auth.uid()) is not null then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Só o owner arquiva condições';
  end if;
  return new;
end;
$$;

create trigger health_conditions_archive_guard
before update on public.health_conditions
for each row execute function private.health_conditions_archive_guard();

-- -----------------------------------------------------------------------------
-- Planos de treino (aluno ou modelo)
-- -----------------------------------------------------------------------------
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid,
  name text not null check (length(trim(name)) between 2 and 120),
  goal text check (length(goal) <= 200),
  level text check (level in ('iniciante', 'intermediario', 'avancado')),
  starts_on date,
  ends_on date,
  notes text check (length(notes) <= 2000),
  status public.plan_status not null default 'draft',
  source_plan_id uuid references public.training_plans (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade,
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  -- Modelos não são ativados; plano ativo precisa de período (alimenta "treino a vencer").
  check (status <> 'active' or (student_id is not null and starts_on is not null and ends_on is not null))
);
create unique index training_plans_one_active_per_student on public.training_plans (student_id) where status = 'active';
create index training_plans_org_student_idx on public.training_plans (organization_id, student_id);

create table public.plan_workouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  organization_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 10),
  name text check (length(name) <= 80),
  notes text check (length(notes) <= 500),
  position integer not null check (position >= 0),
  unique (id, organization_id),
  unique (plan_id, position),
  foreign key (plan_id, organization_id) references public.training_plans (id, organization_id) on delete cascade
);

create table public.plan_workout_items (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null,
  organization_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null check (position >= 0),
  group_key text check (group_key ~ '^[A-Za-z0-9_-]{1,20}$'),
  sets integer check (sets between 1 and 20),
  reps text check (length(reps) <= 20),
  load_value numeric(6, 2) check (load_value >= 0),
  load_unit public.load_unit,
  load_text text check (length(load_text) <= 40),
  rest_seconds integer check (rest_seconds between 0 and 900),
  tempo text check (tempo ~ '^[0-9Xx]{4}$'),
  rpe_target numeric(3, 1) check (rpe_target between 1 and 10),
  notes text check (length(notes) <= 300),
  unique (id, organization_id),
  unique (workout_id, position),
  check ((load_value is null) = (load_unit is null)),
  foreign key (workout_id, organization_id) references public.plan_workouts (id, organization_id) on delete cascade
);
create index plan_workout_items_exercise_idx on public.plan_workout_items (exercise_id);

create table public.plan_item_sets (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  organization_id uuid not null,
  position integer not null check (position >= 0),
  set_type public.set_type not null default 'work',
  reps text check (length(reps) <= 20),
  load_value numeric(6, 2) check (load_value >= 0),
  load_unit public.load_unit,
  load_text text check (length(load_text) <= 40),
  rest_seconds integer check (rest_seconds between 0 and 900),
  unique (item_id, position),
  check ((load_value is null) = (load_unit is null)),
  foreign key (item_id, organization_id) references public.plan_workout_items (id, organization_id) on delete cascade
);

-- Plano ativo alimenta students.workout_plan_ends_at (abas "A vencer / Vencidos / Sem treino").
create function private.sync_student_plan_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := coalesce(new.student_id, old.student_id);
begin
  if v_student is null then
    return null;
  end if;
  update public.students s
  set workout_plan_ends_at = (
    select (p.ends_on::text || 'T23:59:59-03:00')::timestamptz
    from public.training_plans p
    where p.student_id = v_student and p.status = 'active'
  )
  where s.id = v_student;
  return null;
end;
$$;

create trigger training_plans_sync_student
after insert or update of status, ends_on, student_id or delete on public.training_plans
for each row execute function private.sync_student_plan_end();

create trigger health_conditions_updated_at before update on public.health_conditions
  for each row execute function private.set_updated_at();
create trigger exercises_updated_at before update on public.exercises
  for each row execute function private.set_updated_at();
create trigger exercise_contraindications_updated_at before update on public.exercise_contraindications
  for each row execute function private.set_updated_at();
create trigger training_plans_updated_at before update on public.training_plans
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.health_conditions enable row level security;
alter table public.special_group_conditions enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_contraindications enable row level security;
alter table public.training_plans enable row level security;
alter table public.plan_workouts enable row level security;
alter table public.plan_workout_items enable row level security;
alter table public.plan_item_sets enable row level security;

-- O usuário pode ver este plano? Modelo: staff da org. Plano de aluno: quem acessa o aluno.
create function private.can_access_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.training_plans p
    where p.id = p_plan_id
      and p.organization_id = private.current_org_id()
      and private.is_staff()
      and (p.student_id is null or private.can_access_student(p.student_id))
  )
$$;
grant execute on function private.can_access_plan(uuid) to authenticated;

-- Condições: globais + da própria org (staff).
create policy health_conditions_select on public.health_conditions
  for select to authenticated
  using ((select private.is_staff()) and (organization_id is null or organization_id = (select private.current_org_id())));
create policy health_conditions_insert on public.health_conditions
  for insert to authenticated
  with check ((select private.is_staff()) and organization_id = (select private.current_org_id()) and key is null);
create policy health_conditions_update on public.health_conditions
  for update to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()) and key is null);

create policy special_group_conditions_select on public.special_group_conditions
  for select to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()));
create policy special_group_conditions_insert on public.special_group_conditions
  for insert to authenticated
  with check ((select private.is_staff()) and organization_id = (select private.current_org_id()));
create policy special_group_conditions_delete on public.special_group_conditions
  for delete to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()));

-- Exercícios: globais + da própria org. Editar/arquivar próprio: owner ou autor.
create policy exercises_select on public.exercises
  for select to authenticated
  using ((select private.is_staff()) and (organization_id is null or organization_id = (select private.current_org_id())));
create policy exercises_insert on public.exercises
  for insert to authenticated
  with check ((select private.is_staff()) and organization_id = (select private.current_org_id()));
create policy exercises_update on public.exercises
  for update to authenticated
  using (
    organization_id = (select private.current_org_id())
    and ((select private.is_owner()) or created_by = (select auth.uid()))
  )
  with check (organization_id = (select private.current_org_id()));

-- Contraindicações: regras globais visíveis a todos (staff); camada da org mantida pela equipe.
create policy exercise_contraindications_select on public.exercise_contraindications
  for select to authenticated
  using ((select private.is_staff()) and (organization_id is null or organization_id = (select private.current_org_id())));
create policy exercise_contraindications_insert on public.exercise_contraindications
  for insert to authenticated
  with check ((select private.is_staff()) and organization_id = (select private.current_org_id()));
create policy exercise_contraindications_update on public.exercise_contraindications
  for update to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
create policy exercise_contraindications_delete on public.exercise_contraindications
  for delete to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()));

-- Planos e estrutura: leitura por quem acessa o plano; escrita só via RPC.
create policy training_plans_select on public.training_plans
  for select to authenticated
  using (private.can_access_plan(id));
create policy plan_workouts_select on public.plan_workouts
  for select to authenticated
  using (private.can_access_plan(plan_id));
create policy plan_workout_items_select on public.plan_workout_items
  for select to authenticated
  using (exists (select 1 from public.plan_workouts w where w.id = workout_id and private.can_access_plan(w.plan_id)));
create policy plan_item_sets_select on public.plan_item_sets
  for select to authenticated
  using (exists (
    select 1 from public.plan_workout_items i
    join public.plan_workouts w on w.id = i.workout_id
    where i.id = item_id and private.can_access_plan(w.plan_id)
  ));

grant select on
  public.health_conditions, public.special_group_conditions, public.exercises, public.exercise_contraindications,
  public.training_plans, public.plan_workouts, public.plan_workout_items, public.plan_item_sets
to authenticated;
-- INSERT só nas colunas de conteúdo: created_by vem sempre de auth.uid() (default), nunca do cliente.
grant insert (organization_id, name, description), update (name, description, archived_at)
  on public.health_conditions to authenticated;
grant insert, delete on public.special_group_conditions to authenticated;
grant insert (organization_id, name, muscle_groups, equipment, instructions, video_url, source_exercise_id),
  update (name, muscle_groups, equipment, instructions, video_url, archived_at)
  on public.exercises to authenticated;
grant insert (organization_id, exercise_id, condition_id, level, note), update (level, note), delete
  on public.exercise_contraindications to authenticated;

-- Defesa em profundidade (padrão do projeto).
revoke execute on function
  private.assert_condition_scope(uuid, uuid),
  private.validate_contraindication_scope(),
  private.validate_group_condition_scope(),
  private.health_conditions_archive_guard(),
  private.sync_student_plan_end(),
  private.can_access_plan(uuid)
from public, anon;
