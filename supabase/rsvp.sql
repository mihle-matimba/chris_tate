-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists public.rsvps (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  first_name   text not null check (char_length(first_name) between 1 and 80),
  last_name    text not null check (char_length(last_name)  between 1 and 80),
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 150),
  attending    boolean not null,
  guest_count  int  not null default 1 check (guest_count between 1 and 8),
  -- 'both_nights' = Fri 12 & Sat 13 Feb, 'friday_only' = Fri 12 Feb only. Null when declining.
  stay         text check (stay in ('both_nights','friday_only')),
  diet         text check (char_length(diet)    <= 600),
  message      text check (char_length(message) <= 1000),
  guests       jsonb not null default '[]'::jsonb,   -- additional guests: [{first,last,diet}]
  constraint stay_required_when_attending check (attending = false or stay is not null)
);

-- One row per email: re-submitting updates the earlier RSVP instead of creating a duplicate.
create unique index if not exists rsvps_email_key on public.rsvps (lower(email));

-- Lock the table down: nobody can read or write it directly from the website.
alter table public.rsvps enable row level security;
revoke all on public.rsvps from anon, authenticated;

-- The website may only call this function (validates + upserts).
create or replace function public.submit_rsvp(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attending boolean := (payload->>'attending') = 'yes';
  v_count     int     := case when v_attending then greatest(1, least(8, coalesce((payload->>'guests')::int, 1))) else 1 end;
  v_stay      text    := case when v_attending then nullif(payload->>'stay','') else null end;
begin
  if coalesce(payload->>'attending','') not in ('yes','no') then
    raise exception 'attendance required';
  end if;
  if v_attending and v_stay is null then
    raise exception 'stay required';
  end if;

  insert into public.rsvps (first_name, last_name, email, attending, guest_count, stay, diet, message, guests)
  values (
    left(trim(payload->>'first'), 80), left(trim(payload->>'last'), 80), left(trim(payload->>'email'), 150),
    v_attending, v_count, v_stay,
    left(nullif(trim(payload->>'diet'), ''), 600),
    left(nullif(trim(payload->>'message'), ''), 1000),
    case when v_attending then coalesce(payload->'guests_list', '[]'::jsonb) else '[]'::jsonb end
  )
  on conflict (lower(email)) do update set
    first_name = excluded.first_name, last_name = excluded.last_name,
    attending = excluded.attending, guest_count = excluded.guest_count, stay = excluded.stay,
    diet = excluded.diet, message = excluded.message, guests = excluded.guests,
    updated_at = now();
end;
$$;

revoke all on function public.submit_rsvp(jsonb) from public;
grant execute on function public.submit_rsvp(jsonb) to anon;
