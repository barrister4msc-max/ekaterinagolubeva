-- ===== ENUM + ROLES =====
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "Users can view own roles"
on public.user_roles for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins can view all roles"
on public.user_roles for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage roles"
on public.user_roles for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- ===== PROFILES =====
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles viewable by owner"
on public.profiles for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = user_id);

-- ===== UPDATED_AT TRIGGER =====
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- ===== ON SIGNUP: create profile, make first user admin =====
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  select not exists (select 1 from public.user_roles where role = 'admin') into is_first;

  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== SITE SETTINGS (singleton) =====
create table public.site_settings (
  id int primary key default 1,
  hero_image_url text,
  hero_object_position_x numeric not null default 50,
  hero_object_position_y numeric not null default 30,
  hero_scale numeric not null default 1.0,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

insert into public.site_settings (id) values (1);

alter table public.site_settings enable row level security;

create policy "Anyone can read site settings"
on public.site_settings for select
to anon, authenticated
using (true);

create policy "Admins can update site settings"
on public.site_settings for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create trigger update_site_settings_updated_at
before update on public.site_settings
for each row execute function public.update_updated_at_column();

-- ===== STORAGE BUCKET =====
insert into storage.buckets (id, name, public)
values ('hero', 'hero', true)
on conflict (id) do nothing;

create policy "Hero images publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'hero');

create policy "Admins can upload hero images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'hero' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can update hero images"
on storage.objects for update
to authenticated
using (bucket_id = 'hero' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete hero images"
on storage.objects for delete
to authenticated
using (bucket_id = 'hero' and public.has_role(auth.uid(), 'admin'));