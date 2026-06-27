create extension if not exists pgcrypto;

drop table if exists public.post_views;
drop table if exists public.post_likes;
drop table if exists public.comments;
drop table if exists public.posts;
drop table if exists public.profiles;
drop table if exists public.board_state;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 80),
  body text not null,
  board text not null default 'free' check (board in ('free', 'notice')),
  images jsonb not null default '[]'::jsonb,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_views enable row level security;

create policy "profiles_select_all"
on public.profiles for select
to anon, authenticated
using (true);

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_delete_admin"
on public.profiles for delete
to authenticated
using (public.is_admin());

create policy "posts_select_all"
on public.posts for select
to anon, authenticated
using (true);

create policy "posts_insert_auth"
on public.posts for insert
to authenticated
with check (
  author_id = auth.uid()
  and (board = 'free' or public.is_admin())
);

create policy "posts_update_owner_or_admin"
on public.posts for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

create policy "posts_delete_owner_or_admin"
on public.posts for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

create policy "comments_select_all"
on public.comments for select
to anon, authenticated
using (true);

create policy "comments_insert_auth"
on public.comments for insert
to authenticated
with check (author_id = auth.uid());

create policy "comments_delete_owner_or_admin"
on public.comments for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

create policy "likes_select_all"
on public.post_likes for select
to anon, authenticated
using (true);

create policy "likes_insert_own_not_author"
on public.post_likes for insert
to authenticated
with check (
  user_id = auth.uid()
  and not exists (
    select 1 from public.posts
    where posts.id = post_likes.post_id
      and posts.author_id = auth.uid()
  )
);

create policy "likes_delete_own"
on public.post_likes for delete
to authenticated
using (user_id = auth.uid());

create policy "views_select_all"
on public.post_views for select
to anon, authenticated
using (true);

create policy "views_insert_own"
on public.post_views for insert
to authenticated
with check (user_id = auth.uid());

create policy "views_update_own"
on public.post_views for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
