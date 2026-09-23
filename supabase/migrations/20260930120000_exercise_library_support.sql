-- =============================================================================
-- Fase 2.2 — Suporte à tela da biblioteca de exercícios.
-- Tudo SECURITY INVOKER: RLS e grants por coluna do chamador continuam valendo
-- (não aparecem no aviso de SECURITY DEFINER do Security Advisor).
-- =============================================================================

-- Busca sem acento + marcação de globais já personalizados pela organização
-- (a cópia própria substitui o global na listagem).
create view public.exercise_library
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
  ) as customized
from public.exercises e;

grant select on public.exercise_library to authenticated;

-- -----------------------------------------------------------------------------
-- Salvar exercício + camada de contraindicações da organização (atômico).
--   p_id nulo            → cria exercício próprio
--   p_id próprio         → atualiza (RLS: owner ou autor)
--   p_id global          → só a camada de contraindicações da organização
-- p_rules: [{condition_id, level, note}]
-- -----------------------------------------------------------------------------
create function public.save_exercise(p_id uuid, p_data jsonb, p_rules jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  v_id uuid := p_id;
  v_ex_org uuid;
  r jsonb;
begin
  if v_org is null or not private.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rules, '[]'::jsonb)) > 30 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.exercises (organization_id, name, muscle_groups, equipment, instructions, video_url)
    values (
      v_org,
      trim(p_data ->> 'name'),
      coalesce(array(select jsonb_array_elements_text(p_data -> 'muscle_groups')), '{}'),
      nullif(trim(p_data ->> 'equipment'), ''),
      nullif(trim(p_data ->> 'instructions'), ''),
      nullif(trim(p_data ->> 'video_url'), '')
    )
    returning id into v_id;
  else
    select organization_id into v_ex_org from public.exercises where id = v_id;
    if not found then
      raise exception 'EXERCISE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_ex_org is not null then
      update public.exercises set
        name = trim(p_data ->> 'name'),
        muscle_groups = coalesce(array(select jsonb_array_elements_text(p_data -> 'muscle_groups')), '{}'),
        equipment = nullif(trim(p_data ->> 'equipment'), ''),
        instructions = nullif(trim(p_data ->> 'instructions'), ''),
        video_url = nullif(trim(p_data ->> 'video_url'), '')
      where id = v_id;
      if not found then
        raise exception 'FORBIDDEN' using errcode = '42501';
      end if;
    end if;
  end if;

  delete from public.exercise_contraindications where exercise_id = v_id and organization_id = v_org;
  for r in select value from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) loop
    insert into public.exercise_contraindications (organization_id, exercise_id, condition_id, level, note)
    values (v_org, v_id, (r ->> 'condition_id')::uuid, (r ->> 'level')::public.contraindication_level, nullif(trim(r ->> 'note'), ''));
  end loop;

  return v_id;
end;
$$;

-- "Personalizar" um exercício global: cópia própria editável, levando as regras
-- (globais + da organização) para a camada da organização.
create function public.customize_exercise(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := private.current_org_id();
  src public.exercises;
  v_new uuid;
begin
  if v_org is null or not private.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into src from public.exercises where id = p_id and organization_id is null;
  if not found then
    raise exception 'EXERCISE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.exercises (organization_id, name, muscle_groups, equipment, instructions, video_url, source_exercise_id)
  values (v_org, src.name, src.muscle_groups, src.equipment, src.instructions, src.video_url, src.id)
  returning id into v_new;

  insert into public.exercise_contraindications (organization_id, exercise_id, condition_id, level, note)
  select distinct on (c.condition_id) v_org, v_new, c.condition_id, c.level, c.note
  from public.exercise_contraindications c
  where c.exercise_id = src.id
  -- regra da organização prevalece sobre a global para a mesma condição
  order by c.condition_id, (c.organization_id is null);

  return v_new;
end;
$$;

revoke execute on function public.save_exercise(uuid, jsonb, jsonb), public.customize_exercise(uuid) from public, anon;
grant execute on function public.save_exercise(uuid, jsonb, jsonb), public.customize_exercise(uuid) to authenticated;
