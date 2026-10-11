-- Rode este arquivo uma vez no SQL Editor do Supabase.
-- Cada registro do sistema (produto, unidade, movimentação) é uma linha com o JSON em `data`.

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.members enable row level security;  -- sem policies: só o SQL Editor mexe aqui

create or replace function public.is_member() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid())
$$;

create table if not exists public.products (id text primary key, data jsonb not null);
create table if not exists public.units    (id text primary key, data jsonb not null);
create table if not exists public.moves     (id text primary key, data jsonb not null);

alter table public.products enable row level security;
alter table public.units    enable row level security;
alter table public.moves    enable row level security;

create policy "membros" on public.products for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "membros" on public.units    for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "membros" on public.moves    for all to authenticated using (public.is_member()) with check (public.is_member());

-- Atualização em tempo real entre os aparelhos
alter publication supabase_realtime add table public.products, public.units, public.moves;

-- Depois de criar os dois usuários em Authentication > Users, libere os dois:
-- insert into public.members (user_id)
-- select id from auth.users where email in ('seu@email.com', 'dela@email.com');
