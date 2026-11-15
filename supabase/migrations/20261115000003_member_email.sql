-- Mostra quem é cada membro na tela do espaço. O e-mail só é legível por quem é do mesmo
-- espaço (a RLS de workspace_members já limita a leitura aos membros).
alter table public.workspace_members add column email text;

update public.workspace_members m
set email = u.email
from auth.users u
where u.id = m.user_id;

create function public.fill_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select u.email into new.email from auth.users u where u.id = new.user_id;
  return new;
end;
$$;

revoke all on function public.fill_member_email() from public, anon, authenticated;

create trigger workspace_members_fill_email
  before insert on public.workspace_members
  for each row execute function public.fill_member_email();
