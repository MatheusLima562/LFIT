-- =============================================================================
-- App do aluno mais humanizado (banco): chat aluno ↔ professor responsável/owner (com caixa de conversas do
-- professor), recado do professor, resumo/recorde no fim do treino, resposta do professor ao feedback.
--
-- Chat: sempre visível a quem acessa o aluno (owner + professor responsável), independente do consentimento de
-- saúde — mesma base legal da triagem (LGPD art. 11, II, "e"/"d", a validar). Professor do plano sem acesso ao
-- aluno não vê nada: tudo-ou-nada, sem escada restrita/oculta aqui. Conteúdo (mensagens, resposta ao feedback)
-- nunca entra em audit_logs, log, e-mail, URL ou notificação — mesma regra de dado sensível da dor e dos grupos
-- especiais.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  sender_role text not null check (sender_role in ('student', 'staff')),
  -- Nulo quando sender_role = 'student' (o aluno não tem linha em profiles).
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  attached_item_id uuid references public.plan_workout_items (id) on delete set null,
  attached_exercise_name text,
  created_at timestamptz not null default now(),
  check ((sender_role = 'student') = (sender_id is null)),
  check ((attached_item_id is null) = (attached_exercise_name is null))
);
create index chat_messages_student_created_idx on public.chat_messages (student_id, created_at desc);
create index chat_messages_org_idx on public.chat_messages (organization_id);
create index chat_messages_sender_idx on public.chat_messages (sender_id, created_at) where sender_role = 'staff';

-- Cursor de leitura por pessoa (não por mensagem): o staff lê em grupo hoje em quase tudo, mas aqui o dono pediu
-- que o owner marcar como lido não mexa no não lido do professor responsável, e vice-versa.
create table public.chat_reads (
  student_id uuid not null references public.students (id) on delete cascade,
  reader_role text not null check (reader_role in ('student', 'staff')),
  -- Aluno: o próprio students.id (um leitor só). Staff: profiles.id (um cursor por pessoa).
  reader_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (student_id, reader_role, reader_id)
);

create table public.trainer_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  -- Nulo = todos os alunos deste professor (ou do owner, se ele for quem publica).
  student_id uuid references public.students (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index trainer_announcements_student_idx on public.trainer_announcements (student_id, active, expires_at);
create index trainer_announcements_trainer_idx on public.trainer_announcements (trainer_id, active, expires_at) where student_id is null;

alter table public.workout_sessions
  add column coach_reply text check (coach_reply is null or char_length(coach_reply) between 1 and 300),
  add column coach_reply_at timestamptz,
  add column coach_reply_by uuid references public.profiles (id) on delete set null,
  add constraint workout_sessions_coach_reply_consistent check ((coach_reply is null) = (coach_reply_at is null));

-- -----------------------------------------------------------------------------
-- 2) RLS — leitura por quem acessa o aluno (tudo-ou-nada); escrita só por RPC.
-- -----------------------------------------------------------------------------
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.trainer_announcements enable row level security;

create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (private.is_own_student(student_id) or private.can_access_student(student_id));
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (private.is_own_student(student_id) or private.can_access_student(student_id));
grant select on public.chat_messages, public.chat_reads to authenticated;

-- Recado: o aluno-alvo lê o seu; staff só o que publicou (a lista "para todos os meus alunos" é interna da RPC,
-- não uma tabela consultável por quem não é o autor).
create policy trainer_announcements_select on public.trainer_announcements
  for select to authenticated
  using (
    (student_id is not null and private.is_own_student(student_id))
    or trainer_id = (select auth.uid())
  );
grant select on public.trainer_announcements to authenticated;

-- -----------------------------------------------------------------------------
-- 3) RPCs do chat
-- -----------------------------------------------------------------------------

-- Quem está "do outro lado" de uma conversa, para contar não lidas / marcar como lida. Helper interno (schema
-- private, fora da API) — documentado no CLAUDE.md junto da linha das RPCs de chat, não como função pública.
create function private.chat_reader(p_student_id uuid, out role text, out id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.is_own_student(p_student_id) then
    role := 'student';
    id := p_student_id;
  elsif private.can_access_student(p_student_id) then
    role := 'staff';
    id := (select auth.uid());
  else
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function private.chat_reader(uuid) from public, anon, authenticated;

create function public.send_chat_message(p_student_id uuid, p_body text, p_attached_item_id uuid default null)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader record := private.chat_reader(p_student_id);
  s public.students;
  v_body text := trim(coalesce(p_body, ''));
  v_item_name text;
  v_count integer;
  m public.chat_messages;
begin
  if v_body = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'body';
  end if;

  select * into s from public.students where id = p_student_id and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_attached_item_id is not null then
    select e.name into v_item_name
    from public.plan_workout_items i
    join public.plan_workouts w on w.id = i.workout_id
    join public.training_plans p on p.id = w.plan_id
    join public.exercises e on e.id = i.exercise_id
    where i.id = p_attached_item_id and p.student_id = s.id and p.status = 'active';
    if v_item_name is null then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'attached_item_id';
    end if;
  end if;

  -- Limite de 30 mensagens/minuto por remetente. sender_id é nulo para o aluno (uma conversa só por aluno), então
  -- o aluno é contado por student_id; o staff é contado por sender_id, somando as conversas de alunos diferentes.
  if reader.role = 'student' then
    select count(*) into v_count from public.chat_messages
    where student_id = s.id and sender_role = 'student' and created_at > now() - interval '1 minute';
  else
    select count(*) into v_count from public.chat_messages
    where sender_id = (select auth.uid()) and sender_role = 'staff' and created_at > now() - interval '1 minute';
  end if;
  if v_count >= 30 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (
    organization_id, student_id, sender_role, sender_id, body, attached_item_id, attached_exercise_name
  ) values (
    s.organization_id, s.id, reader.role, case when reader.role = 'staff' then (select auth.uid()) end,
    left(v_body, 2000), p_attached_item_id, v_item_name
  )
  returning * into m;
  return m;
end;
$$;

create function public.get_chat_messages(p_student_id uuid, p_before timestamptz default null)
returns setof public.chat_messages
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.chat_messages m
  where m.student_id = p_student_id
    and (private.is_own_student(p_student_id) or private.can_access_student(p_student_id))
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit 50
$$;

create function public.mark_chat_read(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader record := private.chat_reader(p_student_id);
begin
  insert into public.chat_reads (student_id, reader_role, reader_id, last_read_at)
  values (p_student_id, reader.role, reader.id, now())
  on conflict (student_id, reader_role, reader_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

create function public.chat_unread_count(p_student_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader record := private.chat_reader(p_student_id);
  v_since timestamptz;
  v_other text := case when reader.role = 'student' then 'staff' else 'student' end;
  v_count integer;
begin
  select last_read_at into v_since from public.chat_reads
  where student_id = p_student_id and reader_role = reader.role and reader_id = reader.id;
  select count(*) into v_count from public.chat_messages
  where student_id = p_student_id and sender_role = v_other
    and created_at > coalesce(v_since, '-infinity'::timestamptz);
  return v_count;
end;
$$;

-- Caixa de conversas do professor: um registro por aluno acessível, com a última mensagem (se houver) e o não
-- lido do PRÓPRIO chamador (cursor por pessoa). Inclui aluno sem mensagem nenhuma (serve para iniciar conversa).
create function public.list_chat_inbox()
returns table (
  student_id uuid, student_name text, photo_path text,
  last_message text, last_message_at timestamptz, last_sender_role text,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id, concat_ws(' ', s.first_name, s.last_name), s.photo_path,
    last.body, last.created_at, last.sender_role,
    coalesce((
      select count(*)::integer from public.chat_messages m
      where m.student_id = s.id and m.sender_role = 'student'
        and m.created_at > coalesce((
          select r.last_read_at from public.chat_reads r
          where r.student_id = s.id and r.reader_role = 'staff' and r.reader_id = (select auth.uid())
        ), '-infinity'::timestamptz)
    ), 0)
  from public.students s
  left join lateral (
    select body, created_at, sender_role from public.chat_messages cm
    where cm.student_id = s.id order by cm.created_at desc limit 1
  ) last on true
  where s.deleted_at is null and private.can_access_student(s.id)
  order by (coalesce((
    select count(*)::integer from public.chat_messages m
    where m.student_id = s.id and m.sender_role = 'student'
      and m.created_at > coalesce((
        select r.last_read_at from public.chat_reads r
        where r.student_id = s.id and r.reader_role = 'staff' and r.reader_id = (select auth.uid())
      ), '-infinity'::timestamptz)
  ), 0) > 0) desc, last.created_at desc nulls last, s.first_name, s.last_name
$$;

create function public.staff_total_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    (select count(*) from public.chat_messages m
     where m.student_id = s.id and m.sender_role = 'student'
       and m.created_at > coalesce((
         select r.last_read_at from public.chat_reads r
         where r.student_id = s.id and r.reader_role = 'staff' and r.reader_id = (select auth.uid())
       ), '-infinity'::timestamptz))
  ), 0)::integer
  from public.students s
  where s.deleted_at is null and private.can_access_student(s.id)
$$;

revoke execute on function
  public.send_chat_message(uuid, text, uuid), public.get_chat_messages(uuid, timestamptz),
  public.mark_chat_read(uuid), public.chat_unread_count(uuid),
  public.list_chat_inbox(), public.staff_total_unread_count()
from public, anon;
grant execute on function
  public.send_chat_message(uuid, text, uuid), public.get_chat_messages(uuid, timestamptz),
  public.mark_chat_read(uuid), public.chat_unread_count(uuid),
  public.list_chat_inbox(), public.staff_total_unread_count()
to authenticated;

-- Realtime: só esta tabela, respeitando o RLS de cima (primeiro uso de Realtime no projeto).
alter publication supabase_realtime add table public.chat_messages;

-- -----------------------------------------------------------------------------
-- 4) Recado do professor
-- -----------------------------------------------------------------------------
create function public.get_my_announcement(p_student_id uuid default null)
returns public.trainer_announcements
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
  a public.trainer_announcements;
begin
  if p_student_id is null then
    select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  elsif private.can_access_student(p_student_id) then
    select * into s from public.students where id = p_student_id and deleted_at is null;
  end if;
  if s.id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into a from public.trainer_announcements t
  where t.active and t.expires_at > now()
    and (
      t.student_id = s.id
      or (t.student_id is null and t.trainer_id = coalesce(s.trainer_id, (
        select pr.id from public.profiles pr
        where pr.organization_id = s.organization_id and pr.role = 'owner'
        order by pr.created_at asc
        limit 1
      )))
    )
  order by t.created_at desc
  limit 1;
  return a;
end;
$$;

create function public.set_trainer_announcement(p_body text, p_student_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_body = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'body';
  end if;
  if p_student_id is not null then
    perform private.lock_accessible_student(p_student_id);
  end if;
  insert into public.trainer_announcements (organization_id, trainer_id, student_id, body)
  values (v_org, (select auth.uid()), p_student_id, left(v_body, 300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.get_my_announcement(uuid), public.set_trainer_announcement(text, uuid) from public, anon;
grant execute on function public.get_my_announcement(uuid), public.set_trainer_announcement(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Resumo do fim do treino (constância + recorde pessoal discreto)
-- -----------------------------------------------------------------------------
create function public.get_session_summary(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
begin
  select * into w from public.workout_sessions where id = p_session_id;
  if not found or not (private.is_own_student(w.student_id) or private.can_access_student(w.student_id)) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'exercises_done', (select count(*) from public.session_item_logs l where l.session_id = w.id and l.completed_at is not null),
    'sets_done', (select count(*) from public.session_set_logs st join public.session_item_logs l on l.id = st.item_log_id where l.session_id = w.id),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_name', x.exercise_name, 'best_load_now', x.now_max, 'prior_best', x.prior_max,
        -- Só é recorde se já havia carga anterior para bater (a primeira vez não conta).
        'is_pr', x.prior_max is not null and x.now_max > x.prior_max
      ))
      from (
        -- Uma linha por (exercício, unidade de peso) — nunca compara kg com lb. Exercícios sem carga (ex.:
        -- Subida/Descida contadas em "subidas"/"descidas", sem peso externo) já saem pelo "load_value is not null".
        select distinct on (st.exercise_id, st.load_unit)
          l.exercise_name, st.exercise_id, st.load_unit,
          max(st.load_value) over (partition by st.exercise_id, st.load_unit) as now_max,
          (
            select max(st2.load_value)
            from public.session_set_logs st2
            join public.session_item_logs l2 on l2.id = st2.item_log_id
            join public.workout_sessions w2 on w2.id = l2.session_id
            where w2.student_id = w.student_id and w2.status = 'completed' and w2.started_at < w.started_at
              and st2.exercise_id = st.exercise_id and st2.load_unit is not distinct from st.load_unit and st2.load_value is not null
          ) as prior_max
        from public.session_set_logs st
        join public.session_item_logs l on l.id = st.item_log_id
        where l.session_id = w.id and st.exercise_id is not null and st.load_value is not null
        order by st.exercise_id, st.load_unit
      ) x
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_session_summary(uuid) from public, anon;
grant execute on function public.get_session_summary(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Professor responde ao feedback
-- -----------------------------------------------------------------------------
create function public.reply_to_session(p_session_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  v_reply text := trim(coalesce(p_reply, ''));
begin
  if v_reply = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'reply';
  end if;
  perform private.require_staff();
  select * into w from public.workout_sessions where id = p_session_id;
  if not found or not private.can_access_student(w.student_id) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.workout_sessions
  set coach_reply = left(v_reply, 300), coach_reply_at = now(), coach_reply_by = (select auth.uid())
  where id = w.id;
end;
$$;
revoke execute on function public.reply_to_session(uuid, text) from public, anon;
grant execute on function public.reply_to_session(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7) Hoje humanizada: perfil do professor, constância e recado no retorno de get_my_student_profile
-- -----------------------------------------------------------------------------
-- O conjunto de colunas mudou (ganhou trainer_avatar_url/trainer_office_hours no meio) — CREATE OR REPLACE não
-- aceita isso em função que devolve TABLE; precisa recriar.
drop function public.get_my_student_profile();

create function public.get_my_student_profile()
returns table (
  student_id uuid, first_name text, last_name text, photo_path text,
  organization_name text, trainer_name text, trainer_avatar_url text, trainer_office_hours text,
  effective_status public.effective_status,
  sessions_this_month integer, week_streak integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id, s.first_name, s.last_name, s.photo_path, o.name, t.full_name, t.avatar_url, t.preferences ->> 'office_hours',
    public.student_effective_status(s),
    (
      select count(*)::integer from public.workout_sessions ws
      where ws.student_id = s.id and ws.status = 'completed'
        and date_trunc('month', ws.started_at at time zone 'America/Sao_Paulo')
          = date_trunc('month', now() at time zone 'America/Sao_Paulo')
    ),
    coalesce((
      -- Semanas (seg–dom, em SP) consecutivas terminando na mais recente — só conta se a mais recente com sessão
      -- concluída for a semana atual ou a anterior; senão a sequência "quebrou" e o streak é 0.
      with weeks as (
        select distinct date_trunc('week', ws.started_at at time zone 'America/Sao_Paulo')::date as wk
        from public.workout_sessions ws
        where ws.student_id = s.id and ws.status = 'completed'
      ),
      islands as (
        select wk, wk + (row_number() over (order by wk desc) * 7)::int as grp from weeks
      )
      select case
        when (select max(wk) from weeks) >= date_trunc('week', now() at time zone 'America/Sao_Paulo')::date - 7
        then (select count(*)::integer from islands where grp = (select grp from islands order by wk desc limit 1))
        else 0
      end
    ), 0)
  from public.students s
  join public.organizations o on o.id = s.organization_id
  left join public.profiles t on t.id = s.trainer_id
  where s.user_id = (select auth.uid()) and s.deleted_at is null
$$;

revoke execute on function public.get_my_student_profile() from public, anon;
grant execute on function public.get_my_student_profile() to authenticated;

-- Histórico: mesmo motivo (coluna nova, coach_reply) — drop + create em vez de CREATE OR REPLACE.
drop function public.get_my_workout_history(uuid);

create function public.get_my_workout_history(p_student_id uuid default null)
returns table (
  session_id uuid, started_at timestamptz, finished_at timestamptz, status text,
  plan_id uuid, plan_name text, workout_label text, workout_name text, rpe smallint,
  by_trainer boolean, exercises_done integer, coach_reply text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.students;
begin
  if p_student_id is null then
    select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  elsif private.training_mode(p_student_id) = 'full' then
    select * into s from public.students where id = p_student_id and deleted_at is null;
  end if;
  if s.id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
    select ws.id, ws.started_at, ws.finished_at, public.session_effective_status(ws),
      ws.plan_id, tp.name, ws.workout_label, ws.workout_name, ws.rpe,
      ws.recorded_by is distinct from s.user_id,
      (select count(*)::integer from public.session_item_logs l where l.session_id = ws.id and l.completed_at is not null),
      ws.coach_reply
    from public.workout_sessions ws
    left join public.training_plans tp on tp.id = ws.plan_id
    where ws.student_id = s.id
    order by ws.started_at desc
    limit 100;
end;
$$;
revoke execute on function public.get_my_workout_history(uuid) from public, anon;
grant execute on function public.get_my_workout_history(uuid) to authenticated;
