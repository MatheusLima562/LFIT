# Auditoria: candidatas a `SECURITY INVOKER` entre as funções `SECURITY DEFINER` de `public`

_30/09/2026. Só levantamento — nenhuma função foi alterada. Pendência registrada em `docs/PROXIMOS_PASSOS.md`
("Pendências de segurança") e no checklist do CLAUDE.md ("Funções SECURITY DEFINER")._

## Pergunta

Das 40 funções `SECURITY DEFINER` do schema `public` (a lista que o Security Advisor cita em "authenticated can
execute" e que `tests/db/security-definer-coverage.test.ts` mantém sincronizada com a tabela do CLAUDE.md), quais
**poderiam** virar `SECURITY INVOKER` — confiando só no RLS das tabelas, sem função nenhuma "furando" a política —
sem perder segurança nem mudar o que cada papel enxerga?

## Método

Para cada função, três perguntas, nessa ordem:
1. **Ela escreve** em alguma tabela sem `GRANT` para `authenticated` (ou sem política de RLS que cubra a escrita)?
   Se sim, precisa ficar `DEFINER` — não tem outro jeito de `authenticated` fazer o `INSERT`/`UPDATE`/`DELETE`.
2. **Ela devolve dados diferentes por coluna** conforme quem chama (redação por nível, ex.: nível completo ×
   restrito × oculto)? RLS decide **linha por linha**, não **coluna por coluna** — isso não dá para expressar só
   com política, então a função continua precisando decidir e montar a linha.
3. Se passou pelas duas primeiras: **o resultado como `INVOKER` seria idêntico ao de hoje** para todo papel que já
   chama a função? (ex.: um `LEFT JOIN` que hoje conta todos os alunos da organização passaria a contar só os do
   RLS do chamador — mudança de comportamento, não só de "modo".)

## Resultado

### ✅ Candidata segura: `public.can_view_student_health`

```sql
create function public.can_view_student_health(p_student_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.can_view_student_health(p_student_id) $$;
```

É um repasse de uma linha para `private.can_view_student_health`, que **já é** `SECURITY DEFINER` e **já tem**
`grant execute ... to authenticated` (migration `20260926120000_two_step_consent_and_public_signup.sql`, usado
também dentro da política de RLS de `student_groups`). Virar o wrapper público `INVOKER` não muda nada do que ele
enxerga: a leitura privilegiada de `students.health_data_consent_at` continua acontecendo um nível abaixo,
independente do modo do wrapper. Baixo risco, sem mudança de comportamento — mas **ainda não aplicado** (aguardando
sua decisão).

### ⚠️ Parece candidata, mas não é segura como está: `organization_plan_usage`

```sql
create function public.organization_plan_usage()
returns table (...) language sql stable security definer set search_path = ''
as $$
  select o.plan, o.student_limit, count(s.id) filter (where private.occupies_seat(s)), ...
  from public.organizations o
  left join public.students s on s.organization_id = o.id
  where o.id = private.current_org_id() and private.is_staff()
  group by o.id
$$;
```

Hoje conta **todos os alunos da organização**, porque `DEFINER` ignora o RLS de `students` no `LEFT JOIN`. A RLS de
`students_select` é `is_owner() OR trainer_id = auth.uid()` — então, se a função virasse `INVOKER`, um **trainer**
(não-owner) passaria a contar só os próprios alunos no `LEFT JOIN`, e o contador "vagas usadas" no topo de "Meus
alunos" ficaria **errado** para quem não é owner (subcontagem). O `where ... and private.is_staff()` (que hoje
garante "vazio para quem não é staff") continuaria funcionando do mesmo jeito — não é esse pedaço que quebra.
**Não proponho mudar isso agora**; se quiser esse ganho depois, o caminho é separar a contagem num helper
`private.*` `DEFINER` chamado pelo wrapper `INVOKER`, não só trocar o modo desta função.

### Por que as outras 38 continuam `DEFINER` (com o motivo, agrupado)

| Motivo | Funções | Evidência |
|---|---|---|
| Escrevem em `students`, que não tem `GRANT` de escrita para `authenticated` (`CLAUDE.md`: "Escritas em students não têm GRANT para authenticated") | `create_student`, `update_student`, `deactivate_student`, `reactivate_student`, `expire_student`, `clear_student_expiration`, `soft_delete_student`, `hard_delete_student` | `20260923140300_rls.sql`: só `grant select` em `students` para `authenticated` |
| Escrevem em `audit_logs`, que só tem `grant select` (RLS: só owner lê) e **nenhum** `insert` para `authenticated` — "ninguém escreve diretamente" | as 8 acima + `create_access_link`, `record_student_access_email`, `request_anamnesis`, `log_students_export`, `record_red_flag_check`, `record_red_flag_clearance`, `save_training_plan`, `activate_plan`, `archive_plan`, `apply_template_to_student`, `save_plan_as_template`, `duplicate_plan`, `apply_plan_to_students` | `20260923140300_rls.sql` linha ~255 ("Ninguém escreve diretamente") e bloco de `grant select ... to authenticated` (sem `insert` em `audit_logs`) |
| Escritas só de owner em infraestrutura de convite/cadastro público | `ensure_signup_link`, `regenerate_signup_token`, `approve_signup`, `approve_signups`, `reject_signups` | `private.require_owner()` na 1ª linha |
| Existem **para furar o RLS de propósito**, a favor de quem o RLS normal negaria (professor do plano sem `can_access_student`) | `get_plan_header` (nome do aluno), `plan_red_flag_pending` (só o booleano de pendência), `preview_plan_alerts_for_students` (prévia em massa) | comentários no próprio SQL + tabela do CLAUDE.md |
| Redação por nível (coluna muda de valor conforme o papel: completo/restrito/oculto) — não dá pra expressar só com RLS de linha | `student_contraindication_rules`, `plan_contraindication_alerts` | seção "Alertas têm 3 níveis de visibilidade" do CLAUDE.md |
| Escopo especial do próprio titular (papel `student`, que quase não tem `grant` nenhum) + escrita/exclusão de dado de saúde | `get_my_health_consent_request`, `respond_my_health_consent` | escopo `students.user_id = auth.uid()`, apaga dados de saúde na recusa |
| Só `service_role` — nem aparecem no aviso do advisor; `INVOKER`/`DEFINER` não muda nada porque `service_role` já ignora RLS | `consume_access_link`, `submit_public_signup`, `get_public_signup_form`, `hit_rate_limit`, `admin_activate_due_plans` | sem `grant` para `authenticated`/`anon` |

## Conclusão

- **1 candidata seg​ura para aplicar quando você aprovar:** `public.can_view_student_health` → `SECURITY INVOKER`
  (sem mudança de comportamento).
- **1 candidata que precisa de redesenho antes** (não só trocar o modo): `organization_plan_usage`.
- **38 continuam `DEFINER`** por motivo concreto (grant faltando, redação por nível, ou bypass intencional de RLS).
- Nenhuma mudança foi aplicada. Se aprovar a primeira, é uma migration de 1 linha (`alter function ... security
  invoker`) + rodar `tests/db/security-definer-coverage.test.ts` e a suíte de `security-definer.test.ts` de novo.
