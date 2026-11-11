-- Fase 4: compra internacional no cartão (cotação + spread + IOF).

-- Parâmetros por cartão. NULL = não configurado: o app pede para preencher.
alter table public.credit_cards
  add column fx_spread_bps integer
    check (fx_spread_bps is null or fx_spread_bps between 0 and 3000),
  -- IOF próprio deste cartão (ex.: emissor que absorve = 0). NULL = usa a alíquota geral.
  add column fx_iof_bps integer
    check (fx_iof_bps is null or fx_iof_bps between 0 and 1000),
  -- Qual cotação o emissor usa. Confirmar com cada banco; padrão é uma suposição.
  add column fx_rate_rule text not null default 'purchase_date'
    check (fx_rate_rule in ('purchase_date', 'closing_date', 'due_date'));

-- Alíquotas com vigência (ex.: IOF de compra internacional), editáveis pelo usuário.
create table public.tax_params (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key in ('iof_card_international')),
  rate_bps integer not null check (rate_bps between 0 and 2000),
  valid_from date not null,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, key, valid_from)
);

alter table public.tax_params enable row level security;

create policy tax_params_owner on public.tax_params
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index tax_params_user_idx on public.tax_params (user_id);

-- Compra em moeda estrangeira: guarda o que foi usado na estimativa para depois
-- comparar com o que a fatura realmente cobrou.
alter table public.transactions
  add column fx_currency text check (fx_currency is null or fx_currency ~ '^[A-Z]{3}$'),
  -- unidades menores da moeda (centavos; iene: inteiro)
  add column fx_amount_minor bigint check (fx_amount_minor is null or fx_amount_minor > 0),
  -- reais por 1 unidade da moeda, em micro (1e-6)
  add column fx_rate_micro bigint check (fx_rate_micro is null or fx_rate_micro > 0),
  add column fx_spread_bps integer check (fx_spread_bps is null or fx_spread_bps between 0 and 3000),
  add column fx_iof_bps integer check (fx_iof_bps is null or fx_iof_bps between 0 and 1000),
  -- valor estimado em centavos de real (preservado depois que o valor real é confirmado)
  add column fx_estimated_cents bigint check (fx_estimated_cents is null or fx_estimated_cents > 0),
  -- true enquanto amount_cents ainda é estimativa
  add column fx_estimated boolean not null default false;

alter table public.transactions
  add constraint transactions_fx_shape check (
    ((fx_currency is null) = (fx_amount_minor is null))
    and ((fx_currency is null) = (fx_rate_micro is null))
    and (
      fx_currency is not null
      or (not fx_estimated and fx_estimated_cents is null and fx_spread_bps is null and fx_iof_bps is null)
    )
    and (fx_currency is null or kind = 'expense')
  );

create index transactions_fx_pending_idx
  on public.transactions (user_id, card_id)
  where fx_estimated;
