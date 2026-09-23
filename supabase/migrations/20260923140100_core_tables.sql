-- =============================================================================
-- Tabelas de negócio da Fase 1. Toda tabela carrega organization_id.
-- Chaves estrangeiras compostas (id, organization_id) garantem que relações
-- nunca cruzem organizações, mesmo em escritas feitas pelo servidor.
-- =============================================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  plan public.plan_tier not null default 'free',
  student_limit integer not null default 50 check (student_limit > 0),
  overdue_grace_days integer not null default 5 check (overdue_grace_days between 0 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contador de matrícula por organização (linha travada ao gerar o próximo número).
create table public.organization_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_enrollment_number integer not null default 0
);

create function private.create_organization_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_counters (organization_id) values (new.id);
  return new;
end;
$$;

create trigger organizations_create_counter
after insert on public.organizations
for each row execute function private.create_organization_counter();

-- Um usuário pertence a uma organização. Criado sempre pelo servidor
-- (bootstrap/convite) — nunca a partir de metadados enviados pelo usuário.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.user_role not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index profiles_organization_idx on public.profiles (organization_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  trainer_id uuid,
  enrollment_number integer not null check (enrollment_number > 0),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 120),
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp_e164 text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  birth_date date check (birth_date > date '1900-01-01'),
  sex public.sex,
  training_location text check (length(training_location) <= 200),
  notes text check (length(notes) <= 2000),
  photo_path text,
  status public.student_status not null default 'active',
  access_expires_at timestamptz,
  block_if_overdue boolean not null default false,
  source public.student_source not null default 'manual',
  -- Consentimento para dados de saúde (grupos especiais, LGPD art. 11).
  health_data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  unique (organization_id, enrollment_number),
  unique (id, organization_id),
  foreign key (trainer_id, organization_id)
    references public.profiles (id, organization_id) on delete set null (trainer_id)
);
create unique index students_org_email_unique
  on public.students (organization_id, lower(email))
  where deleted_at is null;
create index students_org_trainer_idx on public.students (organization_id, trainer_id) where deleted_at is null;
create index students_org_expires_idx on public.students (organization_id, access_expires_at) where deleted_at is null;
create index students_search_trgm_idx on public.students
  using gin (private.immutable_unaccent(lower(first_name || ' ' || last_name || ' ' || email)) extensions.gin_trgm_ops);

create table public.special_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  color text not null default '#f0642d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index special_groups_org_name_unique on public.special_groups (organization_id, lower(name));

create table public.student_groups (
  student_id uuid not null,
  group_id uuid not null,
  organization_id uuid not null,
  primary key (student_id, group_id),
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade,
  foreign key (group_id, organization_id) references public.special_groups (id, organization_id) on delete cascade
);
create index student_groups_group_idx on public.student_groups (group_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  trainer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (trainer_id, organization_id)
    references public.profiles (id, organization_id) on delete set null (trainer_id)
);
create index classes_org_idx on public.classes (organization_id);

create table public.class_students (
  class_id uuid not null,
  student_id uuid not null,
  organization_id uuid not null,
  primary key (class_id, student_id),
  foreign key (class_id, organization_id) references public.classes (id, organization_id) on delete cascade,
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade
);
create index class_students_student_idx on public.class_students (student_id);

-- Mínima nesta fase: existe para o cálculo de "bloqueado" por inadimplência.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  paid_at timestamptz,
  method public.payment_method,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade,
  check ((status = 'paid') = (paid_at is not null))
);
create index payments_pending_idx on public.payments (student_id, due_date) where status = 'pending';

-- Append-only. Nunca guarda valores de dados de saúde (só o fato de terem mudado).
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- updated_at automático
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger students_updated_at before update on public.students
  for each row execute function private.set_updated_at();
create trigger special_groups_updated_at before update on public.special_groups
  for each row execute function private.set_updated_at();
create trigger classes_updated_at before update on public.classes
  for each row execute function private.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();
