-- 2.8 — Correção: format_quantity removia zeros finais de inteiros ("20" → "2").
-- Só remove zeros depois da vírgula decimal. Recalcula o texto legado de todos os itens/séries
-- a partir das colunas novas (fonte da verdade desde a 2.8).
create or replace function private.format_number(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(case when p::text like '%.%' then regexp_replace(p::text, '\.?0+$', '') else p::text end, '.', ',')
$$;

create or replace function private.format_quantity(p_unit public.quantity_unit, p_min numeric, p_max numeric, p_note text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(nullif(trim(
    case
      when p_unit = 'failure' then 'até a falha'
      when p_min is null then ''
      else private.format_number(p_min)
        || case when p_max is not null and p_max <> p_min then '–' || private.format_number(p_max) else '' end
        || case p_unit when 'seconds' then ' s' when 'minutes' then ' min' when 'meters' then ' m'
             when 'km' then ' km' when 'arrivals' then ' cheg.' else '' end
    end || coalesce(' ' || p_note, '')
  ), ''), 20)
$$;

update public.plan_workout_items set reps = private.format_quantity(quantity_unit, quantity_min, quantity_max, quantity_note);
update public.plan_item_sets set reps = private.format_quantity(quantity_unit, quantity_min, quantity_max, quantity_note);

revoke execute on function private.format_number(numeric) from public, anon, authenticated;
