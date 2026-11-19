-- =============================================================================
-- AO VIVO no Início do professor (sprint "Ao vivo + Importação", 19/11/2026).
--
-- * "Treinando agora" vem de EVENTOS REAIS do treino (iniciou, série registrada, exercício concluído, finalizou), não
--   de presença no app. Gatilhos nas tabelas de execução existentes (workout_sessions, session_item_logs,
--   session_set_logs) carimbam `live_sessions.last_event_at`. Nenhuma RPC de treino muda.
-- * Sessão ao vivo = em andamento (gravado e efetivo) + último evento há menos de 90 min + batimento recente (10 min).
--   O batimento (`live_heartbeat`) só sai da tela de execução aberta, a cada 60 s, e grava no máximo 1 vez a cada 30 s
--   por sessão (limite de taxa). Sem batimento, a sessão sai do card sozinha (calculado; nada é gravado na sessão).
-- * Nada de dado de saúde em `live_sessions`: só ids e horários. O aviso de dor da seção "Precisa de atenção" segue a
--   escada de sempre (completo com `can_view_student_health`; restrito sem o tipo; oculto = nada).
-- * Realtime em `live_sessions` (RLS: staff com acesso ao aluno). O cliente só usa o evento para buscar de novo.
-- * `organizations.live_enabled` (padrão ligado), só o owner muda (`set_live_enabled`, auditado). Desligar apaga o
--   acompanhamento guardado da organização.
-- * Retenção de 30 dias: `private.purge_live_tracking()` diário (pg_cron) — `workout_sessions` (o histórico de treino)
--   não é tocado.
-- Aditiva: nenhuma tabela, coluna ou linha existente é apagada ou alterada.
-- =============================================================================

-- 1) Configuração por organização ----------------------------------------------------------------------------------
alter table public.organizations add column live_enabled boolean not null default true;

-- 2) Tabelas -------------------------------------------------------------------------------------------------------
create table public.live_sessions (
  session_id uuid primary key references public.workout_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  last_event_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index live_sessions_org_event_idx on public.live_sessions (organization_id, last_event_at desc);
create index live_sessions_student_idx on public.live_sessions (student_id);

alter table public.live_sessions enable row level security;
revoke all on public.live_sessions from public, anon, authenticated;
grant select on public.live_sessions to authenticated;
grant select, insert, update, delete on public.live_sessions to service_role;

create policy live_sessions_select on public.live_sessions
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()) and private.can_access_student(student_id));

-- Batimento fora da API (sem Realtime: não acorda o painel a cada minuto).
create table private.live_heartbeats (
  session_id uuid primary key references public.live_sessions (session_id) on delete cascade,
  last_at timestamptz not null default now()
);
revoke all on private.live_heartbeats from public, anon, authenticated;

-- Aviso "seu professor vê quando você está treinando" já visto (uma vez por aluno, em qualquer aparelho).
create table private.live_notice_acks (
  student_id uuid primary key references public.students (id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);
revoke all on private.live_notice_acks from public, anon, authenticated;

alter publication supabase_realtime add table public.live_sessions;

-- 3) Eventos reais do treino → last_event_at -------------------------------------------------------------------------
-- Sessão em andamento de organização com o ao vivo ligado: cria/atualiza. Qualquer outro caso (finalizou, abandonou):
-- só atualiza a linha que já existir (o card sai na próxima busca).
-- NUNCA aborta a gravação do treino: qualquer erro aqui é engolido (bloco com exceção = subtransação só do registro
-- ao vivo) e nada é logado (nem ids, nem a mensagem do erro).
create function private.live_touch(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.live_sessions (session_id, organization_id, student_id, last_event_at)
    select w.id, w.organization_id, w.student_id, now()
    from public.workout_sessions w
    join public.organizations o on o.id = w.organization_id
    where w.id = p_session_id and w.status = 'in_progress' and o.live_enabled
    on conflict (session_id) do update set last_event_at = now(), updated_at = now();
    if not found then
      update public.live_sessions set last_event_at = now(), updated_at = now() where session_id = p_session_id;
    end if;
  exception when others then
    null;
  end;
end;
$$;

create function private.live_on_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.live_touch(new.id);
  end if;
  return null;
end;
$$;

create function private.live_on_item_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.completed_at is distinct from old.completed_at then
    perform private.live_touch(new.session_id);
  end if;
  return null;
end;
$$;

create function private.live_on_set_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.live_touch((select l.session_id from public.session_item_logs l where l.id = new.item_log_id));
  return null;
end;
$$;

create trigger workout_sessions_live after insert or update of status on public.workout_sessions
  for each row execute function private.live_on_session();
create trigger session_item_logs_live after insert or update of completed_at on public.session_item_logs
  for each row execute function private.live_on_item_log();
create trigger session_set_logs_live after insert or update on public.session_set_logs
  for each row execute function private.live_on_set_log();

revoke execute on function
  private.live_touch(uuid), private.live_on_session(), private.live_on_item_log(), private.live_on_set_log()
  from public, anon, authenticated;

-- 4) Batimento (tela de execução aberta) -----------------------------------------------------------------------------
-- Chamador duplo, como as RPCs de treino: o aluno (titular) ou o staff no modo presencial (`private.training_mode`).
-- Devolve também, só para o aluno: se falta o aviso de transparência e a última mensagem do professor desde o início
-- da sessão ainda não lida (o banner da tela de execução; sem push).
create function public.live_heartbeat(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  v_mode text;
  v_enabled boolean;
  v_accepted boolean;
  v_notice boolean := false;
  v_message jsonb;
begin
  select * into w from public.workout_sessions where id = p_session_id;
  v_mode := case when w.id is null then null else private.training_mode(w.student_id) end;
  if v_mode is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  select o.live_enabled into v_enabled from public.organizations o where o.id = w.organization_id;

  -- Limite de taxa: no máximo uma gravação a cada 30 s por sessão (chamadas além disso não gravam nada).
  if v_enabled and w.status = 'in_progress' and exists (select 1 from public.live_sessions ls where ls.session_id = w.id) then
    insert into private.live_heartbeats as h (session_id, last_at) values (w.id, now())
    on conflict (session_id) do update set last_at = excluded.last_at
      where h.last_at < now() - interval '30 seconds'
    returning true into v_accepted;
  end if;

  if v_mode = 'self' then
    v_notice := v_enabled and not exists (select 1 from private.live_notice_acks a where a.student_id = w.student_id);
    select jsonb_build_object(
      'id', cm.id,
      'body', cm.body,
      'created_at', cm.created_at,
      'sender_first_name', split_part(p.full_name, ' ', 1)
    ) into v_message
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.sender_id
    left join public.chat_reads r
      on r.student_id = cm.student_id and r.reader_role = 'student' and r.reader_id = cm.student_id
    where cm.student_id = w.student_id and cm.sender_role = 'staff' and cm.created_at >= w.started_at
      and (r.last_read_at is null or cm.created_at > r.last_read_at)
    order by cm.created_at desc, cm.id desc
    limit 1;
  end if;

  return jsonb_build_object(
    'live_enabled', coalesce(v_enabled, false),
    'accepted', coalesce(v_accepted, false),
    'show_notice', v_notice,
    'message', v_message
  );
end;
$$;

-- Aviso de transparência visto (só o próprio aluno).
create function public.ack_live_notice()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
begin
  select s.id into v_student from public.students s where s.user_id = (select auth.uid()) and s.deleted_at is null;
  if v_student is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into private.live_notice_acks (student_id) values (v_student) on conflict (student_id) do nothing;
end;
$$;

-- 5) Painel do professor ---------------------------------------------------------------------------------------------
-- Escopo = alunos que o chamador acessa (`private.dashboard_students`: owner = organização; professor = os seus).
-- Saída: nome, rótulo da divisão, horários e contagens. Dor só no nível completo; restrito vira "aviso no treino".
create function public.get_live_board()
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
  -- Regras num só lugar (a tela recebe os números daqui).
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
    last_msg as (
      select distinct on (cm.student_id) cm.student_id, cm.sender_role, cm.created_at
      from public.chat_messages cm
      join acc on acc.id = cm.student_id
      where cm.organization_id = v_org and cm.created_at > now() - c_window
      order by cm.student_id, cm.created_at desc, cm.id desc
    ),
    attention as (
      select kind, student_id, since from pain_level where kind is not null
      union all
      select 'unanswered', student_id, created_at from last_msg
      where sender_role = 'student' and created_at <= now() - c_unanswered
      union all
      select 'stalled', student_id, last_event_at from live where last_event_at <= now() - c_stalled
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

-- Liga/desliga o ao vivo da organização (só owner; auditado sem dado de aluno). Desligar apaga o acompanhamento guardado.
create function public.set_live_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
begin
  if p_enabled is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'enabled';
  end if;
  update public.organizations set live_enabled = p_enabled where id = v_org and live_enabled is distinct from p_enabled;
  if found then
    perform private.audit(v_org, 'live_settings_update', 'organization', v_org, jsonb_build_object('live_enabled', p_enabled));
    if not p_enabled then
      delete from public.live_sessions where organization_id = v_org;
    end if;
  end if;
end;
$$;

-- 6) Retenção de 30 dias ---------------------------------------------------------------------------------------------
create function private.purge_live_tracking()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (
    delete from public.live_sessions where last_event_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from d
$$;

-- Disparo manual (testes/servidor).
create function public.admin_purge_live_tracking()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.purge_live_tracking()
$$;

revoke execute on function private.purge_live_tracking() from public, anon, authenticated;

select cron.schedule('lfit-purge-live-tracking', '20 3 * * *', $cron$select private.purge_live_tracking()$cron$);

-- 7) Permissões ------------------------------------------------------------------------------------------------------
revoke execute on function
  public.live_heartbeat(uuid),
  public.ack_live_notice(),
  public.get_live_board(),
  public.set_live_enabled(boolean),
  public.admin_purge_live_tracking()
from public, anon, authenticated;
grant execute on function
  public.live_heartbeat(uuid),
  public.ack_live_notice(),
  public.get_live_board(),
  public.set_live_enabled(boolean)
to authenticated;
grant execute on function public.admin_purge_live_tracking() to service_role;
