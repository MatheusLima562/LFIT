-- =============================================================================
-- 2.8 — Listas de Métodos e Objetivos por organização (só o owner gerencia) e
-- valores padrão por exercício (camada global + camada da organização).
-- =============================================================================

create table public.training_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  position integer not null default 0 check (position >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index training_methods_name_unique on public.training_methods (organization_id, lower(private.immutable_unaccent(name)));

create table public.training_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  position integer not null default 0 check (position >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index training_objectives_name_unique on public.training_objectives (organization_id, lower(private.immutable_unaccent(name)));

-- Valores iniciais de toda organização (novas e existentes).
create function private.seed_training_lists(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.training_methods (organization_id, name, position)
  select p_org, name, ord - 1 from unnest(array[
    'Tradicional', 'Drop-set', 'Rest-pause', 'Cluster', 'Isométrico', 'Excêntrico enfatizado',
    'Pré-exaustão', 'Balístico', 'FNP', 'Alongamento ativo', 'Alongamento passivo'
  ]) with ordinality as t(name, ord)
  on conflict do nothing;
  insert into public.training_objectives (organization_id, name, position)
  select p_org, name, ord - 1 from unnest(array[
    'Aquecimento', 'Ativação', 'Força', 'Hipertrofia', 'Resistência', 'Mobilidade', 'Flexibilidade',
    'Correção postural', 'Pré-treino', 'Pós-treino'
  ]) with ordinality as t(name, ord)
  on conflict do nothing;
$$;

create function private.organizations_seed_lists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_training_lists(new.id);
  return new;
end;
$$;
create trigger organizations_seed_training_lists after insert on public.organizations
for each row execute function private.organizations_seed_lists();

select private.seed_training_lists(id) from public.organizations;

alter table public.training_methods enable row level security;
alter table public.training_objectives enable row level security;
create policy training_methods_select on public.training_methods for select to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()));
create policy training_methods_insert on public.training_methods for insert to authenticated
  with check ((select private.is_owner()) and organization_id = (select private.current_org_id()));
create policy training_methods_update on public.training_methods for update to authenticated
  using ((select private.is_owner()) and organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
create policy training_objectives_select on public.training_objectives for select to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()));
create policy training_objectives_insert on public.training_objectives for insert to authenticated
  with check ((select private.is_owner()) and organization_id = (select private.current_org_id()));
create policy training_objectives_update on public.training_objectives for update to authenticated
  using ((select private.is_owner()) and organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
-- Sem DELETE: itens usados em planos são arquivados.
grant select, insert (organization_id, name, position), update (name, position, archived_at)
  on public.training_methods, public.training_objectives to authenticated;

-- Método e objetivo no item do plano (da própria organização).
alter table public.plan_workout_items
  add column method_id uuid,
  add column objective_id uuid,
  add constraint plan_workout_items_method_fkey foreign key (method_id, organization_id)
    references public.training_methods (id, organization_id) on delete set null (method_id),
  add constraint plan_workout_items_objective_fkey foreign key (objective_id, organization_id)
    references public.training_objectives (id, organization_id) on delete set null (objective_id);
create index plan_workout_items_method_idx on public.plan_workout_items (method_id, organization_id);
create index plan_workout_items_objective_idx on public.plan_workout_items (objective_id, organization_id);

-- -----------------------------------------------------------------------------
-- Valores padrão por exercício ("+ Rápido" no montador)
-- -----------------------------------------------------------------------------
create table public.exercise_defaults (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  sets integer check (sets between 1 and 20),
  quantity_unit public.quantity_unit not null default 'reps',
  quantity_min numeric(8, 2),
  quantity_max numeric(8, 2),
  rest_min integer check (rest_min between 0 and 900),
  rest_max integer check (rest_max between 0 and 900),
  updated_at timestamptz not null default now(),
  check (
    case
      when quantity_unit = 'failure' then quantity_min is null and quantity_max is null
      else (quantity_min is null or quantity_min >= 0)
        and (quantity_max is null or (quantity_min is not null and quantity_max >= quantity_min))
    end
  ),
  check (rest_max is null or (rest_min is not null and rest_max >= rest_min))
);
create unique index exercise_defaults_scope_unique on public.exercise_defaults (
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), exercise_id
);
create index exercise_defaults_exercise_idx on public.exercise_defaults (exercise_id);

-- Camada da org só em exercício global ou da própria org; camada global só com exercício global.
create function private.validate_exercise_defaults_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ex_org uuid;
begin
  select organization_id into v_ex_org from public.exercises where id = new.exercise_id;
  if (new.organization_id is null and v_ex_org is not null)
     or (new.organization_id is not null and v_ex_org is not null and v_ex_org <> new.organization_id) then
    raise exception 'EXERCISE_NOT_FOUND' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger exercise_defaults_scope before insert or update on public.exercise_defaults
for each row execute function private.validate_exercise_defaults_scope();

alter table public.exercise_defaults enable row level security;
create policy exercise_defaults_select on public.exercise_defaults for select to authenticated
  using ((select private.is_staff()) and (organization_id is null or organization_id = (select private.current_org_id())));
-- Escrita na camada da org: exercício global → qualquer staff; exercício próprio → owner ou autor.
create policy exercise_defaults_write on public.exercise_defaults for all to authenticated
  using (
    organization_id = (select private.current_org_id()) and (select private.is_staff())
    and exists (
      select 1 from public.exercises e where e.id = exercise_id
        and (e.organization_id is null or (select private.is_owner()) or e.created_by = (select auth.uid()))
    )
  )
  with check (
    organization_id = (select private.current_org_id()) and (select private.is_staff())
    and exists (
      select 1 from public.exercises e where e.id = exercise_id
        and (e.organization_id is null or (select private.is_owner()) or e.created_by = (select auth.uid()))
    )
  );
grant select, delete, insert (organization_id, exercise_id, sets, quantity_unit, quantity_min, quantity_max, rest_min, rest_max),
  update (sets, quantity_unit, quantity_min, quantity_max, rest_min, rest_max)
  on public.exercise_defaults to authenticated;

-- Padrões globais: 3 × 10–12 com 60 s; pranchas e similares em segundos.
insert into public.exercise_defaults (organization_id, exercise_id, sets, quantity_unit, quantity_min, quantity_max, rest_min, rest_max)
select null, e.id, 3,
  case when e.name in ('Prancha frontal', 'Prancha lateral') then 'seconds'::public.quantity_unit else 'reps' end,
  case when e.name in ('Prancha frontal', 'Prancha lateral') then 20 when e.name = 'Burpee' then 8 else 10 end,
  case when e.name in ('Prancha frontal', 'Prancha lateral') then 40 when e.name = 'Burpee' then 12 else 12 end,
  60, 90
from public.exercises e
where e.organization_id is null;

revoke execute on function
  private.seed_training_lists(uuid),
  private.organizations_seed_lists(),
  private.validate_exercise_defaults_scope()
from public, anon, authenticated;
