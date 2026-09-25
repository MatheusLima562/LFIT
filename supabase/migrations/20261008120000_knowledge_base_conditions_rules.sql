-- =============================================================================
-- Etapa 2.10 — Fase B / B1: base de conhecimento dor × exercício.
--   * health_conditions: região (parent_id) e sinônimos de busca (search_terms);
--   * 8 condições globais novas (docs/conhecimento/*.md, revisados pelo dono);
--   * 2 exercícios globais novos (ombro) com padrões na camada global;
--   * as 19 regras globais aprovadas ("S") de docs/revisao/contraindicacoes-v2.csv — todas "cautela".
-- Lombalgia inespecífica, cervicalgia, dor patelofemoral e artrose de joelho NÃO geram alerta (só Guia).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Região e sinônimos
-- -----------------------------------------------------------------------------
create function private.valid_search_terms(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(p, 1), 0) <= 10
    and not exists (select 1 from unnest(p) t where length(trim(t)) not between 2 and 60)
$$;
grant execute on function private.valid_search_terms(text[]) to authenticated, service_role;

alter table public.health_conditions
  add column parent_id uuid references public.health_conditions (id) on delete set null,
  add column search_terms text[] not null default '{}' check (private.valid_search_terms(search_terms)),
  add check (parent_id is distinct from id);
create index health_conditions_parent_idx on public.health_conditions (parent_id);

-- Um nível só (região → condição). Global só sob global; da org sob global ou da própria org.
create function private.validate_condition_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.health_conditions%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into v_parent from public.health_conditions where id = new.parent_id;
  if not found
    or v_parent.parent_id is not null
    or (v_parent.organization_id is not null and v_parent.organization_id is distinct from new.organization_id)
    or exists (select 1 from public.health_conditions c where c.parent_id = new.id)
  then
    raise exception 'INVALID_CONDITION' using errcode = 'P0001', detail = 'Região inválida';
  end if;
  return new;
end;
$$;

create trigger health_conditions_parent
before insert or update of parent_id on public.health_conditions
for each row execute function private.validate_condition_parent();

grant insert (parent_id, search_terms), update (parent_id, search_terms) on public.health_conditions to authenticated;

-- -----------------------------------------------------------------------------
-- Condições globais novas
-- -----------------------------------------------------------------------------
insert into public.health_conditions (key, name, description, parent_id, search_terms)
select v.key, v.name, v.description, p.id, v.search_terms
from (values
  ('hernia_lombar_flexao', 'Hérnia discal lombar (intolerância à flexão)', 'lombar',
   'Sintomas que pioram ao flexionar a coluna ou ficar sentado e costumam aliviar em pé ou andando.',
   '{hérnia de disco,protrusão discal,ciática}'::text[]),
  ('dor_lombar_flexao', 'Dor lombar — intolerância à flexão', 'lombar',
   'Sem laudo: dor lombar que piora ao flexionar a coluna ou ficar sentado.',
   '{dor nas costas,lombalgia}'::text[]),
  ('estenose_lombar_extensao', 'Estenose lombar (intolerância à extensão)', 'lombar',
   'Sintomas nas pernas ao ficar em pé ou caminhar que aliviam ao sentar ou inclinar o tronco à frente.',
   '{estenose de canal,claudicação neurogênica}'::text[]),
  ('espondilolistese_extensao', 'Espondilolistese (intolerância à extensão)', 'lombar',
   'Sintomas que pioram ao arquear a lombar (extensão), sobretudo sob carga.',
   '{espondilólise,listese}'::text[]),
  ('dor_lombar_extensao', 'Dor lombar — intolerância à extensão', 'lombar',
   'Sem laudo: dor lombar que piora ao arquear a coluna ou ficar muito tempo em pé.',
   '{dor nas costas,lombalgia}'::text[]),
  ('ombro_manguito', 'Dor no ombro relacionada ao manguito rotador', 'ombro',
   'Dor no ombro não traumática, principalmente ao elevar o braço.',
   '{impacto,síndrome do impacto,tendinopatia do manguito,bursite}'::text[]),
  ('joelho_patelofemoral', 'Dor patelofemoral', 'joelho',
   'Dor ao redor ou atrás da patela que piora ao agachar, subir/descer escada, correr ou saltar.',
   '{condromalácia,condromalácia patelar,dor anterior no joelho,joelho de corredor}'::text[]),
  ('joelho_artrose', 'Artrose de joelho', 'joelho',
   'Dor no joelho relacionada à atividade, em geral a partir dos 45 anos.',
   '{osteoartrite,gonartrose}'::text[])
) as v (key, name, parent_key, description, search_terms)
join public.health_conditions p on p.key = v.parent_key
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Exercícios globais novos (docs/conhecimento/ombro-manguito.md, seção 3)
-- -----------------------------------------------------------------------------
insert into public.exercises (name, muscle_groups, equipment, instructions, created_by)
select v.name, v.muscle_groups, v.equipment, v.instructions, null
from (values
  ('Rotação externa com elástico/polia', '{ombros}'::text[], 'Elástico ou polia',
   'Cotovelo junto ao corpo, dobrado a 90°. Gire o antebraço para fora, afastando a mão da barriga, e volte com controle.'),
  ('Elevação no plano da escápula', '{ombros}'::text[], 'Halteres',
   'Em pé, braços cerca de 30° à frente do corpo e polegares para cima. Eleve os halteres até a altura dos ombros e desça com controle.')
) as v (name, muscle_groups, equipment, instructions)
where not exists (
  select 1 from public.exercises e where e.organization_id is null and lower(e.name) = lower(v.name)
);

insert into public.exercise_defaults (organization_id, exercise_id, sets, quantity_unit, quantity_min, quantity_max, rest_min, rest_max)
select null, e.id, 3, 'reps', v.qmin, v.qmax, 45, 60
from (values
  ('Rotação externa com elástico/polia', 12, 15),
  ('Elevação no plano da escápula', 10, 12)
) as v (name, qmin, qmax)
join public.exercises e on e.organization_id is null and e.name = v.name
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Regras globais aprovadas (contraindicacoes-v2.csv, linhas "S")
-- -----------------------------------------------------------------------------
insert into public.exercise_contraindications (organization_id, exercise_id, condition_id, level, note, created_by)
select null, e.id, c.id, 'caution', r.note, null
from (values
  ('Abdominal supra', 'Isometrias: dead bug, prancha, Pallof press.'),
  ('Elevação de pernas deitado', 'Joelhos flexionados, amplitude menor sem tirar a lombar do apoio, ou dead bug.'),
  ('Levantamento terra', 'Barra elevada (blocos/rack), carga junto ao corpo, amplitude até onde não há sintomas; progredir conforme tolerância.'),
  ('Levantamento terra romeno', 'Barra elevada (blocos/rack), carga junto ao corpo, amplitude até onde não há sintomas; progredir conforme tolerância.'),
  ('Remada curvada com barra', 'Remada unilateral apoiada no banco ou remada baixa na polia com tronco ereto.'),
  ('Leg press 45°', 'Limitar a amplitude antes da retroversão da pelve.')
) as r (exercise, note)
cross join (values ('hernia_lombar_flexao'), ('dor_lombar_flexao')) as k (key)
join public.exercises e on e.organization_id is null and e.name = r.exercise
join public.health_conditions c on c.key = k.key
on conflict do nothing;

insert into public.exercise_contraindications (organization_id, exercise_id, condition_id, level, note, created_by)
select null, e.id, c.id, 'caution', r.note, null
from (values
  ('Extensão lombar no banco romano', 'Amplitude só até o neutro, sem hiperextensão; ou bird dog.'),
  ('Desenvolvimento militar com barra', 'Sentado com apoio nas costas, ou halteres/landmine, sem arquear a lombar.')
) as r (exercise, note)
cross join (values ('estenose_lombar_extensao'), ('espondilolistese_extensao'), ('dor_lombar_extensao')) as k (key)
join public.exercises e on e.organization_id is null and e.name = r.exercise
join public.health_conditions c on c.key = k.key
on conflict do nothing;

insert into public.exercise_contraindications (organization_id, exercise_id, condition_id, level, note, created_by)
select null, e.id, c.id, 'caution', 'Tríceps na polia ou francês com halter.', null
from public.exercises e
join public.health_conditions c on c.key = 'ombro_manguito'
where e.organization_id is null and e.name = 'Tríceps no banco'
on conflict do nothing;

-- Trava: exatamente as 19 regras aprovadas, nenhuma "evitar".
do $$
declare
  v_total integer;
begin
  select count(*) into v_total
  from public.exercise_contraindications ec
  join public.health_conditions c on c.id = ec.condition_id
  where ec.organization_id is null
    and c.key in ('hernia_lombar_flexao', 'dor_lombar_flexao', 'estenose_lombar_extensao', 'espondilolistese_extensao',
                  'dor_lombar_extensao', 'ombro_manguito')
    and ec.level = 'caution';
  if v_total <> 19 then
    raise exception 'Esperadas 19 regras globais aprovadas, encontradas %', v_total;
  end if;
  if exists (select 1 from public.exercise_contraindications where organization_id is null and level = 'avoid') then
    raise exception 'Nenhuma regra global "evitar" foi aprovada';
  end if;
end;
$$;
