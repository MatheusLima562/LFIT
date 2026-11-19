# Assistente de IA — o que o advogado precisa revisar antes de ligar

> Situação (19/11/2026): o recurso existe no código e está **desligado para todas as organizações**
> (`organizations.ai_assistant_enabled = false`, sem tela nem RPC para ligar). Nada abaixo foi validado juridicamente.

## 1. Dado enviado ao provedor (Anthropic, EUA)
- **O que o sistema envia:** nome do exercício atual, prescrição (séries, repetições, carga, intensidade, pausa) e a
  observação do professor sobre o exercício, mais o texto que o aluno digita e as últimas mensagens da mesma sessão.
- **O que o sistema não envia:** nome do aluno, e-mail, anamnese, grupos especiais, condições, lesões, orientação de
  cuidado, triagem, dor registrada no treino ou qualquer histórico de saúde.
- **Risco que sobra:** o aluno pode **escrever** dado de saúde no campo ("tenho hérnia"). Expressões de dor ou sintoma
  são barradas antes do modelo (resposta fixa "Pare o exercício e aguarde seu professor", sem chamada ao provedor), mas
  menções a diagnóstico sem sintoma podem chegar ao provedor. Avaliar: é tratamento de dado sensível (LGPD art. 11)? Qual
  base legal? Basta o aviso + aceite? Precisa de consentimento específico e destacado?
- Transferência internacional (LGPD arts. 33–36): cláusulas do provedor, país, garantias.

## 2. Contrato com o provedor (operador)
- Termos comerciais da API, DPA (acordo de tratamento de dados), retenção do lado do provedor, uso dos dados para
  treinamento (confirmar que não há), subprocessadores, incidentes.
- Quem é controlador: o personal (organização) ou a plataforma? Como fica o papel de cada um no contrato com o personal.

## 3. Consentimento e aviso ao aluno
- Texto do aviso exibido no primeiro uso (versão `2026-11-19.1`, em `messages/pt-BR.ts` → `assistant.termsBody`):
  diz que é IA, que não é o professor, que não faz diagnóstico, o que é enviado, que o professor vê a conversa e a
  retenção de 90 dias. O aceite é registrado com versão e data (`ai_consents`).
- O aceite serve de base legal ou é só transparência? Precisa de opção de recusa sem prejuízo (hoje: não aceitar =
  não usar; o treino segue normal)?
- Aluno menor de idade: o app não sabe a idade de forma confiável. Bloquear? Exigir responsável?

## 4. Retenção e acesso
- Conversas guardadas por **90 dias** e apagadas por rotina diária. Prazo adequado? Precisa ser menor?
- Quem vê a conversa: o próprio aluno e quem da equipe pode ver dados de saúde dele (professor responsável; owner com
  a confirmação do titular). Coerente com a base legal escolhida?
- Direitos do titular: a exportação/exclusão do aluno precisa incluir essas conversas (a exclusão definitiva já apaga em
  cascata; a exportação ainda não inclui).

## 5. Termos de uso e política de privacidade
- `/termos` e `/privacidade` (rascunho) não falam do assistente. Incluir: o que é, limites, provedor, dados enviados,
  retenção, como desligar.
- Responsabilidade por resposta errada do modelo (limitação de responsabilidade, papel do personal).

## 6. Como o personal pode anunciar
- Sempre como **"assistente de IA"**. Nunca como professor, nunca com nome de pessoa, nunca prometendo "acompanhamento
  personalizado 24 h" ou orientação de saúde. Avaliar regras do CREF/CONFEF sobre prescrição e acompanhamento por
  ferramenta automatizada.
- Material de marketing e textos do app: revisar antes da comercialização.

## 7. Limites técnicos já implementados (para referência)
- Camada de segurança determinística antes do modelo (lista de expressões em `features/assistant/safety.ts` = banco).
- A IA pausa na sessão quando há relato de sintoma ou quando o professor escreve no chat.
- 30 mensagens/dia por aluno, teto de tokens por resposta, prazo de 20 s com mensagem de contingência e alerta ao
  professor, custo contabilizado por organização.
- O modelo não tem ferramentas; o texto do aluno vai delimitado e o prompt manda não tratá-lo como instrução.
