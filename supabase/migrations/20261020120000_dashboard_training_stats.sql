-- =============================================================================
-- Início com dados reais (docs/planos/dashboard-inicio.md, aprovado 20/10/2026) — migration 1: treinos.
--
-- * Contagens por ACESSO AO ALUNO (`private.can_access_student`: owner = organização; professor = os seus alunos), não
--   pelo RLS de workout_sessions — ele exige `can_view_student_health` (a sessão carrega dor) e faria o owner contar a
--   menos. Por isso SECURITY DEFINER, e a saída é só contagem, data, nome do aluno e rótulo/nome da divisão: nunca dor,
--   feedback, resposta, nota individual, grupo especial ou alerta.
-- * "Hoje" e "semana" em America/Sao_Paulo, nunca em UTC (um treino às 23h de Brasília é do mesmo dia, mesmo já sendo
--   o dia seguinte em UTC). A semana começa na segunda.
-- * Concluído = status 'completed', datado por finished_at. Registrado = qualquer sessão iniciada (started_at).
-- =============================================================================

-- Concluídos por aluno e data: hoje, semana, 30/60 dias. ("Registrados" usam o índice (student_id, started_at) que já existe.)
create index workout_sessions_student_finished_idx on public.workout_sessions (student_id, finished_at) where status = 'completed';

-- Início de um dia civil de São Paulo, como timestamptz.
create function private.sp_day_start(p_day date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_day::timestamp at time zone 'America/Sao_Paulo'
$$;

-- Dia civil de São Paulo de um instante.
create function private.sp_day(p_ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone 'America/Sao_Paulo')::date
$$;

-- Alunos (não excluídos) que o chamador acessa na própria organização. Chamado só de dentro das RPCs do dashboard.
create function private.dashboard_students()
returns table (id uuid, first_name text, last_name text)
language sql
stable
set search_path = ''
as $$
  select s.id, s.first_name, s.last_name
  from public.students s
  where s.organization_id = private.current_org_id()
    and s.deleted_at is null
    and private.can_access_student(s.id)
$$;

revoke execute on function private.sp_day_start(date), private.sp_day(timestamptz), private.dashboard_students()
  from public, anon, authenticated;

create function public.get_dashboard_training_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_today date := private.today_br();
  v_week date := date_trunc('week', v_today)::date; -- segunda-feira da semana atual
  v_from date := least(date_trunc('week', v_today)::date - 14, v_today - 59);
  v_result jsonb;
begin
  with acc as (
    select * from private.dashboard_students()
  ),
  started as (
    select private.sp_day(ws.started_at) as day
    from public.workout_sessions ws
    join acc on acc.id = ws.student_id
    where ws.started_at >= private.sp_day_start(v_from)
  ),
  done as (
    select ws.id, ws.student_id, ws.workout_label, ws.workout_name, ws.finished_at,
      private.sp_day(ws.finished_at) as day,
      concat_ws(' ', acc.first_name, acc.last_name) as student_name
    from public.workout_sessions ws
    join acc on acc.id = ws.student_id
    where ws.status = 'completed' and ws.finished_at >= private.sp_day_start(v_from)
  )
  select jsonb_build_object(
    'today', v_today,
    'registered_30d', (select count(*) from started where day between v_today - 29 and v_today),
    'registered_prev_30d', (select count(*) from started where day between v_today - 59 and v_today - 30),
    'completed_today_count', (select count(*) from done where day = v_today),
    'completed_same_weekday_last_week', (select count(*) from done where day = v_today - 7),
    'completed_today', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session_id', x.id, 'student_id', x.student_id, 'student_name', x.student_name,
        'workout_label', x.workout_label, 'workout_name', x.workout_name, 'finished_at', x.finished_at
      ) order by x.finished_at desc)
      from (select * from done where day = v_today order by finished_at desc limit 8) x
    ), '[]'::jsonb),
    -- 0 = segunda … 6 = domingo; "current" é nulo nos dias que ainda não chegaram.
    'week', (
      select jsonb_agg(jsonb_build_object(
        'day_index', g.i,
        'current', case when v_week + g.i <= v_today then (select count(*) from done where day = v_week + g.i) end,
        'one_week_ago', (select count(*) from done where day = v_week - 7 + g.i),
        'two_weeks_ago', (select count(*) from done where day = v_week - 14 + g.i)
      ) order by g.i)
      from generate_series(0, 6) as g(i)
    ),
    'week_total', (select count(*) from done where day between v_week and v_today),
    -- Semana passada até o mesmo dia da semana (quarta × quarta), para a comparação não ser injusta.
    'last_week_total_to_date', (select count(*) from done where day between v_week - 7 and v_today - 7),
    'top5', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', t.student_id, 'student_name', t.student_name,
        'completed_30d', t.n, 'last_completed_at', t.last_at
      ) order by t.n desc, t.last_at desc, t.student_name)
      from (
        select student_id, student_name, count(*) as n, max(finished_at) as last_at
        from done
        where day between v_today - 29 and v_today
        group by student_id, student_name
        order by count(*) desc, max(finished_at) desc, student_name
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.get_dashboard_training_stats() from public, anon;
grant execute on function public.get_dashboard_training_stats() to authenticated;
