# Finanças

App web de controle financeiro da família. Plano completo em [PLANO.md](PLANO.md).

**Estado: Fases 1 a 4**
- Fase 1: login, contas, cartões, categorias, lançamento manual (criar, editar, excluir) e resumo mensal.
- Fase 2: importação de extrato e fatura (OFX/CSV) com detecção de duplicatas e categorias aprendidas.
- Fase 3: contas a pagar (assinaturas, contas fixas, parcelas, avulsas), vencimentos e calendário `.ics`.
- Fase 4: calculadora de compra internacional (PTAX do Banco Central + spread + IOF), com fechamento do ciclo ao importar a fatura.
- Espaços (pessoal, profissional, família, amigos), com membros e convite por link.
- Pago × previsto, fatura por ciclo, calendário, visão anual, próximos meses (teto e comprometido), saúde financeira, assinaturas detectadas, busca e filtros.
- Pendente: lembretes por e-mail/notificação e tema claro/escuro manual (o visual é do agente de design).

## Rodar localmente

1. Crie um projeto no [Supabase](https://supabase.com) (plano gratuito).
2. Aplique `supabase/migrations/*.sql` (SQL Editor do Supabase ou `supabase db push`).
3. Copie as variáveis:
   ```bash
   cp .env.example .env.local
   ```
   Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings > API). Nunca use a chave `service_role` neste app.
4. Instale e rode:
   ```bash
   npm install
   npm run dev
   ```
5. Abra http://localhost:3000, crie sua conta em "Criar conta". Se a confirmação por e-mail estiver ligada no Supabase (Authentication > Providers > Email), confirme antes de entrar.

## Região

Funções da Vercel (`vercel.json`, `gru1`) e banco Supabase (`sa-east-1`) ficam ambos em **São Paulo**.
Se mudar um, mude o outro: função e banco em continentes diferentes fazem cada consulta atravessar o oceano.

## Deploy na Vercel com Supabase pelo Marketplace

1. Vercel > Add New > Project > importe `isabellua/finances` (framework Next.js detectado).
2. No projeto: Storage (ou Integrations) > Supabase > criar banco e conectar ao projeto. A Vercel injeta as variáveis no projeto.
3. Confira em Settings > Environment Variables que existem `NEXT_PUBLIC_SUPABASE_URL` e uma chave pública (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`; o app aceita as duas). `SUPABASE_SERVICE_ROLE_KEY`, se existir, **não é usada** por este app e não deve ser exposta.
4. Aplique a migração `supabase/migrations/*.sql` no banco (SQL Editor do Supabase).
5. Para rodar local com as mesmas variáveis: `npx vercel link` e `npx vercel env pull .env.local`.
6. Supabase > Authentication > URL Configuration: adicione a URL de produção da Vercel em Site URL e Redirect URLs.

## Navegação

Quatro áreas (Início, Lançamentos, **Previsão**, Contas) e um botão "+" (celular: no centro da barra; web: "+ Novo" no topo) que abre despesa, entrada, transferência, pagar fatura, conta a pagar e compra internacional.
- **Previsão** reúne próximos meses, A pagar, Faturas, Calendário e Anual (`/previsao/*`).
- **Mais** (menu no topo): Importar, Categorias, Saúde, Configurações do espaço (só dono) e Sair.
- A troca de espaço fica no topo (`/espaco/trocar`); a criação de espaço em `/espacos/novo`.
- Compra internacional usa as taxas do próprio cartão (spread, IOF, regra de cotação), editadas em Contas.

## Testes do banco

`scripts/db-test.sh` sobe um Postgres temporário, aplica as migrações em ordem (com dados "antigos" antes da migração de espaços) e roda `supabase/tests/*.test.sql`. `FINGERPRINT=1` imprime uma impressão digital do esquema para comparar com produção.

## Comandos

```bash
npm run dev      # desenvolvimento
npm run build    # build de produção
npm run lint
npx vitest run   # testes (dinheiro, datas, resumo)
```

## Modelo de dados (resumo)

- Valores em **centavos** (inteiro). Nunca float.
- `transactions.kind`: `income`, `expense` (conta **ou** cartão), `transfer` e `invoice_payment`. Transferência e pagamento de fatura **não contam como gasto**: o gasto é cada compra no cartão.
- Cada linha pertence a um usuário (`user_id`) e a RLS isola os dados. Chaves estrangeiras compostas `(id, user_id)` impedem referenciar conta, cartão ou categoria de outro usuário.
- Cada novo usuário recebe categorias padrão via trigger.

## Decisões

- Next.js 16: `middleware` virou `proxy.ts`. Cache Components fica desligado porque todas as telas são por usuário e dinâmicas.
- Autorização de verdade: `requireUser()` nas páginas/ações e RLS no banco. O `proxy.ts` só renova a sessão e faz redirecionamento otimista.
