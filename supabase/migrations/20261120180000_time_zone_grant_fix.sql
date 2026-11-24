-- Sprint de venda 1.7 (correção achada na ETAPA 2): o gatilho do NPS (`private.nps_responses_before_insert`, sem
-- SECURITY DEFINER) chama `private.org_time_zone`, cujo EXECUTE só o dono tinha. `submit_nps` (SECURITY DEFINER) não
-- sentia; gravação direta do servidor com a secret key (seed, scripts) falhava com "permission denied".
-- A função só devolve o fuso de uma organização (sem dado pessoal): mesmo grant de `private.current_time_zone()`.
grant execute on function private.org_time_zone(uuid) to service_role;
