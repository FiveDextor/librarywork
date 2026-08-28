-- ============================================================
-- GALAXY LIBRARY - COMPLETE SUPABASE DATABASE
-- ============================================================
-- Librarian: raminbaandit4@gmail.com
-- Any Google-authenticated account can borrow/return.
-- Normal users cannot add/delete books or see other users' loans.
-- Loans automatically expire after 30 days.
-- ============================================================

create extension if not exists pgcrypto;

-- Remove the previous version so this is a clean rebuild.
drop function if exists public.borrow_book(uuid) cascade;
drop function if exists public.return_book(uuid) cascade;
drop function if exists public.expire_overdue_loans() cascade;
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
  borrowed_by uuid not null references auth.users(id) on delete cascade,
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '30 days'),
  returned_at timestamptz
);

create index loans_book_id_idx on public.loans(book_id);
create index loans_borrowed_by_idx on public.loans(borrowed_by);
create index loans_due_at_idx on public.loans(due_at) where returned_at is null;

alter table public.books enable row level security;
alter table public.loans enable row level security;

-- ============================================================
-- BOOK POLICIES
-- ============================================================

create policy "Anyone can view books"
on public.books
for select
to anon, authenticated
using (true);

create policy "Librarian can add books"
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

-- ============================================================
-- LOAN POLICIES
-- ============================================================

-- Users can see only their own loans.
-- The librarian can see all loans.
create policy "Users can view own loans"
on public.loans
for select
to authenticated
using (
  borrowed_by = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

-- The normal frontend uses the secure borrow_book() function,
-- but this policy also prevents users from inserting a loan for
-- somebody else if a direct insert is attempted.
create policy "Users can create own loans"
on public.loans
for insert
to authenticated
with check (
  borrowed_by = auth.uid()
);

-- The normal frontend uses return_book().
-- This policy allows only the borrower or librarian to update a loan.
create policy "Borrower or librarian can update loans"
on public.loans
for update
to authenticated
using (
  borrowed_by = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
)
with check (
  borrowed_by = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com'
);

-- ============================================================
-- SECURE BORROW FUNCTION
-- ============================================================

create or replace function public.borrow_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.books%rowtype;
  v_name text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select * into v_book
  from public.books
  where id = p_book_id
  for update;

  if not found then
    raise exception 'Book not found';
  end if;

  if v_book.status <> 'available' then
    raise exception 'This book is already borrowed';
  end if;

  v_name := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() ->> 'email',
    'Google User'
  );

  v_email := auth.jwt() ->> 'email';

  insert into public.loans (
    book_id,
    borrower_name,
    borrower_contact,
    borrowed_by,
    borrowed_at,
    due_at
  ) values (
    p_book_id,
    v_name,
    v_email,
    auth.uid(),
    now(),
    now() + interval '30 days'
  );

  update public.books
  set status = 'borrowed'
  where id = p_book_id;
end;
$$;

revoke all on function public.borrow_book(uuid) from public;
grant execute on function public.borrow_book(uuid) to authenticated;

-- ============================================================
-- SECURE RETURN FUNCTION
-- ============================================================

create or replace function public.return_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.loans%rowtype;
  v_is_librarian boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  v_is_librarian := lower(coalesce(auth.jwt() ->> 'email', '')) = 'raminbaandit4@gmail.com';

  select * into v_loan
  from public.loans
  where book_id = p_book_id
    and returned_at is null
    and (borrowed_by = auth.uid() or v_is_librarian)
  order by borrowed_at desc
  limit 1
  for update;

  if not found then
    raise exception 'You do not have an active loan for this book';
  end if;

  update public.loans
  set returned_at = now()
  where id = v_loan.id;

  update public.books
  set status = 'available'
  where id = p_book_id;
end;
$$;

revoke all on function public.return_book(uuid) from public;
grant execute on function public.return_book(uuid) to authenticated;

-- ============================================================
-- AUTOMATIC 30-DAY EXPIRATION
-- ============================================================

create or replace function public.expire_overdue_loans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.loans
    set returned_at = now()
    where returned_at is null
      and due_at <= now()
    returning book_id
  )
  update public.books b
  set status = 'available'
  where b.id in (select book_id from expired);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_overdue_loans() from public;
grant execute on function public.expire_overdue_loans() to anon, authenticated;

-- ============================================================
-- API PRIVILEGES
-- ============================================================
-- Users may read their permitted loans, but loan creation/return is
-- forced through the secure RPC functions above.

revoke insert, update, delete on public.loans from authenticated;
grant select on public.loans to authenticated;

-- ============================================================
-- STARTER BOOKS
-- Delete these INSERT statements if you want an empty library.
-- ============================================================

insert into public.books (title, author, category)
values
  ('สามก๊ก', 'หลอกว้านจง', 'วรรณกรรม'),
  ('ไซอิ๋ว', 'อู๋เฉิงเอิน', 'วรรณกรรม');

-- ============================================================
-- TRUE BACKGROUND AUTO-RETURN
-- ============================================================
-- Supabase Cron runs the cleanup every hour, even when nobody has
-- the website open. Supabase documents pg_cron as its recurring
-- Postgres job scheduler.

create extension if not exists pg_cron;

select cron.schedule(
  'galaxy-library-auto-return',
  '0 * * * *',
  $$select public.expire_overdue_loans();$$
);

-- The website also calls expire_overdue_loans() when loading the
-- catalogue, so an expired book is corrected immediately when the
-- site is opened rather than waiting for the next hourly job.
