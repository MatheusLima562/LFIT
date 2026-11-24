-- Sprint de venda, 1.6: "Recado para todos" vira post FIXADO do feed (proposta de docs/planos/feed.md).
-- * `feed_posts.unpin_at` ("fixado até"): na data o post sai do topo sozinho, sem ser apagado. Fixado efetivo =
--   pinned e (sem data ou data no futuro); um job de hora em hora grava pinned = false nos vencidos.
-- * Recados "para todos" ainda válidos viram posts fixados (até o vencimento do recado) e são encerrados.
-- * `set_trainer_announcement` sem aluno (para todos) passa a ser recusado: INVALID_INPUT, detail 'use_feed'. O recado
--   para UM aluno continua em `trainer_announcements` (o feed é coletivo).
-- * Hoje do aluno: `get_my_pinned_post` devolve o post fixado mais recente que ele vê.

alter table public.feed_posts add column unpin_at timestamptz;

-- 1) Migra os recados para todos ainda válidos --------------------------------------------------------------------------
with moved as (
  insert into public.feed_posts (
    organization_id, author_id, scope_trainer_id, kind, body, audience, pinned, unpin_at, published_at, created_at
  )
  select a.organization_id, a.trainer_id,
    case when p.role = 'owner' then null else a.trainer_id end,
    'text',
    -- Recado é texto puro (≤ 300); o feed recusa "<" seguido de letra: troca por "‹" para não perder o texto.
    regexp_replace(a.body, '<(?=[A-Za-z/!?])', '‹', 'g'),
    'all', true, a.expires_at, a.created_at, a.created_at
  from public.trainer_announcements a
  join public.profiles p on p.id = a.trainer_id
  where a.student_id is null and a.active and a.expires_at > now()
  returning 1
)
select count(*) from moved;

update public.trainer_announcements set active = false
where student_id is null and active and expires_at > now();

-- 2) Recado para todos: só pelo feed ----------------------------------------------------------------------------------
create or replace function public.set_trainer_announcement(p_body text, p_student_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  -- Para todos os alunos: agora é um post fixado do feed (`save_feed_post` com pinned e unpin_at).
  if p_student_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'use_feed';
  end if;
  if v_body = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'body';
  end if;
  perform private.lock_accessible_student(p_student_id);
  insert into public.trainer_announcements (organization_id, trainer_id, student_id, body)
  values (v_org, (select auth.uid()), p_student_id, left(v_body, 300))
  returning id into v_id;
  return v_id;
end;
$$;

-- 3) Post: "fixado até" -----------------------------------------------------------------------------------------------
create or replace function public.save_feed_post(p_data jsonb, p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_uid uuid := (select auth.uid());
  v_role text := private.current_user_role();
  p public.feed_posts;
  v_kind text := p_data ->> 'kind';
  v_body text := trim(coalesce(p_data ->> 'body', ''));
  v_image text := nullif(trim(coalesce(p_data ->> 'image_path', '')), '');
  v_video text := nullif(trim(coalesce(p_data ->> 'video_url', '')), '');
  v_audience text := coalesce(p_data ->> 'audience', 'all');
  v_modality text := nullif(p_data ->> 'audience_modality', '');
  v_class uuid := private.try_uuid(nullif(p_data ->> 'audience_class_id', ''));
  v_pinned boolean := coalesce((p_data ->> 'pinned')::boolean, false);
  v_published timestamptz;
  v_unpin timestamptz;
  v_bad text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'data';
  end if;
  if p_id is not null then
    p := private.lock_editable_feed_post(p_id);
  end if;

  begin
    v_published := nullif(p_data ->> 'published_at', '')::timestamptz;
    v_unpin := nullif(p_data ->> 'unpin_at', '')::timestamptz;
  exception when others then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'date';
  end;
  -- Edição sem data mantém a atual; criação sem data (ou no passado) publica agora.
  if v_published is null then
    v_published := case when p_id is null then now() else p.published_at end;
  elsif p_id is null and v_published < now() then
    v_published := now();
  end if;
  if v_published > now() + interval '365 days' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'published_at';
  end if;
  -- "Fixado até": só para post fixado, depois da publicação e até 1 ano.
  if not v_pinned then
    v_unpin := null;
  elsif v_unpin is not null and (v_unpin <= greatest(now(), v_published) or v_unpin > now() + interval '365 days') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'unpin_at';
  end if;

  v_bad := case
    when v_kind is null or v_kind not in ('text', 'image', 'video') then 'kind'
    when char_length(v_body) > 2000 then 'body'
    when v_body ~ '<[A-Za-z/!?]' then 'body_html'
    when v_kind = 'text' and (char_length(v_body) = 0 or v_image is not null or v_video is not null) then 'body'
    when v_kind = 'image' and (v_image is null or v_video is not null) then 'image_path'
    when v_kind = 'video' and (v_video is null or v_image is not null) then 'video_url'
    when v_audience not in ('all', 'modality', 'class') then 'audience'
    when v_audience = 'modality' and (v_modality is null or v_modality not in ('consultoria', 'presencial', 'hibrido')) then 'audience_modality'
    when v_audience = 'class' and v_class is null then 'audience_class_id'
  end;
  if v_bad is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = v_bad;
  end if;
  if v_audience <> 'modality' then v_modality := null; end if;
  if v_audience <> 'class' then v_class := null; end if;

  if v_video is not null and (
    char_length(v_video) > 500
    or v_video !~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|instagram\.com)/[^\s<>"'']*$'
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'video_url';
  end if;

  if v_image is not null and (
    split_part(v_image, '/', 1) <> v_org::text
    or v_image !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'feed-media' and o.name = v_image)
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'image_path';
  end if;

  if v_class is not null and not exists (select 1 from public.classes c where c.id = v_class and c.organization_id = v_org) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'audience_class_id';
  end if;

  if p_id is null then
    insert into public.feed_posts (
      organization_id, author_id, scope_trainer_id, kind, body, image_path, video_url,
      audience, audience_modality, audience_class_id, pinned, unpin_at, published_at
    ) values (
      v_org, v_uid, case when v_role = 'owner' then null else v_uid end, v_kind, v_body, v_image, v_video,
      v_audience, v_modality, v_class, v_pinned, v_unpin, v_published
    )
    returning * into p;
  else
    update public.feed_posts set
      kind = v_kind, body = v_body, image_path = v_image, video_url = v_video,
      audience = v_audience, audience_modality = v_modality, audience_class_id = v_class,
      pinned = v_pinned, unpin_at = v_unpin, published_at = v_published, updated_at = now()
    where id = p.id
    returning * into p;
  end if;

  return jsonb_build_object('id', p.id, 'published_at', p.published_at, 'unpin_at', p.unpin_at);
end;
$$;

-- Fixar/desafixar pelo botão: desafixar limpa o "fixado até".
create or replace function public.set_feed_post_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.feed_posts := private.lock_editable_feed_post(p_id);
begin
  update public.feed_posts
  set pinned = coalesce(p_pinned, false),
      unpin_at = case when coalesce(p_pinned, false) and (p.unpin_at is null or p.unpin_at > now()) then p.unpin_at end,
      updated_at = now()
  where id = p.id;
end;
$$;

-- Fixado efetivo (o job grava pinned = false; até lá a leitura já respeita a data).
create function private.feed_is_pinned(p_pinned boolean, p_unpin_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_pinned and (p_unpin_at is null or p_unpin_at > now())
$$;
revoke execute on function private.feed_is_pinned(boolean, timestamptz) from public, anon, authenticated;

create or replace function public.list_feed_posts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_uid uuid := (select auth.uid());
  v_owner boolean := private.is_owner();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'body', p.body, 'image_path', p.image_path, 'video_url', p.video_url,
        'audience', p.audience, 'audience_modality', p.audience_modality, 'audience_class_id', p.audience_class_id,
        'audience_class_name', c.name, 'pinned', private.feed_is_pinned(p.pinned, p.unpin_at), 'unpin_at', p.unpin_at,
        'published_at', p.published_at, 'updated_at', p.updated_at,
        'author_name', pr.full_name, 'own_students_only', p.scope_trainer_id is not null,
        'can_edit', v_owner or p.author_id = v_uid,
        'like_count', (select count(*)::integer from public.feed_likes l where l.post_id = p.id)
      ) order by private.feed_is_pinned(p.pinned, p.unpin_at) desc, p.published_at desc, p.id)
    from public.feed_posts p
    left join public.profiles pr on pr.id = p.author_id
    left join public.classes c on c.id = p.audience_class_id
    where p.organization_id = v_org and p.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_my_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students := private.feed_me();
  v_seen timestamptz;
begin
  select r.last_seen_at into v_seen from public.feed_reads r where r.student_id = s.id;
  return jsonb_build_object(
    'last_seen_at', v_seen,
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', v.id, 'kind', v.kind, 'body', v.body, 'image_path', v.image_path, 'video_url', v.video_url,
          'pinned', v.is_pinned, 'published_at', v.published_at,
          'author_first_name', split_part(pr.full_name, ' ', 1),
          'like_count', (select count(*)::integer from public.feed_likes l where l.post_id = v.id),
          'liked', exists (select 1 from public.feed_likes l where l.post_id = v.id and l.student_id = s.id)
        ) order by v.is_pinned desc, v.published_at desc, v.id)
      from (
        select fp.*, private.feed_is_pinned(fp.pinned, fp.unpin_at) as is_pinned
        from private.feed_visible_posts(s.id) fp
        order by private.feed_is_pinned(fp.pinned, fp.unpin_at) desc, fp.published_at desc, fp.id
        limit 50
      ) v
      left join public.profiles pr on pr.id = v.author_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Hoje do aluno: post fixado mais recente que ele vê (nulo se não houver).
create function public.get_my_pinned_post()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students := private.feed_me();
begin
  return (
    select jsonb_build_object(
      'id', v.id, 'kind', v.kind, 'body', v.body, 'image_path', v.image_path, 'video_url', v.video_url,
      'published_at', v.published_at, 'author_first_name', split_part(pr.full_name, ' ', 1)
    )
    from private.feed_visible_posts(s.id) v
    left join public.profiles pr on pr.id = v.author_id
    where private.feed_is_pinned(v.pinned, v.unpin_at)
    order by v.published_at desc, v.id
    limit 1
  );
end;
$$;

-- 4) Job: desafixa o que venceu (de hora em hora) --------------------------------------------------------------------
create function private.unpin_expired_feed_posts()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (
    update public.feed_posts set pinned = false, updated_at = now()
    where pinned and unpin_at is not null and unpin_at <= now()
    returning 1
  )
  select count(*)::integer from d
$$;
revoke execute on function private.unpin_expired_feed_posts() from public, anon, authenticated;
select cron.schedule('lfit-unpin-feed-posts', '7 * * * *', $cron$select private.unpin_expired_feed_posts()$cron$);

revoke execute on function public.get_my_pinned_post() from public, anon;
grant execute on function public.get_my_pinned_post() to authenticated;
