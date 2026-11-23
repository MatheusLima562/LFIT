-- Sprint de venda, 1.1 + 1.2: painel da PLATAFORMA (quem vende o LFit) e regra de inadimplência.
--
-- * A plataforma gerencia contas (organizações = personais) e cobrança MANUAL. Nunca lê alunos, treinos, chat, feed, NPS
--   ou saúde: o acesso é por lista própria (`private.platform_admins`, preenchida só por SQL), não por papel da
--   organização, e as RPCs devolvem só dados da conta (nome, dono, plano, contagem de vagas, datas, situação).
-- * MFA obrigatório: toda RPC da plataforma exige sessão aal2 (TOTP do Supabase Auth); só estar na lista não basta.
-- * Situação da assinatura (`organizations.subscription_status`): active (em dia) · past_due (em atraso) · suspended ·
--   canceled. O ESTADO de acesso é calculado (`private.org_access_state`) com as regras de `private.account_rules`:
--     ok        em dia
--     grace     em atraso há menos de `past_due_grace_days` (10): banner, tudo funciona
--     suspended em atraso depois da tolerância, ou suspensa: SÓ LEITURA para equipe e alunos
--     canceled  cancelada há menos de `canceled_access_days` (30): igual à suspensa
--     closed    cancelada depois disso: só o personal (owner) entra, para exportar (regra aplicada nas telas)
-- * Só leitura garantido no BANCO por um gatilho genérico (`private.enforce_org_writable`) em toda tabela de negócio com
--   `organization_id`: qualquer gravação com sessão de usuário (equipe ou aluno) numa conta suspensa/cancelada é recusada
--   com ACCOUNT_READ_ONLY. Sem sessão (servidor, cron) e admin da plataforma com aal2 passam. Nada é apagado.
-- * Sem gateway de pagamento: pagamentos registrados à mão (docs/planos/cobranca.md).

-- 1) Regras (linha única; muda só por SQL/migration) ------------------------------------------------------------------
create table private.account_rules (
  id boolean primary key default true check (id),
  past_due_grace_days integer not null default 10 check (past_due_grace_days between 0 and 90),
  canceled_access_days integer not null default 30 check (canceled_access_days between 0 and 365),
  invite_daily_limit integer not null default 100 check (invite_daily_limit between 1 and 5000),
  inactive_days integer not null default 7 check (inactive_days between 1 and 90),
  nudge_interval_days integer not null default 7 check (nudge_interval_days between 1 and 90),
  support_whatsapp text check (support_whatsapp is null or support_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  support_email text check (support_email is null or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
insert into private.account_rules default values;
revoke all on private.account_rules from public, anon, authenticated;

create function private.account_config()
returns private.account_rules
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.account_rules where id
$$;

-- 2) Situação da assinatura na organização ---------------------------------------------------------------------------
alter table public.organizations
  add column subscription_status text not null default 'active'
    check (subscription_status in ('active', 'past_due', 'suspended', 'canceled')),
  add column status_changed_at timestamptz not null default now();

-- A equipe não escreve em organizations (sem política de UPDATE no RLS); a situação muda só pela RPC da plataforma.
-- O revoke por coluna é reforço.
revoke update (subscription_status, status_changed_at) on public.organizations from authenticated;

create function private.org_access_state(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.id is null then 'closed'
    when o.subscription_status = 'active' then 'ok'
    when o.subscription_status = 'past_due' and now() < o.status_changed_at + make_interval(days => r.past_due_grace_days) then 'grace'
    when o.subscription_status in ('past_due', 'suspended') then 'suspended'
    when o.subscription_status = 'canceled' and now() < o.status_changed_at + make_interval(days => r.canceled_access_days) then 'canceled'
    else 'closed'
  end
  from (select 1) one
  left join public.organizations o on o.id = p_org
  cross join private.account_rules r
$$;

-- 3) Lista da plataforma e dados internos ------------------------------------------------------------------------------
create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.platform_admins from public, anon, authenticated;

create table private.platform_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  paid_on date not null,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index platform_payments_org_idx on private.platform_payments (organization_id, paid_on desc);

create table private.platform_account_notes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  note text not null check (char_length(note) <= 2000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Auditoria própria da plataforma (o personal não lê; `audit_logs` é da organização).
create table private.platform_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index platform_audit_org_idx on private.platform_audit (organization_id, created_at desc);

revoke all on private.platform_payments, private.platform_account_notes, private.platform_audit from public, anon, authenticated;

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid()))
$$;

-- MFA obrigatório no painel da plataforma: a sessão precisa ser aal2 (TOTP verificado no Supabase Auth). Estar na lista
-- sem o segundo fator = FORBIDDEN em toda RPC da plataforma (e nada de passe livre no gatilho de somente leitura).
create function private.platform_mfa_ok()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create function private.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() or not private.platform_mfa_ok() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;

create function private.platform_log(p_org uuid, p_action text, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.platform_audit (actor_id, organization_id, action, detail)
  values ((select auth.uid()), p_org, p_action, p_detail)
$$;

-- 4) Somente leitura garantido no banco -----------------------------------------------------------------------------
create function private.enforce_org_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_state text;
begin
  -- Sem sessão de usuário (servidor com a secret key, cron, cascata da exclusão da organização): passa.
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  if v_org is null or (private.is_platform_admin() and private.platform_mfa_ok()) then
    return coalesce(new, old);
  end if;
  v_state := private.org_access_state(v_org);
  if v_state in ('suspended', 'canceled', 'closed') then
    raise exception 'ACCOUNT_READ_ONLY' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function private.enforce_org_writable() from public, anon, authenticated;

-- Toda tabela de negócio do schema public com organization_id, menos as técnicas (auditoria, perfis, cursores de leitura,
-- registros ao vivo, contadores, uso/estado da IA, cartão do NPS). TABELA NOVA com organization_id: criar o gatilho
-- `org_writable` na migration dela (ver CLAUDE.md).
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in (
        'audit_logs', 'profiles', 'feed_reads', 'live_sessions', 'organization_counters',
        'ai_usage_daily', 'ai_session_state', 'nps_prompts'
      )
  loop
    execute format(
      'create trigger org_writable before insert or update or delete on public.%I for each row execute function private.enforce_org_writable()',
      t
    );
  end loop;
end;
$$;

-- 5) RPCs da plataforma ----------------------------------------------------------------------------------------------
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
$$;

-- Portão das telas: 'none' (fora da lista: 404) · 'mfa_required' (na lista, sessão sem aal2: tela do autenticador) ·
-- 'ok'. Só diz respeito ao próprio usuário.
create function public.platform_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_platform_admin() then 'none'
    when not private.platform_mfa_ok() then 'mfa_required'
    else 'ok'
  end
$$;

-- Contas: só dados da conta e contagens. Nunca nome, contato ou dado de aluno.
create function public.platform_list_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'owner_name', ow.full_name,
        'owner_email', u.email,
        'owner_pending', u.id is not null and u.last_sign_in_at is null,
        'plan', o.plan,
        'student_limit', o.student_limit,
        'seats_used', (select count(*) from public.students s where s.organization_id = o.id and private.occupies_seat(s)),
        'created_at', o.created_at,
        'last_access_at', (select max(uu.last_sign_in_at) from public.profiles p join auth.users uu on uu.id = p.id
                           where p.organization_id = o.id and p.role in ('owner', 'trainer')),
        'subscription_status', o.subscription_status,
        'status_changed_at', o.status_changed_at,
        'access_state', private.org_access_state(o.id),
        'last_payment_on', (select max(pp.paid_on) from private.platform_payments pp where pp.organization_id = o.id),
        'paid_until', (select max(pp.period_end) from private.platform_payments pp where pp.organization_id = o.id)
      ) order by o.created_at desc)
    from public.organizations o
    left join lateral (
      select p.id, p.full_name from public.profiles p
      where p.organization_id = o.id and p.role = 'owner' order by p.created_at, p.id limit 1
    ) ow on true
    left join auth.users u on u.id = ow.id
  ), '[]'::jsonb);
end;
$$;

create function public.platform_account_detail(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'note', (select n.note from private.platform_account_notes n where n.organization_id = p_org),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', pp.id, 'paid_on', pp.paid_on, 'amount_cents', pp.amount_cents,
          'period_start', pp.period_start, 'period_end', pp.period_end, 'note', pp.note, 'created_at', pp.created_at
        ) order by pp.paid_on desc, pp.created_at desc)
      from private.platform_payments pp where pp.organization_id = p_org
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'detail', a.detail, 'created_at', a.created_at)
        order by a.created_at desc)
      from (select * from private.platform_audit a2 where a2.organization_id = p_org order by a2.created_at desc limit 50) a
    ), '[]'::jsonb)
  );
end;
$$;

-- Criar conta de personal: o SERVIDOR cria antes o usuário do Auth (convite, sem senha) com a secret key, depois desta
-- autorização (`is_platform_admin`); aqui, com a sessão do admin, criam-se organização + perfil de owner, auditados.
create function public.platform_create_account(
  p_user_id uuid, p_org_name text, p_owner_name text, p_plan public.plan_tier, p_student_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_name text := trim(coalesce(p_org_name, ''));
  v_owner text := trim(coalesce(p_owner_name, ''));
  v_slug text;
begin
  perform private.require_platform_admin();
  if char_length(v_name) not between 2 and 120 or char_length(v_owner) not between 2 and 120
     or p_student_limit is null or p_student_limit < 1 or p_student_limit > 100000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) or exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'user';
  end if;
  v_slug := left(regexp_replace(lower(private.immutable_unaccent(v_name)), '[^a-z0-9]+', '-', 'g'), 40);
  v_slug := trim(both '-' from v_slug) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  insert into public.organizations (name, slug, plan, student_limit)
  values (v_name, v_slug, coalesce(p_plan, 'pro'), p_student_limit)
  returning id into v_org;
  insert into public.profiles (id, organization_id, role, full_name) values (p_user_id, v_org, 'owner', v_owner);
  perform private.platform_log(v_org, 'account.created', jsonb_build_object('plan', coalesce(p_plan, 'pro'), 'student_limit', p_student_limit));
  return v_org;
end;
$$;

-- Dono da conta, para gerar um link novo de definir senha (o servidor gera com a secret key depois desta autorização).
create function public.platform_account_owner(p_org uuid)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select p.id, u.email::text from public.profiles p join auth.users u on u.id = p.id
  where p.organization_id = p_org and p.role = 'owner' order by p.created_at, p.id limit 1;
end;
$$;

create function public.platform_log_invite(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  perform private.platform_log(p_org, 'account.invite_link', null);
end;
$$;

create function public.platform_update_plan(p_org uuid, p_plan public.plan_tier, p_student_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizations;
begin
  perform private.require_platform_admin();
  if p_plan is null or p_student_limit is null or p_student_limit < 1 or p_student_limit > 100000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  select * into o from public.organizations where id = p_org for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.organizations set plan = p_plan, student_limit = p_student_limit, updated_at = now() where id = p_org;
  perform private.platform_log(p_org, 'account.plan_updated', jsonb_build_object(
    'from', jsonb_build_object('plan', o.plan, 'student_limit', o.student_limit),
    'to', jsonb_build_object('plan', p_plan, 'student_limit', p_student_limit)
  ));
end;
$$;

create function public.platform_record_payment(
  p_org uuid, p_paid_on date, p_amount_cents integer, p_period_start date, p_period_end date, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 or p_amount_cents is null or p_amount_cents <= 0
     or p_period_start is null or p_period_end is null or p_period_end < p_period_start
     or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  insert into private.platform_payments (organization_id, paid_on, amount_cents, period_start, period_end, note, created_by)
  values (p_org, p_paid_on, p_amount_cents, p_period_start, p_period_end, nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  perform private.platform_log(p_org, 'payment.recorded', jsonb_build_object(
    'paid_on', p_paid_on, 'amount_cents', p_amount_cents, 'period_start', p_period_start, 'period_end', p_period_end
  ));
  return v_id;
end;
$$;

create function public.platform_set_status(p_org uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizations;
begin
  perform private.require_platform_admin();
  if p_status is null or p_status not in ('active', 'past_due', 'suspended', 'canceled') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  select * into o from public.organizations where id = p_org for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.subscription_status is distinct from p_status then
    update public.organizations set subscription_status = p_status, status_changed_at = now(), updated_at = now() where id = p_org;
    perform private.platform_log(p_org, 'account.status_changed', jsonb_build_object('from', o.subscription_status, 'to', p_status));
  end if;
end;
$$;

create function public.platform_set_note(p_org uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := trim(coalesce(p_note, ''));
begin
  perform private.require_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if v_note = '' then
    delete from private.platform_account_notes where organization_id = p_org;
  else
    insert into private.platform_account_notes (organization_id, note, updated_by) values (p_org, v_note, (select auth.uid()))
    on conflict (organization_id) do update set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  end if;
  -- Auditoria sem o texto da observação (só o tamanho).
  perform private.platform_log(p_org, 'account.note_updated', jsonb_build_object('length', char_length(v_note)));
end;
$$;

-- 6) Para a equipe e o aluno ----------------------------------------------------------------------------------------
-- Situação da própria conta (banner, "Regularizar assinatura", Configurações). Qualquer staff da organização.
create function public.get_my_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  o public.organizations;
  r private.account_rules := private.account_config();
begin
  select * into o from public.organizations where id = v_org;
  return jsonb_build_object(
    'status', o.subscription_status,
    'state', private.org_access_state(v_org),
    'status_changed_at', o.status_changed_at,
    'grace_ends_at', case when o.subscription_status = 'past_due' then o.status_changed_at + make_interval(days => r.past_due_grace_days) end,
    'access_ends_at', case when o.subscription_status = 'canceled' then o.status_changed_at + make_interval(days => r.canceled_access_days) end,
    'plan', o.plan,
    'student_limit', o.student_limit,
    'paid_until', (select max(pp.period_end) from private.platform_payments pp where pp.organization_id = v_org),
    'support_whatsapp', r.support_whatsapp,
    'support_email', r.support_email
  );
end;
$$;

-- Contato da plataforma (item "Suporte" do menu): qualquer usuário logado.
create function public.get_platform_support()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null
    else jsonb_build_object('whatsapp', r.support_whatsapp, 'email', r.support_email) end
  from private.account_rules r
$$;

-- Aluno (titular): a conta do personal limita o app? ok | limited (suspensa/cancelada: só leitura do último treino e
-- histórico) | closed (cancelada há mais de 30 dias). E o primeiro nome de quem acompanha, para a mensagem.
create function public.get_my_access_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_state text;
  v_name text;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_state := private.org_access_state(s.organization_id);
  select coalesce(
    nullif(split_part(trim(t.full_name), ' ', 1), ''),
    (select nullif(split_part(trim(p.full_name), ' ', 1), '') from public.profiles p
     where p.organization_id = s.organization_id and p.role = 'owner' order by p.created_at, p.id limit 1)
  ) into v_name
  from (select 1) one left join public.profiles t on t.id = s.trainer_id;
  return jsonb_build_object(
    'state', case when v_state in ('ok', 'grace') then 'ok' when v_state = 'closed' then 'closed' else 'limited' end,
    'personal_name', v_name
  );
end;
$$;

-- 7) Permissões ------------------------------------------------------------------------------------------------------
revoke execute on function
  private.account_config(), private.org_access_state(uuid), private.is_platform_admin(), private.require_platform_admin(),
  private.platform_log(uuid, text, jsonb), private.platform_mfa_ok()
from public, anon, authenticated;

revoke execute on function
  public.is_platform_admin(), public.platform_access(), public.platform_list_accounts(), public.platform_account_detail(uuid),
  public.platform_create_account(uuid, text, text, public.plan_tier, integer), public.platform_account_owner(uuid),
  public.platform_log_invite(uuid), public.platform_update_plan(uuid, public.plan_tier, integer),
  public.platform_record_payment(uuid, date, integer, date, date, text), public.platform_set_status(uuid, text),
  public.platform_set_note(uuid, text), public.get_my_subscription(), public.get_platform_support(),
  public.get_my_access_limits()
from public, anon;
grant execute on function
  public.is_platform_admin(), public.platform_access(), public.platform_list_accounts(), public.platform_account_detail(uuid),
  public.platform_create_account(uuid, text, text, public.plan_tier, integer), public.platform_account_owner(uuid),
  public.platform_log_invite(uuid), public.platform_update_plan(uuid, public.plan_tier, integer),
  public.platform_record_payment(uuid, date, integer, date, date, text), public.platform_set_status(uuid, text),
  public.platform_set_note(uuid, text), public.get_my_subscription(), public.get_platform_support(),
  public.get_my_access_limits()
to authenticated;
