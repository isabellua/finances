-- Simula o mínimo do Supabase que as migrações esperam (auth.users, auth.uid(), papéis).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;

-- Utilitários de teste
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.login(uid uuid, ws uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  perform set_config('request.headers', case when ws is null then '' else json_build_object('x-workspace-id', ws)::text end, false);
  execute 'set role authenticated';
end $$;

create function tests.assert(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Executa um comando que DEVE falhar (erro ou 0 linhas afetadas conta como bloqueio).
create function tests.blocked(sql text, label text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute sql;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALHOU: % foi permitido (% linhas)', label, n; end if;
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
  end;
  raise notice 'ok: % bloqueado', label;
end $$;

create function tests.allowed(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise notice 'ok: %', label;
end $$;

grant execute on all functions in schema tests to authenticated, anon;
