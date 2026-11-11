-- Exclusão definitiva de conta/cartão junto com os lançamentos ligados a eles,
-- numa única transação (tudo ou nada). SECURITY INVOKER: a RLS continua valendo,
-- então cada usuário só apaga o que é seu.

create function public.delete_card(p_card uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.transactions where card_id = p_card;
  get diagnostics n = row_count;

  delete from public.credit_cards where id = p_card;
  if not found then
    raise exception 'card_not_found';
  end if;

  return n;
end;
$$;

create function public.delete_account(p_account uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n1 integer;
  n2 integer;
begin
  -- compras e pagamentos de fatura dos cartões da conta
  delete from public.transactions
  where card_id in (select id from public.credit_cards where account_id = p_account);
  get diagnostics n1 = row_count;

  delete from public.credit_cards where account_id = p_account;

  -- lançamentos da conta, inclusive transferências que chegam nela
  delete from public.transactions
  where account_id = p_account or transfer_account_id = p_account;
  get diagnostics n2 = row_count;

  delete from public.accounts where id = p_account;
  if not found then
    raise exception 'account_not_found';
  end if;

  return n1 + n2;
end;
$$;

revoke all on function public.delete_card(uuid) from public, anon;
revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_card(uuid) to authenticated;
grant execute on function public.delete_account(uuid) to authenticated;
