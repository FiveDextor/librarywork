-- ============================================================
-- GALAXY LIBRARY - INVENTORY + GOOGLE ACCOUNTS
-- Librarian: raminbaandit4@gmail.com
-- Any authenticated Google user: inspect, borrow, return own loans
-- Librarian: add, delete, change inventory, return any loan
-- Automatic return: 30 days
-- Run this whole file in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- Clean rebuild of the library data.
drop function if exists public.borrow_book(uuid) cascade;
drop function if exists public.return_book(uuid) cascade;
drop function if exists public.expire_overdue_loans() cascade;
drop function if exists public.set_book_inventory(uuid, integer) cascade;
drop table if exists public.loans cascade;
drop table if exists public.books cascade;

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  category text,
  isbn text,
  description text,
  total_copies integer not null default 1 check (total_copies >= 1),
  available_copies integer not null default 1 check (available_copies >= 0 and available_copies <= total_copies),
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

-- ================= BOOKS =================
create policy "Anyone can view books"
on public.books for select to anon, authenticated using (true);

create policy "Librarian can add books"
on public.books for insert to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com');

create policy "Librarian can update books"
on public.books for update to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com');

create policy "Librarian can delete books"
on public.books for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com');

-- ================= LOANS =================
create policy "Users can view own loans"
on public.loans for select to authenticated
using (
  borrowed_by = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com'
);

-- Direct inserts/updates are intentionally blocked below.
-- Borrow/return must use the security-definer functions.
revoke insert, update, delete on public.loans from authenticated;
grant select on public.loans to authenticated;

-- ================= BORROW =================
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

  select * into v_book from public.books where id = p_book_id for update;
  if not found then raise exception 'Book not found'; end if;
  if v_book.available_copies <= 0 then raise exception 'No available copies'; end if;

  -- One active copy per user for a title.
  if exists (
    select 1 from public.loans
    where book_id = p_book_id and borrowed_by = auth.uid() and returned_at is null
  ) then
    raise exception 'You already borrowed this book';
  end if;

  v_name := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() ->> 'email',
    'Google User'
  );
  v_email := auth.jwt() ->> 'email';

  insert into public.loans(book_id, borrower_name, borrower_contact, borrowed_by, borrowed_at, due_at)
  values(p_book_id, v_name, v_email, auth.uid(), now(), now() + interval '30 days');

  update public.books
  set available_copies = available_copies - 1
  where id = p_book_id;
end;
$$;

revoke all on function public.borrow_book(uuid) from public;
grant execute on function public.borrow_book(uuid) to authenticated;

-- ================= RETURN =================
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
  if auth.uid() is null then raise exception 'You must be signed in'; end if;

  v_is_librarian := lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com';

  select * into v_loan
  from public.loans
  where book_id = p_book_id
    and returned_at is null
    and (borrowed_by = auth.uid() or v_is_librarian)
  order by borrowed_at desc
  limit 1
  for update;

  if not found then raise exception 'No active loan for this book'; end if;

  update public.loans set returned_at = now() where id = v_loan.id;
  update public.books set available_copies = least(total_copies, available_copies + 1) where id = p_book_id;
end;
$$;

revoke all on function public.return_book(uuid) from public;
grant execute on function public.return_book(uuid) to authenticated;

-- ================= INVENTORY =================
create or replace function public.set_book_inventory(p_book_id uuid, p_total_copies integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrowed integer;
  v_is_librarian boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  v_is_librarian := lower(coalesce(auth.jwt() ->> 'email','')) = 'raminbaandit4@gmail.com';
  if not v_is_librarian then raise exception 'Librarian only'; end if;
  if p_total_copies < 1 then raise exception 'Inventory must be at least 1'; end if;

  select count(*)::integer into v_borrowed
  from public.loans where book_id = p_book_id and returned_at is null;

  if p_total_copies < v_borrowed then
    raise exception 'Inventory cannot be lower than currently borrowed copies (%)', v_borrowed;
  end if;

  update public.books
  set total_copies = p_total_copies,
      available_copies = p_total_copies - v_borrowed
  where id = p_book_id;

  if not found then raise exception 'Book not found'; end if;
end;
$$;

revoke all on function public.set_book_inventory(uuid, integer) from public;
grant execute on function public.set_book_inventory(uuid, integer) to authenticated;

-- ================= AUTO RETURN =================
create or replace function public.expire_overdue_loans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_loan record;
begin
  for v_loan in
    select id, book_id from public.loans
    where returned_at is null and due_at <= now()
    for update
  loop
    update public.loans set returned_at = now() where id = v_loan.id;
    update public.books set available_copies = least(total_copies, available_copies + 1) where id = v_loan.book_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_overdue_loans() from public;
grant execute on function public.expire_overdue_loans() to anon, authenticated;

-- ================= STARTER BOOKS =================
insert into public.books (title, author, category, description, total_copies, available_copies)
values
('สามก๊ก', 'หลอกว้านจง', 'วรรณกรรม', 'มหากาพย์ประวัติศาสตร์จีนว่าด้วยสงคราม การเมือง และกลยุทธ์ของยุคสามก๊ก', 2, 2),
('ไซอิ๋ว', 'อู๋เฉิงเอิน', 'วรรณกรรม', 'การเดินทางไปชมพูทวีปของพระถังซัมจั๋งพร้อมเหล่าศิษย์และเรื่องราวการผจญภัย', 1, 1);

-- ============================================================
-- OPTIONAL AUTOMATIC HOURLY JOB
-- If pg_cron is available in your Supabase project, uncomment:
-- create extension if not exists pg_cron;
-- select cron.schedule('galaxy-library-auto-return','0 * * * *','select public.expire_overdue_loans();');
-- ============================================================
