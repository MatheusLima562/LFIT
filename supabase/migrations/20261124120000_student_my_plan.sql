-- Sprint edição rápida, PARTE 0: Perfil do app do aluno com dois blocos — "Treino atual" e "Plano".
--
-- * "Treino atual": o plano de TREINO ativo (nome e "válido até"). Nunca "vence" para o treino.
-- * "Plano": campos NOVOS no cadastro do aluno — ciclo de cobrança (`billing_cycle`: monthly, quarterly, semiannual,
--   annual) e valor (`plan_amount_cents`) —, editáveis só pela equipe com acesso ao aluno (`set_student_billing`) e na
--   importação (colunas opcionais). Mais o PRÓXIMO pagamento pendente (valor e data): o "vence em N dias / vence hoje /
--   vencido há N dias" é só do pagamento.
-- * `get_my_plan_summary`: só o próprio aluno (sessão dele, acesso ativo); nunca histórico de pagamentos nem outro aluno.
-- * Datas no fuso da conta (private.today_br lê o fuso de quem chama).

-- 1) Cadastro: ciclo de cobrança e valor ------------------------------------------------------------------------------
alter table public.students
  add column billing_cycle text check (billing_cycle in ('monthly', 'quarterly', 'semiannual', 'annual')),
  add column plan_amount_cents integer check (plan_amount_cents between 1 and 100000000);
revoke update (billing_cycle, plan_amount_cents) on public.students from authenticated;

-- Equipe com acesso ao aluno (mesma regra do cadastro). Nulos limpam. Sem mudança → nada é gravado nem auditado.
create function public.set_student_billing(p_student_id uuid, p_cycle text, p_amount_cents integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  s public.students := private.lock_accessible_student(p_student_id);
  v_cycle text := nullif(trim(coalesce(p_cycle, '')), '');
begin
  perform private.assert_org_writable(v_org);
  if v_cycle is not null and v_cycle not in ('monthly', 'quarterly', 'semiannual', 'annual') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'billing_cycle';
  end if;
  if p_amount_cents is not null and (p_amount_cents < 1 or p_amount_cents > 100000000) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'plan_amount';
  end if;
  if s.billing_cycle is not distinct from v_cycle and s.plan_amount_cents is not distinct from p_amount_cents then
    return;
  end if;
  update public.students set billing_cycle = v_cycle, plan_amount_cents = p_amount_cents, updated_at = now() where id = s.id;
  perform private.audit(s.organization_id, 'student.billing_updated', 'student', s.id,
    jsonb_build_object('billing_cycle', v_cycle, 'has_amount', p_amount_cents is not null));
end;
$$;

-- 2) Importação: as duas colunas (opcionais) ---------------------------------------------------------------------------
-- Mesma função de 20261119130000 + ciclo e valor (validados pelas checagens da tabela; inválido → INVALID_INPUT na linha).
create or replace function private.import_one_student(p_org uuid, p_batch uuid, p_row jsonb)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.students;
  v_status text := coalesce(nullif(p_row ->> 'status', ''), 'active');
begin
  if v_status not in ('active', 'inactive') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'status';
  end if;

  r := jsonb_populate_record(null::public.students, private.student_input(p_row));
  r := private.normalize_student(r);
  r.id := gen_random_uuid();
  r.organization_id := p_org;
  r.user_id := null; -- pré-cadastro: sem login
  r.status := v_status::public.student_status;
  r.source := 'import';
  r.import_batch_id := p_batch;
  r.block_if_overdue := coalesce(r.block_if_overdue, false);
  r.health_data_consent_at := null;
  r.modality := coalesce(nullif(p_row ->> 'modality', ''), 'consultoria');
  r.billing_cycle := nullif(p_row ->> 'billing_cycle', '');
  r.plan_amount_cents := nullif(p_row ->> 'plan_amount_cents', '')::integer;
  r.created_at := now();
  r.updated_at := now();
  r.deleted_at := null;
  r.deleted_by := null;

  perform private.assert_trainer_in_org(p_org, r.trainer_id);
  if private.occupies_seat(r) then
    perform private.assert_seat_available(p_org);
  end if;

  update public.organization_counters
  set last_enrollment_number = last_enrollment_number + 1
  where organization_id = p_org
  returning last_enrollment_number into r.enrollment_number;

  insert into public.students values (r.*);

  perform private.audit(p_org, 'student.created', 'student', r.id, jsonb_build_object(
    'enrollment_number', r.enrollment_number,
    'source', r.source,
    'import_batch_id', p_batch,
    'health_data', false
  ));
  return r;
end;
$$;

-- p_rows: [{ "row", "first_name", "last_name", "email", "whatsapp_e164", "birth_date", "notes", "modality", "status",
--            "billing_cycle", "plan_amount_cents" }, ...] — mesma função de 20261119130000 + as duas colunas.
create or replace function public.import_students(p_batch_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_trainer uuid := case when private.current_user_role() = 'trainer' then (select auth.uid()) end;
  b public.import_batches;
  v_item jsonb;
  v_row integer;
  v_data jsonb;
  v_student public.students;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_rejected integer := 0;
  v_code text;
  v_constraint text;
  v_value text;
  v_max integer;
begin
  if p_batch_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'rows';
  end if;
  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'batch_size';
  end if;

  perform pg_advisory_xact_lock(hashtext('lfit.import_students'), hashtext(v_org::text));

  b := private.lock_open_import_batch(p_batch_id);
  if b.rows_sent + jsonb_array_length(p_rows) > 2000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'batch_total';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_row := case when jsonb_typeof(v_item -> 'row') = 'number' then (v_item ->> 'row')::integer end;
    begin
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'INVALID_INPUT' using errcode = 'P0001';
      end if;
      foreach v_value in array array['first_name', 'last_name', 'email', 'whatsapp_e164', 'birth_date', 'modality', 'status', 'billing_cycle', 'plan_amount_cents'] loop
        v_max := case v_value when 'email' then 254 else 120 end;
        if char_length(coalesce(v_item ->> v_value, '')) > v_max then
          raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'cell_too_long';
        end if;
      end loop;
      if char_length(coalesce(v_item ->> 'notes', '')) > 2000 then
        raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'cell_too_long';
      end if;

      -- Só os campos aceitos; trainer_id nunca vem do arquivo.
      v_data := jsonb_strip_nulls(jsonb_build_object(
        'first_name', v_item ->> 'first_name',
        'last_name', v_item ->> 'last_name',
        'email', v_item ->> 'email',
        'whatsapp_e164', nullif(v_item ->> 'whatsapp_e164', ''),
        'birth_date', nullif(v_item ->> 'birth_date', ''),
        'notes', nullif(v_item ->> 'notes', ''),
        'modality', nullif(v_item ->> 'modality', ''),
        'status', nullif(v_item ->> 'status', ''),
        'billing_cycle', nullif(v_item ->> 'billing_cycle', ''),
        'plan_amount_cents', nullif(v_item ->> 'plan_amount_cents', ''),
        'trainer_id', v_trainer
      ));
      v_student := private.import_one_student(v_org, b.id, v_data);
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_row, 'ok', true, 'student_id', v_student.id, 'enrollment_number', v_student.enrollment_number
      ));
    exception
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        v_rejected := v_rejected + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'row', v_row, 'ok', false,
          'error', case when v_constraint = 'students_org_email_unique' then 'DUPLICATE_EMAIL' else 'INVALID_INPUT' end
        ));
      when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
        or string_data_right_truncation or not_null_violation or numeric_value_out_of_range then
        v_rejected := v_rejected + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_row, 'ok', false, 'error', 'INVALID_INPUT'));
      when others then
        v_code := case
          when sqlerrm in ('PLAN_LIMIT_REACHED', 'INVALID_INPUT', 'INVALID_TRAINER') then sqlerrm
          else 'IMPORT_ROW_FAILED'
        end;
        v_rejected := v_rejected + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_row, 'ok', false, 'error', v_code));
    end;
  end loop;

  update public.import_batches set
    rows_sent = rows_sent + jsonb_array_length(p_rows),
    created_count = created_count + v_created,
    rejected_count = rejected_count + v_rejected
  where id = b.id;

  perform private.audit(v_org, 'students.imported', 'import_batch', b.id, jsonb_build_object(
    'rows', jsonb_array_length(p_rows), 'created', v_created
  ));

  return jsonb_build_object('created', v_created, 'results', v_results);
end;
$$;

-- 3) Perfil do aluno: dois blocos ---------------------------------------------------------------------------------------
-- { today, training: {name, starts_on, valid_until, no_end} | null,
--   billing: {cycle, amount_cents} | null, next_payment: {amount_cents, due_date} | null }  — null se não houver nada.
create function public.get_my_plan_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
  p public.training_plans;
  v_pay record;
  v_training jsonb;
  v_billing jsonb;
  v_next jsonb;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.student_effective_status(s) <> 'active' then
    return null;
  end if;

  select * into p from public.training_plans tp
  where tp.student_id = s.id and tp.status = 'active'
  order by tp.starts_on desc nulls last, tp.activated_at desc nulls last
  limit 1;
  if found then
    v_training := jsonb_build_object(
      'name', p.name, 'starts_on', p.starts_on,
      'valid_until', case when p.no_end then null else p.ends_on end, 'no_end', p.no_end
    );
  end if;

  if s.billing_cycle is not null then
    v_billing := jsonb_build_object('cycle', s.billing_cycle, 'amount_cents', s.plan_amount_cents);
  end if;

  select pm.amount_cents, pm.due_date into v_pay
  from public.payments pm
  where pm.student_id = s.id and pm.status = 'pending'
  order by pm.due_date, pm.id
  limit 1;
  if v_pay.due_date is not null then
    v_next := jsonb_build_object('amount_cents', v_pay.amount_cents, 'due_date', v_pay.due_date);
  end if;

  if v_training is null and v_billing is null and v_next is null then
    return null;
  end if;
  return jsonb_build_object('today', private.today_br(), 'training', v_training, 'billing', v_billing, 'next_payment', v_next);
end;
$$;

revoke execute on function public.get_my_plan_summary(), public.set_student_billing(uuid, text, integer) from public, anon;
grant execute on function public.get_my_plan_summary(), public.set_student_billing(uuid, text, integer) to authenticated;
