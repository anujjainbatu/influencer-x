-- Influencer Content Preview Platform — initial schema
-- Run this once against your Supabase project (Dashboard → SQL Editor → paste & run).

-- =============================================================================
-- Tables
-- =============================================================================

-- Creator → Drive provider connection. Refresh token stored encrypted (AES-GCM).
create table if not exists public.drive_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  account_email text,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Videos registered with the platform. Bytes live in the creator's drive; we only
-- store metadata + a pointer (provider_file_id).
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_file_id text not null,
  display_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists videos_user_id_idx on public.videos (user_id, created_at desc);

-- Share links. One token per (video, audience). Brand label is collected at view
-- time (no audience identity stored here; see view_events).
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists share_links_user_id_idx on public.share_links (user_id, created_at desc);
create index if not exists share_links_video_id_idx on public.share_links (video_id, created_at desc);

-- View audit log. One row per first-chunk request (we de-dupe by hashed
-- ip+ua+brand for ~10 min in app code, so refreshes don't spam).
create table if not exists public.view_events (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  brand_label text,
  ip_hash text,
  user_agent text,
  viewed_at timestamptz not null default now()
);

create index if not exists view_events_share_link_id_idx on public.view_events (share_link_id, viewed_at desc);

-- =============================================================================
-- Row-level security
-- =============================================================================
-- Creators access their own rows via the anon/authenticated key.
-- Public viewer flows (token validation, view logging, stream proxy) go through
-- the service-role key on the server and bypass RLS.

alter table public.drive_connections enable row level security;
alter table public.videos enable row level security;
alter table public.share_links enable row level security;
alter table public.view_events enable row level security;

drop policy if exists "own drive" on public.drive_connections;
create policy "own drive" on public.drive_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own videos" on public.videos;
create policy "own videos" on public.videos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own links" on public.share_links;
create policy "own links" on public.share_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own view events" on public.view_events;
create policy "own view events" on public.view_events
  for select
  using (
    exists (
      select 1 from public.share_links sl
      where sl.id = view_events.share_link_id and sl.user_id = auth.uid()
    )
  );
