# Pendentes: fora do escopo de propósito

Registrado no sprint de venda (20/11/2026). Nenhum destes itens foi implementado. Antes de abrir qualquer um, é preciso
a condição indicada abaixo.

| Módulo | Situação | O que destrava |
|---|---|---|
| **Aulas / agenda presencial** | Aguarda entrevistas com personais (proposta e riscos em `docs/planos/modulo-presencial.md`). | Resultado das entrevistas: como o personal marca, remarca e cobra aula presencial. |
| **Vendas** (o personal cobra o aluno) | Depende de gateway e de decisão comercial. É diferente da cobrança do personal pela plataforma (`docs/planos/cobranca.md`). | Gateway escolhido, modelo de repasse/taxa e termos com o aluno. |
| **Marketing** (página de vendas, cupons, indicações) | Sem definição de escopo. | Definir o objetivo: captar alunos para o personal ou personais para a plataforma. |
| **Nutrição** | O personal não pode prescrever dieta (só nutricionista). | Definição jurídica do que o app pode exibir (ex.: só orientações gerais ou integração com nutricionista). |
| **Assistente de IA** | Continua desligado em todas as contas (`docs/ia-checklist-juridico.md`). | Revisão jurídica e decisão do dono. |
| **Comentários no feed** | Fase 2 planejada em `docs/planos/feed.md`: moderação, denúncia, nome de exibição. | Termos da comunidade e revisão de privacidade. |
| **Importação de treinos** (MFIT e outras) | Proposta em `docs/planos/importacao-treinos.md`. | Arquivo real exportado da plataforma de origem. |
| **Tipo de plano comercial do aluno** (mensal, trimestral, semestral, anual) | O cadastro não tem o campo; o "Meu plano" do Perfil mostra o nome do plano de treino, o vencimento e o próximo pagamento. | Definir o cadastro comercial (tipo, valor, renovação) junto com **Vendas**. |
| **Notificações fora do app** (push, e-mail, WhatsApp automático) | Hoje só avisos dentro do app e links para copiar/WhatsApp manual. | SMTP próprio (e-mail) e/ou web push (PWA com service worker), e opt-in do aluno. |
