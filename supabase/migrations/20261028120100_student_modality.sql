-- Base para o presencial (mínimo): modalidade do aluno. Só a etiqueta e o filtro — nada de agenda, presença ou cobrança
-- (proposta em docs/planos/modulo-presencial.md).
-- 1) students.modality: consultoria (padrão) | presencial | hibrido.
-- 2) students_with_status recriada: a view expandiu s.* na criação e não vê a coluna nova (mesma definição de
--    20261001120000_student_plan_filters.sql).
-- 3) set_student_modality: escrita só por RPC, como as demais do aluno (owner ou professor responsável).

alter table public.students
  add column modality text not null default 'consultoria'
  check (modality in ('consultoria', 'presencial', 'hibrido'));

drop view public.students_with_status;

create view public.students_with_status
with (security_invoker = true)
as
select
  s.*,
  public.student_effective_status(s) as effective_status,
  s.first_name || ' ' || s.last_name as full_name,
  private.immutable_unaccent(lower(s.first_name || ' ' || s.last_name || ' ' || s.email)) as search_text
from public.students s
where s.deleted_at is null;

grant select on public.students_with_status to authenticated;

create function public.set_student_modality(p_student_id uuid, p_modality text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
begin
  if p_modality is null or p_modality not in ('consultoria', 'presencial', 'hibrido') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'modality';
  end if;
  update public.students set modality = p_modality, updated_at = now() where id = s.id;
end;
$$;
revoke execute on function public.set_student_modality(uuid, text) from public, anon;
grant execute on function public.set_student_modality(uuid, text) to authenticated;
