-- Sprint de venda, 1.3: Configurações do personal.
-- * Perfil (nome, foto) de qualquer membro da equipe; negócio (nome, logo, WhatsApp de contato) só do owner.
-- * Logo e foto no bucket PRIVADO `org-branding` (imagem reduzida no cliente, JPEG/WebP até 2 MB):
--     <org>/logo-<uuid>.(jpg|webp)            owner envia/remove
--     <org>/avatar-<user>-<uuid>.(jpg|webp)   cada um a própria foto
--   Leitura: equipe e alunos da própria organização (logo no topo do app do aluno). Na tela de convite (sem sessão), o
--   servidor lê o logo com a secret key DEPOIS de `get_access_link_branding` validar o token.
-- * Exportação da conta (owner): alunos e histórico de treinos, sem dado de saúde salvo opt-in explícito. Funciona com a
--   conta encerrada (só leitura + auditoria). Conteúdo nunca vai para a auditoria (só contagens e o tipo).

-- 1) Colunas ----------------------------------------------------------------------------------------------------------
alter table public.organizations
  add column logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/logo-[0-9a-f-]{36}\.(jpg|webp)$'),
  add column contact_whatsapp text check (contact_whatsapp is null or contact_whatsapp ~ '^\+[1-9][0-9]{7,14}$');
alter table public.profiles
  add column avatar_path text check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/avatar-[0-9a-f-]{36}-[0-9a-f-]{36}\.(jpg|webp)$');
-- Escrita só pelas RPCs abaixo (a política de UPDATE de profiles é por coluna; avatar_path não entra nela).
revoke update (logo_path, contact_whatsapp) on public.organizations from authenticated;
revoke update (avatar_path) on public.profiles from authenticated;

-- 2) Storage ----------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-branding', 'org-branding', false, 2 * 1024 * 1024, array['image/jpeg', 'image/webp']);

create function private.can_write_branding(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
    and array_length(storage.foldername(p_name), 1) = 1
    and (storage.foldername(p_name))[1] = private.current_org_id()::text
    and (
      (private.is_owner() and storage.filename(p_name) ~ '^logo-[0-9a-f-]{36}\.(jpg|webp)$')
      or storage.filename(p_name) ~ ('^avatar-' || (select auth.uid())::text || '-[0-9a-f-]{36}\.(jpg|webp)$')
    )
$$;

-- Leitura: equipe da org ou aluno (titular) da org.
create function private.can_read_branding(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] = coalesce(
    case when private.is_staff() then private.current_org_id()::text end,
    (select s.organization_id::text from public.students s where s.user_id = (select auth.uid()) and s.deleted_at is null limit 1)
  )
$$;

revoke execute on function private.can_write_branding(text), private.can_read_branding(text) from public, anon;
grant execute on function private.can_write_branding(text), private.can_read_branding(text) to authenticated;

create policy org_branding_select on storage.objects for select to authenticated
  using (bucket_id = 'org-branding' and private.can_read_branding(name));
create policy org_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-branding' and private.can_write_branding(name));
create policy org_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-branding' and private.can_write_branding(name));

-- 3) RPCs de configuração --------------------------------------------------------------------------------------------
-- Conta em somente leitura não muda nada pelas configurações (organizations não tem o gatilho genérico).
create function private.assert_org_writable(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.org_access_state(p_org) in ('suspended', 'canceled', 'closed') then
    raise exception 'ACCOUNT_READ_ONLY' using errcode = 'P0001';
  end if;
end;
$$;

-- Perfil do próprio usuário (equipe). Foto: caminho da própria pasta, já enviado. Devolve a foto anterior (o cliente apaga).
create function public.update_my_profile(p_full_name text, p_avatar_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_uid uuid := (select auth.uid());
  v_name text := trim(coalesce(p_full_name, ''));
  v_path text := nullif(trim(coalesce(p_avatar_path, '')), '');
  v_old text;
begin
  perform private.assert_org_writable(v_org);
  if char_length(v_name) not between 2 and 120 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'full_name';
  end if;
  if v_path is not null and (
    v_path !~ ('^' || v_org::text || '/avatar-' || v_uid::text || '-[0-9a-f-]{36}\.(jpg|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'org-branding' and o.name = v_path)
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'avatar_path';
  end if;
  select avatar_path into v_old from public.profiles where id = v_uid;
  update public.profiles set full_name = v_name, avatar_path = v_path, updated_at = now() where id = v_uid;
  return jsonb_build_object('previous_avatar_path', case when v_old is distinct from v_path then v_old end);
end;
$$;

-- Negócio (owner): nome, logo e WhatsApp de contato. Auditado sem os valores.
create function public.update_organization_profile(p_name text, p_logo_path text, p_contact_whatsapp text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  v_name text := trim(coalesce(p_name, ''));
  v_logo text := nullif(trim(coalesce(p_logo_path, '')), '');
  v_phone text := nullif(trim(coalesce(p_contact_whatsapp, '')), '');
  v_old text;
begin
  perform private.assert_org_writable(v_org);
  if char_length(v_name) not between 2 and 120 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'name';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'contact_whatsapp';
  end if;
  if v_logo is not null and (
    v_logo !~ ('^' || v_org::text || '/logo-[0-9a-f-]{36}\.(jpg|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'org-branding' and o.name = v_logo)
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'logo_path';
  end if;
  select logo_path into v_old from public.organizations where id = v_org;
  update public.organizations set name = v_name, logo_path = v_logo, contact_whatsapp = v_phone, updated_at = now() where id = v_org;
  perform private.audit(v_org, 'organization.profile_updated', 'organization', v_org,
    jsonb_build_object('logo', v_logo is not null, 'contact_whatsapp', v_phone is not null));
  return jsonb_build_object('previous_logo_path', case when v_old is distinct from v_logo then v_old end);
end;
$$;

-- Dados do negócio para as telas (equipe ou aluno da org): nome, logo (caminho) e WhatsApp de contato.
create function public.get_my_branding()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', o.name, 'logo_path', o.logo_path, 'contact_whatsapp', o.contact_whatsapp)
  from public.organizations o
  where o.id = coalesce(
    case when private.is_staff() then private.current_org_id() end,
    (select s.organization_id from public.students s where s.user_id = (select auth.uid()) and s.deleted_at is null limit 1)
  )
$$;

-- Tela do convite/link de acesso (sem sessão): nome e logo do negócio se o token ainda vale. Não consome o token.
create function public.get_access_link_branding(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', o.name, 'logo_path', o.logo_path)
  from public.access_links l
  join public.organizations o on o.id = l.organization_id
  where l.token_hash = private.sha256_hex(p_token) and l.used_at is null and l.expires_at > now()
$$;

-- 4) Exportação da conta (owner) -------------------------------------------------------------------------------------
-- p_kind: 'students' | 'sessions'. Saúde (grupos especiais e observações do cadastro; dor e comentário do treino) só
-- com p_include_health = true E para alunos cuja saúde o chamador pode ver. Auditado com o tipo e a contagem.
create function public.export_account_data(p_kind text, p_include_health boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
  v_health boolean := coalesce(p_include_health, false);
  v_rows jsonb;
begin
  if p_kind = 'students' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'enrollment_number', s.enrollment_number, 'first_name', s.first_name, 'last_name', s.last_name, 'email', s.email,
        'whatsapp', s.whatsapp_e164, 'birth_date', s.birth_date, 'modality', s.modality,
        'status', public.student_effective_status(s), 'trainer', t.full_name, 'created_at', s.created_at,
        'access_expires_at', s.access_expires_at,
        'groups', case when v_health and private.can_view_student_health(s.id) then (
          select string_agg(g.name, ', ' order by g.name) from public.student_groups sg join public.special_groups g on g.id = sg.group_id
          where sg.student_id = s.id) end,
        'notes', case when v_health and private.can_view_student_health(s.id) then s.notes end
      ) order by s.enrollment_number), '[]'::jsonb)
    into v_rows
    from public.students s left join public.profiles t on t.id = s.trainer_id
    where s.organization_id = v_org and s.deleted_at is null;
  elsif p_kind = 'sessions' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'student', s.first_name || ' ' || s.last_name, 'enrollment_number', s.enrollment_number,
        'started_at', w.started_at, 'finished_at', w.finished_at, 'status', public.session_effective_status(w),
        'workout_label', w.workout_label,
        'exercises_done', (select count(*) from public.session_item_logs l where l.session_id = w.id and l.completed_at is not null),
        'sets_logged', (select count(*) from public.session_set_logs sl join public.session_item_logs l on l.id = sl.item_log_id where l.session_id = w.id),
        'rpe', w.rpe, 'rating', w.student_rating,
        'pain_checkin', case when v_health and private.can_view_student_health(s.id) then w.pain_checkin end,
        'max_pain', case when v_health and private.can_view_student_health(s.id) then
          (select max(l.pain_score) from public.session_item_logs l where l.session_id = w.id) end,
        'feedback_note', case when v_health and private.can_view_student_health(s.id) then w.feedback_note end
      ) order by w.started_at desc), '[]'::jsonb)
    into v_rows
    from public.workout_sessions w join public.students s on s.id = w.student_id
    where w.organization_id = v_org;
  else
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'kind';
  end if;
  return v_rows;
end;
$$;

-- Registro da exportação (separado: a exportação é leitura). Só tipo, contagem e o opt-in de saúde.
create function public.log_account_export(p_kind text, p_count integer, p_include_health boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
begin
  if p_kind not in ('students', 'sessions') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform private.audit(v_org, 'account.exported', 'organization', v_org,
    jsonb_build_object('kind', p_kind, 'count', greatest(coalesce(p_count, 0), 0), 'health', coalesce(p_include_health, false)));
end;
$$;

-- 5) Permissões ------------------------------------------------------------------------------------------------------
revoke execute on function private.assert_org_writable(uuid) from public, anon, authenticated;
revoke execute on function
  public.update_my_profile(text, text), public.update_organization_profile(text, text, text), public.get_my_branding(),
  public.get_access_link_branding(text), public.export_account_data(text, boolean), public.log_account_export(text, integer, boolean)
from public, anon, authenticated;
grant execute on function
  public.update_my_profile(text, text), public.update_organization_profile(text, text, text), public.get_my_branding(),
  public.export_account_data(text, boolean), public.log_account_export(text, integer, boolean)
to authenticated;
grant execute on function public.get_access_link_branding(text) to service_role;
