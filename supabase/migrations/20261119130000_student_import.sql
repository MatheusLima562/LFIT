-- =============================================================================
-- Importação genérica de alunos (rota /importar; sprint "Ao vivo + Importação", 19/11/2026).
--
-- * O arquivo é lido NO CLIENTE e nunca guardado; o cliente envia só linhas já validadas, em lotes (até 200 por chamada).
-- * `import_students` aplica as MESMAS regras do cadastro manual (`private.insert_student`): campos obrigatórios
--   (nome, sobrenome, e-mail), e-mail único na organização, professor da organização, limite do plano para quem ocupa
--   vaga, matrícula sequencial e auditoria `student.created`. Diferenças: origem `import`, status inicial ativo OU
--   inativo (inativo não ocupa vaga, como no resto do sistema) e modalidade.
-- * Professor importa para si (trainer_id = ele, como em `create_student`); owner importa sem professor designado.
-- * Nada de grupo especial/dado de saúde na importação (a planilha-modelo não tem esse campo).
-- * Cada linha roda num bloco próprio: erro numa linha não desfaz as outras. A resposta traz só o número da linha e o
--   código do erro — nunca o conteúdo (observações podem ter dado sensível). Um registro de auditoria por lote, só
--   com contagens.
-- Aditiva: só acrescenta o valor 'import' ao enum de origem e funções novas.
-- =============================================================================

alter type public.student_source add value if not exists 'import';

create function private.import_one_student(p_org uuid, p_row jsonb)
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
  r.user_id := null;
  r.status := v_status::public.student_status;
  r.source := 'import';
  r.block_if_overdue := coalesce(r.block_if_overdue, false);
  r.health_data_consent_at := null;
  r.modality := coalesce(nullif(p_row ->> 'modality', ''), 'consultoria');
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
    'health_data', false
  ));
  return r;
end;
$$;

revoke execute on function private.import_one_student(uuid, jsonb) from public, anon, authenticated;

-- p_batch_id: gerado no cliente por importação (o mesmo em todos os lotes), só para agrupar a auditoria.
-- p_rows: [{ "row": <nº da linha no arquivo>, "first_name", "last_name", "email", "whatsapp_e164", "birth_date",
--            "notes", "modality", "status" }, ...]
create function public.import_students(p_batch_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_trainer uuid := case when private.current_user_role() = 'trainer' then (select auth.uid()) end;
  v_item jsonb;
  v_row integer;
  v_data jsonb;
  v_student public.students;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_code text;
begin
  if p_batch_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'rows';
  end if;
  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'batch_size';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_row := case when jsonb_typeof(v_item -> 'row') = 'number' then (v_item ->> 'row')::integer end;
    begin
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'INVALID_INPUT' using errcode = 'P0001';
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
        'trainer_id', v_trainer
      ));
      v_student := private.import_one_student(v_org, v_data);
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_row, 'ok', true, 'student_id', v_student.id, 'enrollment_number', v_student.enrollment_number
      ));
    exception
      when unique_violation then
        v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_row, 'ok', false, 'error', 'DUPLICATE_EMAIL'));
      when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
        or string_data_right_truncation or not_null_violation then
        v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_row, 'ok', false, 'error', 'INVALID_INPUT'));
      when others then
        -- Só códigos conhecidos saem; qualquer outra mensagem vira genérico (nunca o conteúdo da linha).
        v_code := case
          when sqlerrm in ('PLAN_LIMIT_REACHED', 'INVALID_INPUT', 'INVALID_TRAINER') then sqlerrm
          else 'IMPORT_ROW_FAILED'
        end;
        v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_row, 'ok', false, 'error', v_code));
    end;
  end loop;

  perform private.audit(v_org, 'students.imported', 'organization', v_org, jsonb_build_object(
    'batch_id', p_batch_id, 'rows', jsonb_array_length(p_rows), 'created', v_created
  ));

  return jsonb_build_object('created', v_created, 'results', v_results);
end;
$$;

revoke execute on function public.import_students(uuid, jsonb) from public, anon;
grant execute on function public.import_students(uuid, jsonb) to authenticated;
