-- =============================================================================
-- 2.8 — Plano: sem data de expiração, sessões previstas, professor do plano e agendamento.
-- =============================================================================

alter table public.training_plans
  add column no_end boolean not null default false,
  add column planned_sessions integer check (planned_sessions between 1 and 500),
  add column trainer_id uuid,
  add constraint training_plans_trainer_fkey foreign key (trainer_id, organization_id)
    references public.profiles (id, organization_id) on delete set null (trainer_id),
  add constraint training_plans_no_end_check check (not no_end or ends_on is null);

-- Ativo/agendado: aluno + início + (fim ou "sem data de expiração"). Substitui a regra antiga (fim obrigatório).
alter table public.training_plans drop constraint training_plans_check1;
alter table public.training_plans add constraint training_plans_active_period_check check (
  status not in ('active', 'scheduled')
  or (student_id is not null and starts_on is not null and (ends_on is not null or no_end))
);

create index training_plans_trainer_idx on public.training_plans (trainer_id, organization_id);
create index training_plans_scheduled_idx on public.training_plans (starts_on) where status = 'scheduled';

-- Professor do plano: padrão = professor responsável pelo aluno (planos existentes).
update public.training_plans p set trainer_id = s.trainer_id
from public.students s
where s.id = p.student_id and p.trainer_id is null and s.trainer_id is not null;

-- Sem data de expiração → 'infinity': fora de "A vencer/Vencidos" e diferente de "Sem treino" (nulo).
create or replace function private.sync_student_plan_end()
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
    select case when p.no_end then 'infinity'::timestamptz else (p.ends_on::text || 'T23:59:59-03:00')::timestamptz end
    from public.training_plans p
    where p.student_id = v_student and p.status = 'active'
  )
  where s.id = v_student;
  return null;
end;
$$;

drop trigger training_plans_sync_student on public.training_plans;
create trigger training_plans_sync_student
after insert or update of status, ends_on, no_end, student_id or delete on public.training_plans
for each row execute function private.sync_student_plan_end();

-- Acesso ao plano: modelo = staff da org; plano de aluno = quem acessa o aluno OU o professor do plano.
create or replace function private.can_access_plan(p_plan_id uuid)
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
      and (
        p.student_id is null
        or private.can_access_student(p.student_id)
        or p.trainer_id = (select auth.uid())
      )
  )
$$;

create or replace function private.lock_editable_plan(p_plan_id uuid)
returns public.training_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.training_plans;
begin
  select * into p from public.training_plans t
  where t.id = p_plan_id
    and t.organization_id = private.current_org_id()
    and private.is_staff()
    and (
      (t.student_id is null and (private.is_owner() or t.created_by = (select auth.uid())))
      or (t.student_id is not null and (private.can_access_student(t.student_id) or t.trainer_id = (select auth.uid())))
    )
  for update;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

-- Ativar: início futuro → agendado (sem sobrepor outro agendado); senão ativo (arquiva o anterior).
-- Devolve o status resultante.
drop function public.activate_plan(uuid);
create function public.activate_plan(p_plan_id uuid)
returns public.plan_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.training_plans := private.lock_editable_plan(p_plan_id);
  v_status public.plan_status;
begin
  if p.student_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'Modelos não são ativados';
  end if;
  if p.status = 'archived' then
    raise exception 'PLAN_ARCHIVED' using errcode = 'P0001';
  end if;
  if p.starts_on is null or (p.ends_on is null and not p.no_end) then
    raise exception 'PLAN_DATES_REQUIRED' using errcode = 'P0001';
  end if;

  if p.starts_on > private.today_br() then
    if exists (
      select 1 from public.training_plans o
      where o.student_id = p.student_id and o.status = 'scheduled' and o.id <> p.id
        and daterange(o.starts_on, coalesce(o.ends_on, 'infinity'::date), '[]')
            && daterange(p.starts_on, coalesce(p.ends_on, 'infinity'::date), '[]')
    ) then
      raise exception 'PLAN_OVERLAP' using errcode = 'P0001';
    end if;
    v_status := 'scheduled';
    update public.training_plans set status = 'scheduled', archived_at = null where id = p.id;
  else
    v_status := 'active';
    update public.training_plans set status = 'archived', archived_at = now()
    where student_id = p.student_id and status = 'active' and id <> p.id;
    update public.training_plans set status = 'active', activated_at = now(), archived_at = null where id = p.id;
  end if;

  perform private.audit(p.organization_id, 'plan.' || v_status::text, 'training_plan', p.id,
    jsonb_build_object('student_id', p.student_id, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'no_end', p.no_end));
  return v_status;
end;
$$;

-- Job diário: agendados cuja data chegou viram ativos (o ativo anterior é arquivado).
create function private.activate_due_plans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, student_id, organization_id from public.training_plans
    where status = 'scheduled' and starts_on <= private.today_br()
    order by starts_on, created_at
  loop
    update public.training_plans set status = 'archived', archived_at = now()
    where student_id = r.student_id and status = 'active';
    update public.training_plans set status = 'active', activated_at = now() where id = r.id;
    perform private.audit(r.organization_id, 'plan.activated_by_schedule', 'training_plan', r.id,
      jsonb_build_object('student_id', r.student_id));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Nome do aluno para quem acessa o plano (inclui o professor do plano, que não vê o cadastro).
create function public.get_plan_header(p_plan_id uuid)
returns table (student_id uuid, student_name text, trainer_id uuid, trainer_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_access_plan(p_plan_id) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
    select s.id, s.first_name || ' ' || s.last_name, pr.id, pr.full_name
    from public.training_plans p
    left join public.students s on s.id = p.student_id
    left join public.profiles pr on pr.id = p.trainer_id
    where p.id = p_plan_id;
end;
$$;

grant execute on function public.activate_plan(uuid), public.get_plan_header(uuid) to authenticated;
revoke execute on function public.activate_plan(uuid), public.get_plan_header(uuid), private.activate_due_plans() from public, anon;
revoke execute on function private.activate_due_plans() from authenticated;

-- Agendamento diário às 03:05 UTC (= 00:05 em São Paulo, sem horário de verão).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('lfit-activate-due-plans', '5 3 * * *', $cron$select private.activate_due_plans()$cron$);
