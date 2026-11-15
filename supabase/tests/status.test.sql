-- Status pago/previsto e estilo de categoria.
\set U '''dddddddd-0000-0000-0000-000000000004'''
insert into auth.users (id, email) values (:U, 'd@exemplo.com');

select tests.login(:U);
insert into public.accounts (id, name, opening_balance_cents) values ('a1111111-0000-0000-0000-000000000001', 'Conta', 100000);
insert into public.transactions (kind, amount_cents, occurred_on, account_id, status) values
  ('income',  50000, '2026-11-01', 'a1111111-0000-0000-0000-000000000001', 'paid'),
  ('expense', 20000, '2026-11-02', 'a1111111-0000-0000-0000-000000000001', 'paid'),
  ('expense', 30000, '2026-11-20', 'a1111111-0000-0000-0000-000000000001', 'pending'),
  ('income',  10000, '2026-11-25', 'a1111111-0000-0000-0000-000000000001', 'pending');

select tests.assert((select balance_cents from public.account_balances) = 130000,
                    'saldo = inicial + pagos (1000 + 500 - 200); previstos não entram');
select tests.assert((select count(*) from public.transactions where status = 'pending') = 2, 'dois previstos guardados');

select tests.allowed($q$update public.transactions set status = 'paid' where status = 'pending' and kind = 'expense'$q$, 'marcar previsto como pago');
select tests.assert((select balance_cents from public.account_balances) = 100000, 'saldo cai quando o previsto vira pago (1300 - 300)');
select tests.blocked($q$update public.transactions set status = 'talvez'$q$, 'status inválido');
select tests.assert((select status from public.transactions where occurred_on = '2026-11-01') = 'paid', 'lançamento antigo é pago por padrão');

-- transferência prevista não mexe nos saldos até ser paga
select tests.allowed($q$insert into public.accounts (id, name) values ('a2222222-0000-0000-0000-000000000002', 'Outra')$q$, 'segunda conta');
select tests.allowed($q$insert into public.transactions (kind, amount_cents, occurred_on, account_id, transfer_account_id, status)
  values ('transfer', 5000, '2026-11-26', 'a1111111-0000-0000-0000-000000000001', 'a2222222-0000-0000-0000-000000000002', 'pending')$q$, 'transferência prevista');
select tests.assert((select balance_cents from public.account_balances where account_id = 'a2222222-0000-0000-0000-000000000002') = 0, 'transferência prevista não credita o destino');

-- estilo de categoria
select tests.allowed($q$update public.categories set color = '#1a8f5a', icon = '🛒' where lower(name) = 'mercado'$q$, 'cor e ícone em categoria');
select tests.blocked($q$update public.categories set color = 'verde' where lower(name) = 'mercado'$q$, 'cor inválida');
select tests.blocked($q$update public.categories set icon = 'ícone-muito-longo-demais' where lower(name) = 'mercado'$q$, 'ícone longo demais');
reset role;

-- =================================================================== banco da conta
select tests.login('dddddddd-0000-0000-0000-000000000004'::uuid);
select tests.allowed($q$update public.accounts set bank_slug = 'nubank' where name = 'Conta'$q$, 'bank_slug válido');
select tests.assert((select bank_slug from public.accounts where name = 'Conta') = 'nubank', 'bank_slug gravado');
select tests.blocked($q$update public.accounts set bank_slug = 'Nubank Roxo!' where name = 'Conta'$q$, 'bank_slug com caracteres inválidos');
select tests.allowed($q$update public.accounts set bank_slug = null where name = 'Conta'$q$, 'bank_slug pode ficar vazio (contas antigas)');
reset role;
