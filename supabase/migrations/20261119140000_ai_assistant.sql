-- =============================================================================
-- Assistente de IA na tela de execução (Pacote 3; DESLIGADO por padrão; 19/11/2026).
--
-- * `organizations.ai_assistant_enabled` padrão FALSE. Nenhuma organização é ligada aqui e não há RPC para ligar: a
--   decisão de ligar depende da revisão jurídica (docs/ia-checklist-juridico.md).
-- * O provedor (API da Anthropic) é chamado SOMENTE no servidor (rota /aluno/assistente). O banco decide tudo antes:
--   acesso, aceite do aluno, pausa, limite diário e a CAMADA DE SEGURANÇA DETERMINÍSTICA — expressões de dor/sintoma
--   (`private.ai_safety_hit`) gravam a resposta fixa, pausam a IA naquela sessão e criam o alerta do AO VIVO, sem
--   passar pelo modelo.
-- * Contexto enviado ao provedor (montado aqui, em `ai_submit_message`): exercício atual, prescrição e a dica do
--   professor. Nunca nome do aluno, anamnese, lesões, condições, orientação de cuidado ou histórico de saúde.
-- * Professor mandou mensagem no chat durante a sessão → a IA pausa naquela sessão (gatilho em chat_messages).
-- * Conversas: RLS no nível de `can_view_student_health` (staff) ou o próprio aluno. Retenção de 90 dias (pg_cron).
--   Conteúdo nunca vai para log ou auditoria.
-- * Limites: mensagens/dia por aluno, tamanho da mensagem, teto de tokens e prazo — em `private.ai_settings` (muda só
--   por migration). Custo estimado por organização e dia em `ai_usage_daily`.
-- Aditiva: coluna nova (padrão false) em organizations, tabelas e funções; `get_live_board` ganha o alerta da IA.
-- =============================================================================

-- 1) Flag e regras ----------------------------------------------------------------------------------------------------
alter table public.organizations add column ai_assistant_enabled boolean not null default false;

create table private.ai_settings (
  singleton boolean primary key default true check (singleton),
  model text not null,
  daily_limit integer not null check (daily_limit between 1 and 500),
  max_input_chars integer not null check (max_input_chars between 50 and 2000),
  max_output_tokens integer not null check (max_output_tokens between 256 and 8192),
  history_messages integer not null check (history_messages between 0 and 20),
  timeout_ms integer not null check (timeout_ms between 5000 and 60000),
  retention_days integer not null check (retention_days between 1 and 365),
  consent_version text not null,
  -- Preço por milhão de tokens (USD), para o contador de custo; atualizar por migration quando o preço mudar.
  input_usd_per_mtok numeric(10, 4) not null,
  output_usd_per_mtok numeric(10, 4) not null,
  safety_reply text not null,
  updated_at timestamptz not null default now()
);
insert into private.ai_settings (
  model, daily_limit, max_input_chars, max_output_tokens, history_messages, timeout_ms, retention_days,
  consent_version, input_usd_per_mtok, output_usd_per_mtok, safety_reply
) values (
  'claude-opus-5-5', 30, 500, 512, 6, 20000, 90,
  '2026-11-19.1', 4.0000, 20.0000, 'Pare o exercício e aguarde seu professor.'
);
revoke all on private.ai_settings from public, anon, authenticated, service_role;

create function private.ai_config()
returns private.ai_settings
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.ai_settings where singleton
$$;

-- 2) Tabelas ----------------------------------------------------------------------------------------------------------
create table public.ai_consents (
  student_id uuid not null references public.students (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 40),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (student_id, version)
);
create index ai_consents_org_idx on public.ai_consents (organization_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  role text not null check (role in ('student', 'assistant')),
  -- normal; safety = resposta fixa da camada de segurança; fallback = contingência (falha/tempo esgotado do provedor).
  kind text not null default 'normal' check (kind in ('normal', 'safety', 'fallback')),
  reply_to uuid references public.ai_messages (id) on delete cascade,
  item_id uuid,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((role = 'assistant') = (reply_to is not null))
);
create unique index ai_messages_reply_to_unique on public.ai_messages (reply_to) where reply_to is not null;
create index ai_messages_session_idx on public.ai_messages (session_id, created_at);
create index ai_messages_student_created_idx on public.ai_messages (student_id, created_at desc);
create index ai_messages_org_idx on public.ai_messages (organization_id);

create table public.ai_session_state (
  session_id uuid primary key references public.workout_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  paused_reason text check (paused_reason in ('safety', 'coach_message')),
  paused_at timestamptz,
  alert_kind text check (alert_kind in ('safety', 'failure')),
  alert_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((paused_reason is null) = (paused_at is null)),
  check ((alert_kind is null) = (alert_at is null))
);
create index ai_session_state_org_alert_idx on public.ai_session_state (organization_id, alert_at desc);
create index ai_session_state_student_idx on public.ai_session_state (student_id);

create table public.ai_usage_daily (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  messages integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd_micros bigint not null default 0,
  primary key (organization_id, day)
);

alter table public.ai_consents enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_session_state enable row level security;
alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_consents, public.ai_messages, public.ai_session_state, public.ai_usage_daily
  from public, anon, authenticated;
grant select on public.ai_consents, public.ai_messages, public.ai_session_state, public.ai_usage_daily to authenticated;
grant select, insert, update, delete on public.ai_consents, public.ai_messages, public.ai_session_state, public.ai_usage_daily
  to service_role;

-- Aluno: os próprios. Staff: só quem vê a saúde do aluno (a conversa pode conter relato de sintoma).
create policy ai_consents_select on public.ai_consents for select to authenticated
  using (private.is_own_student(student_id));
create policy ai_messages_select on public.ai_messages for select to authenticated
  using (
    private.is_own_student(student_id)
    or (organization_id = (select private.current_org_id()) and (select private.is_staff()) and private.can_view_student_health(student_id))
  );
create policy ai_session_state_select on public.ai_session_state for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()) and private.can_view_student_health(student_id));
create policy ai_usage_daily_select on public.ai_usage_daily for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));

-- O painel AO VIVO recarrega quando um alerta da IA aparece (o evento só dispara a busca).
alter publication supabase_realtime add table public.ai_session_state;

-- 3) Camada de segurança determinística -------------------------------------------------------------------------------
-- Texto normalizado (minúsculas, sem acento, só letras/dígitos separados por espaço); casa palavra/expressão inteira.
-- A MESMA lista está em features/assistant/safety.ts (teste unitário confere que são iguais).
create function private.ai_safety_hit(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(array[
      -- SAFETY_TERMS_START
      'dor', 'dores', 'doendo', 'doeu', 'doi', 'doer', 'dolorido', 'dolorida', 'pontada', 'pontadas', 'fisgada',
      'fisgou', 'formigamento', 'formigando', 'formigar', 'dormencia', 'dormente', 'adormecido', 'adormeceu',
      'tontura', 'tonto', 'tonta', 'zonzo', 'zonza', 'vertigem', 'falta de ar', 'sem ar', 'nao consigo respirar',
      'enjoo', 'enjoado', 'enjoada', 'nausea', 'vomito', 'vomitei', 'vomitar', 'desmaio', 'desmaiar', 'desmaiei',
      'desmaiando', 'dor no peito', 'aperto no peito', 'palpitacao', 'coracao disparado', 'estalo', 'estalou',
      'estalando', 'travou', 'travada', 'travado', 'torci', 'torceu', 'machuquei', 'machucou', 'lesionei',
      'sangrando', 'sangue', 'inchado', 'inchada', 'inchou', 'caimbra', 'caibra', 'visao turva', 'vista escura',
      'escureceu', 'mal estar', 'passando mal', 'choque', 'choquinho', 'queimacao', 'queimando', 'ardendo',
      'ardencia', 'agulhada', 'irradia', 'irradiando', 'incomodo', 'incomodando', 'desconforto', 'latejando',
      'fraqueza', 'perna fraca', 'perdi a forca', 'sem forca', 'nao sinto', 'sem sensibilidade', 'incontinencia',
      'perdi o controle', 'xixi', 'urina', 'hernia', 'ciatico', 'ciatica'
      -- SAFETY_TERMS_END
    ]) as term
    where position(
      ' ' || term || ' ' in
      ' ' || trim(regexp_replace(lower(private.immutable_unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', ' ', 'g')) || ' '
    ) > 0
  )
$$;

revoke execute on function private.ai_config(), private.ai_safety_hit(text) from public, anon, authenticated;

-- 4) Helpers ----------------------------------------------------------------------------------------------------------
-- Sessão do PRÓPRIO aluno (só o titular usa o assistente; staff no modo presencial não).
create function private.ai_own_session(p_session_id uuid, p_lock boolean)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
begin
  if p_lock then
    select * into w from public.workout_sessions where id = p_session_id for update;
  else
    select * into w from public.workout_sessions where id = p_session_id;
  end if;
  if not found or not private.is_own_student(w.student_id) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  return w;
end;
$$;

create function private.ai_set_state(p_session public.workout_sessions, p_pause text, p_alert text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_session_state (session_id, organization_id, student_id, paused_reason, paused_at, alert_kind, alert_at)
  values (
    p_session.id, p_session.organization_id, p_session.student_id,
    p_pause, case when p_pause is null then null else now() end,
    p_alert, case when p_alert is null then null else now() end
  )
  on conflict (session_id) do update set
    paused_reason = coalesce(public.ai_session_state.paused_reason, excluded.paused_reason),
    paused_at = coalesce(public.ai_session_state.paused_at, excluded.paused_at),
    -- Alerta de segurança não é rebaixado para falha.
    alert_kind = case
      when excluded.alert_kind is null then public.ai_session_state.alert_kind
      when public.ai_session_state.alert_kind = 'safety' then 'safety'
      else excluded.alert_kind
    end,
    alert_at = coalesce(excluded.alert_at, public.ai_session_state.alert_at),
    updated_at = now()
$$;

-- Professor/owner mandou mensagem no chat durante a sessão → pausa a IA nas sessões abertas do aluno. Nunca impede o
-- envio da mensagem (erro engolido, sem log).
create function private.ai_pause_on_coach_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_role = 'staff' then
    begin
      insert into public.ai_session_state (session_id, organization_id, student_id, paused_reason, paused_at)
      select w.id, w.organization_id, w.student_id, 'coach_message', now()
      from public.workout_sessions w
      join public.organizations o on o.id = w.organization_id
      where w.student_id = new.student_id and w.status = 'in_progress'
        and w.started_at > now() - interval '6 hours' and o.ai_assistant_enabled
      on conflict (session_id) do update set
        paused_reason = coalesce(public.ai_session_state.paused_reason, 'coach_message'),
        paused_at = coalesce(public.ai_session_state.paused_at, now()),
        updated_at = now();
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

create trigger chat_messages_ai_pause after insert on public.chat_messages
  for each row execute function private.ai_pause_on_coach_message();

revoke execute on function
  private.ai_own_session(uuid, boolean),
  private.ai_set_state(public.workout_sessions, text, text),
  private.ai_pause_on_coach_message()
from public, anon, authenticated;

-- 5) RPCs do aluno ----------------------------------------------------------------------------------------------------
-- Estado do painel: ligado na organização, aceite pendente, pausa, quanto resta hoje e as mensagens desta sessão.
create function public.get_ai_assistant_state(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg private.ai_settings := private.ai_config();
  w public.workout_sessions := private.ai_own_session(p_session_id, false);
  v_enabled boolean;
  st public.ai_session_state;
  v_used integer;
begin
  select o.ai_assistant_enabled into v_enabled from public.organizations o where o.id = w.organization_id;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('enabled', false);
  end if;
  select * into st from public.ai_session_state where session_id = w.id;
  select count(*)::integer into v_used from public.ai_messages m
  where m.student_id = w.student_id and m.role = 'student' and private.sp_day(m.created_at) = private.today_br();

  return jsonb_build_object(
    'enabled', true,
    'consent_version', cfg.consent_version,
    'consent_required', not exists (
      select 1 from public.ai_consents c where c.student_id = w.student_id and c.version = cfg.consent_version
    ),
    'paused', st.paused_reason is not null,
    'paused_reason', st.paused_reason,
    'remaining_today', greatest(cfg.daily_limit - v_used, 0),
    'max_input_chars', cfg.max_input_chars,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'kind', m.kind, 'body', m.body, 'created_at', m.created_at)
        order by m.created_at, m.id)
      from public.ai_messages m where m.session_id = w.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Aceite do aviso no primeiro uso (versão atual; registro com data).
create function public.accept_ai_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.ai_settings := private.ai_config();
  s public.students;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_version is distinct from cfg.consent_version then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'version';
  end if;
  insert into public.ai_consents (student_id, version, organization_id) values (s.id, p_version, s.organization_id)
  on conflict do nothing;
end;
$$;

-- Mensagem do aluno. Ordem: sessão própria e aberta → ligado → aceite → pausa → limite → tamanho → grava → segurança
-- determinística (resposta fixa + pausa + alerta, sem modelo) → senão devolve o contexto mínimo para o servidor chamar
-- o provedor. Nunca grava conteúdo em log ou auditoria.
create function public.ai_submit_message(p_session_id uuid, p_item_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.ai_settings := private.ai_config();
  w public.workout_sessions := private.ai_own_session(p_session_id, true);
  v_enabled boolean;
  st public.ai_session_state;
  v_used integer;
  v_body text := trim(coalesce(p_body, ''));
  v_msg uuid;
  v_item jsonb;
begin
  if public.session_effective_status(w) <> 'in_progress' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001';
  end if;
  select o.ai_assistant_enabled into v_enabled from public.organizations o where o.id = w.organization_id;
  if not coalesce(v_enabled, false) then
    raise exception 'AI_DISABLED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ai_consents c where c.student_id = w.student_id and c.version = cfg.consent_version) then
    raise exception 'AI_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;
  select * into st from public.ai_session_state where session_id = w.id;
  if st.paused_reason is not null then
    return jsonb_build_object('status', 'paused', 'paused_reason', st.paused_reason);
  end if;
  -- Trava por aluno para a contagem do limite não correr com outra aba.
  perform pg_advisory_xact_lock(hashtext('lfit.ai_submit'), hashtext(w.student_id::text));
  select count(*)::integer into v_used from public.ai_messages m
  where m.student_id = w.student_id and m.role = 'student' and private.sp_day(m.created_at) = private.today_br();
  if v_used >= cfg.daily_limit then
    return jsonb_build_object('status', 'limit');
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > cfg.max_input_chars then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'body';
  end if;

  insert into public.ai_messages (organization_id, student_id, session_id, role, item_id, body)
  values (w.organization_id, w.student_id, w.id, 'student', p_item_id, v_body)
  returning id into v_msg;

  if private.ai_safety_hit(v_body) then
    insert into public.ai_messages (organization_id, student_id, session_id, role, kind, reply_to, item_id, body)
    values (w.organization_id, w.student_id, w.id, 'assistant', 'safety', v_msg, p_item_id, cfg.safety_reply);
    perform private.ai_set_state(w, 'safety', 'safety');
    return jsonb_build_object('status', 'safety', 'reply', cfg.safety_reply, 'remaining_today', cfg.daily_limit - v_used - 1);
  end if;

  -- Contexto mínimo: só o exercício atual da cópia da divisão (nome, prescrição, dica do professor).
  select i into v_item from jsonb_array_elements(coalesce(w.snapshot -> 'items', '[]'::jsonb)) i where i ->> 'id' = p_item_id::text;

  return jsonb_build_object(
    'status', 'ok',
    'message_id', v_msg,
    'remaining_today', cfg.daily_limit - v_used - 1,
    'context', case when v_item is null then null else jsonb_build_object(
      'exercise', v_item -> 'exercise' ->> 'name',
      'sets', v_item -> 'sets',
      'quantity_unit', v_item ->> 'quantity_unit',
      'quantity_min', v_item -> 'quantity_min',
      'quantity_max', v_item -> 'quantity_max',
      'quantity_note', v_item ->> 'quantity_note',
      'load_value', v_item -> 'load_value',
      'load_unit', v_item ->> 'load_unit',
      'load_text', v_item ->> 'load_text',
      'intensity', v_item ->> 'intensity',
      'rest_min', v_item -> 'rest_min',
      'rest_max', v_item -> 'rest_max',
      'tip', v_item ->> 'tip'
    ) end,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('role', h.role, 'body', h.body) order by h.created_at, h.id)
      from (
        select m.role, m.body, m.created_at, m.id from public.ai_messages m
        where m.session_id = w.id and m.id <> v_msg and m.kind = 'normal'
        order by m.created_at desc, m.id desc
        limit cfg.history_messages
      ) h
    ), '[]'::jsonb),
    'config', jsonb_build_object('model', cfg.model, 'max_output_tokens', cfg.max_output_tokens, 'timeout_ms', cfg.timeout_ms)
  );
end;
$$;

-- 6) Só servidor: grava a resposta do provedor (ou a contingência), soma uso e custo. Chamada com a secret key DEPOIS
-- que `ai_submit_message` (sessão do aluno) autorizou. Se o professor pausou durante a chamada, a resposta é descartada.
create function public.ai_record_reply(
  p_message_id uuid, p_body text, p_input_tokens integer, p_output_tokens integer, p_failed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.ai_settings := private.ai_config();
  m public.ai_messages;
  w public.workout_sessions;
  st public.ai_session_state;
  v_in integer := greatest(coalesce(p_input_tokens, 0), 0);
  v_out integer := greatest(coalesce(p_output_tokens, 0), 0);
begin
  select * into m from public.ai_messages where id = p_message_id and role = 'student' for update;
  if not found or exists (select 1 from public.ai_messages r where r.reply_to = m.id) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'message';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'body';
  end if;
  select * into w from public.workout_sessions where id = m.session_id;

  insert into public.ai_usage_daily (organization_id, day, messages, input_tokens, output_tokens, cost_usd_micros)
  values (
    m.organization_id, private.today_br(), 1, v_in, v_out,
    round(v_in * cfg.input_usd_per_mtok + v_out * cfg.output_usd_per_mtok)::bigint
  )
  on conflict (organization_id, day) do update set
    messages = public.ai_usage_daily.messages + 1,
    input_tokens = public.ai_usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_usage_daily.output_tokens + excluded.output_tokens,
    cost_usd_micros = public.ai_usage_daily.cost_usd_micros + excluded.cost_usd_micros;

  select * into st from public.ai_session_state where session_id = m.session_id;
  if st.paused_reason is not null then
    return jsonb_build_object('status', 'paused', 'paused_reason', st.paused_reason);
  end if;

  insert into public.ai_messages (organization_id, student_id, session_id, role, kind, reply_to, item_id, body)
  values (m.organization_id, m.student_id, m.session_id, 'assistant',
    case when p_failed then 'fallback' else 'normal' end, m.id, m.item_id, left(trim(p_body), 2000));
  if p_failed then
    perform private.ai_set_state(w, null, 'failure');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- 7) AO VIVO: "Precisa de atenção" ganha o alerta da IA ---------------------------------------------------------------
-- Mesmo corpo de 20261119120000 + os alertas de `ai_session_state` (segurança = dado de saúde: completo vê "ai_safety",
-- restrito vê o aviso genérico; falha do provedor não é saúde: "ai_failed" para quem acessa o aluno). Uma linha por
-- (tipo, aluno), a mais recente.
create or replace function public.get_live_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_enabled boolean;
  v_live jsonb;
  v_attention jsonb;
  c_active interval := interval '90 minutes';
  c_heartbeat interval := interval '10 minutes';
  c_stalled interval := interval '20 minutes';
  c_unanswered interval := interval '5 minutes';
  c_window interval := interval '24 hours';
begin
  select o.live_enabled into v_enabled from public.organizations o where o.id = v_org;

  if coalesce(v_enabled, false) then
    with acc as (
      select * from private.dashboard_students()
    ),
    live as (
      select ls.session_id, ls.student_id, acc.first_name, acc.last_name, w.workout_label, w.started_at, ls.last_event_at,
        jsonb_array_length(coalesce(w.snapshot -> 'items', '[]'::jsonb)) as total,
        (select count(*)::integer from public.session_item_logs l where l.session_id = w.id and l.completed_at is not null) as done
      from public.live_sessions ls
      join acc on acc.id = ls.student_id
      join public.workout_sessions w on w.id = ls.session_id
      join private.live_heartbeats h on h.session_id = ls.session_id
      where ls.organization_id = v_org
        and public.session_effective_status(w) = 'in_progress'
        and ls.last_event_at > now() - c_active
        and h.last_at > now() - c_heartbeat
    ),
    pain as (
      select ws.student_id, max(ws.started_at) as since
      from public.workout_sessions ws
      join acc on acc.id = ws.student_id
      where ws.started_at > now() - c_window and ws.trainer_reviewed_at is null
        and (ws.pain_checkin = 'ainda_incomoda'
          or exists (select 1 from public.session_item_logs l where l.session_id = ws.id and l.pain_score > 5))
      group by ws.student_id
    ),
    pain_level as (
      select p.student_id, p.since,
        case
          when private.can_view_student_health(p.student_id) then 'pain'
          when private.is_restricted_health_viewer(p.student_id) then 'session_alert'
        end as kind
      from pain p
    ),
    ai_level as (
      select st.student_id, st.alert_at as since,
        case
          when st.alert_kind = 'failure' then 'ai_failed'
          when private.can_view_student_health(st.student_id) then 'ai_safety'
          when private.is_restricted_health_viewer(st.student_id) then 'session_alert'
        end as kind
      from public.ai_session_state st
      join acc on acc.id = st.student_id
      where st.organization_id = v_org and st.alert_at > now() - c_window
    ),
    last_msg as (
      select distinct on (cm.student_id) cm.student_id, cm.sender_role, cm.created_at
      from public.chat_messages cm
      join acc on acc.id = cm.student_id
      where cm.organization_id = v_org and cm.created_at > now() - c_window
      order by cm.student_id, cm.created_at desc, cm.id desc
    ),
    attention_raw as (
      select kind, student_id, since from pain_level where kind is not null
      union all
      select kind, student_id, since from ai_level where kind is not null
      union all
      select 'unanswered', student_id, created_at from last_msg
      where sender_role = 'student' and created_at <= now() - c_unanswered
      union all
      select 'stalled', student_id, last_event_at from live where last_event_at <= now() - c_stalled
    ),
    attention as (
      select kind, student_id, max(since) as since from attention_raw group by kind, student_id
    )
    select
      (select coalesce(jsonb_agg(jsonb_build_object(
          'session_id', l.session_id, 'student_id', l.student_id, 'first_name', l.first_name, 'last_name', l.last_name,
          'workout_label', l.workout_label, 'started_at', l.started_at, 'last_event_at', l.last_event_at,
          'done', l.done, 'total', l.total
        ) order by l.started_at), '[]'::jsonb) from live l),
      (select coalesce(jsonb_agg(jsonb_build_object(
          'kind', a.kind, 'student_id', a.student_id, 'first_name', acc.first_name, 'last_name', acc.last_name,
          'since', a.since
        ) order by a.since), '[]'::jsonb) from attention a join acc on acc.id = a.student_id)
    into v_live, v_attention;
  end if;

  return jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'can_configure', private.is_owner(),
    'now', now(),
    'stalled_after_min', extract(epoch from c_stalled)::integer / 60,
    'unanswered_after_min', extract(epoch from c_unanswered)::integer / 60,
    'live', coalesce(v_live, '[]'::jsonb),
    'attention', coalesce(v_attention, '[]'::jsonb)
  );
end;
$$;

-- 8) Retenção de 90 dias ----------------------------------------------------------------------------------------------
create function private.purge_ai_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.ai_settings := private.ai_config();
  v_count integer;
begin
  with d as (
    delete from public.ai_messages where created_at < now() - make_interval(days => cfg.retention_days) returning 1
  )
  select count(*)::integer into v_count from d;
  delete from public.ai_session_state where updated_at < now() - make_interval(days => cfg.retention_days);
  return v_count;
end;
$$;

create function public.admin_purge_ai_data()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.purge_ai_data()
$$;

revoke execute on function private.purge_ai_data() from public, anon, authenticated;

select cron.schedule('lfit-purge-ai-data', '35 3 * * *', $cron$select private.purge_ai_data()$cron$);

-- 9) Permissões ------------------------------------------------------------------------------------------------------
revoke execute on function
  public.get_ai_assistant_state(uuid),
  public.accept_ai_terms(text),
  public.ai_submit_message(uuid, uuid, text),
  public.ai_record_reply(uuid, text, integer, integer, boolean),
  public.admin_purge_ai_data()
from public, anon, authenticated;
grant execute on function
  public.get_ai_assistant_state(uuid),
  public.accept_ai_terms(text),
  public.ai_submit_message(uuid, uuid, text)
to authenticated;
grant execute on function
  public.ai_record_reply(uuid, text, integer, integer, boolean),
  public.admin_purge_ai_data()
to service_role;
