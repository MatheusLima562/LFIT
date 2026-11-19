-- Correção de 20261028120100: create_student monta a linha inteira (jsonb_populate_record + insert ... values (r.*)),
-- então o DEFAULT da coluna nova não se aplica e modality chegava nula (NOT NULL). Gatilho BEFORE INSERT completa o
-- padrão; o NOT NULL é verificado depois dos gatilhos BEFORE. Vale para qualquer insert futuro no mesmo padrão.

create function private.student_modality_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.modality is null then
    new.modality := 'consultoria';
  end if;
  return new;
end;
$$;

create trigger students_modality_default
  before insert on public.students
  for each row execute function private.student_modality_default();
