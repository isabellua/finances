-- Fase 3: compromissos (assinaturas, contas fixas, compras parceladas, contas avulsas)
-- e quitações por ocorrência. Ocorrência = (compromisso, nº sequencial); a data é
-- calculada pelo app a partir de start_on.

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('subscription', 'installment', 'fixed_bill', 'one_off')),
  description text not null check (length(trim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'yearly')),
  start_on date not null,
  total_occurrences integer check (total_occurrences is null or total_occurrences between 1 and 600),
  end_on date,
  account_id uuid,
  card_id uuid,
  category_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id),

  -- exatamente uma forma de pagamento: conta OU cartão
  constraint commitments_payment check ((account_id is not null) <> (card_id is not null)),
  constraint commitments_shape check (
    case kind
      -- coalesce: NULL >= 2 seria "desconhecido" e o CHECK deixaria passar
      when 'installment' then coalesce(total_occurrences, 0) >= 2 and frequency = 'monthly'
      when 'one_off' then coalesce(total_occurrences, 0) = 1
      else true
    end
  ),

  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id)
);

create index commitments_user_idx on public.commitments (user_id);
create index commitments_account_idx on public.commitments (account_id);
create index commitments_card_idx on public.commitments (card_id);
create index commitments_category_idx on public.commitments (category_id);

-- transactions precisa de unique (id, user_id) para a FK composta de quitações
alter table public.transactions add constraint transactions_id_user_key unique (id, user_id);

create table public.commitment_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  commitment_id uuid not null,
  seq integer not null check (seq >= 1),
  status text not null check (status in ('paid', 'skipped')),
  settled_on date not null,
  -- lançamento criado ao registrar o pagamento (nulo se foi só marcado como pago/pulado)
  transaction_id uuid,
  created_at timestamptz not null default now(),
  unique (commitment_id, seq),
  foreign key (commitment_id, user_id) references public.commitments (id, user_id)
    on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id)
    on delete set null (transaction_id)
);

create index commitment_settlements_user_idx on public.commitment_settlements (user_id);
create index commitment_settlements_tx_idx on public.commitment_settlements (transaction_id);

alter table public.commitments enable row level security;
alter table public.commitment_settlements enable row level security;

create policy commitments_owner on public.commitments
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy commitment_settlements_owner on public.commitment_settlements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Registra uma ocorrência, de forma atômica.
--   p_mode 'create': cria a saída (conta ou cartão do compromisso) e quita
--   p_mode 'mark'  : só marca como paga (o pagamento já está no extrato)
--   p_mode 'skip'  : pula a ocorrência
-- Retorna o id do lançamento criado (ou null).
create function public.settle_commitment(
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
      (user_id, kind, amount_cents, occurred_on, description, category_id, account_id, card_id)
    values
      (c.user_id, 'expense', coalesce(p_amount_cents, c.amount_cents), p_date,
       c.description, c.category_id, c.account_id, c.card_id)
    returning id into tx_id;
  end if;

  insert into public.commitment_settlements
    (user_id, commitment_id, seq, status, settled_on, transaction_id)
  values
    (c.user_id, c.id, p_seq, case when p_mode = 'skip' then 'skipped' else 'paid' end, p_date, tx_id);

  return tx_id;
end;
$$;

-- Desfaz: apaga a quitação e o lançamento que ela criou (se houve).
create function public.unsettle_commitment(p_commitment uuid, p_seq integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  tx_id uuid;
begin
  delete from public.commitment_settlements
  where commitment_id = p_commitment and seq = p_seq
  returning transaction_id into tx_id;
  if not found then
    raise exception 'settlement_not_found';
  end if;

  if tx_id is not null then
    delete from public.transactions where id = tx_id;
  end if;
end;
$$;

revoke all on function public.settle_commitment(uuid, integer, date, text, bigint) from public, anon;
revoke all on function public.unsettle_commitment(uuid, integer) from public, anon;
grant execute on function public.settle_commitment(uuid, integer, date, text, bigint) to authenticated;
grant execute on function public.unsettle_commitment(uuid, integer) to authenticated;
