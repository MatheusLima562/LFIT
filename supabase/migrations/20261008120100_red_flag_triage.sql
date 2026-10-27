-- =============================================================================
-- Etapa 2.10 — Fase B / B3: triagem de sinais de alerta (relatados pelo aluno ou observados pelo professor).
--   * Dado de saúde (LGPD art. 11): leitura só com can_view_student_health; escrita só pelas RPCs abaixo.
--   * Não é diagnóstico: registra sinais e a LIBERAÇÃO de um médico/fisioterapeuta (quem, data, observação).
--     Só a liberação tira o aviso do montador. Sem liberação, o aviso fica — mas nunca bloqueia o treino.
--   * Cada registro é auditado (sem os itens: o log guarda só a ação e o id).
--   * Itens: lista fixa (private.red_flag_keys), igual a features/knowledge/red-flags.ts (teste unitário confere).
--   * Na Fase 3 as respostas do aluno na anamnese alimentam a mesma lista (source = 'anamnesis').
-- =============================================================================

create function private.red_flag_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'chest_pain_exertion', 'neuro_vascular', 'sudden_breathlessness',
    'bladder_bowel_saddle', 'calf_swelling', 'hot_swollen_joint',
    'progressive_weakness', 'bilateral_symptoms', 'recent_trauma', 'dislocation',
    'cancer_weight_night', 'fever_infection', 'rapid_worsening'
  ]
$$;
grant execute on function private.red_flag_keys() to authenticated, service_role;

create table public.student_red_flag_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  -- 'trainer' (professor registrou); 'anamnesis' reservado para a Fase 3.
  source text not null default 'trainer' check (source in ('trainer', 'anamnesis')),
  items text[] not null default '{}' check (items <@ private.red_flag_keys()),
  note text check (length(note) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  -- Liberação (só quando há sinais): quem liberou, data e observação.
  clearance_kind text check (clearance_kind in ('medico', 'fisioterapeuta')),
  clearance_name text check (length(trim(clearance_name)) between 2 and 120),
  clearance_on date,
  clearance_note text check (length(clearance_note) <= 300),
  clearance_recorded_by uuid references auth.users (id) on delete set null,
  clearance_recorded_at timestamptz,
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade,
  check (
    (clearance_recorded_at is null and clearance_kind is null and clearance_name is null and clearance_on is null and clearance_note is null)
    or (clearance_recorded_at is not null and clearance_kind is not null and clearance_on is not null and cardinality(items) > 0)
  )
);
create index student_red_flag_checks_student_idx on public.student_red_flag_checks (student_id, recorded_at desc);
create index student_red_flag_checks_org_idx on public.student_red_flag_checks (organization_id);

alter table public.student_red_flag_checks enable row level security;
create policy student_red_flag_checks_select on public.student_red_flag_checks
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_view_student_health(student_id));
grant select on public.student_red_flag_checks to authenticated;
-- Sem INSERT/UPDATE/DELETE para authenticated: só as RPCs abaixo escrevem.

-- -----------------------------------------------------------------------------
-- Registrar triagem: sinais marcados ou "nenhum destes sinais" (items vazio).
-- -----------------------------------------------------------------------------
create function public.record_red_flag_check(p_student_id uuid, p_items text[], p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_items text[];
  v_id uuid;
begin
  s := private.lock_accessible_student(p_student_id);
  if not private.can_view_student_health(s.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if s.health_consent_declared_at is null and s.health_data_consent_at is null then
    raise exception 'HEALTH_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;
  v_items := array(select distinct unnest(coalesce(p_items, '{}')) order by 1);
  if not (v_items <@ private.red_flag_keys()) or length(coalesce(p_note, '')) > 300 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  insert into public.student_red_flag_checks (organization_id, student_id, items, note, recorded_by)
  values (s.organization_id, s.id, v_items, nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  perform private.audit(s.organization_id, 'student.red_flag_check_recorded', 'student', s.id);
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registrar liberação de uma triagem com sinais (uma vez; data até hoje em São Paulo).
-- -----------------------------------------------------------------------------
create function public.record_red_flag_clearance(
  p_check_id uuid,
  p_kind text,
  p_name text,
  p_on date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.student_red_flag_checks;
  s public.students;
begin
  select * into c from public.student_red_flag_checks where id = p_check_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  s := private.lock_accessible_student(c.student_id);
  if not private.can_view_student_health(s.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Relê com trava depois de validar o acesso.
  select * into c from public.student_red_flag_checks where id = p_check_id for update;
  if cardinality(c.items) = 0 or c.clearance_recorded_at is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_kind not in ('medico', 'fisioterapeuta')
    or length(trim(coalesce(p_name, ''))) not between 2 and 120
    or p_on is null or p_on > private.today_br() or p_on < (c.recorded_at at time zone 'America/Sao_Paulo')::date - 30
    or length(coalesce(p_note, '')) > 300
  then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  update public.student_red_flag_checks
  set clearance_kind = p_kind,
      clearance_name = trim(p_name),
      clearance_on = p_on,
      clearance_note = nullif(trim(p_note), ''),
      clearance_recorded_by = (select auth.uid()),
      clearance_recorded_at = now()
  where id = c.id;
  perform private.audit(s.organization_id, 'student.red_flag_clearance_recorded', 'student', s.id);
end;
$$;

revoke execute on function public.record_red_flag_check(uuid, text[], text), public.record_red_flag_clearance(uuid, text, text, date, text)
  from public, anon;
grant execute on function public.record_red_flag_check(uuid, text[], text), public.record_red_flag_clearance(uuid, text, text, date, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Recusa do consentimento pelo titular apaga os dados de saúde — inclusive a triagem.
-- -----------------------------------------------------------------------------
create function private.clear_red_flags_on_consent_decline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.health_consent_declared_at is not null and new.health_consent_declared_at is null and new.health_data_consent_at is null then
    delete from public.student_red_flag_checks where student_id = new.id;
  end if;
  return new;
end;
$$;

create trigger students_clear_red_flags_on_decline
after update of health_consent_declared_at on public.students
for each row execute function private.clear_red_flags_on_consent_decline();
