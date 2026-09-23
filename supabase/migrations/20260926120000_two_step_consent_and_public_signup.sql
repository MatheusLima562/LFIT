-- =============================================================================
-- (1) Consentimento LGPD em duas etapas para dados de saúde
--     - Professor DECLARA ter obtido o consentimento (health_consent_declared_*).
--     - O TITULAR confirma no primeiro acesso (health_data_consent_at).
--     - Sem a confirmação do titular, dados de saúde (grupos especiais) ficam
--       visíveis só ao professor responsável.
-- (2) Cadastro público (etapa 1.4)
--     - Saúde em texto livre; a lista de grupos nunca é exposta publicamente.
--     - Consentimento dado pelo próprio aluno no formulário.
--     - Treinador classifica em grupos ao aprovar; dados enviados são descartados
--       após aprovação/recusa (minimização).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) Consentimento em duas etapas
-- -----------------------------------------------------------------------------
alter table public.students
  add column health_consent_declared_at timestamptz,
  add column health_consent_declared_by uuid references auth.users (id) on delete set null;

comment on column public.students.health_data_consent_at is
  'Consentimento do TITULAR para dados de saúde (LGPD art. 11). Confirmado pelo próprio aluno.';
comment on column public.students.health_consent_declared_at is
  'Declaração do professor de que obteve o consentimento; aguarda confirmação do titular.';

-- Registros anteriores: consentimentos de cadastros manuais eram declarações do professor.
update public.students
set health_consent_declared_at = health_data_consent_at,
    health_data_consent_at = null
where source = 'manual' and health_data_consent_at is not null;

-- Responsável pelo aluno: o professor atribuído; sem professor, o owner.
create function private.is_responsible_for(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.deleted_at is null
      and s.organization_id = private.current_org_id()
      and (
        s.trainer_id = (select auth.uid())
        or (s.trainer_id is null and private.is_owner())
      )
  )
$$;

-- Dados de saúde: quem acessa o aluno, desde que o titular tenha confirmado;
-- antes disso, só o responsável.
create function private.can_view_student_health(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_student(p_student_id)
     and (
       private.is_responsible_for(p_student_id)
       or exists (
         select 1 from public.students s
         where s.id = p_student_id and s.health_data_consent_at is not null
       )
     )
$$;

grant execute on function private.is_responsible_for(uuid), private.can_view_student_health(uuid) to authenticated;

-- Versão pública para a UI decidir se mostra/edita grupos.
create function public.can_view_student_health(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_student_health(p_student_id)
$$;
grant execute on function public.can_view_student_health(uuid) to authenticated;

drop policy student_groups_select on public.student_groups;
create policy student_groups_select on public.student_groups
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and private.can_view_student_health(student_id)
  );

-- Grupos: exige consentimento do titular OU declaração do professor (que é registrada aqui).
create or replace function private.set_student_groups(s public.students, p_group_ids uuid[], p_consent boolean)
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

  if cardinality(p_group_ids) > 0
     and s.health_data_consent_at is null
     and s.health_consent_declared_at is null then
    if not p_consent then
      raise exception 'HEALTH_CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
    update public.students
    set health_consent_declared_at = now(), health_consent_declared_by = (select auth.uid())
    where id = s.id;
    perform private.audit(s.organization_id, 'student.health_consent_declared', 'student', s.id);
  end if;

  select coalesce(array_agg(group_id order by group_id), '{}') into v_current
  from public.student_groups where student_id = s.id;

  if v_current = array(select g from unnest(p_group_ids) g order by g) then
    return false;
  end if;

  delete from public.student_groups where student_id = s.id and group_id <> all (p_group_ids);
  insert into public.student_groups (student_id, group_id, organization_id)
  select s.id, g, s.organization_id from unnest(p_group_ids) g
  on conflict do nothing;

  return true;
end;
$$;

-- Edição: quem não enxerga os dados de saúde não pode alterá-los (evita apagar
-- grupos ocultos ao salvar o formulário).
create or replace function public.update_student(p_student_id uuid, p_patch jsonb)
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

  if p_patch ? 'group_ids' and not private.can_view_student_health(s.id) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Dados de saúde aguardando confirmação do aluno';
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

-- student_diff não deve registrar os carimbos de consentimento como "edição".
create or replace function private.student_diff(p_before public.students, p_after public.students)
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
    and o.key not in ('updated_at', 'health_data_consent_at', 'health_consent_declared_at', 'health_consent_declared_by')
$$;

-- --- Lado do aluno (primeiro acesso) ----------------------------------------

-- Pedido de confirmação pendente para o aluno logado (dados do próprio titular).
create function public.get_my_health_consent_request()
returns table (student_id uuid, organization_name text, trainer_name text, group_names text[], declared_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, o.name, p.full_name,
         array(select sg.name from public.student_groups x
               join public.special_groups sg on sg.id = x.group_id
               where x.student_id = s.id order by sg.name),
         s.health_consent_declared_at
  from public.students s
  join public.organizations o on o.id = s.organization_id
  left join public.profiles p on p.id = s.trainer_id
  where s.user_id = (select auth.uid())
    and s.deleted_at is null
    and s.health_data_consent_at is null
    and s.health_consent_declared_at is not null
    and exists (select 1 from public.student_groups x where x.student_id = s.id)
$$;

-- O titular confirma (accept) ou recusa. Recusa apaga os dados de saúde.
create function public.respond_my_health_consent(p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
begin
  select * into s from public.students
  where user_id = (select auth.uid()) and deleted_at is null
    and health_data_consent_at is null and health_consent_declared_at is not null
  for update;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_accept then
    update public.students set health_data_consent_at = now() where id = s.id;
    perform private.audit(s.organization_id, 'student.health_consent_confirmed', 'student', s.id);
  else
    delete from public.student_groups where student_id = s.id;
    update public.students
    set health_consent_declared_at = null, health_consent_declared_by = null
    where id = s.id;
    perform private.audit(s.organization_id, 'student.health_consent_declined', 'student', s.id);
  end if;
end;
$$;

grant execute on function public.get_my_health_consent_request(), public.respond_my_health_consent(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- (2) Cadastro público
-- -----------------------------------------------------------------------------

-- Configuração dos campos opcionais: hidden | optional | required.
-- Nome, sobrenome e e-mail são sempre obrigatórios.
alter table public.public_signup_links
  alter column form_config set default
  '{"fields": {"birth_date": "optional", "whatsapp_e164": "optional", "sex": "optional", "training_location": "hidden", "health_description": "optional"}}'::jsonb;

update public.public_signup_links
set form_config = '{"fields": {"birth_date": "optional", "whatsapp_e164": "optional", "sex": "optional", "training_location": "hidden", "health_description": "optional"}}'::jsonb;

create function private.valid_signup_form_config(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p -> 'fields') = 'object'
     and not exists (
       select 1 from jsonb_each_text(p -> 'fields') f
       where f.key not in ('birth_date', 'whatsapp_e164', 'sex', 'training_location', 'health_description')
          or f.value not in ('hidden', 'optional', 'required')
     )
$$;

alter table public.public_signup_links
  add constraint public_signup_links_form_config_valid check (private.valid_signup_form_config(form_config));

-- Formulário público (lido pelo servidor com a secret key; anon não lê a tabela).
create function public.get_public_signup_form(p_token text)
returns table (organization_name text, form_config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, l.form_config
  from public.public_signup_links l
  join public.organizations o on o.id = l.organization_id
  where l.token = p_token and l.is_active
$$;

revoke execute on function public.get_public_signup_form(text) from authenticated, anon;
grant execute on function public.get_public_signup_form(text) to service_role;

-- Envio: só campos permitidos pela configuração; saúde em texto livre; nada de group_ids.
create or replace function public.submit_public_signup(p_token text, p_payload jsonb, p_consent boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.public_signup_links;
  v_fields jsonb;
  v_payload jsonb;
  v_key text;
  v_mode text;
  v_health text;
  v_id uuid;
begin
  select * into l from public.public_signup_links where token = p_token and is_active;
  if not found then
    raise exception 'SIGNUP_LINK_INVALID' using errcode = 'P0002';
  end if;
  v_fields := l.form_config -> 'fields';

  -- Base obrigatória + campos opcionais não ocultos.
  v_payload := jsonb_build_object(
    'first_name', nullif(trim(p_payload ->> 'first_name'), ''),
    'last_name', nullif(trim(p_payload ->> 'last_name'), ''),
    'email', nullif(lower(trim(p_payload ->> 'email')), '')
  );
  for v_key, v_mode in select key, value from jsonb_each_text(v_fields) loop
    if v_mode <> 'hidden' and nullif(trim(p_payload ->> v_key), '') is not null then
      v_payload := v_payload || jsonb_build_object(v_key, trim(p_payload ->> v_key));
    end if;
    if v_mode = 'required' and not (v_payload ? v_key) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = v_key;
    end if;
  end loop;

  if v_payload ->> 'first_name' is null or v_payload ->> 'last_name' is null or v_payload ->> 'email' is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'nome/e-mail';
  end if;

  -- Formatos aceitos (o servidor já valida; aqui é a última linha de defesa).
  if (v_payload ? 'sex' and v_payload ->> 'sex' not in ('M', 'F'))
     or (v_payload ? 'birth_date' and (v_payload ->> 'birth_date') !~ '^\d{4}-\d{2}-\d{2}$')
     or (v_payload ? 'whatsapp_e164' and (v_payload ->> 'whatsapp_e164') !~ '^\+[1-9][0-9]{7,14}$')
     or (v_payload ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'formato';
  end if;

  v_health := v_payload ->> 'health_description';
  if v_health is not null then
    if length(v_health) > 1000 then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'health_description';
    end if;
    if not p_consent then
      raise exception 'HEALTH_CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.pending_signups (organization_id, link_id, payload, consent_at)
  values (l.organization_id, l.id, v_payload, case when p_consent and v_health is not null then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Aprovação individual com classificação em grupos pelo treinador.
-- O consentimento é do próprio titular (dado no formulário).
create function public.approve_signup(p_id uuid, p_trainer_id uuid default null, p_group_ids uuid[] default '{}')
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  p public.pending_signups;
  st public.students;
begin
  select * into p from public.pending_signups
  where id = p_id and organization_id = v_org and status = 'pending'
  for update;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if cardinality(coalesce(p_group_ids, '{}')) > 0 and p.consent_at is null then
    raise exception 'HEALTH_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;

  -- Pendente não ocupa vaga; a vaga é checada aqui (insert_student).
  st := private.insert_student(
    v_org,
    (p.payload - 'health_description') || jsonb_build_object('trainer_id', p_trainer_id),
    'public_link'
  );

  if p.consent_at is not null then
    update public.students set health_data_consent_at = p.consent_at where id = st.id returning * into st;
  end if;
  perform private.set_student_groups(st, coalesce(p_group_ids, '{}'), false);

  update public.pending_signups
  set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
      student_id = st.id, payload = '{}'::jsonb   -- minimização: os dados já estão no aluno
  where id = p.id;

  perform private.audit(v_org, 'signup.approved', 'pending_signup', p.id, jsonb_build_object('student_id', st.id));
  select * into st from public.students where id = st.id;
  return st;
end;
$$;

-- Aprovação em lote: sem classificação de grupos (feita depois, na edição).
create or replace function public.approve_signups(p_ids uuid[], p_trainer_id uuid default null)
returns setof public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_owner();
  foreach v_id in array coalesce(p_ids, '{}') loop
    return next public.approve_signup(v_id, p_trainer_id, '{}');
  end loop;
end;
$$;

grant execute on function public.approve_signup(uuid, uuid, uuid[]) to authenticated;
