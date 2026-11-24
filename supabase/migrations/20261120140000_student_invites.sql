-- Sprint de venda, 1.4: convites dos alunos (inclusive os importados em pré-cadastro).
-- * Convite = link individual de uso único, válido por 7 dias (`access_links.kind = 'invite'`; o link de acesso antigo,
--   de 30 min, continua como 'access'). O consumo é o mesmo (`consume_access_link` → definir senha → consentimentos).
-- * Sem e-mail: o link volta só na resposta (o banco guarda só o hash) para copiar ou abrir o WhatsApp.
-- * Limite diário por conta (`private.account_rules.invite_daily_limit`, padrão 100), contado no dia civil da conta.
-- * Status na lista: aceito (aluno já tem login) · enviado (convite válido) · expirado · nenhum.

alter table public.access_links
  add column kind text not null default 'access' check (kind in ('access', 'invite'));
create index access_links_org_kind_created_idx on public.access_links (organization_id, kind, created_at desc);

-- Gera convites para vários alunos. Cada aluno: acesso pela regra de sempre (owner ou responsável) e sem login ainda.
-- O lote inteiro é recusado se passar do limite de hoje (INVITE_LIMIT_REACHED, detail = quantos ainda cabem).
create function public.create_student_invites(p_student_ids uuid[])
returns table (student_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  r private.account_rules := private.account_config();
  v_ids uuid[];
  v_used integer;
  s public.students;
  v_token text;
  v_exp timestamptz := now() + interval '7 days';
  v_id uuid;
begin
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_student_ids, '{}'::uuid[])) x;
  if v_ids is null or array_length(v_ids, 1) = 0 or array_length(v_ids, 1) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  -- Uma geração por vez por conta (a contagem do limite não corre com outra aba).
  perform pg_advisory_xact_lock(hashtext('lfit.invites'), hashtext(v_org::text));
  select count(*)::integer into v_used from public.access_links l
  where l.organization_id = v_org and l.kind = 'invite' and private.sp_day(l.created_at) = private.today_br();
  if v_used + array_length(v_ids, 1) > r.invite_daily_limit then
    raise exception 'INVITE_LIMIT_REACHED' using errcode = 'P0001', detail = greatest(r.invite_daily_limit - v_used, 0)::text;
  end if;

  foreach v_id in array v_ids loop
    s := private.lock_accessible_student(v_id);
    if s.user_id is not null then
      raise exception 'STUDENT_HAS_ACCOUNT' using errcode = 'P0001';
    end if;
    -- Convite novo invalida links anteriores ainda válidos do aluno.
    update public.access_links set expires_at = now()
    where access_links.student_id = s.id and used_at is null and access_links.expires_at > now();
    v_token := private.random_token();
    insert into public.access_links (organization_id, student_id, token_hash, created_by, expires_at, kind)
    values (s.organization_id, s.id, private.sha256_hex(v_token), (select auth.uid()), v_exp, 'invite');
    perform private.audit(s.organization_id, 'student.invite_created', 'student', s.id);
    student_id := s.id;
    token := v_token;
    expires_at := v_exp;
    return next;
  end loop;
end;
$$;

-- Status de convite dos alunos que o chamador acessa (todos os da lista, ou os ids informados).
create function public.student_invite_statuses(p_student_ids uuid[] default null)
returns table (student_id uuid, status text, sent_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
    case
      when s.user_id is not null then 'accepted'
      when l.id is null then 'none'
      when l.used_at is not null then 'accepted'
      when l.expires_at <= now() then 'expired'
      else 'sent'
    end,
    l.created_at,
    l.expires_at
  from public.students s
  left join lateral (
    select a.* from public.access_links a
    where a.student_id = s.id and a.kind = 'invite'
    order by a.created_at desc limit 1
  ) l on true
  where s.organization_id = private.current_org_id()
    and private.is_staff()
    and s.deleted_at is null
    and private.can_access_student(s.id)
    and (p_student_ids is null or s.id = any (p_student_ids))
$$;

-- Quantos convites ainda cabem hoje na conta.
create function public.get_invite_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  r private.account_rules := private.account_config();
  v_used integer;
begin
  select count(*)::integer into v_used from public.access_links l
  where l.organization_id = v_org and l.kind = 'invite' and private.sp_day(l.created_at) = private.today_br();
  return jsonb_build_object('limit', r.invite_daily_limit, 'used_today', v_used, 'remaining', greatest(r.invite_daily_limit - v_used, 0));
end;
$$;

revoke execute on function
  public.create_student_invites(uuid[]), public.student_invite_statuses(uuid[]), public.get_invite_quota()
from public, anon;
grant execute on function
  public.create_student_invites(uuid[]), public.student_invite_statuses(uuid[]), public.get_invite_quota()
to authenticated;
