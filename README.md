# Finanças

App web de controle financeiro da família. Plano completo em [PLANO.md](PLANO.md).

**Estado: Fase 1** — login, contas, cartões, categorias, lançamento manual e resumo mensal.

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

## Deploy na Vercel com Supabase pelo Marketplace

1. Vercel > Add New > Project > importe `isabellua/finances` (framework Next.js detectado).
2. No projeto: Storage (ou Integrations) > Supabase > criar banco e conectar ao projeto. A Vercel injeta as variáveis no projeto.
3. Confira em Settings > Environment Variables que existem `NEXT_PUBLIC_SUPABASE_URL` e uma chave pública (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`; o app aceita as duas). `SUPABASE_SERVICE_ROLE_KEY`, se existir, **não é usada** por este app e não deve ser exposta.
4. Aplique a migração `supabase/migrations/*.sql` no banco (SQL Editor do Supabase).
5. Para rodar local com as mesmas variáveis: `npx vercel link` e `npx vercel env pull .env.local`.
6. Supabase > Authentication > URL Configuration: adicione a URL de produção da Vercel em Site URL e Redirect URLs.

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
