-- Impressão digital do esquema público: compare entre bancos (teste local x produção).
with parts as (
  select 'col' as k, 'col:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') as x from information_schema.columns where table_schema='public'
  union all select 'con', 'con:'||conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace
  union all select 'idx', 'idx:'||indexname||':'||indexdef from pg_indexes where schemaname='public'
  union all select 'pol', 'pol:'||tablename||':'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'') from pg_policies where schemaname='public'
  union all select 'fn', 'fn:'||proname||':'||md5(prosrc)||':'||pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace
  union all select 'trg', 'trg:'||tgname||':'||tgenabled::text from pg_trigger where not tgisinternal and tgrelid in ('auth.users'::regclass, 'public.workspace_members'::regclass)
  union all select 'rls', 'rls:'||relname||':'||relrowsecurity::text from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v')
  union all select 'priv', 'priv:'||routine_name||':'||grantee||':'||privilege_type from information_schema.routine_privileges where routine_schema='public' and grantee in ('anon','authenticated','public')
)
select k, count(*) as n, md5(string_agg(x, E'\n' order by x)) as fingerprint from parts group by k order by k;
