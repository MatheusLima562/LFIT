-- Sprint edição rápida, PARTE A: edição rápida da prescrição (sem IA, todos os planos).
--
-- * Um único ponto de escrita: `apply_prescription_changes` (edição rápida +/−, sugestão "Atualizar prescrição para X?",
--   progressão em lote e — PARTE B — as propostas da IA aceitas pelo personal). Cada mudança leva o valor ANTIGO
--   esperado: se o item mudou desde que a tela leu, nada é gravado (PRESCRIPTION_CHANGED). Nunca atualiza sozinho.
-- * Campos editáveis: carga (`load_value`, na unidade do item), séries (`sets`) e repetições (`quantity_min`/`quantity_max`,
--   só itens em repetições). Itens com séries detalhadas (`plan_item_sets`) ou carga em texto ficam para o montador.
-- * Só planos de ALUNO (não modelos), não arquivados, de quem pode editar o plano (`private.lock_editable_plan`).
-- * Histórico (`prescription_changes`) com cópia própria (treino, exercício, antes → depois, quem, quando, origem) — o
--   montador recria os itens ao salvar o plano inteiro; o histórico sobrevive e o desfazer avisa se o item sumiu
--   (PRESCRIPTION_ITEM_GONE) ou mudou depois (PRESCRIPTION_CHANGED).
-- * Passo da carga por conta: `organizations.load_step` (padrão 2,5, na unidade do item), só o personal muda.

-- 1) Passo da carga ---------------------------------------------------------------------------------------------------
alter table public.organizations
  add column load_step numeric(5, 2) not null default 2.5 check (load_step between 0.25 and 20);
revoke update (load_step) on public.organizations from authenticated;

create function public.set_load_step(p_step numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
begin
  perform private.assert_org_writable(v_org);
  if p_step is null or p_step < 0.25 or p_step > 20 or (p_step * 100) <> trunc(p_step * 100) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'load_step';
  end if;
  update public.organizations set load_step = p_step, updated_at = now() where id = v_org;
  perform private.audit(v_org, 'organization.load_step_updated', 'organization', v_org, jsonb_build_object('load_step', p_step));
end;
$$;

-- 2) Histórico ---------------------------------------------------------------------------------------------------------
create table public.prescription_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id uuid not null,
  student_id uuid not null references public.students (id) on delete cascade,
  plan_id uuid references public.training_plans (id) on delete set null,
  workout_id uuid references public.plan_workouts (id) on delete set null,
  item_id uuid references public.plan_workout_items (id) on delete set null,
  workout_label text not null,
  exercise_name text not null,
  field text not null check (field in ('load_value', 'sets', 'quantity_min', 'quantity_max')),
  old_value numeric(8, 2),
  new_value numeric(8, 2),
  unit text,
  source text not null check (source in ('quick', 'suggestion', 'bulk', 'ai', 'undo')),
  session_id uuid references public.workout_sessions (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references auth.users (id) on delete set null,
  undo_batch_id uuid
);
create index prescription_changes_student_idx on public.prescription_changes (student_id, created_at desc);
create index prescription_changes_batch_idx on public.prescription_changes (batch_id);
create index prescription_changes_org_idx on public.prescription_changes (organization_id);

alter table public.prescription_changes enable row level security;
revoke all on public.prescription_changes from public, anon, authenticated;
grant select on public.prescription_changes to authenticated;
create policy prescription_changes_select on public.prescription_changes for select to authenticated
  using (organization_id = private.current_org_id() and private.is_staff() and private.can_access_student(student_id));
create trigger org_writable before insert or update or delete on public.prescription_changes
  for each row execute function private.enforce_org_writable();

-- Sugestões dispensadas ("Manter") — por sessão, item e campo; não voltam para aquela sessão.
create table public.prescription_suggestion_dismissals (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  item_id uuid not null references public.plan_workout_items (id) on delete cascade,
  field text not null check (field in ('load_value', 'sets', 'quantity_min', 'quantity_max', 'quantity')),
  dismissed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (session_id, item_id, field)
);
create index prescription_suggestion_dismissals_org_idx on public.prescription_suggestion_dismissals (organization_id);
alter table public.prescription_suggestion_dismissals enable row level security;
revoke all on public.prescription_suggestion_dismissals from public, anon, authenticated;
grant select on public.prescription_suggestion_dismissals to authenticated;
create policy prescription_suggestion_dismissals_select on public.prescription_suggestion_dismissals for select to authenticated
  using (organization_id = private.current_org_id() and private.is_staff());
create trigger org_writable before insert or update or delete on public.prescription_suggestion_dismissals
  for each row execute function private.enforce_org_writable();

-- 3) Núcleo: uma mudança num item -----------------------------------------------------------------------------------------
-- Confere permissão (plano editável de aluno, não arquivado), campo, limites e o valor antigo; grava e registra.
-- `p_new` nulo só no desfazer (volta a "sem valor"). Devolve o id do plano (para marcar como atualizado).
create function private.prescription_apply_one(
  p_item_id uuid,
  p_field text,
  p_old numeric,
  p_new numeric,
  p_unit text,
  p_source text,
  p_batch uuid,
  p_session_id uuid,
  p_allow_null boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.plan_workout_items;
  w public.plan_workouts;
  p public.training_plans;
  v_current numeric;
  v_exercise text;
  v_unit text;
begin
  select * into it from public.plan_workout_items where id = p_item_id for update;
  if not found then
    raise exception 'PRESCRIPTION_ITEM_GONE' using errcode = 'P0002';
  end if;
  select * into w from public.plan_workouts where id = it.workout_id;
  p := private.lock_editable_plan(w.plan_id);
  if p.student_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'not_student_plan';
  end if;
  if p.status = 'archived' then
    raise exception 'PLAN_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_session_id is not null and not exists (
    select 1 from public.workout_sessions ws where ws.id = p_session_id and ws.student_id = p.student_id
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'session';
  end if;
  if exists (select 1 from public.plan_item_sets s where s.item_id = it.id) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'detailed_sets';
  end if;

  if p_new is null and not p_allow_null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'value';
  end if;

  if p_field = 'load_value' then
    if it.load_text is not null then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'load_text';
    end if;
    if p_new is not null and (p_new < 0 or p_new > 1000 or (p_new * 100) <> trunc(p_new * 100)) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'load_value';
    end if;
    v_current := it.load_value;
    v_unit := coalesce(it.load_unit::text, p_unit, 'kg');
    if v_unit not in ('kg', 'lb') then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'load_unit';
    end if;
  elsif p_field = 'sets' then
    if p_new is not null and (p_new <> trunc(p_new) or p_new < 1 or p_new > 20) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'sets';
    end if;
    v_current := it.sets;
    v_unit := 'sets';
  elsif p_field in ('quantity_min', 'quantity_max') then
    if it.quantity_unit <> 'reps' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'quantity_unit';
    end if;
    if p_new is not null and (p_new <> trunc(p_new) or p_new < 1 or p_new > 300) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'quantity';
    end if;
    if p_field = 'quantity_min' and p_new is null then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'quantity';
    end if;
    v_current := case when p_field = 'quantity_min' then it.quantity_min else it.quantity_max end;
    v_unit := 'reps';
  else
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'field';
  end if;

  if v_current is distinct from p_old then
    raise exception 'PRESCRIPTION_CHANGED' using errcode = 'P0001', detail = p_item_id::text;
  end if;
  if v_current is not distinct from p_new then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'no_change';
  end if;

  update public.plan_workout_items set
    load_value = case when p_field = 'load_value' then p_new else load_value end,
    load_unit = case when p_field = 'load_value' then v_unit::public.load_unit else load_unit end,
    sets = case when p_field = 'sets' then p_new::integer else sets end,
    quantity_min = case when p_field = 'quantity_min' then p_new::integer else quantity_min end,
    quantity_max = case when p_field = 'quantity_max' then p_new::integer else quantity_max end
  where id = it.id;

  select e.name into v_exercise from public.exercises e where e.id = it.exercise_id;
  insert into public.prescription_changes (
    organization_id, batch_id, student_id, plan_id, workout_id, item_id, workout_label, exercise_name,
    field, old_value, new_value, unit, source, session_id, actor_id
  ) values (
    it.organization_id, p_batch, p.student_id, p.id, w.id, it.id, w.label, coalesce(v_exercise, '—'),
    p_field, v_current, p_new, v_unit, p_source, p_session_id, (select auth.uid())
  );
  return p.id;
end;
$$;

-- Faixa de repetições coerente depois de um lote (máximo ≥ mínimo).
create function private.prescription_check_ranges(p_items uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.plan_workout_items i
    where i.id = any (p_items) and i.quantity_max is not null and i.quantity_min is not null and i.quantity_max < i.quantity_min
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'quantity_range';
  end if;
end;
$$;

-- 4) RPCs ----------------------------------------------------------------------------------------------------------------
-- p_changes: [{item_id, field, old, new, unit?}] (1–200, sem repetir item+campo). Tudo ou nada.
create function public.apply_prescription_changes(p_changes jsonb, p_source text, p_session_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_batch uuid := gen_random_uuid();
  c jsonb;
  v_item uuid;
  v_plan uuid;
  v_plans uuid[] := '{}';
  v_items uuid[] := '{}';
  v_keys text[] := '{}';
  v_key text;
  v_n integer := 0;
begin
  perform private.assert_org_writable(v_org);
  if p_source is null or p_source not in ('quick', 'suggestion', 'bulk', 'ai') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'source';
  end if;
  if p_session_id is not null and p_source <> 'suggestion' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'session';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) not between 1 and 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'changes';
  end if;

  for c in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(c) <> 'object' or jsonb_typeof(c -> 'new') <> 'number'
       or (c ? 'old' and jsonb_typeof(c -> 'old') not in ('number', 'null')) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'change';
    end if;
    begin
      v_item := (c ->> 'item_id')::uuid;
    exception when others then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'item_id';
    end;
    v_key := v_item::text || ':' || coalesce(c ->> 'field', '');
    if v_key = any (v_keys) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'duplicate';
    end if;
    v_keys := v_keys || v_key;
    -- Item de outra organização = "não existe" (RLS + checagem do plano editável).
    if not exists (select 1 from public.plan_workout_items i where i.id = v_item and i.organization_id = v_org) then
      raise exception 'PRESCRIPTION_ITEM_GONE' using errcode = 'P0002';
    end if;
    v_plan := private.prescription_apply_one(
      v_item, c ->> 'field', (c ->> 'old')::numeric, (c ->> 'new')::numeric, nullif(c ->> 'unit', ''),
      p_source, v_batch, p_session_id, false
    );
    if not v_plan = any (v_plans) then
      v_plans := v_plans || v_plan;
    end if;
    if not v_item = any (v_items) then
      v_items := v_items || v_item;
    end if;
    v_n := v_n + 1;
  end loop;

  perform private.prescription_check_ranges(v_items);
  update public.training_plans set updated_at = now() where id = any (v_plans);
  perform private.audit(v_org, 'prescription.changed', 'training_plan', v_plans[1],
    jsonb_build_object('count', v_n, 'source', p_source, 'batch_id', v_batch));
  return jsonb_build_object('batch_id', v_batch, 'applied', v_n);
end;
$$;

-- Desfazer um lote inteiro: só se cada item ainda existe e está com o valor que o lote gravou.
create function public.undo_prescription_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_undo uuid := gen_random_uuid();
  r public.prescription_changes;
  v_plan uuid;
  v_plans uuid[] := '{}';
  v_items uuid[] := '{}';
  v_n integer := 0;
begin
  perform private.assert_org_writable(v_org);
  if not exists (
    select 1 from public.prescription_changes pc
    where pc.batch_id = p_batch_id and pc.organization_id = v_org and private.can_access_student(pc.student_id)
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.prescription_changes pc where pc.batch_id = p_batch_id and pc.undone_at is not null) then
    raise exception 'ALREADY_UNDONE' using errcode = 'P0001';
  end if;

  for r in
    select * from public.prescription_changes pc where pc.batch_id = p_batch_id order by pc.created_at, pc.id for update
  loop
    if r.item_id is null then
      raise exception 'PRESCRIPTION_ITEM_GONE' using errcode = 'P0002';
    end if;
    v_plan := private.prescription_apply_one(r.item_id, r.field, r.new_value, r.old_value, r.unit, 'undo', v_undo, null, true);
    if not v_plan = any (v_plans) then
      v_plans := v_plans || v_plan;
    end if;
    if not r.item_id = any (v_items) then
      v_items := v_items || r.item_id;
    end if;
    v_n := v_n + 1;
  end loop;

  perform private.prescription_check_ranges(v_items);
  update public.prescription_changes
    set undone_at = now(), undone_by = (select auth.uid()), undo_batch_id = v_undo
    where batch_id = p_batch_id;
  update public.training_plans set updated_at = now() where id = any (v_plans);
  perform private.audit(v_org, 'prescription.undone', 'training_plan', v_plans[1],
    jsonb_build_object('count', v_n, 'batch_id', p_batch_id, 'undo_batch_id', v_undo));
  return jsonb_build_object('batch_id', v_undo, 'undone', v_n);
end;
$$;

-- Histórico do aluno, por lote (mais recente primeiro): quem, quando, origem, antes → depois, se pode desfazer.
create function public.list_prescription_changes(p_student_id uuid, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
begin
  if not private.can_access_student(p_student_id) then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(b order by b ->> 'created_at' desc)
    from (
      select jsonb_build_object(
        'batch_id', pc.batch_id,
        'created_at', min(pc.created_at),
        'source', min(pc.source),
        'actor_name', min(pr.full_name),
        'undone_at', max(pc.undone_at),
        'item_gone', bool_or(pc.item_id is null),
        'changes', jsonb_agg(jsonb_build_object(
          'workout_label', pc.workout_label, 'exercise_name', pc.exercise_name, 'field', pc.field,
          'old', pc.old_value, 'new', pc.new_value, 'unit', pc.unit
        ) order by pc.workout_label, pc.exercise_name, pc.field)
      ) as b
      from public.prescription_changes pc
      left join public.profiles pr on pr.id = pc.actor_id
      where pc.student_id = p_student_id and pc.organization_id = v_org
      group by pc.batch_id
      order by min(pc.created_at) desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Dados para "Atualizar prescrição para X?": itens do plano ATIVO do aluno + séries registradas na sessão concluída mais
-- recente de cada item (ou na sessão pedida), nos últimos 60 dias. Sem dor, sem comentário: só carga e repetições.
-- A regra da sugestão fica no cliente (`features/prescription/suggestions.ts`); aplicar passa por apply_prescription_changes.
create function public.get_prescription_review(p_student_id uuid, p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_plan public.training_plans;
begin
  if not private.can_access_student(p_student_id) then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not exists (
    select 1 from public.workout_sessions ws
    where ws.id = p_session_id and ws.student_id = p_student_id and ws.status = 'completed'
  ) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_plan from public.training_plans tp
  where tp.student_id = p_student_id and tp.status = 'active' and tp.organization_id = v_org
  order by tp.starts_on desc nulls last limit 1;
  if not found then
    return jsonb_build_object('plan_id', null, 'items', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'plan_id', v_plan.id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'workout_id', w.id, 'workout_label', w.label, 'exercise_name', e.name,
        'sets', i.sets, 'quantity_min', i.quantity_min, 'quantity_max', i.quantity_max, 'quantity_unit', i.quantity_unit,
        'load_value', i.load_value, 'load_unit', i.load_unit, 'load_text', i.load_text,
        'detailed', exists (select 1 from public.plan_item_sets st where st.item_id = i.id),
        'session_id', ls.session_id, 'session_finished_at', ls.finished_at,
        'logs', ls.logs,
        'dismissed', coalesce((
          select jsonb_agg(d.field) from public.prescription_suggestion_dismissals d
          where d.session_id = ls.session_id and d.item_id = i.id
        ), '[]'::jsonb)
      ) order by w.position, i.position)
      from public.plan_workouts w
      join public.plan_workout_items i on i.workout_id = w.id
      left join public.exercises e on e.id = i.exercise_id
      join lateral (
        select ws.id as session_id, ws.finished_at,
          (select jsonb_agg(jsonb_build_object('load_value', sl.load_value, 'load_unit', sl.load_unit, 'quantity_value', sl.quantity_value)
                            order by sl.set_index)
           from public.session_set_logs sl where sl.item_log_id = il.id) as logs
        from public.session_item_logs il
        join public.workout_sessions ws on ws.id = il.session_id
        where il.item_id = i.id and not il.substitute and ws.status = 'completed'
          and ws.student_id = p_student_id
          and (p_session_id is null or ws.id = p_session_id)
          and ws.finished_at > now() - interval '60 days'
          and exists (select 1 from public.session_set_logs sl2 where sl2.item_log_id = il.id)
        order by ws.finished_at desc
        limit 1
      ) ls on true
      where w.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$;

-- "Manter" (dispensar a sugestão daquela sessão para aquele item/campo).
create function public.dismiss_prescription_suggestion(p_session_id uuid, p_item_id uuid, p_field text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_student uuid;
begin
  perform private.assert_org_writable(v_org);
  if p_field is null or p_field not in ('load_value', 'sets', 'quantity_min', 'quantity_max', 'quantity') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'field';
  end if;
  select ws.student_id into v_student from public.workout_sessions ws where ws.id = p_session_id and ws.organization_id = v_org;
  if v_student is null or not private.can_access_student(v_student) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.plan_workout_items i where i.id = p_item_id and i.organization_id = v_org) then
    raise exception 'PRESCRIPTION_ITEM_GONE' using errcode = 'P0002';
  end if;
  insert into public.prescription_suggestion_dismissals (organization_id, session_id, item_id, field, dismissed_by)
  values (v_org, p_session_id, p_item_id, p_field, (select auth.uid()))
  on conflict do nothing;
end;
$$;

-- 5) Permissões --------------------------------------------------------------------------------------------------------
revoke execute on function
  private.prescription_apply_one(uuid, text, numeric, numeric, text, text, uuid, uuid, boolean),
  private.prescription_check_ranges(uuid[])
from public, anon, authenticated;

revoke execute on function
  public.set_load_step(numeric), public.apply_prescription_changes(jsonb, text, uuid), public.undo_prescription_batch(uuid),
  public.list_prescription_changes(uuid, integer), public.get_prescription_review(uuid, uuid),
  public.dismiss_prescription_suggestion(uuid, uuid, text)
from public, anon;
grant execute on function
  public.set_load_step(numeric), public.apply_prescription_changes(jsonb, text, uuid), public.undo_prescription_batch(uuid),
  public.list_prescription_changes(uuid, integer), public.get_prescription_review(uuid, uuid),
  public.dismiss_prescription_suggestion(uuid, uuid, text)
to authenticated;
