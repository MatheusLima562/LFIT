-- =============================================================================
-- Autorização: helpers + Row Level Security + grants.
--
-- Modelo:
--   owner   → tudo da própria organização
--   trainer → alunos em que é o professor responsável (dados de saúde inclusos)
--             + cadastros compartilhados da org (grupos, turmas, modelos)
--   student → nada nesta fase (app do aluno chega na Fase 3)
--   anon    → nada; o cadastro público passa pelo servidor (service_role)
--
-- Escritas em alunos, vínculos de grupo, status, links e cadastros pendentes
-- acontecem APENAS via funções RPC (migrations seguintes), que validam limite
-- do plano, geram matrícula e registram auditoria na mesma transação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers (security definer: leem profiles sem recursão de RLS)
-- -----------------------------------------------------------------------------
create function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles where id = (select auth.uid())
$$;

create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'owner', false)
$$;

create function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() in ('owner', 'trainer'), false)
$$;

-- O usuário atual pode ver este aluno? (owner da org ou professor responsável)
create function private.can_access_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.deleted_at is null
      and s.organization_id = private.current_org_id()
      and (private.is_owner() or s.trainer_id = (select auth.uid()))
  )
$$;

grant execute on function
  private.current_org_id(),
  private.current_user_role(),
  private.is_owner(),
  private.is_staff(),
  private.can_access_student(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- RLS ligado em todas as tabelas (sem política = sem acesso)
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_counters enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.special_groups enable row level security;
alter table public.student_groups enable row level security;
alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.public_signup_links enable row level security;
alter table public.pending_signups enable row level security;
alter table public.anamnesis_templates enable row level security;
alter table public.anamnesis_requests enable row level security;
alter table public.access_links enable row level security;
alter table public.rate_limits enable row level security;

-- organization_counters, access_links, rate_limits: sem políticas (só RPC/servidor).

-- -----------------------------------------------------------------------------
-- organizations — leitura da própria org; plano/limite só mudam pelo servidor.
-- -----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = (select private.current_org_id()));

-- -----------------------------------------------------------------------------
-- profiles — o próprio perfil + equipe (owner/trainer) da mesma org.
-- Atualização restrita por coluna (não dá para trocar role/org).
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      organization_id = (select private.current_org_id())
      and role in ('owner', 'trainer')
      and (select private.is_staff())
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- students — owner vê a org; trainer vê só os seus. Escrita só via RPC.
-- -----------------------------------------------------------------------------
create policy students_select on public.students
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and deleted_at is null
    and ((select private.is_owner()) or trainer_id = (select auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- special_groups — cadastro compartilhado da org (staff lê e mantém).
-- -----------------------------------------------------------------------------
create policy special_groups_select on public.special_groups
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()));

create policy special_groups_insert on public.special_groups
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_staff()));

create policy special_groups_update on public.special_groups
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()))
  with check (organization_id = (select private.current_org_id()));

create policy special_groups_delete on public.special_groups
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));

-- -----------------------------------------------------------------------------
-- student_groups — dado de saúde: só quem acessa o aluno. Escrita via RPC.
-- -----------------------------------------------------------------------------
create policy student_groups_select on public.student_groups
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and private.can_access_student(student_id)
  );

-- -----------------------------------------------------------------------------
-- classes — staff lê; owner mantém qualquer turma, trainer mantém as suas.
-- -----------------------------------------------------------------------------
create policy classes_select on public.classes
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()));

create policy classes_insert on public.classes
  for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and ((select private.is_owner())
      or ((select private.is_staff()) and trainer_id = (select auth.uid())))
  );

create policy classes_update on public.classes
  for update to authenticated
  using (
    organization_id = (select private.current_org_id())
    and ((select private.is_owner()) or trainer_id = (select auth.uid()))
  )
  with check (
    organization_id = (select private.current_org_id())
    and ((select private.is_owner()) or trainer_id = (select auth.uid()))
  );

create policy classes_delete on public.classes
  for delete to authenticated
  using (
    organization_id = (select private.current_org_id())
    and ((select private.is_owner()) or trainer_id = (select auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- class_students — vê/gerencia vínculo de alunos que pode acessar, em turmas
-- que pode editar.
-- -----------------------------------------------------------------------------
create policy class_students_select on public.class_students
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and private.can_access_student(student_id)
  );

create policy class_students_insert on public.class_students
  for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and private.can_access_student(student_id)
    and exists (
      select 1 from public.classes c
      where c.id = class_id
        and c.organization_id = (select private.current_org_id())
        and ((select private.is_owner()) or c.trainer_id = (select auth.uid()))
    )
  );

create policy class_students_delete on public.class_students
  for delete to authenticated
  using (
    organization_id = (select private.current_org_id())
    and private.can_access_student(student_id)
    and exists (
      select 1 from public.classes c
      where c.id = class_id
        and ((select private.is_owner()) or c.trainer_id = (select auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- payments — leitura para quem acessa o aluno. Sem escrita nesta fase.
-- -----------------------------------------------------------------------------
create policy payments_select on public.payments
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and private.can_access_student(student_id)
  );

-- -----------------------------------------------------------------------------
-- audit_logs — somente owner lê. Ninguém escreve diretamente.
-- -----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));

-- -----------------------------------------------------------------------------
-- Cadastro público — somente owner (os pendentes ainda não têm professor e
-- podem conter dados de saúde).
-- -----------------------------------------------------------------------------
create policy public_signup_links_select on public.public_signup_links
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));

create policy public_signup_links_update on public.public_signup_links
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()))
  with check (organization_id = (select private.current_org_id()));

create policy pending_signups_select on public.pending_signups
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));

-- -----------------------------------------------------------------------------
-- Anamnese — modelos compartilhados pela equipe; solicitações por aluno.
-- -----------------------------------------------------------------------------
create policy anamnesis_templates_select on public.anamnesis_templates
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()));

create policy anamnesis_templates_insert on public.anamnesis_templates
  for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_staff()));

create policy anamnesis_templates_update on public.anamnesis_templates
  for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_staff()))
  with check (organization_id = (select private.current_org_id()));

create policy anamnesis_templates_delete on public.anamnesis_templates
  for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_owner()));

create policy anamnesis_requests_select on public.anamnesis_requests
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and private.can_access_student(student_id)
  );

-- -----------------------------------------------------------------------------
-- Grants (anon não recebe nada)
-- -----------------------------------------------------------------------------
grant select on
  public.organizations,
  public.profiles,
  public.students,
  public.special_groups,
  public.student_groups,
  public.classes,
  public.class_students,
  public.payments,
  public.audit_logs,
  public.public_signup_links,
  public.pending_signups,
  public.anamnesis_templates,
  public.anamnesis_requests
to authenticated;

grant update (full_name, avatar_url, preferences) on public.profiles to authenticated;
grant insert, update (name, color), delete on public.special_groups to authenticated;
grant insert, update (name, trainer_id), delete on public.classes to authenticated;
grant insert, delete on public.class_students to authenticated;
grant update (is_active, form_config) on public.public_signup_links to authenticated;
grant insert, update (title, questions), delete on public.anamnesis_templates to authenticated;
