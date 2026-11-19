-- =============================================================================
-- Importação genérica de alunos (rota /importar; sprint "Ao vivo + Importação", 19/11/2026).
--
-- * O arquivo é lido NO CLIENTE e nunca guardado; o cliente envia só linhas já validadas, em lotes (até 200 por chamada).
-- * Antes de gravar, o professor marca a declaração (base legal + vai informar os alunos). O TEXTO fica no código
--   (messages/pt-BR.ts → importer.declaration); aqui ficam as VERSÕES aceitas. A versão e a data vão para o lote.
-- * `import_batches`: quem, quando, origem (rótulo), versão da declaração e contagens — nunca o conteúdo dos dados.
--   Alunos criados levam `students.import_batch_id`.
-- * `import_students` aplica as MESMAS regras do cadastro manual (`private.insert_student`): obrigatórios, e-mail único,
--   professor da organização, limite do plano para quem ocupa vaga, matrícula e auditoria `student.created`. Diferenças:
--   origem `import`, status inicial ativo OU inativo, modalidade e o lote. Uma importação por vez por organização
--   (advisory lock): dois lotes simultâneos não passam juntos do limite do plano.
-- * Pré-cadastro: o aluno importado nasce sem login (`user_id` nulo) e NADA é enviado (nenhum e-mail ou convite sai
--   do banco; convites são uma etapa separada).
-- * Desfazer em até 7 dias (`undo_import_batch`): arquiva (soft delete) os alunos do lote SEM atividade; os outros ficam.
-- * Professor importa para si (trainer_id = ele); owner importa sem professor designado. Sem dado de saúde.
-- * Cada linha roda num bloco próprio; a resposta traz só número da linha e código do erro — nunca o conteúdo.
-- Aditiva quanto a dados existentes: valor novo no enum de origem, coluna nova (nula) em students, tabelas e funções.
-- =============================================================================

alter type public.student_source add value if not exists 'import';

-- 1) Versões aceitas da declaração (texto no código) ------------------------------------------------------------------
create table private.import_declarations (
  version text primary key check (char_length(version) between 1 and 40),
  valid_from timestamptz not null default now(),
  retired_at timestamptz
);
insert into private.import_declarations (version) values ('2026-11-19.1');
revoke all on private.import_declarations from public, anon, authenticated;

-- 2) Lotes --------------------------------------------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  source_label text not null check (char_length(source_label) between 1 and 60),
  declaration_version text not null check (char_length(declaration_version) between 1 and 40),
  declared_at timestamptz not null,
  rows_expected integer not null check (rows_expected between 1 and 2000),
  rows_sent integer not null default 0 check (rows_sent between 0 and 2000), -- linhas recebidas (reenvios contam)
  created_count integer not null default 0,
  rejected_count integer not null default 0,
  undone_at timestamptz,
  undone_by uuid references public.profiles (id) on delete set null,
  archived_count integer,
  kept_count integer
);
create index import_batches_org_created_idx on public.import_batches (organization_id, created_at desc);
create index import_batches_created_by_idx on public.import_batches (created_by);
create index import_batches_undone_by_idx on public.import_batches (undone_by);

alter table public.import_batches enable row level security;
revoke all on public.import_batches from public, anon, authenticated;
grant select on public.import_batches to authenticated;
grant select, insert, update, delete on public.import_batches to service_role;
-- Owner vê os lotes da organização; professor, os próprios.
create policy import_batches_select on public.import_batches
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_staff())
    and ((select private.is_owner()) or created_by = (select auth.uid()))
  );

alter table public.students add column import_batch_id uuid references public.import_batches (id) on delete set null;
create index students_import_batch_idx on public.students (import_batch_id) where import_batch_id is not null;

-- 3) Uma linha ----------------------------------------------------------------------------------------------------------
create function private.import_one_student(p_org uuid, p_batch uuid, p_row jsonb)
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

-- Lote do chamador ainda aberto para receber linhas (24 h, não desfeito) — senão IMPORT_BATCH_NOT_FOUND.
create function private.lock_open_import_batch(p_batch_id uuid)
returns public.import_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.import_batches;
begin
  select * into b from public.import_batches
  where id = p_batch_id and organization_id = private.current_org_id() and created_by = (select auth.uid())
  for update;
  if not found or b.undone_at is not null or b.created_at < now() - interval '24 hours' then
    raise exception 'IMPORT_BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  return b;
end;
$$;

-- Atividade = qualquer sinal de uso depois da importação: login criado, cadastro editado, plano, treino, chat, recado,
-- pagamento, turma, grupo, triagem, anamnese, link de acesso, NPS. Sem nenhum deles, o desfazer pode arquivar.
create function private.student_has_activity(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    -- A importação grava created_at = updated_at (mesma transação); qualquer edição depois passa pelo gatilho
    -- students_updated_at (now() de outra transação) e deixa updated_at > created_at.
    where s.id = p_student_id and (s.user_id is not null or s.updated_at > s.created_at)
  )
  or exists (select 1 from public.training_plans x where x.student_id = p_student_id)
  or exists (select 1 from public.workout_sessions x where x.student_id = p_student_id)
  or exists (select 1 from public.chat_messages x where x.student_id = p_student_id)
  or exists (select 1 from public.chat_reads x where x.student_id = p_student_id)
  or exists (select 1 from public.trainer_announcements x where x.student_id = p_student_id)
  or exists (select 1 from public.payments x where x.student_id = p_student_id)
  or exists (select 1 from public.class_students x where x.student_id = p_student_id)
  or exists (select 1 from public.student_groups x where x.student_id = p_student_id)
  or exists (select 1 from public.student_red_flag_checks x where x.student_id = p_student_id)
  or exists (select 1 from public.anamnesis_requests x where x.student_id = p_student_id)
  or exists (select 1 from public.access_links x where x.student_id = p_student_id)
  or exists (select 1 from public.nps_prompts x where x.student_id = p_student_id)
  or exists (select 1 from public.nps_reminders x where x.student_id = p_student_id)
  or exists (select 1 from public.nps_responses x where x.student_id = p_student_id)
$$;

revoke execute on function
  private.import_one_student(uuid, uuid, jsonb),
  private.lock_open_import_batch(uuid),
  private.student_has_activity(uuid)
from public, anon, authenticated;

-- 4) RPCs ---------------------------------------------------------------------------------------------------------------
-- Abre o lote depois da declaração marcada na tela. Devolve o id do lote.
create function public.start_import_batch(p_source_label text, p_declaration_version text, p_rows_expected integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_label text := nullif(trim(p_source_label), '');
  v_id uuid;
begin
  if v_label is null or char_length(v_label) > 60 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'source_label';
  end if;
  if not exists (
    select 1 from private.import_declarations d where d.version = p_declaration_version and d.retired_at is null
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'declaration_version';
  end if;
  if p_rows_expected is null or p_rows_expected not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'rows_expected';
  end if;

  insert into public.import_batches (organization_id, created_by, source_label, declaration_version, declared_at, rows_expected)
  values (v_org, (select auth.uid()), v_label, p_declaration_version, now(), p_rows_expected)
  returning id into v_id;

  perform private.audit(v_org, 'students.import_started', 'import_batch', v_id, jsonb_build_object(
    'declaration_version', p_declaration_version, 'rows_expected', p_rows_expected
  ));
  return v_id;
end;
$$;

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

  -- Uma importação por vez por organização (até o fim desta transação): sem isso, dois lotes simultâneos liam a mesma
  -- contagem de vagas e passavam juntos do limite do plano. Chave = (classe fixa da importação, hash da organização).
  perform pg_advisory_xact_lock(hashtext('lfit.import_students'), hashtext(v_org::text));

  b := private.lock_open_import_batch(p_batch_id);
  -- Teto de 2000 linhas por lote no total (não `rows_expected`: um reenvio depois de queda de conexão manda o mesmo
  -- trecho de novo, e as linhas já gravadas voltam como DUPLICATE_EMAIL).
  if b.rows_sent + jsonb_array_length(p_rows) > 2000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'batch_total';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_row := case when jsonb_typeof(v_item -> 'row') = 'number' then (v_item ->> 'row')::integer end;
    begin
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'INVALID_INPUT' using errcode = 'P0001';
      end if;
      -- Limite por célula (o cliente já confere; aqui é a garantia): texto ≤ 2000, e-mail ≤ 254, demais ≤ 120.
      -- (O limite vai numa variável: num IF do PL/pgSQL a condição acaba no primeiro THEN, inclusive o de um CASE.)
      foreach v_value in array array['first_name', 'last_name', 'email', 'whatsapp_e164', 'birth_date', 'modality', 'status'] loop
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
        'trainer_id', v_trainer
      ));
      v_student := private.import_one_student(v_org, b.id, v_data);
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row', v_row, 'ok', true, 'student_id', v_student.id, 'enrollment_number', v_student.enrollment_number
      ));
    exception
      when unique_violation then
        -- Só o índice do e-mail vira DUPLICATE_EMAIL; qualquer outra unicidade (matrícula etc.) é INVALID_INPUT.
        get stacked diagnostics v_constraint = constraint_name;
        v_rejected := v_rejected + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'row', v_row, 'ok', false,
          'error', case when v_constraint = 'students_org_email_unique' then 'DUPLICATE_EMAIL' else 'INVALID_INPUT' end
        ));
      when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow
        or string_data_right_truncation or not_null_violation then
        v_rejected := v_rejected + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_row, 'ok', false, 'error', 'INVALID_INPUT'));
      when others then
        -- Só códigos conhecidos saem; qualquer outra mensagem vira genérico (nunca o conteúdo da linha).
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

-- Desfazer (até 7 dias): arquiva os alunos do lote sem atividade. Autor do lote ou owner.
create function public.undo_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  b public.import_batches;
  s record;
  v_archived integer := 0;
  v_kept integer := 0;
begin
  -- Mesma trava da importação: não desfaz um lote enquanto linhas dele ainda chegam.
  perform pg_advisory_xact_lock(hashtext('lfit.import_students'), hashtext(v_org::text));

  select * into b from public.import_batches
  where id = p_batch_id and organization_id = v_org
    and (private.is_owner() or created_by = (select auth.uid()))
  for update;
  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if b.undone_at is not null then
    raise exception 'IMPORT_ALREADY_UNDONE' using errcode = 'P0001';
  end if;
  if b.created_at < now() - interval '7 days' then
    raise exception 'IMPORT_UNDO_EXPIRED' using errcode = 'P0001';
  end if;

  for s in
    select st.id from public.students st
    where st.import_batch_id = b.id and st.organization_id = v_org and st.deleted_at is null
    for update
  loop
    if private.student_has_activity(s.id) then
      v_kept := v_kept + 1;
    else
      update public.students set deleted_at = now(), deleted_by = (select auth.uid()) where id = s.id;
      perform private.audit(v_org, 'student.deleted', 'student', s.id, jsonb_build_object('reason', 'import_undo', 'import_batch_id', b.id));
      v_archived := v_archived + 1;
    end if;
  end loop;

  update public.import_batches set
    undone_at = now(), undone_by = (select auth.uid()), archived_count = v_archived, kept_count = v_kept
  where id = b.id;
  perform private.audit(v_org, 'students.import_undone', 'import_batch', b.id, jsonb_build_object(
    'archived', v_archived, 'kept', v_kept
  ));
  return jsonb_build_object('archived', v_archived, 'kept', v_kept);
end;
$$;

revoke execute on function
  public.start_import_batch(text, text, integer),
  public.import_students(uuid, jsonb),
  public.undo_import_batch(uuid)
from public, anon;
grant execute on function
  public.start_import_batch(text, text, integer),
  public.import_students(uuid, jsonb),
  public.undo_import_batch(uuid)
to authenticated;
