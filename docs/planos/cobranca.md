# Cobrança dos personais por gateway

Status: **só plano, nada implementado.** Hoje a plataforma registra pagamentos **à mão** em `/plataforma`: data, valor,
período e observação, na tabela `private.platform_payments`. Ela também muda a situação da assinatura (em dia, em
atraso, suspensa, cancelada) pela RPC `platform_set_status`, e tudo fica auditado.

## O que já está pronto para receber um gateway

- **Situação da assinatura e regras de acesso** (`organizations.subscription_status` + `private.account_rules`):
  - em atraso → 10 dias de tolerância → somente leitura;
  - cancelada → 30 dias → só exportação.

  O gateway só precisa **mudar a situação** e **registrar o pagamento**.
- **Um único ponto de escrita:** as mesmas RPCs da plataforma (`platform_record_payment`, `platform_set_status`).
  Um webhook no servidor chamaria versões **só service_role** dessas RPCs, autenticadas pela assinatura do webhook,
  nunca pela sessão de um usuário.
- **Auditoria:** cada evento do gateway entra em `private.platform_audit` com o id do evento, para não processar duas
  vezes.

## Opções

| | Asaas | Mercado Pago | Stripe |
|---|---|---|---|
| Pix | sim, com QR dinâmico e cobrança recorrente via Pix Automático | sim | sim, no Brasil, mas com menos maturidade em recorrência por Pix |
| Boleto | sim | sim | sim (Brasil) |
| Cartão recorrente | sim (assinaturas) | sim (assinaturas/preapproval) | sim (Billing, o mais completo) |
| Nota fiscal | emissão integrada (NFS-e) | não nativa | não nativa (integrações de terceiros) |
| Webhooks | sim | sim | sim (assinados, com nova tentativa) |
| Observação | foco em PMEs brasileiras e cobrança recorrente; régua de cobrança por WhatsApp/e-mail | marca conhecida pelo público; checkout pronto | melhor API e documentação; custo em dólar/IOF a avaliar |

**Recomendação provisória:** Asaas, pela combinação de Pix recorrente, boleto, cartão e NFS-e. É a mesma recomendação da
C2 em `docs/planos/fase-c.md`. A decisão comercial é do dono.

## Fluxo proposto (recorrência)

1. **Plano criado no gateway:** mensal ou anual, com o preço da tabela comercial.
2. **Personal assina** em "Minha assinatura", na página Configurações: checkout do gateway, Pix, boleto ou cartão.
3. **Webhook "pagamento confirmado"** → `platform_record_payment` (período = ciclo pago) + `platform_set_status('active')`.
4. **Webhook "vencido / não pago"** → `platform_set_status('past_due')`. A tolerância de 10 dias já está no banco.
5. **Webhook "cancelado"** → `platform_set_status('canceled')`. Seguem 30 dias de somente leitura e depois só exportação.
6. **Pix sem recorrência automática:** a plataforma gera uma cobrança Pix por ciclo, perto do vencimento, e o aviso
   aparece no painel (sem e-mail próprio nesta fase).

## Pendências antes de implementar

- **Conta e chaves do gateway:** as chaves ficam só em variáveis do servidor.
- **Contrato e termos de uso da assinatura:** passam por revisão jurídica.
- **Política de reembolso e de troca de plano**, com cobrança pró-rata ou não.
- **Envio de e-mail** (SMTP próprio) para recibos e avisos de vencimento: hoje só há avisos dentro do app.
