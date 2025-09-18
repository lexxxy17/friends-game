-- Supabase schema for Friends Game
create extension if not exists "uuid-ossp";

-- Words
create table if not exists public.words (
  id uuid primary key default uuid_generate_v4(),
  ru text not null,
  en text not null,
  image_url text,
  created_at timestamptz not null default now()
);

-- Packs
create table if not exists public.packs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Pack-Word mapping
create table if not exists public.pack_words (
  pack_id uuid references public.packs(id) on delete cascade,
  word_id uuid references public.words(id) on delete cascade,
  primary key (pack_id, word_id)
);

-- Students (Telegram users)
create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  tg_user_id bigint unique,
  name text,
  username text,
  created_at timestamptz not null default now()
);

-- Assignments
create table if not exists public.assignments (
  id uuid primary key default uuid_generate_v4(),
  pack_id uuid not null references public.packs(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  status text not null default 'assigned',
  created_at timestamptz not null default now()
);

-- Reports
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_name text,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

-- Storage bucket for images (create via dashboard if needed)
-- In SQL:
-- select storage.create_bucket('images', public => true);

-- Optional: simple RLS off while using service role key
alter table public.words disable row level security;
alter table public.packs disable row level security;
alter table public.pack_words disable row level security;
alter table public.students disable row level security;
alter table public.assignments disable row level security;
alter table public.reports disable row level security;
