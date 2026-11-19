-- Feed (Comunidade), fase 1. O personal (e professores da equipe, se houver) publica dicas, imagens e vídeos por link;
-- os alunos dele leem e curtem. Aluno NÃO publica nem comenta nesta fase.
--
-- Regras:
-- * Escrita só por RPC (tabelas sem grant de insert/update/delete para `authenticated`).
-- * Público: todos os alunos do autor, uma modalidade ou uma TURMA (`classes`). Grupos especiais ficam de fora: são
--   dado de saúde e mirar um post neles revelaria a condição a quem lê.
-- * Post do owner (o personal) vale para os alunos da organização; post de professor da equipe vale só para os alunos
--   dele (`scope_trainer_id`, mesma regra do recado para todos).
-- * Agendado (`published_at` no futuro) e apagado (`deleted_at`, soft delete) são invisíveis ao aluno.
-- * Curtidas: o aluno vê só a CONTAGEM e se ele mesmo curtiu, nunca quem curtiu; o personal vê a contagem.
-- * Texto puro (sem HTML), até 2000 caracteres. Vídeo só por link https de YouTube, Vimeo ou Instagram. Imagem no bucket
--   PRIVADO `feed-media` (5 MB, JPEG/WebP redimensionado no cliente), leitura por RLS: staff da org e alunos que veem o
--   post. Sem upload de vídeo (custo de armazenamento e banda).
-- * Conteúdo de post nunca vai para log ou auditoria.

-- 1) Tabelas -----------------------------------------------------------------------------------------------------------
create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Nulo = post do owner (todos os alunos da org); preenchido = professor da equipe (só os alunos dele).
  scope_trainer_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'video')),
  body text not null default '' check (char_length(body) <= 2000 and body !~ '<[A-Za-z/!?]'),
  image_path text,
  video_url text check (
    video_url is null or (
      char_length(video_url) <= 500
      and video_url ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|instagram\.com)/[^\s<>"'']*$'
    )
  ),
  audience text not null default 'all' check (audience in ('all', 'modality', 'class')),
  audience_modality text check (audience_modality in ('consultoria', 'presencial', 'hibrido')),
  -- Turma apagada vira nulo: o post deixa de aparecer para alguém (nunca passa a valer para todos).
  audience_class_id uuid references public.classes (id) on delete set null,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((audience = 'modality') = (audience_modality is not null)),
  check (audience = 'class' or audience_class_id is null),
  check (
    (kind = 'text' and char_length(trim(body)) > 0 and image_path is null and video_url is null)
    or (kind = 'image' and image_path is not null and video_url is null)
    or (kind = 'video' and video_url is not null and image_path is null)
  )
);
create index feed_posts_org_published_idx on public.feed_posts (organization_id, published_at desc) where deleted_at is null;
create index feed_posts_image_idx on public.feed_posts (image_path) where image_path is not null;

create table public.feed_likes (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, student_id)
);
create index feed_likes_student_idx on public.feed_likes (student_id);

-- Indicador de novidades (sem push): até quando o aluno já viu o feed.
create table public.feed_reads (
  student_id uuid primary key references public.students (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.feed_posts enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_reads enable row level security;

revoke all on public.feed_posts, public.feed_likes, public.feed_reads from public, anon, authenticated;
grant select, insert, update, delete on public.feed_posts, public.feed_likes, public.feed_reads to service_role;
-- Staff lê os posts da própria organização (a tela usa a RPC; a leitura direta não traz curtidas). Aluno não lê tabela
-- nenhuma do feed diretamente: tudo passa por `get_my_feed`, que aplica público, agendamento e exclusão.
grant select on public.feed_posts to authenticated;
create policy feed_posts_select_staff on public.feed_posts for select to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()) and deleted_at is null);

-- 2) Visibilidade para o aluno (fonte única: RPCs e Storage) -------------------------------------------------------
create function private.feed_visible_posts(p_student_id uuid)
returns setof public.feed_posts
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.feed_posts p
  join public.students s on s.id = p_student_id and s.organization_id = p.organization_id and s.deleted_at is null
  where p.deleted_at is null
    and p.published_at <= now()
    and (p.scope_trainer_id is null or s.trainer_id = p.scope_trainer_id)
    and (
      p.audience = 'all'
      or (p.audience = 'modality' and s.modality = p.audience_modality)
      or (p.audience = 'class' and exists (
        select 1 from public.class_students cs where cs.class_id = p.audience_class_id and cs.student_id = s.id
      ))
    )
$$;

-- Aluno titular com acesso ativo (senão STUDENT_NOT_FOUND / ACCESS_SUSPENDED).
create function private.feed_me()
returns public.students
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.student_effective_status(s) <> 'active' then
    raise exception 'ACCESS_SUSPENDED' using errcode = 'P0001';
  end if;
  return s;
end;
$$;

-- Post editável pelo chamador: staff da mesma org, não apagado, e owner ou autor. Senão FEED_POST_NOT_FOUND (não revela
-- se o post existe em outra organização).
create function private.lock_editable_feed_post(p_id uuid)
returns public.feed_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  p public.feed_posts;
begin
  select * into p from public.feed_posts
  where id = p_id and organization_id = v_org and deleted_at is null
  for update;
  if not found or not (private.is_owner() or p.author_id = (select auth.uid())) then
    raise exception 'FEED_POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

revoke execute on function private.feed_visible_posts(uuid), private.feed_me(), private.lock_editable_feed_post(uuid)
from public, anon, authenticated;

-- 3) Storage: bucket privado `feed-media` ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-media', 'feed-media', false, 5 * 1024 * 1024, array['image/jpeg', 'image/webp']);

-- Caminho `<org_id>/<uuid>.(jpg|webp)`. Envio: staff, na pasta da própria organização.
create function private.can_upload_feed_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
    and (storage.foldername(p_name))[1] = private.current_org_id()::text
    and array_length(storage.foldername(p_name), 1) = 1
    and storage.filename(p_name) ~ '^[0-9a-f-]{36}\.(jpg|webp)$'
$$;

-- Remoção: staff da org, desde que nenhum post ativo de OUTRA pessoa use a imagem (owner remove qualquer uma).
create function private.can_delete_feed_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_upload_feed_media(p_name)
    and (private.is_owner() or not exists (
      select 1 from public.feed_posts p
      where p.image_path = p_name and p.deleted_at is null and p.author_id <> (select auth.uid())
    ))
$$;

-- Leitura pelo aluno: só a imagem de um post que ele vê agora (público, publicado, não apagado) e só com acesso ATIVO
-- (mesma regra de `private.feed_me`: inativo, expirado ou bloqueado não abre a imagem nem por URL assinada nova).
create function private.student_can_read_feed_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    cross join lateral private.feed_visible_posts(s.id) p
    where s.user_id = (select auth.uid())
      and s.deleted_at is null
      and public.student_effective_status(s) = 'active'
      and p.image_path = p_name
  )
$$;

revoke execute on function
  private.can_upload_feed_media(text), private.can_delete_feed_media(text), private.student_can_read_feed_media(text)
from public, anon;
grant execute on function
  private.can_upload_feed_media(text), private.can_delete_feed_media(text), private.student_can_read_feed_media(text)
to authenticated;

create policy feed_media_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feed-media'
    and (select private.is_staff())
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
  );

create policy feed_media_select_student on storage.objects
  for select to authenticated
  using (bucket_id = 'feed-media' and private.student_can_read_feed_media(name));

create policy feed_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feed-media' and private.can_upload_feed_media(name));

create policy feed_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'feed-media' and private.can_delete_feed_media(name));

-- 4) RPCs do personal / equipe --------------------------------------------------------------------------------------
-- Cria (p_id nulo) ou edita um post. Campos em p_data: kind, body, image_path, video_url, audience, audience_modality,
-- audience_class_id, pinned, published_at (agendamento; nulo = agora; até 365 dias à frente).
create function public.save_feed_post(p_data jsonb, p_id uuid default null)
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
  exception when others then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'published_at';
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

  -- Imagem: da pasta da própria organização e já enviada ao bucket.
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
      audience, audience_modality, audience_class_id, pinned, published_at
    ) values (
      v_org, v_uid, case when v_role = 'owner' then null else v_uid end, v_kind, v_body, v_image, v_video,
      v_audience, v_modality, v_class, v_pinned, v_published
    )
    returning * into p;
  else
    update public.feed_posts set
      kind = v_kind, body = v_body, image_path = v_image, video_url = v_video,
      audience = v_audience, audience_modality = v_modality, audience_class_id = v_class,
      pinned = v_pinned, published_at = v_published, updated_at = now()
    where id = p.id
    returning * into p;
  end if;

  return jsonb_build_object('id', p.id, 'published_at', p.published_at);
end;
$$;

-- Apagar = soft delete (some para o aluno na hora; as curtidas ficam até a exclusão em cascata da org). Devolve o
-- caminho da imagem que pode sair do Storage (nenhum outro post ativo a usa): o SERVIDOR apaga o arquivo pela API do
-- Storage logo depois (`features/feed/actions.ts`); o que falhar ali a limpeza diária remove.
create function public.delete_feed_post(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.feed_posts := private.lock_editable_feed_post(p_id);
begin
  update public.feed_posts set deleted_at = now(), pinned = false, updated_at = now() where id = p.id;
  return jsonb_build_object(
    'image_path',
    case when p.image_path is not null and not exists (
      select 1 from public.feed_posts o where o.image_path = p.image_path and o.id <> p.id and o.deleted_at is null
    ) then p.image_path end
  );
end;
$$;

create function public.set_feed_post_pinned(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.feed_posts := private.lock_editable_feed_post(p_id);
begin
  update public.feed_posts set pinned = coalesce(p_pinned, false), updated_at = now() where id = p.id;
end;
$$;

-- Lista para a página "Feed" do painel: posts não apagados da organização (inclusive agendados), com a CONTAGEM de
-- curtidas, o nome do autor e se o chamador pode editar. Nunca quem curtiu.
create function public.list_feed_posts()
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
        'audience_class_name', c.name, 'pinned', p.pinned, 'published_at', p.published_at, 'updated_at', p.updated_at,
        'author_name', pr.full_name, 'own_students_only', p.scope_trainer_id is not null,
        'can_edit', v_owner or p.author_id = v_uid,
        'like_count', (select count(*)::integer from public.feed_likes l where l.post_id = p.id)
      ) order by p.pinned desc, p.published_at desc, p.id)
    from public.feed_posts p
    left join public.profiles pr on pr.id = p.author_id
    left join public.classes c on c.id = p.audience_class_id
    where p.organization_id = v_org and p.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- 5) RPCs do aluno (titular) -----------------------------------------------------------------------------------------
-- Feed do próprio aluno: fixados primeiro, depois do mais novo para o mais antigo (até 50). Para cada post: a contagem
-- de curtidas e se ELE curtiu — nunca quem curtiu. `last_seen_at` = até quando ele já tinha visto (novidades).
create function public.get_my_feed()
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
          'pinned', v.pinned, 'published_at', v.published_at,
          'author_first_name', split_part(pr.full_name, ' ', 1),
          'like_count', (select count(*)::integer from public.feed_likes l where l.post_id = v.id),
          'liked', exists (select 1 from public.feed_likes l where l.post_id = v.id and l.student_id = s.id)
        ) order by v.pinned desc, v.published_at desc, v.id)
      from (
        select * from private.feed_visible_posts(s.id) fp order by fp.pinned desc, fp.published_at desc, fp.id limit 50
      ) v
      left join public.profiles pr on pr.id = v.author_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Quantos posts visíveis chegaram depois da última visita (só o número, para o marcador da aba).
create function public.get_my_feed_new_count()
returns integer
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
  return (select count(*)::integer from private.feed_visible_posts(s.id) v where v_seen is null or v.published_at > v_seen);
end;
$$;

create function public.mark_feed_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.feed_me();
begin
  insert into public.feed_reads (student_id, organization_id, last_seen_at) values (s.id, s.organization_id, now())
  on conflict (student_id) do update set last_seen_at = now();
end;
$$;

-- Curtir / descurtir (idempotente). Só post que o aluno vê; senão FEED_POST_NOT_FOUND. Devolve a contagem e o estado.
create function public.toggle_feed_like(p_post_id uuid, p_like boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.feed_me();
begin
  if not exists (select 1 from private.feed_visible_posts(s.id) v where v.id = p_post_id) then
    raise exception 'FEED_POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(p_like, false) then
    insert into public.feed_likes (post_id, student_id, organization_id) values (p_post_id, s.id, s.organization_id)
    on conflict do nothing;
  else
    delete from public.feed_likes where post_id = p_post_id and student_id = s.id;
  end if;
  return jsonb_build_object(
    'like_count', (select count(*)::integer from public.feed_likes l where l.post_id = p_post_id),
    'liked', coalesce(p_like, false)
  );
end;
$$;

-- 6) Permissões ------------------------------------------------------------------------------------------------------
revoke execute on function
  public.save_feed_post(jsonb, uuid),
  public.delete_feed_post(uuid),
  public.set_feed_post_pinned(uuid, boolean),
  public.list_feed_posts(),
  public.get_my_feed(),
  public.get_my_feed_new_count(),
  public.mark_feed_seen(),
  public.toggle_feed_like(uuid, boolean)
from public, anon;
grant execute on function
  public.save_feed_post(jsonb, uuid),
  public.delete_feed_post(uuid),
  public.set_feed_post_pinned(uuid, boolean),
  public.list_feed_posts(),
  public.get_my_feed(),
  public.get_my_feed_new_count(),
  public.mark_feed_seen(),
  public.toggle_feed_like(uuid, boolean)
to authenticated;
