-- =============================================================================
-- Cadastro público, solicitações de anamnese, links de acesso e rate limit.
-- =============================================================================

-- Token aleatório com ~244 bits de entropia, sem depender de pgcrypto.
create function private.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

create function private.sha256_hex(value text)
returns text
language sql
immutable strict
set search_path = ''
as $$
  select encode(sha256(convert_to(value, 'UTF8')), 'hex')
$$;

-- Um link público por organização. O token não é credencial de acesso a dados
-- (só permite enviar o formulário), por isso fica em texto para ser copiado.
create table public.public_signup_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  token text not null unique default private.random_token(),
  is_active boolean not null default false,
  form_config jsonb not null default '{"required": ["first_name", "last_name", "email"]}'::jsonb
    check (jsonb_typeof(form_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.pending_signups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  link_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  consent_at timestamptz,
  status public.signup_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  student_id uuid references public.students (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (link_id, organization_id) references public.public_signup_links (id, organization_id) on delete cascade
);
create index pending_signups_org_status_idx on public.pending_signups (organization_id, status, created_at desc);

create table public.anamnesis_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

-- Fase 1 registra a solicitação; as respostas (anamnesis_responses) chegam na Fase 3.
create table public.anamnesis_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  template_id uuid not null,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade,
  foreign key (template_id, organization_id) references public.anamnesis_templates (id, organization_id) on delete cascade
);
create index anamnesis_requests_student_idx on public.anamnesis_requests (student_id);

-- Link de "definir senha" de curta duração e uso único. Só o hash é guardado.
create table public.access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (student_id, organization_id) references public.students (id, organization_id) on delete cascade
);
create index access_links_student_idx on public.access_links (student_id) where used_at is null;

-- Janela fixa por chave (ex.: "login:ip:1.2.3.4").
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create trigger public_signup_links_updated_at before update on public.public_signup_links
  for each row execute function private.set_updated_at();
create trigger anamnesis_templates_updated_at before update on public.anamnesis_templates
  for each row execute function private.set_updated_at();
