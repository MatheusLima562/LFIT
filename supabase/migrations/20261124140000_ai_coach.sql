-- Sprint edição rápida, PARTE B: comando do personal com IA na ficha do aluno — DESLIGADO por padrão.
--
-- * Flag por conta `organizations.ai_coach_enabled` (padrão FALSE; liga só por SQL/migration — nenhuma tela liga) e
--   só nos planos Pro e Gold. Nenhuma conta é ligada aqui.
-- * A IA só PROPÕE alterações estruturadas no treino ATIVO daquele aluno; nunca grava. O personal confirma o
--   "antes → depois" e a aplicação passa por `apply_prescription_changes` (mesmas permissões, histórico e desfazer,
--   origem `ai`).
-- * Enviado ao provedor: só nomes dos exercícios e a prescrição atual (séries, repetições, carga), com referências
--   curtas (A1, A2…). Nunca nome do aluno, nome do plano, ficha de saúde, contraindicação, observações ou dicas.
--   O texto do comando NUNCA é gravado (só contagem, tokens e custo).
-- * Limite de comandos por dia por conta, contador de custo, prazo (timeout) — `private.ai_coach_settings`.

-- 1) Flag e regras ----------------------------------------------------------------------------------------------------
alter table public.organizations add column ai_coach_enabled boolean not null default false;
revoke update (ai_coach_enabled) on public.organizations from authenticated;

create table private.ai_coach_settings (
  singleton boolean primary key default true check (singleton),
  model text not null,
  daily_limit integer not null check (daily_limit between 1 and 500),
  max_input_chars integer not null check (max_input_chars between 20 and 1000),
  max_output_tokens integer not null check (max_output_tokens between 256 and 8192),
  timeout_ms integer not null check (timeout_ms between 5000 and 60000),
  input_usd_per_mtok numeric(10, 4) not null,
  output_usd_per_mtok numeric(10, 4) not null,
  updated_at timestamptz not null default now()
);
insert into private.ai_coach_settings (model, daily_limit, max_input_chars, max_output_tokens, timeout_ms, input_usd_per_mtok, output_usd_per_mtok)
values ('claude-opus-5-5', 30, 300, 1024, 20000, 4.0000, 20.0000);
revoke all on private.ai_coach_settings from public, anon, authenticated, service_role;

-- Pedidos (sem o texto do comando): contagem diária, tokens e custo.
create table private.ai_coach_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  student_id uuid references public.students (id) on delete set null,
  day date not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd_micros bigint not null default 0,
  created_at timestamptz not null default now()
);
create index ai_coach_requests_org_day_idx on private.ai_coach_requests (organization_id, day);
revoke all on private.ai_coach_requests from public, anon, authenticated;

-- 2) RPCs ---------------------------------------------------------------------------------------------------------------
-- Situação para a tela: ligado? plano permite? quanto resta hoje? custo do mês (só para o personal).
create function public.get_ai_coach_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  o public.organizations;
  cfg private.ai_coach_settings;
  v_used integer;
begin
  select * into o from public.organizations where id = v_org;
  select * into cfg from private.ai_coach_settings where singleton;
  select count(*) into v_used from private.ai_coach_requests r where r.organization_id = v_org and r.day = private.today_br();
  return jsonb_build_object(
    'enabled', o.ai_coach_enabled,
    'plan_ok', o.plan in ('pro', 'gold'),
    'daily_limit', cfg.daily_limit,
    'remaining_today', greatest(cfg.daily_limit - v_used, 0),
    'max_input_chars', cfg.max_input_chars,
    'cost_month_usd_micros', case when private.is_owner() then (
      select coalesce(sum(r.cost_usd_micros), 0) from private.ai_coach_requests r
      where r.organization_id = v_org and r.day >= date_trunc('month', private.today_br())::date
    ) end
  );
end;
$$;

-- Começa um comando: confere tudo (equipe com acesso ao aluno, conta gravável, ligado, plano, tamanho, limite do dia,
-- treino ativo), reserva 1 do limite e devolve o contexto MÍNIMO para o servidor chamar o provedor. O texto do comando
-- não é gravado.
create function public.ai_coach_begin(p_student_id uuid, p_command text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  o public.organizations;
  cfg private.ai_coach_settings;
  s public.students;
  v_plan uuid;
  v_used integer;
  v_req uuid;
begin
  perform private.assert_org_writable(v_org);
  select * into o from public.organizations where id = v_org;
  if not o.ai_coach_enabled then
    raise exception 'AI_DISABLED' using errcode = 'P0001';
  end if;
  if o.plan not in ('pro', 'gold') then
    raise exception 'AI_PLAN_REQUIRED' using errcode = 'P0001';
  end if;
  if not private.can_access_student(p_student_id) then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into cfg from private.ai_coach_settings where singleton;
  if p_command is null or length(trim(p_command)) = 0 or length(p_command) > cfg.max_input_chars then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'command';
  end if;
  select * into s from public.students where id = p_student_id;

  select tp.id into v_plan from public.training_plans tp
  where tp.student_id = p_student_id and tp.status = 'active' and tp.organization_id = v_org
  order by tp.starts_on desc nulls last limit 1;
  if v_plan is null then
    return jsonb_build_object('status', 'no_plan');
  end if;

  -- Limite por conta e dia (trava a linha da organização para não estourar em pedidos simultâneos).
  perform 1 from public.organizations where id = v_org for update;
  select count(*) into v_used from private.ai_coach_requests r where r.organization_id = v_org and r.day = private.today_br();
  if v_used >= cfg.daily_limit then
    return jsonb_build_object('status', 'limit', 'remaining_today', 0);
  end if;
  insert into private.ai_coach_requests (organization_id, actor_id, student_id, day)
  values (v_org, (select auth.uid()), p_student_id, private.today_br())
  returning id into v_req;

  return jsonb_build_object(
    'status', 'ok',
    'request_id', v_req,
    'remaining_today', cfg.daily_limit - v_used - 1,
    'config', jsonb_build_object('model', cfg.model, 'max_output_tokens', cfg.max_output_tokens, 'timeout_ms', cfg.timeout_ms),
    -- Só para o SERVIDOR tirar o nome do aluno do texto antes de enviar (nunca vai ao provedor).
    'redact', jsonb_build_array(s.first_name, s.last_name),
    'workouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', w.label,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ref', w.label || x.rn::text,
            'item_id', x.id,
            'exercise', x.exercise,
            'sets', x.sets,
            'reps_min', case when x.quantity_unit = 'reps' then x.quantity_min end,
            'reps_max', case when x.quantity_unit = 'reps' then x.quantity_max end,
            'quantity_unit', x.quantity_unit,
            'load', case when x.load_text is null then x.load_value end,
            'load_unit', x.load_unit,
            'editable', not x.detailed and x.load_text is null
          ) order by x.rn)
          from (
            select i.id, i.sets, i.quantity_min, i.quantity_max, i.quantity_unit, i.load_value, i.load_unit, i.load_text,
              coalesce(e.name, '—') as exercise,
              exists (select 1 from public.plan_item_sets st where st.item_id = i.id) as detailed,
              row_number() over (order by i.position, i.id) as rn
            from public.plan_workout_items i
            left join public.exercises e on e.id = i.exercise_id
            where i.workout_id = w.id
          ) x
        ), '[]'::jsonb)
      ) order by w.position)
      from public.plan_workouts w
      where w.plan_id = v_plan
    ), '[]'::jsonb)
  );
end;
$$;

-- Fecha o pedido com tokens e custo (só o servidor, com a secret key). Falha do provedor também conta no limite.
create function public.ai_coach_finish(p_request_id uuid, p_input_tokens integer, p_output_tokens integer, p_failed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.ai_coach_settings;
  v_in integer := greatest(coalesce(p_input_tokens, 0), 0);
  v_out integer := greatest(coalesce(p_output_tokens, 0), 0);
begin
  select * into cfg from private.ai_coach_settings where singleton;
  update private.ai_coach_requests set
    status = case when p_failed then 'failed' else 'done' end,
    input_tokens = v_in,
    output_tokens = v_out,
    cost_usd_micros = round(v_in * cfg.input_usd_per_mtok + v_out * cfg.output_usd_per_mtok)::bigint
  where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'request';
  end if;
end;
$$;

-- 3) Permissões --------------------------------------------------------------------------------------------------------
revoke execute on function public.get_ai_coach_status(), public.ai_coach_begin(uuid, text) from public, anon;
grant execute on function public.get_ai_coach_status(), public.ai_coach_begin(uuid, text) to authenticated;
revoke execute on function public.ai_coach_finish(uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ai_coach_finish(uuid, integer, integer, boolean) to service_role;
