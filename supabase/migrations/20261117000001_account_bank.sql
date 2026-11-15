-- Banco escolhido numa lista (logo e cor vêm do app), em vez de texto digitado.
-- `institution` continua guardando o nome para exibição e para contas antigas.
alter table public.accounts
  add column bank_slug text check (bank_slug is null or bank_slug ~ '^[a-z0-9-]{2,30}$');
