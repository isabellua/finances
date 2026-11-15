-- Cor escolhida pelo usuário para contas de "outro banco" (sem logo na lista).
alter table public.accounts
  add column bank_color text check (bank_color is null or bank_color ~ '^#[0-9a-fA-F]{6}$');
