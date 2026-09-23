-- =============================================================================
-- Fundação: extensões, schema privado, privilégios padrão, tipos e utilitários.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Schema para funções internas (helpers de RLS, regras). Não é exposto pela API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Privilégios: nada é acessível por padrão. Cada tabela/função recebe grants
-- explícitos nas migrations seguintes. O service_role mantém os grants padrão
-- do Supabase (usado apenas no servidor).
-- -----------------------------------------------------------------------------
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.plan_tier as enum ('free', 'pro', 'gold');
create type public.user_role as enum ('owner', 'trainer', 'student');
create type public.student_status as enum ('active', 'inactive');
create type public.effective_status as enum ('active', 'blocked', 'inactive', 'expired');
create type public.sex as enum ('M', 'F');
create type public.student_source as enum ('manual', 'public_link');
create type public.signup_status as enum ('pending', 'approved', 'rejected');
create type public.payment_status as enum ('pending', 'paid', 'canceled');
create type public.payment_method as enum ('pix', 'card', 'cash', 'transfer', 'other');

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

-- unaccent() não é IMMUTABLE; este wrapper permite usá-lo em índices.
create function private.immutable_unaccent(value text)
returns text
language sql
immutable parallel safe strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Converte texto em uuid sem lançar erro (usado em políticas do Storage).
create function private.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- "Hoje" no fuso de exibição do produto (datas de vencimento são datas civis).
create function private.today_br()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

grant execute on function private.immutable_unaccent(text) to authenticated, service_role;
grant execute on function private.try_uuid(text) to authenticated, service_role;
grant execute on function private.today_br() to authenticated, service_role;
