-- =============================================================================
-- Fotos de alunos: bucket privado, caminho "{organization_id}/{student_id}/{arquivo}".
-- Acesso só para quem pode acessar o aluno; leitura via URL assinada.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function private.can_access_student_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_object_name))[1] = private.current_org_id()::text
     and private.can_access_student(private.try_uuid((storage.foldername(p_object_name))[2]))
$$;

grant execute on function private.can_access_student_photo(text) to authenticated;

create policy "student_photos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos' and private.can_access_student_photo(name));

create policy "student_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos' and private.can_access_student_photo(name));

create policy "student_photos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'student-photos' and private.can_access_student_photo(name))
  with check (bucket_id = 'student-photos' and private.can_access_student_photo(name));

create policy "student_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos' and private.can_access_student_photo(name));
