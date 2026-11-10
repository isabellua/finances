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
