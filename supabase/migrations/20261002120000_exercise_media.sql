-- =============================================================================
-- Vídeo próprio (MP4/WebM) de demonstração nos exercícios.
--
-- Arquivos no bucket privado "exercise-media":
--   <org_id>/<exercise_id>/<uuid>.(mp4|webm)   vídeo
--   <org_id>/<exercise_id>/<uuid>.(jpg|webp)   poster (primeiro quadro)
--   global/<exercise_id>/...                   biblioteca global (só service_role)
--
-- Limites: 15 MB por arquivo (bucket), MP4/WebM, 30 s (validado no cliente — o
-- banco não decodifica vídeo). Cota de armazenamento por plano da organização,
-- configurável em plan_tier_limits (e por organização em organizations.video_quota_bytes).
-- Motivo: custo de storage e egress no plano grátis do Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cotas por plano (configuráveis, sem valores fixos no código)
-- -----------------------------------------------------------------------------
create table public.plan_tier_limits (
  plan public.plan_tier primary key,
  video_quota_bytes bigint not null check (video_quota_bytes >= 0),
  updated_at timestamptz not null default now()
);

insert into public.plan_tier_limits (plan, video_quota_bytes) values
  ('free', 0),
  ('pro', 500::bigint * 1024 * 1024),
  ('gold', 2048::bigint * 1024 * 1024);

alter table public.plan_tier_limits enable row level security;
create policy plan_tier_limits_select on public.plan_tier_limits for select to authenticated using (true);
grant select on public.plan_tier_limits to authenticated;

-- Exceção negociada por organização (nulo = cota do plano).
alter table public.organizations add column video_quota_bytes bigint check (video_quota_bytes >= 0);

-- -----------------------------------------------------------------------------
-- Colunas de mídia no exercício
-- -----------------------------------------------------------------------------
alter table public.exercises
  add column video_path text,
  add column poster_path text,
  -- Tamanho real (vídeo + poster) lido de storage.objects pelo gatilho; nunca vem do cliente.
  add column media_bytes bigint not null default 0 check (media_bytes >= 0),
  add constraint exercises_poster_needs_video check (poster_path is null or video_path is not null);

create index exercises_org_media_idx on public.exercises (organization_id) where video_path is not null;

-- Valida os arquivos, calcula media_bytes e aplica a cota. Roda como dono para
-- ler storage.objects; o chamador já passou pelo RLS de UPDATE de exercises.
create function private.exercise_media_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_video storage.objects;
  v_poster storage.objects;
  v_quota bigint;
  v_used bigint;
begin
  if tg_op = 'UPDATE' and new.video_path is not distinct from old.video_path and new.poster_path is not distinct from old.poster_path then
    new.media_bytes := old.media_bytes;
    return new;
  end if;

  new.media_bytes := 0;
  if new.video_path is null then
    new.poster_path := null;
    return new;
  end if;

  v_prefix := coalesce(new.organization_id::text, 'global') || '/' || new.id::text || '/';
  if new.video_path !~ ('^' || v_prefix || '[0-9a-f-]{36}\.(mp4|webm)$')
     or (new.poster_path is not null and new.poster_path !~ ('^' || v_prefix || '[0-9a-f-]{36}\.(jpg|webp)$')) then
    raise exception 'INVALID_MEDIA' using errcode = 'P0001', detail = 'path';
  end if;

  select * into v_video from storage.objects where bucket_id = 'exercise-media' and name = new.video_path;
  if not found
     or coalesce(v_video.metadata ->> 'mimetype', '') not in ('video/mp4', 'video/webm')
     or coalesce((v_video.metadata ->> 'size')::bigint, 0) > 15 * 1024 * 1024 then
    raise exception 'INVALID_MEDIA' using errcode = 'P0001', detail = 'video';
  end if;
  new.media_bytes := coalesce((v_video.metadata ->> 'size')::bigint, 0);

  if new.poster_path is not null then
    select * into v_poster from storage.objects where bucket_id = 'exercise-media' and name = new.poster_path;
    if not found
       or coalesce(v_poster.metadata ->> 'mimetype', '') not in ('image/jpeg', 'image/webp')
       or coalesce((v_poster.metadata ->> 'size')::bigint, 0) > 1024 * 1024 then
      raise exception 'INVALID_MEDIA' using errcode = 'P0001', detail = 'poster';
    end if;
    new.media_bytes := new.media_bytes + coalesce((v_poster.metadata ->> 'size')::bigint, 0);
  end if;

  -- Cota da organização (biblioteca global não tem cota). Diminuir nunca é bloqueado.
  if new.organization_id is not null and new.media_bytes > (case when tg_op = 'UPDATE' then old.media_bytes else 0 end) then
    select coalesce(o.video_quota_bytes, l.video_quota_bytes, 0) into v_quota
    from public.organizations o
    left join public.plan_tier_limits l on l.plan = o.plan
    where o.id = new.organization_id;

    select coalesce(sum(e.media_bytes), 0) into v_used
    from public.exercises e
    where e.organization_id = new.organization_id and e.id <> new.id;

    if v_used + new.media_bytes > coalesce(v_quota, 0) then
      raise exception 'VIDEO_QUOTA_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger exercises_media_guard
before insert or update of video_path, poster_path, media_bytes on public.exercises
for each row execute function private.exercise_media_guard();

-- Só os caminhos são graváveis pelo cliente (media_bytes vem do gatilho).
grant update (video_path, poster_path) on public.exercises to authenticated;

-- Exclusão definitiva de exercício próprio: só owner (planos que o usam bloqueiam pela FK).
create policy exercises_delete on public.exercises
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));
grant delete on public.exercises to authenticated;

-- Uso x cota da organização (SECURITY INVOKER: o RLS de exercises limita à própria org).
create function public.organization_video_usage()
returns table (used_bytes bigint, quota_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select coalesce(sum(e.media_bytes), 0)::bigint from public.exercises e where e.organization_id = o.id),
    coalesce(o.video_quota_bytes, l.video_quota_bytes, 0)::bigint
  from public.organizations o
  left join public.plan_tier_limits l on l.plan = o.plan
  where o.id = private.current_org_id() and private.is_staff()
$$;
revoke execute on function public.organization_video_usage() from public, anon;
grant execute on function public.organization_video_usage() to authenticated;

-- A view da biblioteca passa a expor se há vídeo próprio.
create or replace view public.exercise_library
with (security_invoker = true)
as
select
  e.id,
  e.organization_id,
  e.name,
  e.muscle_groups,
  e.equipment,
  e.instructions,
  e.video_url,
  e.source_exercise_id,
  e.created_by,
  e.archived_at,
  e.created_at,
  e.organization_id is null as is_global,
  private.immutable_unaccent(lower(e.name || ' ' || coalesce(e.equipment, ''))) as search_text,
  (
    e.organization_id is null
    and exists (
      select 1 from public.exercises c
      where c.source_exercise_id = e.id
        and c.organization_id = private.current_org_id()
        and c.archived_at is null
    )
  ) as customized,
  e.video_path is not null as has_video
from public.exercises e;

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', false, 15 * 1024 * 1024, array['video/mp4', 'video/webm', 'image/jpeg', 'image/webp']);

-- Escrita: staff da org, na pasta de um exercício próprio que pode editar (owner ou autor).
create function private.can_write_exercise_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
    and (storage.foldername(p_name))[1] = private.current_org_id()::text
    and storage.filename(p_name) ~ '^[0-9a-f-]{36}\.(mp4|webm|jpg|webp)$'
    and exists (
      select 1 from public.exercises e
      where e.id = private.try_uuid((storage.foldername(p_name))[2])
        and e.organization_id = private.current_org_id()
        and (private.is_owner() or e.created_by = (select auth.uid()))
    )
$$;

-- Leitura pelo aluno (Fase 3): só mídia de exercícios presentes no próprio plano ativo.
create function private.student_can_read_exercise_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    join public.training_plans p on p.student_id = s.id and p.status = 'active'
    join public.plan_workouts w on w.plan_id = p.id
    join public.plan_workout_items i on i.workout_id = w.id
    join public.exercises e on e.id = i.exercise_id
    where s.user_id = (select auth.uid())
      and s.deleted_at is null
      and (e.video_path = p_name or e.poster_path = p_name)
  )
$$;

grant execute on function private.can_write_exercise_media(text), private.student_can_read_exercise_media(text) to authenticated;
revoke execute on function
  private.can_write_exercise_media(text),
  private.student_can_read_exercise_media(text),
  private.exercise_media_guard()
from public, anon;

create policy exercise_media_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exercise-media'
    and (select private.is_staff())
    and (storage.foldername(name))[1] in ('global', (select private.current_org_id())::text)
  );

create policy exercise_media_select_student on storage.objects
  for select to authenticated
  using (bucket_id = 'exercise-media' and private.student_can_read_exercise_media(name));

create policy exercise_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exercise-media' and private.can_write_exercise_media(name));

create policy exercise_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'exercise-media' and private.can_write_exercise_media(name));
