-- =============================================================================
-- Chat (2.12): leitura só até a mensagem exibida + primeiro nome de quem enviou (staff).
--
-- 1) mark_chat_read marcava tudo "até agora": uma mensagem que chegou depois da última exibida na tela virava lida
--    sem ter sido vista. Agora recebe a mensagem mais recente que o cliente exibiu e marca SOMENTE até ela.
--    O cursor passa a ser o par (last_read_at, last_read_message_id) — a mesma ordem (created_at, id) da conversa —
--    para não errar no empate de timestamp. Nunca anda para trás.
-- 2) get_chat_messages devolve sender_first_name (só o primeiro nome do staff; nulo nas mensagens do aluno).
--
-- Contagens de não lidas (chat_unread_count, list_chat_inbox, staff_total_unread_count): mesma semântica — mensagens
-- do outro lado depois do MEU cursor —, agora comparando o par. Cursores antigos (sem mensagem) valem como antes:
-- tudo com created_at <= last_read_at é lido (id "máximo" no desempate).
-- Nada de corpo de mensagem nem nome em audit_logs, log ou mensagem de erro (erros só com códigos fixos).
-- =============================================================================

alter table public.chat_reads
  add column last_read_message_id uuid references public.chat_messages (id) on delete set null;
create index chat_reads_last_read_message_idx on public.chat_reads (last_read_message_id);

-- Desempate de cursores antigos (sem mensagem): equivale ao "created_at <= last_read_at" de antes.
create function private.chat_cursor_id(p_id uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
$$;
revoke execute on function private.chat_cursor_id(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1) mark_chat_read(p_student_id, p_until_message_id)
-- -----------------------------------------------------------------------------
drop function public.mark_chat_read(uuid);

create function public.mark_chat_read(p_student_id uuid, p_until_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Quem não acessa a conversa (nem como aluno, nem como staff): STUDENT_NOT_FOUND, como nas demais RPCs do chat.
  reader record := private.chat_reader(p_student_id);
  v_at timestamptz;
begin
  -- A mensagem precisa ser desta conversa (e o acesso a ela já foi checado acima).
  select m.created_at into v_at
  from public.chat_messages m
  where m.id = p_until_message_id and m.student_id = p_student_id;
  if v_at is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'until_message_id';
  end if;

  insert into public.chat_reads as cr (student_id, reader_role, reader_id, last_read_at, last_read_message_id)
  values (p_student_id, reader.role, reader.id, v_at, p_until_message_id)
  on conflict (student_id, reader_role, reader_id) do update
    set last_read_at = excluded.last_read_at, last_read_message_id = excluded.last_read_message_id
    -- Nunca para trás: só avança se a mensagem for posterior ao cursor atual na ordem (created_at, id).
    where (excluded.last_read_at, excluded.last_read_message_id)
      > (cr.last_read_at, private.chat_cursor_id(cr.last_read_message_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) get_chat_messages com sender_first_name (o tipo de retorno muda: drop + create)
-- -----------------------------------------------------------------------------
drop function public.get_chat_messages(uuid, timestamptz);

create function public.get_chat_messages(p_student_id uuid, p_before timestamptz default null)
returns table (
  id uuid,
  organization_id uuid,
  student_id uuid,
  sender_role text,
  sender_id uuid,
  body text,
  attached_item_id uuid,
  attached_exercise_name text,
  created_at timestamptz,
  client_msg_id uuid,
  -- Só o primeiro nome do staff (nunca sobrenome, e-mail ou outro dado do perfil); nulo nas mensagens do aluno.
  sender_first_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.organization_id, m.student_id, m.sender_role, m.sender_id, m.body,
    m.attached_item_id, m.attached_exercise_name, m.created_at, m.client_msg_id,
    case when m.sender_role = 'staff' then nullif(split_part(btrim(p.full_name), ' ', 1), '') end
  from public.chat_messages m
  left join public.profiles p on p.id = m.sender_id and m.sender_role = 'staff'
  where m.student_id = p_student_id
    and (private.is_own_student(p_student_id) or private.can_access_student(p_student_id))
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc, m.id desc
  limit 50
$$;

-- -----------------------------------------------------------------------------
-- 3) Contagens: mesma semântica, cursor comparado como par (created_at, id)
-- -----------------------------------------------------------------------------
create or replace function public.chat_unread_count(p_student_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reader record := private.chat_reader(p_student_id);
  r public.chat_reads;
  v_other text := case when reader.role = 'student' then 'staff' else 'student' end;
  v_count integer;
begin
  select * into r from public.chat_reads
  where student_id = p_student_id and reader_role = reader.role and reader_id = reader.id;
  select count(*) into v_count from public.chat_messages m
  where m.student_id = p_student_id and m.sender_role = v_other
    and (r.student_id is null
      or (m.created_at, m.id) > (r.last_read_at, private.chat_cursor_id(r.last_read_message_id)));
  return v_count;
end;
$$;

create or replace function public.list_chat_inbox()
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
  with visible as (
    select
      s.id, s.first_name, s.last_name, s.photo_path,
      (
        select count(*)::integer from public.chat_messages m
        left join public.chat_reads r
          on r.student_id = s.id and r.reader_role = 'staff' and r.reader_id = (select auth.uid())
        where m.student_id = s.id and m.sender_role = 'student'
          and (r.student_id is null
            or (m.created_at, m.id) > (r.last_read_at, private.chat_cursor_id(r.last_read_message_id)))
      ) as unread
    from public.students s
    where s.deleted_at is null and private.can_access_student(s.id)
  )
  select
    v.id, concat_ws(' ', v.first_name, v.last_name), v.photo_path,
    last.body, last.created_at, last.sender_role,
    v.unread
  from visible v
  left join lateral (
    select cm.body, cm.created_at, cm.sender_role from public.chat_messages cm
    where cm.student_id = v.id order by cm.created_at desc, cm.id desc limit 1
  ) last on true
  order by (v.unread > 0) desc, last.created_at desc nulls last, v.first_name, v.last_name
$$;

create or replace function public.staff_total_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    (select count(*) from public.chat_messages m
     left join public.chat_reads r
       on r.student_id = s.id and r.reader_role = 'staff' and r.reader_id = (select auth.uid())
     where m.student_id = s.id and m.sender_role = 'student'
       and (r.student_id is null
         or (m.created_at, m.id) > (r.last_read_at, private.chat_cursor_id(r.last_read_message_id))))
  ), 0)::integer
  from public.students s
  where s.deleted_at is null and private.can_access_student(s.id)
$$;

-- -----------------------------------------------------------------------------
-- 4) Permissões (as funções recriadas perdem os grants; as substituídas mantêm, mas reafirmamos)
-- -----------------------------------------------------------------------------
revoke execute on function
  public.mark_chat_read(uuid, uuid), public.get_chat_messages(uuid, timestamptz),
  public.chat_unread_count(uuid), public.list_chat_inbox(), public.staff_total_unread_count()
from public, anon;
grant execute on function
  public.mark_chat_read(uuid, uuid), public.get_chat_messages(uuid, timestamptz),
  public.chat_unread_count(uuid), public.list_chat_inbox(), public.staff_total_unread_count()
to authenticated;
