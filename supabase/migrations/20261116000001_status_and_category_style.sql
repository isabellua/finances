-- Lançamento pago x previsto: só o pago entra no saldo das contas.
alter table public.transactions
  add column status text not null default 'paid' check (status in ('paid', 'pending'));

create index transactions_ws_pending_idx
  on public.transactions (workspace_id, occurred_on)
  where status = 'pending';

-- Saldo por conta considera apenas lançamentos pagos (mesmas colunas de antes).
create or replace view public.account_balances
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
  on (t.account_id = a.id or t.transfer_account_id = a.id)
 and t.status = 'paid'
group by a.id;

-- Cor e ícone (emoji) opcionais por categoria.
alter table public.categories
  add column color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  add column icon text check (icon is null or length(icon) between 1 and 8);
