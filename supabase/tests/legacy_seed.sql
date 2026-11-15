-- Dados criados ANTES da migração de espaços (como estão hoje no banco real).
-- Inseridos como superusuário (sem RLS), com user_id explícito.
insert into auth.users (id, email) values ('11111111-0000-0000-0000-000000000001', 'legado@exemplo.com');

insert into public.accounts (id, user_id, name, institution, opening_balance_cents)
values ('a0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Itaú', 'Itaú', 100000);

insert into public.credit_cards (id, user_id, account_id, name, brand, closing_day, due_day)
values ('c0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', 'Itaú Visa', 'Visa', 5, 12);

insert into public.transactions (id, user_id, kind, amount_cents, occurred_on, description, card_id, category_id, external_hash)
values ('e0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'expense', 2500,
        '2026-11-05', 'Mercado', 'c0000000-0000-0000-0000-000000000001',
        (select id from public.categories where user_id = '11111111-0000-0000-0000-000000000001' and lower(name) = 'mercado'),
        'hash-legado-1');

insert into public.commitments (id, user_id, kind, description, amount_cents, start_on, card_id)
values ('d0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'subscription',
        'Netflix', 5590, '2026-11-10', 'c0000000-0000-0000-0000-000000000001');

insert into public.commitment_settlements (user_id, commitment_id, seq, status, settled_on)
values ('11111111-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'paid', '2026-11-10');

insert into public.tax_params (user_id, key, rate_bps, valid_from)
values ('11111111-0000-0000-0000-000000000001', 'iof_card_international', 350, '2025-07-01');
