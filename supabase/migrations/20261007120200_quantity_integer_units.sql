-- =============================================================================
-- 2.8 — Subida/Descida entram na regra de quantidade inteira (itens e séries).
-- Mesma regra de 20261004120200_prescription.sql, com a lista de unidades inteiras ampliada.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['plan_workout_items', 'plan_item_sets'] loop
    execute format($f$
      alter table public.%1$I drop constraint %1$s_quantity_check;
      alter table public.%1$I add constraint %1$s_quantity_check check (
        case
          when quantity_unit = 'failure' then quantity_min is null and quantity_max is null
          else (quantity_min is null or quantity_min >= 0)
            and (quantity_max is null or (quantity_min is not null and quantity_max >= quantity_min))
            and (quantity_unit not in ('reps', 'arrivals', 'ascents', 'descents')
                 or ((quantity_min is null or quantity_min = trunc(quantity_min))
                     and (quantity_max is null or quantity_max = trunc(quantity_max))))
        end
      );
    $f$, t);
  end loop;
end;
$$;
