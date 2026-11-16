-- Apelido opcional do cartão e parâmetros de "parcelar compra à vista" (ex.: Banco do Brasil).
-- Taxas em ppm (1e-6 da fração): 4,201% = 42010.
alter table public.credit_cards
  add column nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  add column split_rate_ppm int check (split_rate_ppm is null or split_rate_ppm between 0 and 300000),
  add column split_upfront_ppm int check (split_upfront_ppm is null or split_upfront_ppm between 0 and 100000),
  add column split_min_cents int check (split_min_cents is null or split_min_cents >= 0),
  add column split_max_parts int check (split_max_parts is null or split_max_parts between 2 and 48);
