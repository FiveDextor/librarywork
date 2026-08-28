-- Galaxy Library database rebuild
-- This removes the old books table and creates a safer two-table setup.
-- Run this in Supabase SQL Editor.

drop table if exists public.loans cascade;
drop table if exists public.books cascade;

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  category text,
  status text not null default 'available'
    check (status in ('available', 'borrowed')),
  created_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  borrower_name text not null,
  borrower_contact text,
  borrowed_by uuid not null references auth.users(id),
  borrowed_at timestamptz not null default now(),
  returned_at timestamptz
);

create index loans_book_id_idx on public.loans(book_id);
create index loans_active_idx on public.loans(book_id) where returned_at is null;

alter table public.books enable row level security;
alter table public.loans enable row level security;

-- Everyone can see the public book catalogue.
create policy "Public can read books"
on public.books
for select
to anon, authenticated
using (true);

-- ONLY the one librarian Google account can change books.
create policy "Librarian can insert books"
on public.books
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

create policy "Librarian can update books"
on public.books
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

create policy "Librarian can delete books"
on public.books
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

-- Borrower details are private to the librarian.
create policy "Librarian can read loans"
on public.loans
for select
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

create policy "Librarian can create loans"
on public.loans
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
  and borrowed_by = auth.uid()
);

create policy "Librarian can update loans"
on public.loans
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

-- Optional starter books.
-- Delete these INSERTs if you want an empty library.
insert into public.books (title, author, category)
values
  ('สามก๊ก', 'หลอกว้านจง', 'วรรณกรรม'),
  ('ไซอิ๋ว', 'อู๋เฉิงเอิน', 'วรรณกรรม');
