-- default_category_names é constante e só é chamada por funções SECURITY DEFINER
-- (seed_default_categories, create_workspace): ninguém precisa executá-la direto.
alter function public.default_category_names() set search_path = '';
revoke all on function public.default_category_names() from public, anon, authenticated;

-- Nota para o linter "authenticated_security_definer_function_executable":
-- is_member() e current_workspace() PRECISAM ser executáveis por `authenticated` porque as
-- políticas RLS e o DEFAULT de workspace_id as chamam com o papel do usuário. Elas só
-- revelam dados do próprio chamador. create_workspace, create_workspace_invite e
-- accept_workspace_invite são a API de espaços (checam dono/token internamente).
-- Nenhuma é executável por `anon`.
