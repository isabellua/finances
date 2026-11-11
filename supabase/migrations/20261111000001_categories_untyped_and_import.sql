-- Ajustes da Fase 1 + base da Fase 2 (importação).
--  * categorias deixam de ter tipo (entrada/saída)
--  * categorias padrão também para usuários que já existiam
--  * cartão ganha os 4 últimos dígitos
--  * hash de importação vira UNIQUE comum (permite upsert com ignore duplicates)
--  * regras de categorização por estabelecimento

-- 1. Categorias sem tipo. Derruba junto a unique (user_id, kind, name).
alter table public.categories drop column kind;
create unique index categories_user_name_uniq
  on public.categories (user_id, lower(name));

-- 2. Seed sem tipo.
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name)
  select new.id, c.name
  from (values
    ('Moradia'), ('Mercado'), ('Alimentação fora'), ('Transporte'), ('Saúde'),
    ('Educação'), ('Lazer'), ('Assinaturas'), ('Compras'), ('Impostos e taxas'),
    ('Viagem'), ('Outros'), ('Salário'), ('Rendimentos'), ('Outras entradas')
  ) as c(name)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.seed_default_categories() from public, anon, authenticated;

-- Preenche quem já existia (o gatilho só cobre usuários novos).
insert into public.categories (user_id, name)
select u.id, c.name
from auth.users u
cross join (values
  ('Moradia'), ('Mercado'), ('Alimentação fora'), ('Transporte'), ('Saúde'),
  ('Educação'), ('Lazer'), ('Assinaturas'), ('Compras'), ('Impostos e taxas'),
  ('Viagem'), ('Outros'), ('Salário'), ('Rendimentos'), ('Outras entradas')
) as c(name)
on conflict do nothing;

-- 3. Cartão: últimos 4 dígitos (opcional).
alter table public.credit_cards
  add column last4 text check (last4 is null or last4 ~ '^[0-9]{4}$');

-- 4. Hash de importação: UNIQUE comum. NULLs são distintos, então lançamentos
--    manuais (sem hash) não colidem entre si.
drop index public.transactions_external_hash_uniq;
alter table public.transactions
  add constraint transactions_user_external_hash_key unique (user_id, external_hash);

-- 5. Regras de categorização: "contém <pattern>" vira <categoria>.
create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern text not null check (length(pattern) between 2 and 80),
  category_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, pattern),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete cascade
);

alter table public.category_rules enable row level security;

create policy category_rules_owner on public.category_rules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index category_rules_category_idx on public.category_rules (category_id);
create index transactions_category_idx on public.transactions (category_id);
