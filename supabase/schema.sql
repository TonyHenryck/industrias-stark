-- Pode ser rodado inteiro, quantas vezes precisar, no SQL Editor do Supabase.
-- Cada registro do sistema (produto, unidade, movimentação, cliente, fornecedor, conta) é uma linha com o JSON em `data`.

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.members enable row level security;  -- sem policies: só o SQL Editor mexe aqui

create or replace function public.is_member() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid())
$$;

create table if not exists public.products  (id text primary key, data jsonb not null);
create table if not exists public.units     (id text primary key, data jsonb not null);
create table if not exists public.moves     (id text primary key, data jsonb not null);
create table if not exists public.customers (id text primary key, data jsonb not null);
create table if not exists public.suppliers (id text primary key, data jsonb not null);
create table if not exists public.bills     (id text primary key, data jsonb not null);

do $$
declare t text;
begin
  foreach t in array array['products','units','moves','customers','suppliers','bills'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros" on public.%I', t);
    execute format('create policy "membros" on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    -- Atualização em tempo real entre os aparelhos
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;   -- já estava na publicação
    end;
  end loop;
end $$;

-- Depois de criar os usuários em Authentication > Users, libere os dois:
-- insert into public.members (user_id)
-- select id from auth.users where email in ('seu@email.com', 'dela@email.com')
-- on conflict do nothing;
