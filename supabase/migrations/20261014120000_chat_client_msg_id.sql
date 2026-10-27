-- =============================================================================
-- Chat (2.12): envio idempotente. O cliente gera um client_msg_id (UUID) por mensagem; reenviar com o mesmo id
-- (rede caiu depois de o banco gravar) devolve a linha já gravada, sem duplicar e sem contar de novo no limite de
-- 30/min. O mesmo id serve para o cliente deduplicar a mensagem local com o evento do Realtime.
--
-- Único por remetente: aluno por student_id (sender_id é nulo para ele), staff por sender_id (vale em todas as
-- conversas daquele professor/owner).
-- =============================================================================

-- Linhas já existentes ganham um id aleatório; depois o default sai, para o RPC sempre exigir o do cliente.
alter table public.chat_messages add column client_msg_id uuid not null default gen_random_uuid();
alter table public.chat_messages alter column client_msg_id drop default;

create unique index chat_messages_student_client_msg_uidx
  on public.chat_messages (student_id, client_msg_id) where sender_role = 'student';
create unique index chat_messages_staff_client_msg_uidx
  on public.chat_messages (sender_id, client_msg_id) where sender_role = 'staff';

-- Sem overload: a assinatura antiga sai.
drop function public.send_chat_message(uuid, text, uuid);

create function public.send_chat_message(
  p_student_id uuid,
  p_body text,
  p_client_msg_id uuid,
  p_attached_item_id uuid default null
)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  reader record := private.chat_reader(p_student_id);
  s public.students;
  v_body text := left(trim(coalesce(p_body, '')), 2000);
  v_item_name text;
  v_count integer;
  m public.chat_messages;
begin
  if p_client_msg_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'client_msg_id';
  end if;
  if v_body = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'body';
  end if;

  select * into s from public.students where id = p_student_id and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Reenvio: devolve a linha gravada antes de qualquer outra regra (não conta de novo no limite).
  select * into m from public.chat_messages cm
  where cm.client_msg_id = p_client_msg_id
    and (
      (reader.role = 'student' and cm.sender_role = 'student' and cm.student_id = s.id)
      or (reader.role = 'staff' and cm.sender_role = 'staff' and cm.sender_id = (select auth.uid()))
    );
  if found then
    -- Mesmo id com outra conversa ou outro texto é erro do cliente, nunca uma segunda mensagem.
    if m.student_id <> s.id or m.body <> v_body or m.attached_item_id is distinct from p_attached_item_id then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'client_msg_id';
    end if;
    return m;
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

  -- Limite de 30 mensagens/minuto por remetente (aluno por student_id; staff por sender_id, somando conversas).
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

  begin
    insert into public.chat_messages (
      organization_id, student_id, sender_role, sender_id, body, attached_item_id, attached_exercise_name, client_msg_id
    ) values (
      s.organization_id, s.id, reader.role, case when reader.role = 'staff' then (select auth.uid()) end,
      v_body, p_attached_item_id, v_item_name, p_client_msg_id
    )
    returning * into m;
  exception when unique_violation then
    -- Dois envios simultâneos com o mesmo id: o segundo devolve a linha do primeiro.
    select * into m from public.chat_messages cm
    where cm.client_msg_id = p_client_msg_id
      and (
        (reader.role = 'student' and cm.sender_role = 'student' and cm.student_id = s.id)
        or (reader.role = 'staff' and cm.sender_role = 'staff' and cm.sender_id = (select auth.uid()))
      );
    if m.student_id <> s.id or m.body <> v_body or m.attached_item_id is distinct from p_attached_item_id then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'client_msg_id';
    end if;
  end;
  return m;
end;
$$;

revoke execute on function public.send_chat_message(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.send_chat_message(uuid, text, uuid, uuid) to authenticated;
