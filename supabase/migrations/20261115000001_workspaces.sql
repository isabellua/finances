-- Espaços (pessoal, profissional, família, amigos...). Cada dado pertence a um espaço;
-- usuários entram em espaços como dono, editor ou somente leitura.
--
-- O espaço ativo vem do cabeçalho HTTP `x-workspace-id` (lido por current_workspace()).
-- Sem cabeçalho, vale o espaço mais antigo do usuário: o app antigo continua funcionando.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null default 'personal'
    check (kind in ('personal', 'professional', 'family', 'friends', 'other')),
  -- teto de gastos e meta de receita por mês (centavos); opcionais
  monthly_cap_cents bigint check (monthly_cap_cents is null or monthly_cap_cents > 0),
  monthly_income_goal_cents bigint check (monthly_income_goal_cents is null or monthly_income_goal_cents > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Convite por link secreto (token). Quem tem o link e uma conta entra no espaço.
create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  role text not null check (role in ('editor', 'viewer')),
  note text check (note is null or length(note) <= 80),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index workspace_invites_ws_idx on public.workspace_invites (workspace_id);

-- ---------------------------------------------------------------- funções auxiliares
-- SECURITY DEFINER: leem workspace_members sem passar pela RLS dela (evita recursão).

create function public.is_member(ws uuid, min_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and case min_role
            when 'owner' then m.role = 'owner'
            when 'editor' then m.role in ('owner', 'editor')
            else true
          end
  );
$$;

-- Espaço ativo: cabeçalho x-workspace-id (se o usuário é membro) ou o mais antigo dele.
-- Cabeçalho presente mas inválido ou de espaço alheio => NULL (nenhum acesso), nunca outro espaço.
create function public.current_workspace()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h text;
  ws uuid;
begin
  begin
    h := current_setting('request.headers', true)::json ->> 'x-workspace-id';
  exception when others then
    h := null;
  end;

  if h is not null then
    if h ~ '^[0-9a-fA-F-]{36}$' then
      ws := h::uuid;
      if public.is_member(ws) then
        return ws;
      end if;
    end if;
    return null;
  end if;

  select m.workspace_id into ws
  from public.workspace_members m
  where m.user_id = (select auth.uid())
  order by m.created_at, m.workspace_id
  limit 1;
  return ws;
end;
$$;

create function public.default_category_names()
returns text[]
language sql
immutable
as $$
  select array[
    'Moradia', 'Mercado', 'Alimentação fora', 'Transporte', 'Saúde', 'Educação',
    'Lazer', 'Assinaturas', 'Compras', 'Impostos e taxas', 'Viagem', 'Outros',
    'Salário', 'Rendimentos', 'Outras entradas'
  ];
$$;

-- ---------------------------------------------------------------- coluna workspace_id
alter table public.accounts add column workspace_id uuid;
alter table public.credit_cards add column workspace_id uuid;
alter table public.categories add column workspace_id uuid;
alter table public.category_rules add column workspace_id uuid;
alter table public.transactions add column workspace_id uuid;
alter table public.commitments add column workspace_id uuid;
alter table public.commitment_settlements add column workspace_id uuid;
alter table public.tax_params add column workspace_id uuid;

-- Cada usuário existente ganha o espaço "Pessoal" com todos os dados que já tinha.
do $$
declare
  u record;
  ws uuid;
begin
  for u in select id from auth.users loop
    insert into public.workspaces (name, kind, created_by)
    values ('Pessoal', 'personal', u.id)
    returning id into ws;

    insert into public.workspace_members (workspace_id, user_id, role) values (ws, u.id, 'owner');

    update public.accounts set workspace_id = ws where user_id = u.id;
    update public.credit_cards set workspace_id = ws where user_id = u.id;
    update public.categories set workspace_id = ws where user_id = u.id;
    update public.category_rules set workspace_id = ws where user_id = u.id;
    update public.transactions set workspace_id = ws where user_id = u.id;
    update public.commitments set workspace_id = ws where user_id = u.id;
    update public.commitment_settlements set workspace_id = ws where user_id = u.id;
    update public.tax_params set workspace_id = ws where user_id = u.id;
  end loop;
end $$;

-- ---------------------------------------------------------------- refaz as chaves
-- Antes: (id, user_id) garantia "mesmo usuário". Agora: (id, workspace_id) garante "mesmo espaço".
do $$
declare
  r record;
begin
  -- chaves estrangeiras compostas (2 colunas) das tabelas de dados
  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace and cardinality(conkey) = 2
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  -- uniques (id, user_id)
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    where c.contype = 'u' and c.connamespace = 'public'::regnamespace and cardinality(c.conkey) = 2
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'id')
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'user_id')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.accounts alter column workspace_id set not null;
alter table public.credit_cards alter column workspace_id set not null;
alter table public.categories alter column workspace_id set not null;
alter table public.category_rules alter column workspace_id set not null;
alter table public.transactions alter column workspace_id set not null;
alter table public.commitments alter column workspace_id set not null;
alter table public.commitment_settlements alter column workspace_id set not null;
alter table public.tax_params alter column workspace_id set not null;

alter table public.accounts alter column workspace_id set default public.current_workspace();
alter table public.credit_cards alter column workspace_id set default public.current_workspace();
alter table public.categories alter column workspace_id set default public.current_workspace();
alter table public.category_rules alter column workspace_id set default public.current_workspace();
alter table public.transactions alter column workspace_id set default public.current_workspace();
alter table public.commitments alter column workspace_id set default public.current_workspace();
alter table public.commitment_settlements alter column workspace_id set default public.current_workspace();
alter table public.tax_params alter column workspace_id set default public.current_workspace();

alter table public.accounts add constraint accounts_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.credit_cards add constraint credit_cards_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.categories add constraint categories_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.category_rules add constraint category_rules_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.transactions add constraint transactions_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.commitments add constraint commitments_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.commitment_settlements add constraint commitment_settlements_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;
alter table public.tax_params add constraint tax_params_workspace_fkey foreign key (workspace_id) references public.workspaces (id) on delete cascade;

alter table public.accounts add constraint accounts_id_ws_key unique (id, workspace_id);
alter table public.credit_cards add constraint credit_cards_id_ws_key unique (id, workspace_id);
alter table public.categories add constraint categories_id_ws_key unique (id, workspace_id);
alter table public.transactions add constraint transactions_id_ws_key unique (id, workspace_id);
alter table public.commitments add constraint commitments_id_ws_key unique (id, workspace_id);

alter table public.credit_cards
  add constraint credit_cards_account_ws_fkey
  foreign key (account_id, workspace_id) references public.accounts (id, workspace_id);

alter table public.transactions
  add constraint transactions_account_ws_fkey
    foreign key (account_id, workspace_id) references public.accounts (id, workspace_id),
  add constraint transactions_transfer_ws_fkey
    foreign key (transfer_account_id, workspace_id) references public.accounts (id, workspace_id),
  add constraint transactions_card_ws_fkey
    foreign key (card_id, workspace_id) references public.credit_cards (id, workspace_id),
  add constraint transactions_category_ws_fkey
    foreign key (category_id, workspace_id) references public.categories (id, workspace_id)
    on delete set null (category_id);

alter table public.category_rules
  add constraint category_rules_category_ws_fkey
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id)
  on delete cascade;

alter table public.commitments
  add constraint commitments_account_ws_fkey
    foreign key (account_id, workspace_id) references public.accounts (id, workspace_id),
  add constraint commitments_card_ws_fkey
    foreign key (card_id, workspace_id) references public.credit_cards (id, workspace_id),
  add constraint commitments_category_ws_fkey
    foreign key (category_id, workspace_id) references public.categories (id, workspace_id)
    on delete set null (category_id);

alter table public.commitment_settlements
  add constraint commitment_settlements_commitment_ws_fkey
    foreign key (commitment_id, workspace_id) references public.commitments (id, workspace_id)
    on delete cascade,
  add constraint commitment_settlements_transaction_ws_fkey
    foreign key (transaction_id, workspace_id) references public.transactions (id, workspace_id)
    on delete set null (transaction_id);

-- unicidades passam a valer por espaço
drop index public.categories_user_name_uniq;
create unique index categories_ws_name_uniq on public.categories (workspace_id, lower(name));
alter table public.category_rules drop constraint category_rules_user_id_pattern_key;
alter table public.category_rules add constraint category_rules_ws_pattern_key unique (workspace_id, pattern);
alter table public.transactions drop constraint transactions_user_external_hash_key;
alter table public.transactions add constraint transactions_ws_external_hash_key unique (workspace_id, external_hash);
alter table public.tax_params drop constraint tax_params_user_id_key_valid_from_key;
alter table public.tax_params add constraint tax_params_ws_key_valid_from_key unique (workspace_id, key, valid_from);

drop index public.transactions_user_date_idx;
create index transactions_ws_date_idx on public.transactions (workspace_id, occurred_on desc);
create index accounts_ws_idx on public.accounts (workspace_id);
create index credit_cards_ws_idx on public.credit_cards (workspace_id);
create index categories_ws_idx on public.categories (workspace_id);
create index category_rules_ws_idx on public.category_rules (workspace_id);
create index commitments_ws_idx on public.commitments (workspace_id);
create index commitment_settlements_ws_idx on public.commitment_settlements (workspace_id);
create index tax_params_ws_idx on public.tax_params (workspace_id);

-- ---------------------------------------------------------------- RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.is_member(id, 'owner')) with check (public.is_member(id, 'owner'));
create policy workspaces_delete on public.workspaces
  for delete to authenticated using (public.is_member(id, 'owner'));

create policy workspace_members_select on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));
-- dono remove qualquer membro; qualquer um pode sair
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (public.is_member(workspace_id, 'owner') or user_id = (select auth.uid()));

create policy workspace_invites_select on public.workspace_invites
  for select to authenticated using (public.is_member(workspace_id, 'owner'));
create policy workspace_invites_delete on public.workspace_invites
  for delete to authenticated using (public.is_member(workspace_id, 'owner'));

-- Nunca deixa um espaço sem dono (exceto quando o próprio espaço está sendo apagado).
create function public.keep_one_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = old.workspace_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'last_owner';
  end if;
  return old;
end;
$$;

create trigger workspace_members_keep_one_owner
  before delete on public.workspace_members
  for each row execute function public.keep_one_owner();

-- Políticas das tabelas de dados: leitura no espaço ativo; escrita só para editor/dono.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'credit_cards', 'categories', 'category_rules',
    'transactions', 'commitments', 'commitment_settlements', 'tax_params'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (workspace_id = (select public.current_workspace()))',
      t || '_select', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (workspace_id = (select public.current_workspace())
                     and public.is_member(workspace_id, ''editor'')
                     and user_id = (select auth.uid()))',
      t || '_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated
         using (workspace_id = (select public.current_workspace())
                and public.is_member(workspace_id, ''editor''))
         with check (workspace_id = (select public.current_workspace())
                     and public.is_member(workspace_id, ''editor''))',
      t || '_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (workspace_id = (select public.current_workspace())
                and public.is_member(workspace_id, ''editor''))',
      t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- operações de espaço
-- Gatilho de novo usuário: cria o espaço "Pessoal" com as categorias padrão.
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  insert into public.workspaces (name, kind, created_by)
  values ('Pessoal', 'personal', new.id)
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');

  insert into public.categories (user_id, workspace_id, name)
  select new.id, ws, n from unnest(public.default_category_names()) as n;

  return new;
end;
$$;

create function public.create_workspace(p_name text, p_kind text default 'personal')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_kind not in ('personal', 'professional', 'family', 'friends', 'other') then
    raise exception 'invalid_kind';
  end if;

  insert into public.workspaces (name, kind, created_by)
  values (trim(p_name), p_kind, uid)
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');

  insert into public.categories (user_id, workspace_id, name)
  select uid, ws, n from unnest(public.default_category_names()) as n;

  return ws;
end;
$$;

-- Cria um convite (link) para o espaço. Só dono.
create function public.create_workspace_invite(p_ws uuid, p_role text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok uuid;
begin
  if not public.is_member(p_ws, 'owner') then
    raise exception 'forbidden';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'invalid_role';
  end if;

  insert into public.workspace_invites (workspace_id, role, note)
  values (p_ws, p_role, nullif(trim(p_note), ''))
  returning token into tok;
  return tok;
end;
$$;

-- Entra no espaço com o link. Convite vale uma vez e expira.
create function public.accept_workspace_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.workspace_invites;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.workspace_invites where token = p_token;
  if not found or inv.expires_at < now() then
    raise exception 'invite_invalid';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, inv.role)
  on conflict (workspace_id, user_id) do nothing;

  delete from public.workspace_invites where id = inv.id;
  return inv.workspace_id;
end;
$$;

-- Registro de pagamento: o lançamento nasce no espaço do compromisso, criado por quem registra.
create or replace function public.settle_commitment(
  p_commitment uuid,
  p_seq integer,
  p_date date,
  p_mode text,
  p_amount_cents bigint default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  c public.commitments;
  tx_id uuid;
begin
  if p_mode not in ('create', 'mark', 'skip') then
    raise exception 'invalid_mode';
  end if;
  if p_seq is null or p_seq < 1 then
    raise exception 'invalid_seq';
  end if;

  select * into c from public.commitments where id = p_commitment;
  if not found then
    raise exception 'commitment_not_found';
  end if;
  if c.total_occurrences is not null and p_seq > c.total_occurrences then
    raise exception 'invalid_seq';
  end if;

  if p_mode = 'create' then
    insert into public.transactions
      (user_id, workspace_id, kind, amount_cents, occurred_on, description, category_id, account_id, card_id)
    values
      ((select auth.uid()), c.workspace_id, 'expense', coalesce(p_amount_cents, c.amount_cents), p_date,
       c.description, c.category_id, c.account_id, c.card_id)
    returning id into tx_id;
  end if;

  insert into public.commitment_settlements
    (user_id, workspace_id, commitment_id, seq, status, settled_on, transaction_id)
  values
    ((select auth.uid()), c.workspace_id, c.id, p_seq,
     case when p_mode = 'skip' then 'skipped' else 'paid' end, p_date, tx_id);

  return tx_id;
end;
$$;

revoke all on function public.is_member(uuid, text) from public, anon;
revoke all on function public.current_workspace() from public, anon;
revoke all on function public.create_workspace(text, text) from public, anon;
revoke all on function public.create_workspace_invite(uuid, text, text) from public, anon;
revoke all on function public.accept_workspace_invite(uuid) from public, anon;
revoke all on function public.keep_one_owner() from public, anon, authenticated;
grant execute on function public.is_member(uuid, text) to authenticated;
grant execute on function public.current_workspace() to authenticated;
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.create_workspace_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;
