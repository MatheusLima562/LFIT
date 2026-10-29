-- Etapa 3.3 enxuta (decisões do dono em docs/planos/etapa-2.12-paginas.md):
-- 1) reply_to_session passa a exigir que o chamador veja a saúde do aluno (can_view_student_health), coerente com o
--    RLS de leitura de workout_sessions: quem não lê o comentário não responde a ele. Recusa = SESSION_NOT_FOUND (não
--    confirma que a sessão existe).
-- 2) end_trainer_announcement: o autor encerra o próprio recado (active = false). Nenhum texto em audit_logs.

create or replace function public.reply_to_session(p_session_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  v_reply text := trim(coalesce(p_reply, ''));
begin
  perform private.require_staff();
  if v_reply = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'reply';
  end if;
  select * into w from public.workout_sessions where id = p_session_id;
  if not found
     or not private.can_access_student(w.student_id)
     or not private.can_view_student_health(w.student_id) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.workout_sessions
  set coach_reply = left(v_reply, 300), coach_reply_at = now(), coach_reply_by = (select auth.uid())
  where id = w.id;
end;
$$;
revoke execute on function public.reply_to_session(uuid, text) from public, anon;
grant execute on function public.reply_to_session(uuid, text) to authenticated;

create function public.end_trainer_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
begin
  update public.trainer_announcements
  set active = false
  where id = p_announcement_id
    and organization_id = v_org
    and trainer_id = (select auth.uid())
    and active;
  if not found then
    raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.end_trainer_announcement(uuid) from public, anon;
grant execute on function public.end_trainer_announcement(uuid) to authenticated;
