-- =============================================================================
-- Ações sobre alunos (RPC). Toda regra de negócio fica aqui, na mesma
-- transação da escrita: permissão, limite do plano, matrícula e auditoria.
--
-- Erros de negócio usam a mensagem como código estável (o app traduz):
--   FORBIDDEN, STUDENT_NOT_FOUND, PLAN_LIMIT_REACHED, INVALID_INPUT,
--   INVALID_TRAINER, INVALID_GROUP, HEALTH_CONSENT_REQUIRED,
--   CONFIRMATION_MISMATCH, SIGNUP_LINK_INVALID
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Infra interna
-- -----------------------------------------------------------------------------
create function private.audit(
  p_org uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_diff jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, diff)
  values (p_org, (select auth.uid()), p_action, p_entity, p_entity_id, p_diff)
$$;

create function private.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return private.current_org_id();
end;
$$;

create function private.require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return private.current_org_id();
end;
$$;

-- Trava e devolve o aluno se o usuário atual puder acessá-lo.
-- Não diferencia "não existe" de "sem permissão" (não vaza existência).
create function private.lock_accessible_student(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
begin
  select * into s
  from public.students
  where id = p_student_id
    and deleted_at is null
    and organization_id = private.current_org_id()
    and private.is_staff()
    and (private.is_owner() or trainer_id = (select auth.uid()))
  for update;

  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return s;
end;
$$;

-- Trava a organização e garante que ainda há vaga. Chamar ANTES de a mudança
-- fazer um aluno passar a ocupar vaga. O lock serializa cadastros concorrentes.
create function private.assert_seat_available(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  select student_limit into v_limit from public.organizations where id = p_org for update;

  select count(*) into v_used
  from public.students s
  where s.organization_id = p_org and private.occupies_seat(s);

  if v_used >= v_limit then
    raise exception 'PLAN_LIMIT_REACHED'
      using errcode = 'P0001', detail = format('%s/%s', v_used, v_limit), hint = 'upgrade';
  end if;
end;
$$;

create function private.assert_trainer_in_org(p_org uuid, p_trainer_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_trainer_id is not null and not exists (
    select 1 from public.profiles
    where id = p_trainer_id and organization_id = p_org and role in ('owner', 'trainer')
  ) then
    raise exception 'INVALID_TRAINER' using errcode = 'P0001';
  end if;
end;
$$;

-- Turmas também só podem apontar para owner/trainer.
create function private.classes_validate_trainer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_trainer_in_org(new.organization_id, new.trainer_id);
  return new;
end;
$$;

create trigger classes_validate_trainer
before insert or update of trainer_id on public.classes
for each row execute function private.classes_validate_trainer();

-- Campos que o formulário pode enviar (whitelist).
create function private.student_input(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb))
  where key = any (array[
    'first_name', 'last_name', 'email', 'whatsapp_e164', 'birth_date', 'sex',
    'trainer_id', 'training_location', 'notes', 'photo_path',
    'access_expires_at', 'block_if_overdue'
  ])
$$;

create function private.normalize_student(r public.students)
returns public.students
language plpgsql
immutable
set search_path = ''
as $$
begin
  r.first_name := nullif(trim(r.first_name), '');
  r.last_name := nullif(trim(r.last_name), '');
  r.email := nullif(lower(trim(r.email)), '');
  r.whatsapp_e164 := nullif(trim(r.whatsapp_e164), '');
  r.training_location := nullif(trim(r.training_location), '');
  r.notes := nullif(trim(r.notes), '');
  if r.first_name is null or r.last_name is null or r.email is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'first_name, last_name e email são obrigatórios';
  end if;
  return r;
end;
$$;

create function private.group_ids_from(p jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p ? 'group_ids' then
      coalesce(array(select distinct jsonb_array_elements_text(p -> 'group_ids')::uuid), '{}')
    else null
  end
$$;

-- Substitui os grupos especiais do aluno. Retorna true se algo mudou.
-- p_group_ids null = não mexer.
create function private.set_student_groups(s public.students, p_group_ids uuid[], p_consent boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid[];
begin
  if p_group_ids is null then
    return false;
  end if;

  if exists (
    select 1 from unnest(p_group_ids) g
    where not exists (
      select 1 from public.special_groups sg where sg.id = g and sg.organization_id = s.organization_id
    )
  ) then
    raise exception 'INVALID_GROUP' using errcode = 'P0001';
  end if;

  if cardinality(p_group_ids) > 0 and s.health_data_consent_at is null then
    if not p_consent then
      raise exception 'HEALTH_CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
    update public.students set health_data_consent_at = now() where id = s.id;
  end if;

  select coalesce(array_agg(group_id order by group_id), '{}') into v_current
  from public.student_groups where student_id = s.id;

  if v_current = array(select g from unnest(p_group_ids) g order by g) then
    return false;
  end if;

  delete from public.student_groups
  where student_id = s.id and group_id <> all (p_group_ids);

  insert into public.student_groups (student_id, group_id, organization_id)
  select s.id, g, s.organization_id from unnest(p_group_ids) g
  on conflict do nothing;

  return true;
end;
$$;

-- Diferenças auditáveis. Campos sensíveis registram só que mudaram.
create function private.student_diff(p_before public.students, p_after public.students)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
    o.key,
    case when o.key = 'notes' then '"changed"'::jsonb
         else jsonb_build_object('from', o.value, 'to', n.value) end
  ), '{}'::jsonb)
  from jsonb_each(to_jsonb(p_before)) o
  join jsonb_each(to_jsonb(p_after)) n using (key)
  where o.value is distinct from n.value
    and o.key not in ('updated_at', 'health_data_consent_at')
$$;

-- Criação usada pelo cadastro manual e pela aprovação do link público.
-- Chamadores são responsáveis pela checagem de permissão.
create function private.insert_student(p_org uuid, p_data jsonb, p_source public.student_source)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.students;
  v_groups uuid[] := private.group_ids_from(p_data);
  v_consent boolean := coalesce((p_data ->> 'health_data_consent')::boolean, false);
begin
  r := jsonb_populate_record(null::public.students, private.student_input(p_data));
  r := private.normalize_student(r);
  r.id := gen_random_uuid();
  r.organization_id := p_org;
  r.user_id := null;
  r.status := 'active';
  r.source := p_source;
  r.block_if_overdue := coalesce(r.block_if_overdue, false);
  r.health_data_consent_at := null;
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

  perform private.set_student_groups(r, v_groups, v_consent);

  perform private.audit(p_org, 'student.created', 'student', r.id, jsonb_build_object(
    'enrollment_number', r.enrollment_number,
    'source', r.source,
    'health_data', coalesce(cardinality(v_groups), 0) > 0
  ));

  select * into r from public.students where id = r.id;
  return r;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs públicas
-- -----------------------------------------------------------------------------

-- Cadastro manual. Trainer sempre vira o responsável pelo aluno que cria.
create function public.create_student(p_data jsonb)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
begin
  if private.current_user_role() = 'trainer' then
    p_data := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('trainer_id', (select auth.uid()));
  end if;
  return private.insert_student(v_org, p_data, 'manual');
end;
$$;

-- Edição parcial: só as chaves presentes em p_patch mudam.
-- `group_ids` substitui os grupos; `health_data_consent` registra consentimento.
create function public.update_student(p_student_id uuid, p_patch jsonb)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  r public.students;
  v_input jsonb := private.student_input(p_patch);
  v_health_changed boolean;
  v_diff jsonb;
begin
  if not private.is_owner()
     and v_input ? 'trainer_id'
     and (v_input ->> 'trainer_id') is distinct from s.trainer_id::text then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Só o owner reatribui alunos';
  end if;

  r := private.normalize_student(jsonb_populate_record(s, v_input));
  perform private.assert_trainer_in_org(s.organization_id, r.trainer_id);

  if not private.occupies_seat(s) and private.occupies_seat(r) then
    perform private.assert_seat_available(s.organization_id);
  end if;

  update public.students set
    first_name = r.first_name,
    last_name = r.last_name,
    email = r.email,
    whatsapp_e164 = r.whatsapp_e164,
    birth_date = r.birth_date,
    sex = r.sex,
    trainer_id = r.trainer_id,
    training_location = r.training_location,
    notes = r.notes,
    photo_path = r.photo_path,
    access_expires_at = r.access_expires_at,
    block_if_overdue = r.block_if_overdue
  where id = s.id
  returning * into r;

  v_health_changed := private.set_student_groups(
    r,
    private.group_ids_from(p_patch),
    coalesce((p_patch ->> 'health_data_consent')::boolean, false)
  );

  v_diff := private.student_diff(s, r);
  if v_diff <> '{}'::jsonb then
    perform private.audit(s.organization_id, 'student.updated', 'student', s.id, v_diff);
  end if;
  if v_health_changed then
    perform private.audit(s.organization_id, 'student.health_data_changed', 'student', s.id);
  end if;

  select * into r from public.students where id = s.id;
  return r;
end;
$$;

-- Aplica mudança de status/expiração, checando vaga e auditando.
create function private.save_status_change(p_before public.students, p_after public.students, p_action text)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_after.status = p_before.status
     and p_after.access_expires_at is not distinct from p_before.access_expires_at then
    return p_before;
  end if;

  if not private.occupies_seat(p_before) and private.occupies_seat(p_after) then
    perform private.assert_seat_available(p_before.organization_id);
  end if;

  update public.students
  set status = p_after.status, access_expires_at = p_after.access_expires_at
  where id = p_before.id
  returning * into p_after;

  perform private.audit(p_before.organization_id, p_action, 'student', p_before.id, jsonb_build_object(
    'from', public.student_effective_status(p_before),
    'to', public.student_effective_status(p_after)
  ));
  return p_after;
end;
$$;

create function public.deactivate_student(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  a public.students := s;
begin
  a.status := 'inactive';
  return private.save_status_change(s, a, 'student.deactivated');
end;
$$;

create function public.reactivate_student(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  a public.students := s;
begin
  a.status := 'active';
  return private.save_status_change(s, a, 'student.reactivated');
end;
$$;

create function public.expire_student(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  a public.students := s;
begin
  a.access_expires_at := now();
  return private.save_status_change(s, a, 'student.expired');
end;
$$;

create function public.clear_student_expiration(p_student_id uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  a public.students := s;
begin
  a.access_expires_at := null;
  return private.save_status_change(s, a, 'student.expiration_cleared');
end;
$$;

create function private.assert_confirmation(s public.students, p_confirm_name text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(s.first_name || ' ' || s.last_name) then
    raise exception 'CONFIRMATION_MISMATCH' using errcode = 'P0001';
  end if;
end;
$$;

-- Exclusão (soft delete): some das listagens e libera a vaga e o e-mail.
create function public.soft_delete_student(p_student_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
begin
  perform private.assert_confirmation(s, p_confirm_name);

  update public.students set deleted_at = now(), deleted_by = (select auth.uid()) where id = s.id;
  update public.access_links set expires_at = now()
  where student_id = s.id and used_at is null and expires_at > now();

  perform private.audit(s.organization_id, 'student.deleted', 'student', s.id);
end;
$$;

-- Eliminação definitiva (LGPD). Só owner; vale também para alunos já excluídos.
-- Devolve o que o servidor precisa apagar fora do banco (usuário e foto).
create function public.hard_delete_student(p_student_id uuid, p_confirm_name text)
returns table (user_id uuid, photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  s public.students;
begin
  select * into s from public.students
  where id = p_student_id and organization_id = v_org
  for update;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.assert_confirmation(s, p_confirm_name);

  delete from public.pending_signups where student_id = s.id;
  delete from public.students where id = s.id;

  -- Sem dados pessoais no log: só o identificador.
  perform private.audit(v_org, 'student.purged', 'student', s.id);

  return query select s.user_id, s.photo_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- Link de acesso (definir senha) — curta validade, uso único, só hash no banco.
-- -----------------------------------------------------------------------------
create function public.create_access_link(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  v_token text := private.random_token();
begin
  -- Invalida links anteriores ainda válidos.
  update public.access_links set expires_at = now()
  where student_id = s.id and used_at is null and expires_at > now();

  insert into public.access_links (organization_id, student_id, token_hash, created_by, expires_at)
  values (s.organization_id, s.id, private.sha256_hex(v_token), (select auth.uid()), now() + interval '30 minutes');

  perform private.audit(s.organization_id, 'student.access_link_created', 'student', s.id);
  return v_token;
end;
$$;

-- Consumido pela rota /acesso/[token] no servidor (service_role).
create function public.consume_access_link(p_token text)
returns table (student_id uuid, organization_id uuid, user_id uuid, email text, first_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.access_links;
begin
  update public.access_links
  set used_at = now()
  where token_hash = private.sha256_hex(p_token)
    and used_at is null
    and expires_at > now()
  returning * into v_link;

  if not found then
    return;
  end if;

  perform private.audit(v_link.organization_id, 'student.access_link_used', 'student', v_link.student_id);

  return query
  select s.id, s.organization_id, s.user_id, s.email, s.first_name
  from public.students s
  where s.id = v_link.student_id and s.deleted_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cadastro por link público
-- -----------------------------------------------------------------------------
create function public.ensure_signup_link()
returns public.public_signup_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  l public.public_signup_links;
begin
  insert into public.public_signup_links (organization_id) values (v_org)
  on conflict (organization_id) do nothing;
  select * into l from public.public_signup_links where organization_id = v_org;
  return l;
end;
$$;

create function public.regenerate_signup_token()
returns public.public_signup_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  l public.public_signup_links;
begin
  update public.public_signup_links set token = private.random_token()
  where organization_id = v_org
  returning * into l;
  perform private.audit(v_org, 'signup_link.regenerated', 'public_signup_link', l.id);
  return l;
end;
$$;

-- Chamado pelo servidor (service_role) depois de captcha, honeypot e rate limit.
create function public.submit_public_signup(p_token text, p_payload jsonb, p_consent boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.public_signup_links;
  v_payload jsonb;
  v_missing text;
  v_id uuid;
begin
  select * into l from public.public_signup_links where token = p_token and is_active;
  if not found then
    raise exception 'SIGNUP_LINK_INVALID' using errcode = 'P0002';
  end if;

  v_payload := private.student_input(p_payload) - 'trainer_id' - 'photo_path' - 'access_expires_at' - 'block_if_overdue';
  if p_payload ? 'group_ids' then
    v_payload := v_payload || jsonb_build_object('group_ids', p_payload -> 'group_ids');
  end if;

  select f into v_missing
  from jsonb_array_elements_text(coalesce(l.form_config -> 'required', '[]'::jsonb)) f
  where coalesce(trim(v_payload ->> f), '') = ''
  limit 1;
  if v_missing is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = v_missing;
  end if;

  if p_payload ? 'group_ids' and jsonb_array_length(p_payload -> 'group_ids') > 0 and not p_consent then
    raise exception 'HEALTH_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.pending_signups (organization_id, link_id, payload, consent_at)
  values (l.organization_id, l.id, v_payload, case when p_consent then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Aprova em lote (tudo ou nada; respeita o limite do plano).
create function public.approve_signups(p_ids uuid[], p_trainer_id uuid default null)
returns setof public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  p public.pending_signups;
  st public.students;
begin
  for p in
    select * from public.pending_signups
    where id = any (p_ids) and organization_id = v_org and status = 'pending'
    order by created_at
    for update
  loop
    st := private.insert_student(
      v_org,
      p.payload || jsonb_build_object('trainer_id', p_trainer_id, 'health_data_consent', p.consent_at is not null),
      'public_link'
    );
    if p.consent_at is not null and st.health_data_consent_at is not null then
      update public.students set health_data_consent_at = p.consent_at where id = st.id
      returning * into st;
    end if;

    update public.pending_signups
    set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(), student_id = st.id
    where id = p.id;

    perform private.audit(v_org, 'signup.approved', 'pending_signup', p.id, jsonb_build_object('student_id', st.id));
    return next st;
  end loop;
end;
$$;

-- Recusa em lote. Os dados enviados são descartados (minimização — LGPD).
create function public.reject_signups(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  v_count integer;
begin
  update public.pending_signups
  set status = 'rejected', payload = '{}'::jsonb, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = any (p_ids) and organization_id = v_org and status = 'pending';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform private.audit(v_org, 'signup.rejected', 'pending_signup', null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limit (janela fixa). Retorna true se a requisição está dentro do limite.
-- -----------------------------------------------------------------------------
create function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;

  -- Limpeza oportunista de janelas antigas.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants de execução
-- -----------------------------------------------------------------------------
grant execute on function
  public.create_student(jsonb),
  public.update_student(uuid, jsonb),
  public.deactivate_student(uuid),
  public.reactivate_student(uuid),
  public.expire_student(uuid),
  public.clear_student_expiration(uuid),
  public.soft_delete_student(uuid, text),
  public.hard_delete_student(uuid, text),
  public.create_access_link(uuid),
  public.ensure_signup_link(),
  public.regenerate_signup_token(),
  public.approve_signups(uuid[], uuid),
  public.reject_signups(uuid[])
to authenticated;

-- Somente servidor.
revoke execute on function
  public.consume_access_link(text),
  public.submit_public_signup(text, jsonb, boolean),
  public.hit_rate_limit(text, integer, integer)
from authenticated, anon;
grant execute on function
  public.consume_access_link(text),
  public.submit_public_signup(text, jsonb, boolean),
  public.hit_rate_limit(text, integer, integer)
to service_role;
