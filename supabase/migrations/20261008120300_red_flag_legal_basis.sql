-- =============================================================================
-- 2.10 Fase B — Ajuste da triagem de sinais de alerta (decisão do dono, a validar com advogado):
--   * Base legal própria: LGPD art. 11, II, "e" (proteção da vida/incolumidade física) e "d" (exercício regular de
--     direitos). A triagem e a liberação são registradas SEM depender do consentimento de saúde, com dados mínimos:
--     sinais + encaminhamento + liberação.
--   * Acesso só do professor responsável e do owner (private.can_access_student), independentemente do consentimento;
--     professor do plano e demais staff não veem. Continua auditado (sem os itens).
--   * Recusa do consentimento pelo titular apaga grupos e demais dados de saúde, mas MANTÉM triagem e liberação.
-- =============================================================================

-- Encaminhamento (só faz sentido com sinais marcados).
alter table public.student_red_flag_checks
  add column referred boolean not null default false,
  add constraint student_red_flag_checks_referred_needs_items check (not referred or cardinality(items) > 0);

-- Leitura: responsável e owner (mesmo sem consentimento de saúde).
drop policy student_red_flag_checks_select on public.student_red_flag_checks;
create policy student_red_flag_checks_select on public.student_red_flag_checks
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_access_student(student_id));

-- A recusa do consentimento não apaga mais a triagem.
drop trigger students_clear_red_flags_on_decline on public.students;
drop function private.clear_red_flags_on_consent_decline();

-- Registrar triagem: sem exigir consentimento; acesso = lock_accessible_student (owner ou responsável).
drop function public.record_red_flag_check(uuid, text[], text);
create function public.record_red_flag_check(
  p_student_id uuid,
  p_items text[],
  p_referred boolean default false,
  p_note text default null
)
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
  v_items := array(select distinct unnest(coalesce(p_items, '{}')) order by 1);
  if not (v_items <@ private.red_flag_keys())
    or (coalesce(p_referred, false) and cardinality(v_items) = 0)
    or length(coalesce(p_note, '')) > 300
  then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  insert into public.student_red_flag_checks (organization_id, student_id, items, referred, note, recorded_by)
  values (s.organization_id, s.id, v_items, coalesce(p_referred, false), nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  perform private.audit(s.organization_id, 'student.red_flag_check_recorded', 'student', s.id);
  return v_id;
end;
$$;

-- Liberação: mesmo escopo de acesso, sem exigir consentimento.
create or replace function public.record_red_flag_clearance(
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

revoke execute on function public.record_red_flag_check(uuid, text[], boolean, text), public.record_red_flag_clearance(uuid, text, text, date, text)
  from public, anon;
grant execute on function public.record_red_flag_check(uuid, text[], boolean, text), public.record_red_flag_clearance(uuid, text, text, date, text)
  to authenticated;
