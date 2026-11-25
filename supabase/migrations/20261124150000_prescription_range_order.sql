-- Sprint edição rápida, correção achada na ETAPA 2 (20261124130000 já aplicada): faixa de repetições.
--
-- `plan_workout_items` tem a checagem imediata "máximo ≥ mínimo". Aplicar [mínimo, máximo] na ordem em que chegam
-- quebrava no meio uma mudança VÁLIDA (8–10 → 12–14: o mínimo 12 com o máximo 10 ainda antigo) e uma faixa invertida
-- vazava o erro cru do banco. Agora: dentro do mesmo lote, sobe primeiro o máximo / desce primeiro o mínimo, e qualquer
-- violação da checagem vira INVALID_INPUT (detail quantity_range). Mesma regra no desfazer.

create or replace function public.apply_prescription_changes(p_changes jsonb, p_source text, p_session_id uuid default null)
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

  -- Validação de forma antes de qualquer gravação (repetidos, tipos, item da organização).
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
    if not exists (select 1 from public.plan_workout_items i where i.id = v_item and i.organization_id = v_org) then
      raise exception 'PRESCRIPTION_ITEM_GONE' using errcode = 'P0002';
    end if;
  end loop;

  begin
    -- Ordem segura para a faixa: máximo que SOBE e mínimo que DESCE primeiro.
    for c in
      select e.value from jsonb_array_elements(p_changes) with ordinality as e(value, ord)
      order by case
        when e.value ->> 'field' = 'quantity_max' and (e.value ->> 'new')::numeric > coalesce((e.value ->> 'old')::numeric, 0) then 0
        when e.value ->> 'field' = 'quantity_min' and (e.value ->> 'new')::numeric < coalesce((e.value ->> 'old')::numeric, 0) then 0
        else 1
      end, e.ord
    loop
      v_item := (c ->> 'item_id')::uuid;
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
  exception when check_violation then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'quantity_range';
  end;

  perform private.prescription_check_ranges(v_items);
  update public.training_plans set updated_at = now() where id = any (v_plans);
  perform private.audit(v_org, 'prescription.changed', 'training_plan', v_plans[1],
    jsonb_build_object('count', v_n, 'source', p_source, 'batch_id', v_batch));
  return jsonb_build_object('batch_id', v_batch, 'applied', v_n);
end;
$$;

create or replace function public.undo_prescription_batch(p_batch_id uuid)
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

  begin
    -- Desfazer = gravar o valor antigo: mesma ordem segura (máximo que sobe / mínimo que desce primeiro).
    for r in
      select * from public.prescription_changes pc where pc.batch_id = p_batch_id
      order by case
        when pc.field = 'quantity_max' and coalesce(pc.old_value, 0) > coalesce(pc.new_value, 0) then 0
        when pc.field = 'quantity_min' and coalesce(pc.old_value, 0) < coalesce(pc.new_value, 0) then 0
        else 1
      end, pc.created_at, pc.id
      for update
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
  exception when check_violation then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'quantity_range';
  end;

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
