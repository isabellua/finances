-- Fase 1: contas, cartões, categorias e lançamentos.
-- Valores em centavos (bigint). Cada linha pertence a um usuário (RLS).

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  institution text check (institution is null or length(institution) <= 80),
  type text not null default 'checking'
    check (type in ('checking', 'savings', 'investment', 'cash')),
  opening_balance_cents bigint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  brand text check (brand is null or length(brand) <= 40),
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  -- a conta que paga a fatura precisa ser do mesmo usuário
  foreign key (account_id, user_id) references public.accounts (id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- income: entrada na conta | expense: saída da conta OU compra no cartão
  -- transfer: entre contas (não é gasto) | invoice_payment: pagamento de fatura (não é gasto)
  kind text not null check (kind in ('income', 'expense', 'transfer', 'invoice_payment')),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  description text not null default '' check (length(description) <= 200),
  category_id uuid,
  account_id uuid,
  card_id uuid,
  transfer_account_id uuid,
  source text not null default 'manual' check (source in ('manual', 'import')),
  external_hash text,
  created_at timestamptz not null default now(),

  constraint transactions_shape check (
    case kind
      when 'income' then
        account_id is not null and card_id is null and transfer_account_id is null
      when 'expense' then
        ((account_id is not null) <> (card_id is not null)) and transfer_account_id is null
      when 'transfer' then
        account_id is not null and transfer_account_id is not null
        and account_id <> transfer_account_id and card_id is null
      when 'invoice_payment' then
        account_id is not null and card_id is not null and transfer_account_id is null
    end
  ),
  -- transferência e pagamento de fatura não têm categoria
  constraint transactions_category_rule check (
    kind in ('income', 'expense') or category_id is null
  ),

  -- todas as referências precisam ser do mesmo usuário
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (transfer_account_id, user_id) references public.accounts (id, user_id),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id)
);

create unique index transactions_external_hash_uniq
  on public.transactions (user_id, external_hash)
  where external_hash is not null;
create index transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_card_idx on public.transactions (card_id);

-- Saldo por conta (security_invoker: respeita a RLS de quem consulta).
create view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.opening_balance_cents + coalesce(sum(
    case
      when t.account_id = a.id and t.kind = 'income' then t.amount_cents
      when t.account_id = a.id and t.kind in ('expense', 'transfer', 'invoice_payment') then -t.amount_cents
      when t.transfer_account_id = a.id and t.kind = 'transfer' then t.amount_cents
      else 0
    end
  ), 0)::bigint as balance_cents
from public.accounts a
left join public.transactions t
  on t.account_id = a.id or t.transfer_account_id = a.id
group by a.id;

-- RLS
alter table public.accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy accounts_owner on public.accounts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy credit_cards_owner on public.credit_cards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy categories_owner on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy transactions_owner on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Categorias padrão para cada novo usuário.
create function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, kind)
  select new.id, c.name, c.kind
  from (values
    ('Moradia', 'expense'), ('Mercado', 'expense'), ('Alimentação fora', 'expense'),
    ('Transporte', 'expense'), ('Saúde', 'expense'), ('Educação', 'expense'),
    ('Lazer', 'expense'), ('Assinaturas', 'expense'), ('Compras', 'expense'),
    ('Impostos e taxas', 'expense'), ('Viagem', 'expense'), ('Outros', 'expense'),
    ('Salário', 'income'), ('Rendimentos', 'income'), ('Outras entradas', 'income')
  ) as c(name, kind);
  return new;
end;
$$;

revoke all on function public.seed_default_categories() from public, anon, authenticated;

create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row execute function public.seed_default_categories();
