/**
 * Textos-base de Política de Privacidade e Termos de Uso — RASCUNHO, pendente de revisão jurídica.
 * Não afirmam base legal: as bases em aberto estão listadas no próprio texto para o advogado decidir
 * (ver também docs/planos/fase-c.md, C7, e a seção "Segurança e LGPD" do CLAUDE.md).
 * Markdown simples (o mesmo dos tutoriais); `{{marca}}` vira o nome do app (features/brand/config.ts).
 */
export const LEGAL_DRAFT_NOTICE = "RASCUNHO, pendente de revisão jurídica";

export const PRIVACY_MD = `
> ${LEGAL_DRAFT_NOTICE}. Este texto é uma base de trabalho para o advogado e ainda não vale como política oficial. Os pontos marcados **[em aberto]** dependem de decisão jurídica.

## Quem trata os seus dados

O {{marca}} é um sistema usado por personal trainers e estúdios para acompanhar os seus alunos.

- **[em aberto]** Papel de cada parte na LGPD: em regra, o personal ou estúdio seria o **controlador** dos dados dos seus alunos e o {{marca}} o **operador**. Confirmar com o advogado, inclusive para os dados do próprio personal.
- **[em aberto]** Identificação do responsável pelo {{marca}} (razão social, CNPJ, endereço) e do **encarregado** (DPO), com o canal de contato.

## Quais dados tratamos

- **Cadastro do aluno:** nome, e-mail, WhatsApp, data de nascimento, sexo, foto (opcional), local de treino e observações do professor.
- **Treino:** planos de treino, sessões registradas, séries, cargas, esforço percebido, comentários do aluno ao professor e a nota opcional dada ao fim do treino.
- **Dados de saúde (dados sensíveis):** grupos especiais (ex.: dores ou condições informadas), triagem de sinais de alerta, encaminhamento e liberação de profissional de saúde, dor registrada por exercício e o que o aluno escrever no chat.
- **Chat e recados:** mensagens trocadas entre aluno e professor e recados do professor.
- **Conta e uso:** e-mail de acesso, registros técnicos de segurança (como endereço IP para limitar tentativas de acesso) e cookies de sessão necessários para manter você conectado.

## Para que usamos

- Permitir que o professor prescreva, acompanhe e ajuste os treinos.
- Alertar o professor sobre exercícios que pedem cuidado, sem bloquear o treino.
- Permitir a conversa entre aluno e professor.
- Manter a conta segura (login, recuperação de senha, proteção contra robôs e limite de tentativas).

## Bases legais

**[em aberto]** As bases legais abaixo estão **em discussão** e precisam ser confirmadas pelo advogado antes da publicação:

1. Dados de saúde dos grupos especiais: **consentimento** do titular (LGPD, art. 11, I). Hoje o app pede o consentimento em duas etapas: o professor declara que obteve e o aluno confirma no primeiro acesso.
2. Triagem de sinais de alerta, encaminhamento e liberação, e o chat: proposta de usar a **proteção da vida e da incolumidade física** e o **exercício regular de direitos** (art. 11, II, "e" e "d"), sem depender do consentimento. **Se não for aceita,** o chat passa a exigir o consentimento confirmado.
3. Cadastro e treino: proposta de **execução de contrato** (art. 7º, V) entre aluno e personal.
4. Registros de segurança: proposta de **legítimo interesse** (art. 7º, IX) ou cumprimento de obrigação legal (art. 7º, II, Marco Civil da Internet).

## Com quem compartilhamos

Os dados ficam em serviços contratados para operar o {{marca}} (operadores):

- **Supabase**: banco de dados, autenticação e armazenamento de arquivos. **[em aberto]** região de hospedagem e transferência internacional (LGPD, art. 33).
- **Vercel**: hospedagem do site.
- **Cloudflare Turnstile**: proteção contra robôs no cadastro público.
- **Provedor de e-mail** para convites e recuperação de senha. **[em aberto]** qual provedor.
- **YouTube, Vimeo e Loom**: vídeos de exercício e de tutorial, carregados **só quando você clica** para assistir.

Não vendemos dados. Dados de saúde, mensagens do chat e recados nunca aparecem em endereços de página, registros de sistema ou e-mails.

## Por quanto tempo guardamos

**[em aberto]** Prazos de guarda por tipo de dado (cadastro, treinos, saúde, chat, registros de segurança) e o que acontece quando o aluno deixa de treinar com o personal.

## Seus direitos

Você pode pedir confirmação de tratamento, acesso, correção, anonimização ou exclusão, portabilidade, informação sobre compartilhamento e a revogação do consentimento (LGPD, art. 18). Hoje o app já permite ao personal exportar os dados de um aluno e excluí-los definitivamente. A recusa do consentimento de saúde apaga os dados de saúde do aluno.

**[em aberto]** Canal oficial para pedidos do titular e prazo de resposta.

## Segurança

Acesso por login individual, isolamento entre estúdios no banco de dados, regras de acesso por papel (dono, professor, aluno), conexão criptografada e links de acesso de uso único com validade curta.

## Alterações

Avisaremos sobre mudanças relevantes nesta política. **[em aberto]** forma de aviso e data de vigência.
`;

export const TERMS_MD = `
> ${LEGAL_DRAFT_NOTICE}. Este texto é uma base de trabalho para o advogado e ainda não vale como termos oficiais. Os pontos marcados **[em aberto]** dependem de decisão jurídica.

## O que é o {{marca}}

Um sistema para personal trainers e estúdios organizarem alunos e treinos, com um app para o aluno acompanhar o próprio treino e conversar com o professor.

## Contas

- O personal ou estúdio cria a conta e convida os professores. Cada pessoa usa o próprio login e é responsável por manter a senha em segredo.
- O aluno recebe o acesso pelo personal (link de uso único). O acesso pode ser suspenso pelo personal (por exemplo, por inatividade ou pagamento em atraso).

## Responsabilidades do personal ou estúdio

- Obter e registrar o consentimento do aluno para os dados de saúde, quando aplicável, e usar esses dados só para orientar o treino.
- Manter os dados dos alunos corretos e atender aos pedidos dos titulares.
- Usar os alertas do sistema como **apoio à decisão**: eles não substituem a avaliação profissional.

## Não é atendimento de saúde nem de emergência

O {{marca}} não faz diagnóstico nem substitui médico ou fisioterapeuta. O chat **não é canal de emergência**: em caso de dor forte, falta de ar ou dor no peito, ligue **192**.

## Uso aceitável

Não é permitido usar o {{marca}} para enviar conteúdo ilegal, ofensivo ou de terceiros sem autorização, nem tentar acessar dados de outros estúdios ou burlar as proteções do sistema.

## Planos, pagamento e cancelamento

**[em aberto]** Planos, período de teste, cobrança, inadimplência (hoje o produto prevê somente leitura para o personal e suspensão do acesso dos alunos após a carência), cancelamento e devolução dos dados.

## Disponibilidade e responsabilidade

**[em aberto]** Nível de disponibilidade, limitação de responsabilidade, backups e o que acontece com os dados ao encerrar a conta.

## Privacidade

O tratamento de dados pessoais segue a [Política de Privacidade](/privacidade).

## Alterações, foro e contato

**[em aberto]** Forma de aviso de mudanças, data de vigência, foro e canal de contato.
`;
