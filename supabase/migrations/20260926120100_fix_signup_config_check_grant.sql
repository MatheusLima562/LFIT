-- CHECK constraints executam com o privilégio de quem faz o UPDATE: o owner
-- (authenticated) precisa poder executar a função de validação da configuração.
grant execute on function private.valid_signup_form_config(jsonb) to authenticated;
