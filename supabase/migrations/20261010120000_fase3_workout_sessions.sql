-- =============================================================================
-- Fase 3 mínima — banco do app do aluno (plano aprovado em 30/09/2026).
--
-- * `plan_workout_items.care_note`: "Orientação de cuidado ao aluno" (só o texto aprovado pelo professor chega ao
--   aluno; nada de nível, condição ou nota de contraindicação).
-- * Sessões de treino: `workout_sessions` (uma por treino), `session_item_logs` (um por exercício — dor 0–10 é por
--   EXERCÍCIO, obrigatória só quando o item tem `care_note`), `session_set_logs` (carga/quantidade por série).
-- * `save_training_plan` apaga e recria divisões e itens a cada salvamento (ids novos). Por isso os registros de
--   sessão NÃO dependem desses ids: FKs com `on delete set null` + cópia do rótulo da divisão e do nome do exercício.
-- * Sessão "abandonada" é calculada (`session_effective_status`: em andamento há mais de 6 h), não gravada por job —
--   mesmo princípio do status do aluno. Iniciar uma sessão nova grava 'abandoned' nas abertas anteriores.
-- * Escrita só por RPC. Chamador duplo: o próprio aluno (`p_student_id` nulo) ou, no modo presencial, staff com
--   acesso ao aluno E aos dados de saúde (`can_view_student_health` — a execução mostra e grava dor).
-- * Aluno com status efetivo diferente de 'active' (inativo, expirado, bloqueado) não treina: ACCESS_SUSPENDED.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Orientação de cuidado no item do plano
-- -----------------------------------------------------------------------------
alter table public.plan_workout_items
  add column care_note text check (care_note is null or char_length(care_note) between 1 and 300);

-- -----------------------------------------------------------------------------
-- 2) Tabelas de sessão
-- -----------------------------------------------------------------------------
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  plan_id uuid references public.training_plans (id) on delete set null,
  workout_id uuid references public.plan_workouts (id) on delete set null,
  -- Cópia da divisão no início da sessão (sobrevive a edições do plano).
  workout_label text not null check (char_length(workout_label) between 1 and 10),
  workout_name text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Quem registrou: o próprio aluno ou o professor (modo presencial).
  recorded_by uuid references public.profiles (id) on delete set null,
  rpe smallint check (rpe between 1 and 10),
  feedback_note text check (feedback_note is null or char_length(feedback_note) between 1 and 300),
  -- Respondida no INÍCIO desta sessão, sobre a dor desde a sessão anterior.
  pain_checkin text check (pain_checkin in ('normal', 'ainda_incomoda')),
  trainer_reviewed_at timestamptz,
  trainer_reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((status = 'completed') = (finished_at is not null))
);

create index workout_sessions_student_started_idx on public.workout_sessions (student_id, started_at desc);
create index workout_sessions_plan_status_idx on public.workout_sessions (plan_id, status);
create index workout_sessions_org_idx on public.workout_sessions (organization_id);
create index workout_sessions_workout_idx on public.workout_sessions (workout_id);
create index workout_sessions_recorded_by_idx on public.workout_sessions (recorded_by);
create index workout_sessions_reviewed_by_idx on public.workout_sessions (trainer_reviewed_by);

create table public.session_item_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  item_id uuid references public.plan_workout_items (id) on delete set null,
  -- Exercício realmente feito (o principal ou um substituto do item) + cópia do nome.
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,
  substitute boolean not null default false,
  -- Cópia de "o item tinha orientação de cuidado" (a dor é obrigatória nesse caso).
  care_note_required boolean not null default false,
  pain_score smallint check (pain_score between 0 and 10),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, item_id)
);

create index session_item_logs_org_idx on public.session_item_logs (organization_id);
create index session_item_logs_item_idx on public.session_item_logs (item_id);
create index session_item_logs_exercise_idx on public.session_item_logs (exercise_id);

create table public.session_set_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_log_id uuid not null references public.session_item_logs (id) on delete cascade,
  set_index smallint not null check (set_index between 1 and 50),
  -- Unidade/tipo vêm do item (reps, segundos...), sem duplicar aqui.
  quantity_value numeric check (quantity_value >= 0 and quantity_value < 100000),
  load_value numeric check (load_value >= 0 and load_value <= 10000),
  load_unit public.load_unit,
  load_text text check (load_text is null or char_length(load_text) between 1 and 40),
  logged_at timestamptz not null default now(),
  unique (item_log_id, set_index),
  check ((load_value is null) = (load_unit is null))
);

create index session_set_logs_org_idx on public.session_set_logs (organization_id);

-- -----------------------------------------------------------------------------
-- 3) Helpers
-- -----------------------------------------------------------------------------

-- O usuário logado é o titular deste cadastro de aluno? (DEFINER: o papel student não lê `students`.)
create function private.is_own_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.user_id = (select auth.uid()) and s.deleted_at is null
  )
$$;

-- Status efetivo da sessão: em andamento há mais de 6 h = abandonada (calculado, nunca gravado por job).
create function public.session_effective_status(w public.workout_sessions)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when w.status = 'in_progress' and w.started_at < now() - interval '6 hours' then 'abandoned'
    else w.status
  end
$$;

-- Divisão sugerida ("treino do dia"): a seguinte (por posição, com volta) à da última sessão CONCLUÍDA deste plano.
-- Casa pelo rótulo copiado na sessão (os ids das divisões mudam a cada salvamento do plano).
create function private.next_workout_for_plan(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with prev as (
    select ws.workout_label from public.workout_sessions ws
    where ws.plan_id = p_plan_id and ws.status = 'completed'
    order by ws.started_at desc
    limit 1
  ),
  cur as (
    select w.position from public.plan_workouts w join prev on w.label = prev.workout_label
    where w.plan_id = p_plan_id
    order by w.position
    limit 1
  )
  select coalesce(
    (select w.id from public.plan_workouts w, cur where w.plan_id = p_plan_id and w.position > cur.position order by w.position limit 1),
    (select w.id from public.plan_workouts w where w.plan_id = p_plan_id order by w.position limit 1)
  )
$$;

-- Aluno para quem se treina. Nulo = o próprio aluno logado; preenchido = modo presencial (staff com acesso ao aluno
-- e à saúde dele). Sempre exige status efetivo 'active'.
create function private.resolve_training_student(p_student_id uuid)
returns public.students
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
begin
  if p_student_id is null then
    select * into s from public.students
    where user_id = (select auth.uid()) and deleted_at is null;
  else
    if not (private.is_staff() and private.can_access_student(p_student_id)) then
      raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not private.can_view_student_health(p_student_id) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select * into s from public.students where id = p_student_id and deleted_at is null;
  end if;

  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.student_effective_status(s) <> 'active' then
    raise exception 'ACCESS_SUSPENDED' using errcode = 'P0001';
  end if;
  return s;
end;
$$;

-- Trava uma sessão para escrita: autoriza (titular ou staff do modo presencial), exige sessão em andamento (status
-- gravado — sincronização atrasada da fila local ainda é aceita) e aluno com status efetivo 'active'.
create function private.lock_open_session(p_session_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  s public.students;
begin
  select * into w from public.workout_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not private.is_own_student(w.student_id) then
    if not (private.is_staff() and private.can_access_student(w.student_id)) then
      raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
    end if;
    if not private.can_view_student_health(w.student_id) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  select * into s from public.students where id = w.student_id;
  if public.student_effective_status(s) <> 'active' then
    raise exception 'ACCESS_SUSPENDED' using errcode = 'P0001';
  end if;
  if w.status <> 'in_progress' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001';
  end if;
  return w;
end;
$$;

-- Registro do exercício na sessão (cria ou atualiza). Valida que o item é da divisão da sessão e que o substituto,
-- se houver, é um dos substitutos do item.
create function private.upsert_item_log(w public.workout_sessions, p_item_id uuid, p_substitute uuid)
returns public.session_item_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.plan_workout_items;
  v_ex uuid;
  v_name text;
  l public.session_item_logs;
begin
  select * into it from public.plan_workout_items
  where id = p_item_id and workout_id = w.workout_id;
  if not found then
    -- Também cobre o plano editado durante a sessão (o item ganhou id novo).
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_substitute is not null then
    if not exists (select 1 from public.plan_item_substitutes x where x.item_id = it.id and x.exercise_id = p_substitute) then
      raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001';
    end if;
    v_ex := p_substitute;
  else
    v_ex := it.exercise_id;
  end if;
  select e.name into v_name from public.exercises e where e.id = v_ex;

  insert into public.session_item_logs (
    organization_id, session_id, item_id, exercise_id, exercise_name, substitute, care_note_required
  ) values (
    w.organization_id, w.id, it.id, v_ex, coalesce(v_name, '—'), p_substitute is not null, it.care_note is not null
  )
  on conflict (session_id, item_id) do update set
    exercise_id = excluded.exercise_id,
    exercise_name = excluded.exercise_name,
    substitute = excluded.substitute,
    care_note_required = excluded.care_note_required
  returning * into l;
  return l;
end;
$$;

-- `private.upsert_item_log` recebe a linha da sessão, mas só é chamada de dentro das RPCs com a linha já travada e
-- autorizada por `lock_open_session` (nunca exposta a quem chama a API).
revoke execute on function
  private.is_own_student(uuid),
  private.next_workout_for_plan(uuid),
  private.resolve_training_student(uuid),
  private.lock_open_session(uuid),
  private.upsert_item_log(public.workout_sessions, uuid, uuid)
from public, anon;
-- Só chamadas de dentro das RPCs (que rodam como dono): ninguém da API executa direto.
revoke execute on function
  private.next_workout_for_plan(uuid),
  private.resolve_training_student(uuid),
  private.lock_open_session(uuid),
  private.upsert_item_log(public.workout_sessions, uuid, uuid)
from authenticated;
-- Usada na política de RLS (roda como quem consulta).
grant execute on function private.is_own_student(uuid) to authenticated;
grant execute on function public.session_effective_status(public.workout_sessions) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) RLS: leitura pelo titular ou por staff que vê a saúde do aluno; escrita só por RPC.
-- -----------------------------------------------------------------------------
alter table public.workout_sessions enable row level security;
alter table public.session_item_logs enable row level security;
alter table public.session_set_logs enable row level security;

create policy workout_sessions_select on public.workout_sessions
  for select to authenticated
  using (
    private.is_own_student(student_id)
    or (organization_id = (select private.current_org_id()) and private.can_view_student_health(student_id))
  );

create policy session_item_logs_select on public.session_item_logs
  for select to authenticated
  using (exists (select 1 from public.workout_sessions w where w.id = session_id));

create policy session_set_logs_select on public.session_set_logs
  for select to authenticated
  using (exists (select 1 from public.session_item_logs l where l.id = item_log_id));

grant select on public.workout_sessions, public.session_item_logs, public.session_set_logs to authenticated;

-- A mídia de exercícios que o aluno pode baixar inclui os substitutos do plano ativo, e só com acesso ativo.
create or replace function private.student_can_read_exercise_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    join public.training_plans p on p.student_id = s.id and p.status = 'active'
    join public.plan_workouts w on w.plan_id = p.id
    join public.plan_workout_items i on i.workout_id = w.id
    join public.exercises e
      on e.id = i.exercise_id
      or e.id in (select x.exercise_id from public.plan_item_substitutes x where x.item_id = i.id)
    where s.user_id = (select auth.uid())
      and s.deleted_at is null
      and public.student_effective_status(s) = 'active'
      and (e.video_path = p_name or e.poster_path = p_name)
  )
$$;

-- -----------------------------------------------------------------------------
-- 5) RPCs do aluno (e do modo presencial)
-- -----------------------------------------------------------------------------

-- Perfil seguro do aluno logado (a tabela `students` não é exposta ao papel student).
create function public.get_my_student_profile()
returns table (
  student_id uuid, first_name text, last_name text, photo_path text,
  organization_name text, trainer_name text, effective_status public.effective_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.first_name, s.last_name, s.photo_path, o.name, t.full_name, public.student_effective_status(s)
  from public.students s
  join public.organizations o on o.id = s.organization_id
  left join public.profiles t on t.id = s.trainer_id
  where s.user_id = (select auth.uid()) and s.deleted_at is null
$$;

-- Plano ativo para treinar: divisões, itens, substitutos e séries detalhadas, com a divisão sugerida e a sessão
-- aberta (se houver). NUNCA devolve nível, condição ou nota de contraindicação. Nulo se não houver plano ativo.
create function public.get_my_active_plan(p_student_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students := private.resolve_training_student(p_student_id);
  p public.training_plans;
  v_open public.workout_sessions;
begin
  select * into p from public.training_plans where student_id = s.id and status = 'active';
  if not found then
    return null;
  end if;

  select * into v_open from public.workout_sessions ws
  where ws.student_id = s.id and ws.plan_id = p.id and public.session_effective_status(ws) = 'in_progress'
  order by ws.started_at desc
  limit 1;

  return jsonb_build_object(
    'plan', jsonb_build_object(
      'id', p.id, 'name', p.name, 'goal', p.goal, 'notes', p.notes,
      'starts_on', p.starts_on, 'ends_on', p.ends_on, 'no_end', p.no_end,
      'planned_sessions', p.planned_sessions,
      'completed_sessions', (select count(*) from public.workout_sessions x where x.plan_id = p.id and x.status = 'completed')
    ),
    'suggested_workout_id', private.next_workout_for_plan(p.id),
    'open_session', case when v_open.id is null then null else jsonb_build_object(
      'id', v_open.id, 'workout_id', v_open.workout_id, 'started_at', v_open.started_at
    ) end,
    'workouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'label', w.label, 'name', w.name, 'notes', w.notes, 'position', w.position,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'position', i.position, 'group_key', i.group_key, 'sets', i.sets,
            'quantity_unit', i.quantity_unit, 'quantity_min', i.quantity_min, 'quantity_max', i.quantity_max,
            'quantity_note', i.quantity_note,
            'load_value', i.load_value, 'load_unit', i.load_unit, 'load_text', i.load_text,
            'intensity', i.intensity, 'speed', i.speed, 'tempo', i.tempo, 'rest_min', i.rest_min, 'rest_max', i.rest_max,
            'method', m.name, 'tip', i.tip, 'care_note', i.care_note,
            'exercise', jsonb_build_object(
              'id', e.id, 'name', e.name, 'instructions', e.instructions, 'equipment', e.equipment,
              'video_url', e.video_url, 'video_path', e.video_path, 'poster_path', e.poster_path
            ),
            'substitutes', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', se.id, 'name', se.name, 'instructions', se.instructions, 'equipment', se.equipment,
                'video_url', se.video_url, 'video_path', se.video_path, 'poster_path', se.poster_path
              ) order by x.position)
              from public.plan_item_substitutes x join public.exercises se on se.id = x.exercise_id
              where x.item_id = i.id
            ), '[]'::jsonb),
            'sets_detail', coalesce((
              select jsonb_agg(jsonb_build_object(
                'position', st.position, 'set_type', st.set_type,
                'quantity_unit', st.quantity_unit, 'quantity_min', st.quantity_min, 'quantity_max', st.quantity_max,
                'quantity_note', st.quantity_note,
                'load_value', st.load_value, 'load_unit', st.load_unit, 'load_text', st.load_text,
                'intensity', st.intensity, 'speed', st.speed, 'tempo', st.tempo,
                'rest_min', st.rest_min, 'rest_max', st.rest_max
              ) order by st.position)
              from public.plan_item_sets st where st.item_id = i.id
            ), '[]'::jsonb)
          ) order by i.position)
          from public.plan_workout_items i
          join public.exercises e on e.id = i.exercise_id
          left join public.training_methods m on m.id = i.method_id
          where i.workout_id = w.id
        ), '[]'::jsonb)
      ) order by w.position)
      from public.plan_workouts w
      where w.plan_id = p.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Inicia (ou retoma) uma sessão. Mesma divisão já aberta → retoma; qualquer outra sessão aberta do aluno vira
-- 'abandoned'. Devolve se deve perguntar "Como ficou a dor desde o último treino?": houve dor (> 0) em algum
-- exercício de uma sessão posterior à última pergunta respondida.
create function public.start_workout_session(p_plan_id uuid, p_workout_id uuid, p_student_id uuid default null)
returns table (session_id uuid, resumed boolean, ask_pain_checkin boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.students := private.resolve_training_student(p_student_id);
  p public.training_plans;
  wk public.plan_workouts;
  w public.workout_sessions;
  v_resumed boolean := false;
  v_last_answer timestamptz;
begin
  select * into p from public.training_plans where id = p_plan_id and student_id = s.id and status = 'active';
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into wk from public.plan_workouts where id = p_workout_id and plan_id = p.id;
  if not found then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'workout';
  end if;

  select * into w from public.workout_sessions ws
  where ws.student_id = s.id and ws.workout_id = wk.id and public.session_effective_status(ws) = 'in_progress'
  order by ws.started_at desc
  limit 1
  for update;

  if found then
    v_resumed := true;
  else
    insert into public.workout_sessions (
      organization_id, student_id, plan_id, workout_id, workout_label, workout_name, recorded_by
    ) values (
      s.organization_id, s.id, p.id, wk.id, wk.label, wk.name, (select auth.uid())
    )
    returning * into w;
  end if;

  update public.workout_sessions set status = 'abandoned'
  where student_id = s.id and status = 'in_progress' and id <> w.id;

  select max(x.started_at) into v_last_answer
  from public.workout_sessions x
  where x.student_id = s.id and x.pain_checkin is not null and x.id <> w.id;

  return query select
    w.id,
    v_resumed,
    w.pain_checkin is null and exists (
      select 1
      from public.workout_sessions x
      join public.session_item_logs l on l.session_id = x.id
      where x.student_id = s.id
        and x.id <> w.id
        and x.started_at < w.started_at
        and x.started_at > coalesce(v_last_answer, '-infinity'::timestamptz)
        and l.pain_score > 0
    );
end;
$$;

create function public.record_pain_checkin(p_session_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions := private.lock_open_session(p_session_id);
begin
  if p_answer is null or p_answer not in ('normal', 'ainda_incomoda') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'answer';
  end if;
  update public.workout_sessions set pain_checkin = p_answer where id = w.id;
end;
$$;

-- Uma série. Idempotente (reenviar a mesma série só atualiza) — a fila local do app reenvia quando a internet volta.
-- p_data: { quantity_value, load_value, load_unit, load_text, substitute_exercise_id }
create function public.log_set(p_session_id uuid, p_item_id uuid, p_set_index integer, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions := private.lock_open_session(p_session_id);
  l public.session_item_logs;
begin
  if p_set_index is null or p_set_index not between 1 and 50 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'set_index';
  end if;
  l := private.upsert_item_log(w, p_item_id, private.try_uuid(p_data ->> 'substitute_exercise_id'));

  insert into public.session_set_logs (
    organization_id, item_log_id, set_index, quantity_value, load_value, load_unit, load_text
  ) values (
    w.organization_id, l.id, p_set_index,
    nullif(p_data ->> 'quantity_value', '')::numeric,
    nullif(p_data ->> 'load_value', '')::numeric,
    nullif(p_data ->> 'load_unit', '')::public.load_unit,
    nullif(trim(p_data ->> 'load_text'), '')
  )
  on conflict (item_log_id, set_index) do update set
    quantity_value = excluded.quantity_value,
    load_value = excluded.load_value,
    load_unit = excluded.load_unit,
    load_text = excluded.load_text,
    logged_at = now();
end;
$$;

-- Conclui um exercício da sessão com a dor 0–10 (obrigatória se o item tem orientação de cuidado). Idempotente.
create function public.complete_session_item(
  p_session_id uuid, p_item_id uuid, p_pain_score integer, p_substitute_exercise_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions := private.lock_open_session(p_session_id);
  l public.session_item_logs;
begin
  if p_pain_score is not null and p_pain_score not between 0 and 10 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'pain_score';
  end if;
  l := private.upsert_item_log(w, p_item_id, p_substitute_exercise_id);
  if l.care_note_required and p_pain_score is null then
    raise exception 'PAIN_REQUIRED' using errcode = 'P0001';
  end if;
  update public.session_item_logs
  set pain_score = p_pain_score, completed_at = coalesce(completed_at, now())
  where id = l.id;
end;
$$;

-- Fecha a sessão com RPE (1–10) e feedback curto, ambos opcionais. Reenviar para uma sessão já concluída não faz nada.
create function public.finish_workout_session(p_session_id uuid, p_rpe integer default null, p_feedback text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
begin
  select * into w from public.workout_sessions where id = p_session_id;
  if found and w.status = 'completed'
     and (private.is_own_student(w.student_id)
          or (private.is_staff() and private.can_access_student(w.student_id) and private.can_view_student_health(w.student_id))) then
    return;
  end if;

  w := private.lock_open_session(p_session_id);
  if p_rpe is not null and p_rpe not between 1 and 10 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'rpe';
  end if;
  update public.workout_sessions set
    status = 'completed',
    finished_at = now(),
    rpe = p_rpe,
    feedback_note = left(nullif(trim(p_feedback), ''), 300)
  where id = w.id;
end;
$$;

-- Histórico simples do aluno (sem dor nem feedback — só o que a lista mostra).
create function public.get_my_workout_history(p_student_id uuid default null)
returns table (
  session_id uuid, started_at timestamptz, finished_at timestamptz, status text,
  plan_id uuid, plan_name text, workout_label text, workout_name text, rpe smallint,
  by_trainer boolean, exercises_done integer
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
  -- Histórico continua visível com acesso suspenso (são dados do próprio aluno): não usa resolve_training_student.
  if p_student_id is null then
    select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  elsif private.is_staff() and private.can_access_student(p_student_id) and private.can_view_student_health(p_student_id) then
    select * into s from public.students where id = p_student_id and deleted_at is null;
  end if;
  if s.id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
    select ws.id, ws.started_at, ws.finished_at, public.session_effective_status(ws),
      ws.plan_id, tp.name, ws.workout_label, ws.workout_name, ws.rpe,
      ws.recorded_by is distinct from s.user_id,
      (select count(*)::integer from public.session_item_logs l where l.session_id = ws.id and l.completed_at is not null)
    from public.workout_sessions ws
    left join public.training_plans tp on tp.id = ws.plan_id
    where ws.student_id = s.id
    order by ws.started_at desc
    limit 100;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) RPCs do professor: avisos de dor (mesma escada de 3 níveis dos alertas de contraindicação)
-- -----------------------------------------------------------------------------

-- Avisos pendentes (sem "visto"): dor > 5 num exercício, ou "ainda incomoda" na pergunta do início da sessão.
--  completo  (can_view_student_health): tipo, exercício, dor, resposta e feedback;
--  restrito  (professor do plano sem acesso / consentimento só declarado): só a sessão e o exercício — sem tipo, dor
--            nem comentário ("Feedback de atenção neste exercício — alinhe com o professor responsável");
--  oculto    (acessa o aluno, mas nada declarado): uma linha hidden = true, sempre (não revela se há aviso).
create function public.student_session_alerts(p_student_id uuid)
returns table (
  session_id uuid, started_at timestamptz, workout_label text, kind text, exercise_name text,
  pain_score smallint, pain_checkin text, feedback_note text, hidden boolean, restricted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_staff();

  if private.can_view_student_health(p_student_id) then
    return query
      select ws.id, ws.started_at, ws.workout_label, 'pain_high'::text, l.exercise_name,
             l.pain_score, null::text, ws.feedback_note, false, false
      from public.workout_sessions ws
      join public.session_item_logs l on l.session_id = ws.id
      where ws.student_id = p_student_id and ws.trainer_reviewed_at is null and l.pain_score > 5
      union all
      select ws.id, ws.started_at, ws.workout_label, 'pain_persisting'::text, null::text,
             null::smallint, ws.pain_checkin, ws.feedback_note, false, false
      from public.workout_sessions ws
      where ws.student_id = p_student_id and ws.trainer_reviewed_at is null and ws.pain_checkin = 'ainda_incomoda'
      order by 2 desc;
    return;
  end if;

  if private.is_restricted_plan_viewer(p_student_id) or private.is_restricted_health_viewer(p_student_id) then
    return query
      select distinct ws.id, ws.started_at, ws.workout_label, null::text, l.exercise_name,
             null::smallint, null::text, null::text, false, true
      from public.workout_sessions ws
      left join public.session_item_logs l on l.session_id = ws.id and l.pain_score > 5
      where ws.student_id = p_student_id and ws.trainer_reviewed_at is null
        and (l.id is not null or ws.pain_checkin = 'ainda_incomoda')
      order by 2 desc;
    return;
  end if;

  if private.can_access_student(p_student_id) then
    return query select null::uuid, null::timestamptz, null::text, null::text, null::text,
      null::smallint, null::text, null::text, true, false;
    return;
  end if;
  raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
end;
$$;

-- "Marcar como visto": só quem vê o aviso completo (responsável, ou owner com a confirmação do titular).
create function public.acknowledge_session_alert(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
begin
  perform private.require_staff();
  select * into w from public.workout_sessions where id = p_session_id;
  if not found or not private.can_access_student(w.student_id) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.lock_accessible_student(w.student_id);
  if not private.can_view_student_health(w.student_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.workout_sessions
  set trainer_reviewed_at = now(), trainer_reviewed_by = (select auth.uid())
  where id = w.id and trainer_reviewed_at is null;
end;
$$;

revoke execute on function
  public.get_my_student_profile(),
  public.get_my_active_plan(uuid),
  public.start_workout_session(uuid, uuid, uuid),
  public.record_pain_checkin(uuid, text),
  public.log_set(uuid, uuid, integer, jsonb),
  public.complete_session_item(uuid, uuid, integer, uuid),
  public.finish_workout_session(uuid, integer, text),
  public.get_my_workout_history(uuid),
  public.student_session_alerts(uuid),
  public.acknowledge_session_alert(uuid)
from public, anon;
grant execute on function
  public.get_my_student_profile(),
  public.get_my_active_plan(uuid),
  public.start_workout_session(uuid, uuid, uuid),
  public.record_pain_checkin(uuid, text),
  public.log_set(uuid, uuid, integer, jsonb),
  public.complete_session_item(uuid, uuid, integer, uuid),
  public.finish_workout_session(uuid, integer, text),
  public.get_my_workout_history(uuid),
  public.student_session_alerts(uuid),
  public.acknowledge_session_alert(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- 7) care_note no salvamento e nas cópias de plano (o resto dos corpos é igual a 20261007120000)
-- -----------------------------------------------------------------------------
create or replace function private.copy_plan(p_source uuid, p_student_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.training_plans;
  v_new uuid;
  w public.plan_workouts;
  v_w uuid;
  it public.plan_workout_items;
  v_i uuid;
begin
  select * into src from public.training_plans where id = p_source;

  insert into public.training_plans (
    organization_id, student_id, name, goal, level, notes, status, source_plan_id, planned_sessions, trainer_id
  ) values (
    src.organization_id, p_student_id, left(coalesce(nullif(trim(p_name), ''), src.name), 120), src.goal, src.level,
    src.notes, 'draft', src.id, src.planned_sessions,
    case when p_student_id is null then null else (select s.trainer_id from public.students s where s.id = p_student_id) end
  )
  returning id into v_new;

  for w in select * from public.plan_workouts where plan_id = src.id order by position loop
    insert into public.plan_workouts (plan_id, organization_id, label, name, notes, position)
    values (v_new, src.organization_id, w.label, w.name, w.notes, w.position)
    returning id into v_w;

    for it in select * from public.plan_workout_items where workout_id = w.id order by position loop
      insert into public.plan_workout_items (
        workout_id, organization_id, exercise_id, position, group_key, sets, load_value, load_unit, load_text,
        tempo, quantity_unit, quantity_min, quantity_max, quantity_note,
        intensity, speed, rest_min, rest_max, method_id, objective_id, tip, care_note
      ) values (
        v_w, src.organization_id, it.exercise_id, it.position, it.group_key, it.sets, it.load_value, it.load_unit,
        it.load_text, it.tempo, it.quantity_unit, it.quantity_min, it.quantity_max,
        it.quantity_note, it.intensity, it.speed, it.rest_min, it.rest_max, it.method_id,
        it.objective_id, it.tip, it.care_note
      ) returning id into v_i;

      insert into public.plan_item_sets (
        item_id, organization_id, position, set_type, load_value, load_unit, load_text,
        quantity_unit, quantity_min, quantity_max, quantity_note, intensity, speed, tempo, rest_min, rest_max
      )
      select v_i, src.organization_id, s.position, s.set_type, s.load_value, s.load_unit, s.load_text,
        s.quantity_unit, s.quantity_min, s.quantity_max, s.quantity_note, s.intensity, s.speed, s.tempo,
        s.rest_min, s.rest_max
      from public.plan_item_sets s where s.item_id = it.id;

      insert into public.plan_item_substitutes (item_id, organization_id, exercise_id, position)
      select v_i, src.organization_id, x.exercise_id, x.position
      from public.plan_item_substitutes x where x.item_id = it.id;
    end loop;
  end loop;

  return v_new;
end;
$$;

create or replace function public.save_training_plan(p_plan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_id uuid := nullif(p_plan ->> 'id', '')::uuid;
  v_student uuid := nullif(p_plan ->> 'student_id', '')::uuid;
  v_no_end boolean := coalesce((p_plan ->> 'no_end')::boolean, false);
  v_trainer uuid;
  p public.training_plans;
  w jsonb;
  it jsonb;
  st jsonb;
  sub text;
  pr record;
  v_w uuid;
  v_i uuid;
  v_ex uuid;
  v_sub uuid;
  v_wpos integer := 0;
  v_ipos integer;
  v_spos integer;
  v_subpos integer;
  v_group text;
  v_prev_group text;
  v_seen text[];
  v_items integer := 0;
begin
  if v_id is not null then
    p := private.lock_editable_plan(v_id);
    if p.status = 'archived' then
      raise exception 'PLAN_ARCHIVED' using errcode = 'P0001';
    end if;
  else
    if v_student is not null then
      perform private.lock_accessible_student(v_student);
    end if;
    insert into public.training_plans (organization_id, student_id, name, created_by)
    values (v_org, v_student, left(coalesce(nullif(trim(p_plan ->> 'name'), ''), 'Treino'), 120), (select auth.uid()))
    returning * into p;
  end if;

  if jsonb_typeof(coalesce(p_plan -> 'workouts', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_plan -> 'workouts', '[]'::jsonb)) > 12 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'workouts';
  end if;

  -- Professor do plano: informado (staff da org) ou, por padrão, o responsável pelo aluno.
  if p.student_id is not null then
    if p_plan ? 'trainer_id' then
      v_trainer := nullif(p_plan ->> 'trainer_id', '')::uuid;
    else
      v_trainer := coalesce(p.trainer_id, (select s.trainer_id from public.students s where s.id = p.student_id));
    end if;
    if v_trainer is not null and not exists (
      select 1 from public.profiles pr2
      where pr2.id = v_trainer and pr2.organization_id = p.organization_id and pr2.role in ('owner', 'trainer')
    ) then
      raise exception 'INVALID_TRAINER' using errcode = 'P0001';
    end if;
  end if;

  update public.training_plans set
    name = left(coalesce(nullif(trim(p_plan ->> 'name'), ''), p.name), 120),
    goal = nullif(trim(p_plan ->> 'goal'), ''),
    level = nullif(p_plan ->> 'level', ''),
    starts_on = nullif(p_plan ->> 'starts_on', '')::date,
    ends_on = case when v_no_end then null else nullif(p_plan ->> 'ends_on', '')::date end,
    no_end = v_no_end,
    planned_sessions = nullif(p_plan ->> 'planned_sessions', '')::integer,
    trainer_id = v_trainer,
    notes = nullif(trim(p_plan ->> 'notes'), '')
  where id = p.id
  returning * into p;

  if p.status in ('active', 'scheduled') and (p.starts_on is null or (p.ends_on is null and not p.no_end)) then
    raise exception 'PLAN_DATES_REQUIRED' using errcode = 'P0001';
  end if;

  delete from public.plan_workouts where plan_id = p.id;

  for w in select value from jsonb_array_elements(coalesce(p_plan -> 'workouts', '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(w -> 'items', '[]'::jsonb)) > 40 then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'items';
    end if;

    insert into public.plan_workouts (plan_id, organization_id, label, name, notes, position)
    values (p.id, p.organization_id, left(trim(w ->> 'label'), 10), nullif(trim(w ->> 'name'), ''), nullif(trim(w ->> 'notes'), ''), v_wpos)
    returning id into v_w;

    v_ipos := 0;
    v_prev_group := null;
    v_seen := '{}';
    for it in select value from jsonb_array_elements(coalesce(w -> 'items', '[]'::jsonb)) loop
      v_ex := nullif(it ->> 'exercise_id', '')::uuid;
      if not exists (
        select 1 from public.exercises e
        where e.id = v_ex and (e.organization_id is null or e.organization_id = p.organization_id)
      ) then
        raise exception 'INVALID_EXERCISE' using errcode = 'P0001';
      end if;

      -- Itens do mesmo agrupamento precisam ser contíguos.
      v_group := nullif(trim(it ->> 'group_key'), '');
      if v_group is not null and v_group is distinct from v_prev_group and v_group = any (v_seen) then
        raise exception 'INVALID_GROUP_ORDER' using errcode = 'P0001';
      end if;
      if v_group is not null and not (v_group = any (v_seen)) then
        v_seen := v_seen || v_group;
      end if;
      v_prev_group := v_group;

      select * into pr from private.read_prescription(it);

      insert into public.plan_workout_items (
        workout_id, organization_id, exercise_id, position, group_key, sets,
        load_value, load_unit, load_text,
        quantity_unit, quantity_min, quantity_max, quantity_note, intensity, speed, tempo, rest_min, rest_max,
        method_id, objective_id, tip, care_note
      ) values (
        v_w, p.organization_id, v_ex, v_ipos, v_group,
        nullif(it ->> 'sets', '')::integer,
        nullif(it ->> 'load_value', '')::numeric,
        nullif(it ->> 'load_unit', '')::public.load_unit,
        nullif(trim(it ->> 'load_text'), ''),
        pr.unit, pr.qmin, pr.qmax, pr.note, pr.intensity, pr.speed, pr.tempo, pr.rmin, pr.rmax,
        nullif(it ->> 'method_id', '')::uuid,
        nullif(it ->> 'objective_id', '')::uuid,
        -- "notes" = formato antigo (importação/seed); a interface envia "tip".
        coalesce(nullif(trim(it ->> 'tip'), ''), nullif(trim(it ->> 'notes'), '')),
        nullif(trim(it ->> 'care_note'), '')
      ) returning id into v_i;

      -- Substitutos: até 3, diferentes do principal, visíveis à organização e não arquivados.
      if jsonb_array_length(coalesce(it -> 'substitutes', '[]'::jsonb)) > 3 then
        raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001', detail = 'max';
      end if;
      v_subpos := 0;
      for sub in select value from jsonb_array_elements_text(coalesce(it -> 'substitutes', '[]'::jsonb)) loop
        v_sub := private.try_uuid(sub);
        if v_sub is null or v_sub = v_ex or not exists (
          select 1 from public.exercises e
          where e.id = v_sub and e.archived_at is null
            and (e.organization_id is null or e.organization_id = p.organization_id)
        ) then
          raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001';
        end if;
        begin
          insert into public.plan_item_substitutes (item_id, organization_id, exercise_id, position)
          values (v_i, p.organization_id, v_sub, v_subpos);
        exception when unique_violation then
          raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001', detail = 'duplicate';
        end;
        v_subpos := v_subpos + 1;
      end loop;

      if jsonb_array_length(coalesce(it -> 'sets_detail', '[]'::jsonb)) > 20 then
        raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'sets_detail';
      end if;
      v_spos := 0;
      for st in select value from jsonb_array_elements(coalesce(it -> 'sets_detail', '[]'::jsonb)) loop
        select * into pr from private.read_prescription(st);
        insert into public.plan_item_sets (
          item_id, organization_id, position, set_type, load_value, load_unit, load_text,
          quantity_unit, quantity_min, quantity_max, quantity_note, intensity, speed, tempo, rest_min, rest_max
        ) values (
          v_i, p.organization_id, v_spos,
          coalesce(nullif(st ->> 'set_type', ''), 'work')::public.set_type,
          nullif(st ->> 'load_value', '')::numeric,
          nullif(st ->> 'load_unit', '')::public.load_unit,
          nullif(trim(st ->> 'load_text'), ''),
          pr.unit, pr.qmin, pr.qmax, pr.note, pr.intensity, pr.speed, pr.tempo, pr.rmin, pr.rmax
        );
        v_spos := v_spos + 1;
      end loop;

      v_ipos := v_ipos + 1;
      v_items := v_items + 1;
    end loop;
    v_wpos := v_wpos + 1;
  end loop;

  perform private.audit(p.organization_id, 'plan.saved', 'training_plan', p.id, jsonb_build_object(
    'template', p.student_id is null, 'workouts', v_wpos, 'items', v_items
  ));
  return p.id;
end;
$$;
