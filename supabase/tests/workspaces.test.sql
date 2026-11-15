-- Espaços: migração dos dados antigos, isolamento, papéis, convites.
\set L '''11111111-0000-0000-0000-000000000001'''
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''

-- =================================================================== dados antigos
select tests.assert((select count(*) from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
                     where m.user_id = :L and m.role = 'owner' and w.name = 'Pessoal') = 1,
                    'usuário antigo ganhou 1 espaço Pessoal como dono');
select tests.assert((select count(distinct workspace_id) from (
    select workspace_id from public.accounts where user_id = :L union all
    select workspace_id from public.credit_cards where user_id = :L union all
    select workspace_id from public.categories where user_id = :L union all
    select workspace_id from public.transactions where user_id = :L union all
    select workspace_id from public.commitments where user_id = :L union all
    select workspace_id from public.commitment_settlements where user_id = :L union all
    select workspace_id from public.tax_params where user_id = :L) x) = 1,
  'todos os dados antigos foram para o mesmo espaço');
select tests.assert((select count(*) from public.categories where user_id = :L) = 15, 'categorias antigas preservadas (15)');
select tests.assert((select count(*) from public.transactions where user_id = :L and external_hash = 'hash-legado-1') = 1, 'lançamento e hash antigos preservados');

select tests.login(:L);
select tests.assert((select count(*) from public.accounts) = 1 and (select count(*) from public.transactions) = 1,
                    'usuário antigo, sem cabeçalho, continua vendo seus dados (compatível com o app antigo)');
select tests.allowed($q$insert into public.accounts (name) values ('Nova antiga')$q$, 'insert sem workspace_id usa o espaço padrão');
select tests.assert((select count(*) from public.accounts) = 2, 'a nova conta caiu no espaço padrão');
reset role;

-- =================================================================== novos usuários
insert into auth.users (id, email) values (:A, 'a@exemplo.com'), (:B, 'b@exemplo.com'), (:C, 'c@exemplo.com');
select tests.assert((select count(*) from public.workspace_members where user_id in (:A, :B, :C) and role = 'owner') = 3,
                    'gatilho cria espaço Pessoal para cada novo usuário');
select tests.assert((select count(*) from public.categories c join public.workspace_members m on m.workspace_id = c.workspace_id
                     where m.user_id = :A) = 15, 'novo usuário recebe 15 categorias no espaço');

-- espaços (guardados em tabela temporária visível aos papéis)
create table tests.ws (name text primary key, id uuid);
grant all on tests.ws to authenticated;
insert into tests.ws select 'A_pessoal', workspace_id from public.workspace_members where user_id = :A;
insert into tests.ws select 'B_pessoal', workspace_id from public.workspace_members where user_id = :B;

-- =================================================================== criar espaço e alternar
select tests.login(:A);
insert into tests.ws select 'A_empresa', public.create_workspace('Empresa', 'professional');
select tests.assert((select count(*) from public.workspace_members where workspace_id = (select id from tests.ws where name='A_empresa') and role='owner' and user_id = :A) = 1,
                    'create_workspace: criador vira dono');
select tests.blocked($q$select public.create_workspace('x', 'inexistente')$q$, 'tipo de espaço inválido');

select tests.allowed($q$insert into public.accounts (name) values ('A-pessoal-1')$q$, 'A cria conta no espaço padrão');
select tests.login(:A, (select id from tests.ws where name='A_empresa'));
select tests.assert((select count(*) from public.categories) = 15, 'espaço novo tem 15 categorias próprias');
select tests.allowed($q$insert into public.accounts (name) values ('A-empresa-1')$q$, 'A cria conta no espaço Empresa (cabeçalho)');
select tests.assert((select count(*) from public.accounts) = 1 and (select name from public.accounts) = 'A-empresa-1',
                    'com cabeçalho Empresa, só vê dados da Empresa');
select tests.login(:A);
select tests.assert((select count(*) from public.accounts) = 1 and (select name from public.accounts) = 'A-pessoal-1',
                    'sem cabeçalho, só vê dados do espaço Pessoal');

-- =================================================================== cabeçalho malicioso
select tests.login(:A, (select id from tests.ws where name='B_pessoal'));
select tests.assert((select count(*) from public.accounts) = 0, 'cabeçalho de espaço alheio: não vê nada');
select tests.blocked($q$insert into public.accounts (name) values ('invasão')$q$, 'cabeçalho de espaço alheio: não escreve');
select tests.login(:A, '00000000-0000-0000-0000-000000000000');
select tests.assert((select count(*) from public.accounts) = 0, 'cabeçalho com espaço inexistente: não vê nada (e não cai em outro)');
select tests.assert(public.current_workspace() is null, 'current_workspace() é NULL para cabeçalho inválido');

-- =================================================================== integridade entre espaços
select tests.login(:A, (select id from tests.ws where name='A_empresa'));
reset role;
create table tests.ids (k text primary key, id uuid);
grant all on tests.ids to authenticated;
insert into tests.ids select 'acc_pessoal', id from public.accounts where name = 'A-pessoal-1';
insert into tests.ids select 'acc_empresa', id from public.accounts where name = 'A-empresa-1';

select tests.login(:A, (select id from tests.ws where name='A_empresa'));
select tests.blocked(format($q$insert into public.transactions (kind, amount_cents, occurred_on, account_id) values ('income', 100, '2026-11-01', %L)$q$,
                            (select id from tests.ids where k='acc_pessoal')),
                     'lançamento no espaço A referenciando conta de outro espaço (mesmo usuário)');
select tests.allowed(format($q$insert into public.transactions (kind, amount_cents, occurred_on, account_id) values ('income', 100, '2026-11-01', %L)$q$,
                            (select id from tests.ids where k='acc_empresa')),
                     'lançamento referenciando conta do mesmo espaço');
select tests.blocked($q$insert into public.accounts (name, user_id) values ('falso', 'bbbbbbbb-0000-0000-0000-000000000002')$q$,
                     'gravar user_id de outra pessoa');

-- =================================================================== convites e papéis
insert into tests.ids select 'inv_editor', public.create_workspace_invite((select id from tests.ws where name='A_empresa'), 'editor', 'sócio');
insert into tests.ids select 'inv_viewer', public.create_workspace_invite((select id from tests.ws where name='A_empresa'), 'viewer', 'contador');
select tests.blocked($q$select public.create_workspace_invite((select id from tests.ws where name='A_empresa'), 'owner')$q$, 'convite com papel owner');
reset role;
create table tests.tok (k text primary key, token uuid);
grant all on tests.tok to authenticated;
insert into tests.tok select 'editor', token from public.workspace_invites where role = 'editor';
insert into tests.tok select 'viewer', token from public.workspace_invites where role = 'viewer';

-- B não é dono: não cria convite
select tests.login(:B, (select id from tests.ws where name='B_pessoal'));
select tests.blocked($q$select public.create_workspace_invite((select id from tests.ws where name='A_empresa'), 'editor')$q$, 'não-dono criando convite');
select tests.blocked($q$select public.accept_workspace_invite('00000000-0000-0000-0000-0000000000ff')$q$, 'token inexistente');
select tests.assert((select count(*) from public.workspace_invites) = 0, 'não-membro não vê convites');

-- B entra como editor
select tests.allowed($q$select public.accept_workspace_invite((select token from tests.tok where k='editor'))$q$, 'B aceita convite de editor');
select tests.blocked($q$select public.accept_workspace_invite((select token from tests.tok where k='editor'))$q$, 'convite usado não vale de novo');
select tests.login(:B, (select id from tests.ws where name='A_empresa'));
select tests.assert((select count(*) from public.accounts) = 1, 'B (editor) vê a conta da Empresa');
select tests.allowed($q$insert into public.accounts (name) values ('B-na-empresa')$q$, 'B (editor) cria conta na Empresa');
select tests.assert((select user_id from public.accounts where name='B-na-empresa') = :B::uuid, 'user_id registra quem criou (B)');
select tests.blocked($q$update public.workspaces set name = 'Roubada' where id = (select id from tests.ws where name='A_empresa')$q$, 'editor renomeando o espaço compartilhado');
select tests.blocked($q$delete from public.workspaces where id = (select id from tests.ws where name='A_empresa')$q$, 'editor apagando o espaço compartilhado');
select tests.assert((select count(*) from public.workspaces where name = 'Pessoal') >= 1, 'o espaço próprio do editor segue intacto');
select tests.login(:A, (select id from tests.ws where name='A_empresa'));
select tests.assert((select count(*) from public.accounts) = 2, 'A vê a conta que B criou (espaço compartilhado)');
select tests.allowed($q$update public.accounts set name = 'A-empresa-1 (editada)' where name = 'A-empresa-1'$q$, 'dono edita conta');

-- C entra como somente leitura
select tests.login(:C, (select id from tests.ws where name='A_empresa'));
select tests.assert((select count(*) from public.accounts) = 0, 'C ainda não é membro: não vê nada');
select tests.allowed($q$select public.accept_workspace_invite((select token from tests.tok where k='viewer'))$q$, 'C aceita convite de leitura');
select tests.assert((select count(*) from public.accounts) = 2, 'C (leitura) vê as contas');
select tests.blocked($q$insert into public.accounts (name) values ('C-tenta')$q$, 'leitura não cria');
select tests.blocked($q$update public.accounts set name = 'hack'$q$, 'leitura não edita');
select tests.blocked($q$delete from public.accounts$q$, 'leitura não apaga');
select tests.assert((select count(*) from public.workspace_members where workspace_id = (select id from tests.ws where name='A_empresa')) = 3, 'C enxerga a lista de membros');

-- convite expirado
reset role;
update public.workspace_invites set expires_at = now() - interval '1 day';
insert into public.workspace_invites (workspace_id, role) values ((select id from tests.ws where name='A_empresa'), 'viewer');
update public.workspace_invites set expires_at = now() - interval '1 day';
insert into tests.tok select 'expirado', token from public.workspace_invites limit 1;
select tests.login(:B, (select id from tests.ws where name='B_pessoal'));
select tests.blocked($q$select public.accept_workspace_invite((select token from tests.tok where k='expirado'))$q$, 'convite expirado');

-- =================================================================== donos, saída e exclusão
select tests.login(:A, (select id from tests.ws where name='A_empresa'));
reset role;
select tests.login(:A);
do $$ begin
  begin
    delete from public.workspace_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and workspace_id = (select id from tests.ws where name='A_empresa');
    raise exception 'FALHOU: último dono saiu';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    raise notice 'ok: último dono não pode sair (%)', sqlerrm;
  end;
end $$;
-- C sai sozinho
select tests.login(:C);
select tests.allowed(format($q$delete from public.workspace_members where user_id = %L and workspace_id = %L$q$, :C, (select id from tests.ws where name='A_empresa')), 'membro sai por conta própria');
select tests.assert(not public.is_member((select id from tests.ws where name='A_empresa')), 'C não é mais membro');
-- dono remove B
select tests.login(:A);
select tests.allowed(format($q$delete from public.workspace_members where user_id = %L and workspace_id = %L$q$, :B, (select id from tests.ws where name='A_empresa')), 'dono remove membro');
select tests.login(:B, (select id from tests.ws where name='A_empresa'));
select tests.assert((select count(*) from public.accounts) = 0, 'B removido deixa de ver os dados');

-- apagar o espaço inteiro (cascata, inclusive donos)
select tests.login(:A);
select tests.allowed(format($q$delete from public.workspaces where id = %L$q$, (select id from tests.ws where name='A_empresa')), 'dono apaga o espaço (cascata passa pelo gatilho de último dono)');
reset role;
select tests.assert((select count(*) from public.accounts where workspace_id = (select id from tests.ws where name='A_empresa')) = 0, 'dados do espaço apagado sumiram');
select tests.assert((select count(*) from public.workspace_members where workspace_id = (select id from tests.ws where name='A_empresa')) = 0, 'membros do espaço apagado sumiram');
select tests.assert((select count(*) from public.accounts where name = 'A-pessoal-1') = 1, 'outro espaço do mesmo dono intacto');

-- =================================================================== função de pagamento
select tests.login(:A);
insert into tests.ids select 'com', id from (select gen_random_uuid() as id) s;
select tests.allowed($q$insert into public.commitments (id, kind, description, amount_cents, start_on, account_id)
  values ((select id from tests.ids where k='com'), 'subscription', 'Academia', 9000, '2026-11-10', (select id from tests.ids where k='acc_pessoal'))$q$, 'compromisso no espaço Pessoal');
select tests.allowed($q$select public.settle_commitment((select id from tests.ids where k='com'), 1, '2026-11-10', 'create')$q$, 'registrar pagamento cria lançamento');
select tests.assert((select workspace_id from public.transactions where description = 'Academia') = (select id from tests.ws where name='A_pessoal')
                    and (select user_id from public.transactions where description = 'Academia') = :A::uuid,
                    'lançamento nasce no espaço do compromisso, criado por quem registra');

-- =================================================================== RLS ligada em tudo
select tests.assert((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0, 'RLS ligada em todas as tabelas públicas');
reset role;
-- anon não executa as funções
set role anon;
select tests.blocked($q$select public.create_workspace('x')$q$, 'anon criando espaço');
select tests.blocked($q$select public.current_workspace()$q$, 'anon chamando current_workspace');
reset role;

-- =================================================================== endurecimento
set role anon;
select tests.blocked($q$select public.default_category_names()$q$, 'anon chamando default_category_names');
select tests.blocked($q$select public.is_member('00000000-0000-0000-0000-000000000000')$q$, 'anon chamando is_member');
reset role;
select tests.assert((select count(*) from information_schema.routine_privileges
                     where routine_schema = 'public' and grantee in ('anon', 'public')) = 0,
                    'nenhuma função pública executável por anon/public');

-- =================================================================== e-mail do membro
select tests.assert((select email from public.workspace_members where user_id = :L) = 'legado@exemplo.com', 'e-mail do membro antigo preenchido na migração');
select tests.assert((select email from public.workspace_members where user_id = :A limit 1) = 'a@exemplo.com', 'gatilho de novo usuário preenche o e-mail');
select tests.login(:B, (select id from tests.ws where name='B_pessoal'));
select tests.allowed($q$select public.accept_workspace_invite((select token from tests.tok where k='editor'))$q$, 'x') where false;
reset role;
set role anon;
select tests.blocked($q$select public.fill_member_email()$q$, 'anon chamando fill_member_email');
reset role;
