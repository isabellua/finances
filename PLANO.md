# Plano de desenvolvimento: app de finanças da família

Legenda: **[Certo]** prova concreta · **[Provável]** inferência forte · **[Suposição]** preenchendo lacuna, verificar.

## 0. Contexto e decisões já tomadas

- Brasil. Bancos: Banco do Brasil, Itaú, Inter, Nubank, Caixa, Bradesco, BTG, outros.
- Uso pessoal da família, não será vendido. Cada pessoa com seus próprios dados (sem espaço compartilhado).
- Orçamento zero. Cadastro manual no início.
- Desenvolvimento por uma pessoa com Claude Code.
- Cartões: todos têm. Prioridade de adaptadores de fatura: **Banco do Brasil e Itaú**.
- Requisito novo: **calculadora de conversão de moeda** para compras internacionais no cartão (taxas do cartão + IOF).

## 1. Integrações (parte mais importante)

### 1.1 Entrada de dados
1. **Lançamento manual rápido.** Núcleo do app. Meta: lançar um gasto em menos de 10 segundos (3 campos: valor, categoria, conta; atalho "repetir último"; PWA instalável).
2. **Importação OFX/CSV de extrato e fatura**, com um adaptador por banco/formato, todos com a mesma saída padronizada (data, descrição, valor, id externo, conta/cartão). Deduplicação por hash para poder reimportar sem duplicar.
   - [Provável] Os bancos listados oferecem exportação de extrato/fatura em OFX e/ou CSV, mas formato e disponibilidade variam por banco e por produto. Sem fonte verificada por banco.
   - **Ação Fase 0:** em BB e Itaú, baixar arquivos reais de exemplo (extrato e fatura). Eles definem os primeiros adaptadores.
3. **PDF de fatura:** só se algum cartão não tiver CSV/OFX. [Suposição] Extração frágil, layout muda.
4. **Conexão automática (Open Finance via agregador):** [Suposição] pode existir plano gratuito para uso pessoal; não tenho certeza de condições nem de cobertura dos seus bancos. Verificar na Fase 0. Se existir, entra como opcional atrás de uma interface (sem prender o app a um fornecedor).
5. **Leitura de e-mails de aviso do banco:** não recomendado agora (acesso à caixa de e-mail, parsing frágil).

### 1.2 Categorização sem custo
- Regras por texto aprendidas das correções do usuário, com busca aproximada (fuzzy). Sem LLM (custo e envio de dados financeiros a terceiros).
- [Provável] Depois de algumas semanas de uso cobre a maioria dos gastos recorrentes.

### 1.3 Lembretes gratuitos
- E-mail (Resend ou similar, plano gratuito) e Web Push (PWA). Telegram bot opcional. WhatsApp fora do escopo.
- Agendador no servidor (não depender do navegador). [Provável] Cron da Vercel Hobby tem limite de frequência; `pg_cron` do Supabase é alternativa. Verificar limites atuais.
- Exportar vencimentos em ICS / Google Calendar.

### 1.4 Dados públicos gratuitos
- API do Banco Central (Olinda/PTAX e SGS) para dólar, Selic, CDI, IPCA. [Provável] Sem chave e sem custo; verificar disponibilidade e formato antes de depender.

### 1.5 Calculadora de compra internacional (novo)

**Objetivo:** estimar quanto uma compra em moeda estrangeira vai custar na fatura de um cartão específico.

**Entradas:** valor, moeda, cartão (de uma lista cadastrada), data da compra, cotação (automática PTAX ou manual).

**Parâmetros configuráveis por cartão (nunca fixos no código):**
- Spread/taxa de conversão do emissor (%).
- Alíquota de IOF para compras internacionais no cartão (%).
- Regra de data da cotação (data da compra, fechamento ou pagamento da fatura).

**Fórmula-base:** `valor_moeda × cotação × (1 + spread) × (1 + IOF)`. Mostrar o detalhamento linha a linha (cotação, spread, IOF, total em R$) e o custo efetivo percentual sobre a cotação.

**Pontos que não posso afirmar:**
- [Suposição] A alíquota vigente do IOF para cartão internacional mudou nos últimos anos. Não tenho certeza do valor atual. Conferir na Receita Federal/gov.br e guardar como parâmetro com data de vigência.
- [Suposição] Como BB e Itaú convertem (cotação do dia da compra, do fechamento ou do pagamento; taxa/spread própria) não está verificado. Conferir nos contratos/FAQ de cada cartão. Até lá, o campo de spread e a regra de data são preenchidos por você.
- [Suposição] Compras em moedas que não sejam dólar podem passar por conversão intermediária via bandeira; o cálculo pode divergir.

**Fechamento do ciclo:** quando a fatura real chegar (importação), comparar valor estimado × valor cobrado e guardar a diferença. Com o tempo isso calibra o spread/regra de cada cartão. A compra internacional lançada na fatura deve guardar: valor original, moeda, cotação aplicada, IOF.

**Resultado:** apresentar como estimativa com faixa (cotação de hoje vs cotação do fechamento), não como valor exato.

## 2. Stack gratuita

- [Suposição] Next.js + TypeScript, Supabase (Postgres, auth, RLS), Vercel Hobby.
- [Provável] Projeto Supabase gratuito pode ser pausado por inatividade e tem limites de armazenamento. Mitigação: ping semanal + **backup periódico exportado**.
- [Provável] Vercel Hobby é para uso não comercial (cobre este caso).
- Valores monetários em centavos (inteiro), nunca float.
- Cada usuário isolado por RLS (`user_id`).

## 3. Modelo de dados

`user`, `account`, `credit_card` (limite, dia de fechamento, dia de vencimento, spread, regra de cotação), `invoice`, `transaction` (valor, data, conta/cartão, categoria, `origem` manual/importado, `hash_externo`, campos opcionais de moeda estrangeira: `valor_original`, `moeda`, `cotacao`, `iof`), `category` (hierárquica), `rule`, `recurring`, `installment_plan`, `bill`, `reminder`, `budget`, `fx_rate_cache`, `tax_param` (alíquotas com data de vigência).

Pontos difíceis [Certo]:
- Transferência entre contas não é gasto.
- Pagamento da fatura não é gasto (o gasto é cada compra no cartão).
- Parcelamento precisa gerar parcelas futuras para a previsão.
- Deduplicar importado × manual.

## 4. Funções

1. **Contas e cartões:** múltiplas contas, saldo consolidado, cartões por conta, fatura aberta/fechada, limite usado.
2. **Lançamentos:** entrada, saída, transferência, estorno, divisão entre categorias, compra internacional.
3. **Categorias e regras.**
4. **Prazos e lembretes:** calendário, status pago/pendente/atrasado, lembrete D-3/D-1/dia.
5. **Visão mensal e anual:** por categoria, entradas × saídas, comparativos.
6. **Análises:** maiores gastos, categorias que cresceram, assinaturas esquecidas, anomalias.
7. **Previsão:** fixas + assinaturas + parcelas restantes + média das variáveis, com faixa e premissas visíveis.
8. **Saúde financeira:** [Suposição] indicador próprio (taxa de poupança, comprometimento de renda com fixas e parcelas, reserva em meses de despesa, uso do limite, contas atrasadas), pesos ajustáveis e transparentes.
9. **Calculadora de conversão** (seção 1.5).

## 5. Roadmap

- **Fase 0 (1 semana):** baixar exemplos reais de BB e Itaú (extrato e fatura); levantar spread e regra de cotação dos cartões; conferir alíquota de IOF vigente; checar se há agregador gratuito.
- **Fase 1:** auth, contas, cartões, lançamento manual rápido, categorias, visão mensal, PWA.
- **Fase 2:** importação CSV/OFX (adaptadores BB e Itaú primeiro), deduplicação, regras de categoria.
- **Fase 3:** contas a pagar, recorrências, parcelamentos, lembretes (e-mail, push).
- **Fase 4:** calculadora de conversão (PTAX + parâmetros do cartão), compra internacional integrada ao lançamento e à fatura.
- **Fase 5:** previsão, análises, visão anual, saúde financeira, backup automático.
- **Fase 6 (opcional):** adaptadores de Inter/Nubank/Caixa/Bradesco/BTG, agregador gratuito se viável, PDF de fatura, Telegram.

A calculadora (Fase 4) depende só de cartões cadastrados e de lançamentos, então pode subir de posição se for urgente (ex.: viagem próxima). Ela funciona de forma independente com cotação manual.

## 6. Riscos

- [Certo] Dado financeiro é dado pessoal (LGPD): RLS, HTTPS, nunca guardar senha bancária, backup protegido.
- [Provável] Formatos de exportação mudam sem aviso: testes com arquivos reais por adaptador.
- [Provável] Entrada manual cansa: medir tempo de lançamento.
- [Provável] Taxas e IOF mudam: parametrizar com data de vigência e mostrar "estimativa".

## 7. Itens a verificar antes de construir

1. Formatos de exportação de BB e Itaú (extrato e fatura).
2. Spread e regra de data de cotação dos cartões BB e Itaú.
3. Alíquota vigente de IOF em compras internacionais no cartão.
4. Limites atuais dos planos gratuitos (Supabase, Vercel, Resend).
5. Disponibilidade e formato da API PTAX do Banco Central.
6. Existência de agregador de Open Finance gratuito para uso pessoal.
