-- Run in Supabase SQL Editor AFTER rsvp.sql. Adds accommodation to RSVPs.

alter table public.rsvps
  add column if not exists accommodation     jsonb not null default '[]'::jsonb,  -- [{id,people}]
  add column if not exists total_amount      int,
  add column if not exists payment_reference text;

create table if not exists public.room_rates (
  id text primary key, label text not null, short text not null, rate int not null check (rate>0), capacity int not null check (capacity>0)
);
alter table public.room_rates enable row level security;
revoke all on public.room_rates from anon, authenticated;

insert into public.room_rates (id,label,short,rate,capacity) values
  ('irafi-1','House Irafi - Room 1','Irafi R1',1600,2),
  ('irafi-2','House Irafi - Room 2','Irafi R2',1600,2),
  ('irafi-3','House Irafi - Room 3 (Honeymoon Suite)','Irafi R3',1925,2),
  ('ibala','Ibala-Bala Chalets - Ibala-Bala Chalet','Ibala-Bala',1045,20),
  ('malazi-1','Malazi Houses - Malazi 1','Malazi 1',950,8),
  ('malazi-2','Malazi Houses - Malazi 2','Malazi 2',950,12),
  ('malazi-3','Malazi Houses - Malazi 3','Malazi 3',950,12),
  ('malazi-4','Malazi Houses - Malazi 4','Malazi 4',950,12),
  ('malazi-5','Malazi Houses - Malazi 5','Malazi 5',950,10),
  ('inyati','Inyati - Inyati','Inyati',950,8),
  ('amani','Amani - Amani','Amani',850,6),
  ('sefata-a','Units - Sefata · Rooms 1 & 8','Sefata R1&8',1080,4),
  ('sefata-b','Units - Sefata · Rooms 2 to 7','Sefata R2-7',970,12),
  ('tulia-a','Units - Tulia · Rooms 1 & 8','Tulia R1&8',1080,4),
  ('tulia-b','Units - Tulia · Rooms 2 to 7','Tulia R2-7',970,12),
  ('ilanga-a','Units - Ilanga · Rooms 1 & 8','Ilanga R1&8',1080,4),
  ('ilanga-b','Units - Ilanga · Rooms 2 to 7','Ilanga R2-7',970,12),
  ('sehlala-a','Units - Sehlala · Rooms 1 & 8','Sehlala R1&8',1080,4),
  ('sehlala-b','Units - Sehlala · Rooms 2 to 7','Sehlala R2-7',970,12)
on conflict (id) do update set label=excluded.label, short=excluded.short, rate=excluded.rate, capacity=excluded.capacity;

-- Replaces submit_rsvp: now validates rooms, recomputes the price server-side (so it can't be tampered with)
-- and stores the payment reference.
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
  v_nights    int     := case v_stay when 'both_nights' then 2 when 'friday_only' then 1 else 0 end;
  v_total     int     := null;
  v_ref       text    := null;
  v_acc       jsonb   := '[]'::jsonb;
  v_people    int     := 0;
  v_names     text[]  := '{}';
  item        jsonb;
  rr          public.room_rates%rowtype;
  p           int;
begin
  if coalesce(payload->>'attending','') not in ('yes','no') then raise exception 'attendance required'; end if;
  if v_attending and v_stay is null then raise exception 'stay required'; end if;

  -- Once an RSVP has been marked paid it is locked: it can only be changed by the couple (from the dashboard / database).
  if exists (select 1 from public.rsvps where lower(email) = lower(trim(payload->>'email')) and paid) then
    raise exception 'rsvp_locked';
  end if;

  if v_attending then
    v_total := 0;
    for item in select * from jsonb_array_elements(coalesce(payload->'accommodation','[]'::jsonb)) loop
      select * into rr from public.room_rates where id = item->>'id';
      if not found then raise exception 'unknown room'; end if;
      p := (item->>'people')::int;
      if p is null or p < 1 or p > rr.capacity then raise exception 'bad room occupancy'; end if;
      v_people := v_people + p;
      v_total  := v_total + rr.rate * p * v_nights;
      v_names  := v_names || rr.short;
      v_acc    := v_acc || jsonb_build_array(jsonb_build_object('id', rr.id, 'people', p, 'names', coalesce((select jsonb_agg(left(n, 80)) from jsonb_array_elements_text(case when jsonb_typeof(item->'names') = 'array' then item->'names' else '[]'::jsonb end) n), '[]'::jsonb)));
    end loop;
    if jsonb_array_length(v_acc) = 0 then raise exception 'accommodation required'; end if;
    if v_people <> v_count then raise exception 'rooms must cover every guest'; end if;
    v_ref := left(trim(payload->>'first') || ' ' || trim(payload->>'last'), 40) || ' - ' || array_to_string(v_names, ', ');
  end if;

  insert into public.rsvps (first_name, last_name, email, attending, guest_count, stay, diet, message, guests, accommodation, total_amount, payment_reference)
  values (
    left(trim(payload->>'first'), 80), left(trim(payload->>'last'), 80), left(trim(payload->>'email'), 150),
    v_attending, v_count, v_stay,
    left(nullif(trim(payload->>'diet'), ''), 600),
    left(nullif(trim(payload->>'message'), ''), 1000),
    case when v_attending then coalesce(payload->'guests_list', '[]'::jsonb) else '[]'::jsonb end,
    v_acc, v_total, v_ref
  )
  on conflict (lower(email)) do update set
    first_name = excluded.first_name, last_name = excluded.last_name,
    attending = excluded.attending, guest_count = excluded.guest_count, stay = excluded.stay,
    diet = excluded.diet, message = excluded.message, guests = excluded.guests,
    accommodation = excluded.accommodation, total_amount = excluded.total_amount, payment_reference = excluded.payment_reference,
    updated_at = now();
end;
$$;

revoke all on function public.submit_rsvp(jsonb) from public;
grant execute on function public.submit_rsvp(jsonb) to anon;

-- ===== Payment tracking + per-guest room names (added later; safe to re-run) =====
alter table public.rsvps
  add column if not exists paid        boolean not null default false,
  add column if not exists paid_amount int,
  add column if not exists paid_at     timestamptz,
  add column if not exists pay_note    text;

-- Lets the RSVP form check, as soon as an email is typed, whether that RSVP is already locked (paid).
-- Returns only true/false; no other details are exposed.
create or replace function public.rsvp_is_locked(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.rsvps where lower(email) = lower(trim(p_email)) and paid);
$$;
revoke all on function public.rsvp_is_locked(text) from public;
grant execute on function public.rsvp_is_locked(text) to anon;
