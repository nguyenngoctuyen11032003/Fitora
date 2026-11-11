-- Fitora: gói dịch vụ (tùy chỉnh được), hạn mức quét AI theo gói, quản trị viên, thanh toán chuyển khoản.
-- Chạy MỘT LẦN trong Supabase SQL editor (idempotent — chạy lại không hỏng), hoặc chép vào
-- Note_mytasks/supabase/migrations/. Thay thế file 20261111000100 cũ nếu bạn đã chạy nó.
--
-- Bảo mật: mọi quyền admin được kiểm tra Ở SERVER bằng bảng fit_admins + fit_is_admin(); giao diện chỉ ẩn/hiện nút.
-- KHÔNG lưu mật khẩu admin ở bất kỳ đâu trong code. Tài khoản admin phải tồn tại trong auth.users (đăng ký bình thường).
--
-- KIỂM TRA: fit_ai_quota_consume viết lại theo mô tả docs/PLAN.md (000300) — so với bản đang chạy
-- (\sf public.fit_ai_quota_consume) trước khi ghi đè. fit_admin_set_password / fit_admin_set_banned đụng vào bảng
-- nội bộ auth.users / auth.sessions của Supabase.

-- ───────────────────────── Gói ─────────────────────────
create table if not exists public.fit_plan_defs (
  key           text primary key check (key ~ '^[a-z0-9_]{2,20}$'),
  name          text not null check (char_length(name) between 1 and 40),
  daily_scans   int  not null check (daily_scans between 0 and 1000),
  price_vnd     int  not null default 0 check (price_vnd >= 0),
  duration_days int  check (duration_days is null or duration_days > 0),   -- null = không hết hạn
  description   text check (description is null or char_length(description) <= 300),
  purchasable   boolean not null default false,
  active        boolean not null default true,
  sort          int  not null default 0,
  updated_at    timestamptz not null default now()
);
alter table public.fit_plan_defs enable row level security;
revoke all on public.fit_plan_defs from anon, authenticated;
grant select on public.fit_plan_defs to authenticated;
drop policy if exists fit_plan_defs_read on public.fit_plan_defs;
create policy fit_plan_defs_read on public.fit_plan_defs for select to authenticated using (true);

insert into public.fit_plan_defs (key, name, daily_scans, price_vnd, duration_days, description, purchasable, sort) values
  ('free', 'Thường', 5,  0,     null, 'Quét món AI 5 lượt mỗi ngày.', false, 0),
  ('pro',  'Pro',    20, 50000, null, 'Quét món AI 20 lượt mỗi ngày.', true,  1)
on conflict (key) do nothing;

create table if not exists public.fit_plans (
  user_id    uuid primary key references auth.users on delete cascade,
  plan       text not null default 'free',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.fit_plans add column if not exists expires_at timestamptz;
alter table public.fit_plans drop constraint if exists fit_plans_plan_check;
do $$ begin
  alter table public.fit_plans add constraint fit_plans_plan_fkey foreign key (plan) references public.fit_plan_defs (key) on update cascade;
exception when duplicate_object then null; end $$;
alter table public.fit_plans enable row level security;
revoke all on public.fit_plans from anon, authenticated;
grant select on public.fit_plans to authenticated;
drop policy if exists fit_plans_select_own on public.fit_plans;
create policy fit_plans_select_own on public.fit_plans for select to authenticated using (user_id = auth.uid());

-- ───────────────────────── Quản trị viên ─────────────────────────
create table if not exists public.fit_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.fit_admins enable row level security;
revoke all on public.fit_admins from anon, authenticated;   -- không policy ⇒ chỉ hàm security definer đọc được

create or replace function public.fit_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fit_admins where user_id = auth.uid())
$$;
revoke all on function public.fit_is_admin() from public, anon;
grant execute on function public.fit_is_admin() to authenticated;

-- ───────────────────────── Hạn mức quét ─────────────────────────
-- Gói hiệu lực: gói đang active và chưa hết hạn, ngược lại = 'free'.
create or replace function public.fit_effective_plan(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.plan from public.fit_plans p join public.fit_plan_defs d on d.key = p.plan
      where p.user_id = p_user and d.active and (p.expires_at is null or p.expires_at > now())),
    'free')
$$;
revoke all on function public.fit_effective_plan(uuid) from public, anon, authenticated;

create or replace function public.fit_ai_daily_limit(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select daily_scans from public.fit_plan_defs where key = public.fit_effective_plan(p_user)), 5)
$$;
revoke all on function public.fit_ai_daily_limit(uuid) from public, anon, authenticated;

-- p_limit giữ cho edge function cũ nhưng BỊ BỎ QUA: hạn mức do gói quyết định.
create or replace function public.fit_ai_quota_consume(p_limit int default 40)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_limit int;
  v_row int;
begin
  if v_uid is null then return false; end if;
  v_limit := public.fit_ai_daily_limit(v_uid);
  insert into public.fit_ai_usage as u (user_id, used_on, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, used_on) do update set count = u.count + 1 where u.count < v_limit
  returning 1 into v_row;
  return v_row is not null;
end $$;
revoke all on function public.fit_ai_quota_consume(int) from public, anon;
grant execute on function public.fit_ai_quota_consume(int) to authenticated;

-- ───────────────────────── Thanh toán ─────────────────────────
create table if not exists public.fit_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  plan_key    text not null references public.fit_plan_defs (key) on update cascade,
  amount_vnd  int  not null check (amount_vnd >= 0),
  proof_path  text not null check (char_length(proof_path) <= 300),
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 300),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users on delete set null
);
create index if not exists fit_payments_user_idx   on public.fit_payments (user_id, created_at desc);
create index if not exists fit_payments_status_idx on public.fit_payments (status, created_at desc);
alter table public.fit_payments enable row level security;
revoke all on public.fit_payments from anon, authenticated;
grant select on public.fit_payments to authenticated;
drop policy if exists fit_payments_select_own on public.fit_payments;
create policy fit_payments_select_own on public.fit_payments for select to authenticated using (user_id = auth.uid());
-- Không có policy ghi: người dùng gửi qua fit_submit_payment, admin duyệt qua fit_admin_review_payment.

-- Admin xem được ảnh chứng từ của mọi người (bucket private 'fitora').
drop policy if exists fitora_admin_read on storage.objects;
create policy fitora_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'fitora' and public.fit_is_admin());

create or replace function public.fit_submit_payment(p_plan text, p_proof_path text, p_note text default null)
returns public.fit_payments language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_def public.fit_plan_defs;
  v_row public.fit_payments;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  select * into v_def from public.fit_plan_defs where key = p_plan and active and purchasable;
  if not found then raise exception 'Gói này không thể mua.'; end if;
  if p_proof_path is null or p_proof_path not like v_uid::text || '/payments/%' then
    raise exception 'Ảnh chuyển khoản không hợp lệ.';
  end if;
  if (select count(*) from public.fit_payments where user_id = v_uid and status = 'pending') >= 3 then
    raise exception 'Bạn đang có yêu cầu chờ duyệt. Vui lòng đợi quản trị viên kiểm tra.';
  end if;
  insert into public.fit_payments (user_id, plan_key, amount_vnd, proof_path, note)
  values (v_uid, v_def.key, v_def.price_vnd, p_proof_path, nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.fit_submit_payment(text, text, text) from public, anon;
grant execute on function public.fit_submit_payment(text, text, text) to authenticated;

-- Trạng thái gói của chính mình (giao diện dùng để hiện huy hiệu, số lượt còn lại, quyền admin).
create or replace function public.fit_my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid), eff as (select public.fit_effective_plan((select uid from me)) as key)
  select jsonb_build_object(
    'plan',        (select key from eff),
    'name',        (select name from public.fit_plan_defs where key = (select key from eff)),
    'daily_limit', public.fit_ai_daily_limit((select uid from me)),
    'used',        coalesce((select count from public.fit_ai_usage where user_id = (select uid from me) and used_on = (now() at time zone 'utc')::date), 0),
    'expires_at',  (select expires_at from public.fit_plans where user_id = (select uid from me)),
    'is_admin',    public.fit_is_admin(),
    'pending_payments', (select count(*) from public.fit_payments where user_id = (select uid from me) and status = 'pending'))
$$;
revoke all on function public.fit_my_plan() from public, anon;
grant execute on function public.fit_my_plan() to authenticated;

-- ───────────────────────── RPC quản trị ─────────────────────────
create or replace function public.fit__require_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fit_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;
revoke all on function public.fit__require_admin() from public, anon, authenticated;

create or replace function public.fit_admin_list_users()
returns table (user_id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz,
               banned_until timestamptz, plan text, plan_expires_at timestamptz, scans_today int, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fit__require_admin();
  return query
    select u.id, u.email::text, pr.display_name::text, u.created_at, u.last_sign_in_at, u.banned_until,
           public.fit_effective_plan(u.id), fp.expires_at,
           coalesce(us.count, 0)::int, exists (select 1 from public.fit_admins a where a.user_id = u.id)
      from auth.users u
      left join public.profiles pr on pr.id = u.id
      left join public.fit_plans fp on fp.user_id = u.id
      left join public.fit_ai_usage us on us.user_id = u.id and us.used_on = (now() at time zone 'utc')::date
     order by u.created_at desc;
end $$;

create or replace function public.fit__grant_plan(p_user uuid, p_plan text, p_days int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fit_plan_defs where key = p_plan) then raise exception 'Gói không tồn tại.'; end if;
  insert into public.fit_plans (user_id, plan, expires_at, updated_at)
  values (p_user, p_plan, case when p_days is null or p_plan = 'free' then null else now() + make_interval(days => p_days) end, now())
  on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = now();
end $$;
revoke all on function public.fit__grant_plan(uuid, text, int) from public, anon, authenticated;

-- p_days null ⇒ dùng thời hạn mặc định của gói (null = không hết hạn).
create or replace function public.fit_admin_set_plan(p_user uuid, p_plan text, p_days int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_days int;
begin
  perform public.fit__require_admin();
  select coalesce(p_days, duration_days) into v_days from public.fit_plan_defs where key = p_plan;
  perform public.fit__grant_plan(p_user, p_plan, v_days);
end $$;

create or replace function public.fit_admin_list_payments(p_status text default null)
returns table (id uuid, user_id uuid, email text, display_name text, plan_key text, plan_name text, amount_vnd int,
               proof_path text, note text, status text, admin_note text, created_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fit__require_admin();
  return query
    select p.id, p.user_id, u.email::text, pr.display_name::text, p.plan_key, d.name, p.amount_vnd, p.proof_path,
           p.note, p.status, p.admin_note, p.created_at, p.reviewed_at
      from public.fit_payments p
      join auth.users u on u.id = p.user_id
      join public.fit_plan_defs d on d.key = p.plan_key
      left join public.profiles pr on pr.id = p.user_id
     where p_status is null or p.status = p_status
     order by (p.status = 'pending') desc, p.created_at desc
     limit 500;
end $$;

create or replace function public.fit_admin_review_payment(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pay public.fit_payments; v_days int;
begin
  perform public.fit__require_admin();
  select * into v_pay from public.fit_payments where id = p_id for update;
  if not found then raise exception 'Không thấy giao dịch.'; end if;
  if v_pay.status <> 'pending' then raise exception 'Giao dịch này đã được xử lý.'; end if;
  if p_approve then
    select duration_days into v_days from public.fit_plan_defs where key = v_pay.plan_key;
    perform public.fit__grant_plan(v_pay.user_id, v_pay.plan_key, v_days);
  end if;
  update public.fit_payments
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
end $$;

create or replace function public.fit_admin_save_plan(
  p_key text, p_name text, p_daily_scans int, p_price_vnd int, p_duration_days int,
  p_description text, p_purchasable boolean, p_active boolean, p_sort int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fit__require_admin();
  if p_key = 'free' and (p_purchasable or not p_active) then raise exception 'Gói Thường luôn bật và không bán.'; end if;
  insert into public.fit_plan_defs as d (key, name, daily_scans, price_vnd, duration_days, description, purchasable, active, sort, updated_at)
  values (p_key, btrim(p_name), p_daily_scans, p_price_vnd, p_duration_days, nullif(btrim(coalesce(p_description, '')), ''), p_purchasable, p_active, p_sort, now())
  on conflict (key) do update set name = excluded.name, daily_scans = excluded.daily_scans, price_vnd = excluded.price_vnd,
    duration_days = excluded.duration_days, description = excluded.description, purchasable = excluded.purchasable,
    active = excluded.active, sort = excluded.sort, updated_at = now();
end $$;

create or replace function public.fit_admin_delete_plan(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fit__require_admin();
  if p_key = 'free' then raise exception 'Không xóa được gói Thường.'; end if;
  update public.fit_plans set plan = 'free', expires_at = null, updated_at = now() where plan = p_key;
  delete from public.fit_plan_defs where key = p_key;   -- lỗi nếu còn giao dịch tham chiếu: hãy tắt gói thay vì xóa
end $$;

-- Khóa / mở khóa đăng nhập.
create or replace function public.fit_admin_set_banned(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fit__require_admin();
  if p_user = auth.uid() then raise exception 'Không thể tự khóa chính mình.'; end if;
  update auth.users set banned_until = case when p_banned then now() + interval '100 years' else null end where id = p_user;
  if p_banned then delete from auth.sessions where user_id = p_user; end if;
end $$;

-- Đặt lại mật khẩu trực tiếp (đăng xuất mọi thiết bị của người đó).
create or replace function public.fit_admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fit__require_admin();
  if p_password is null or char_length(p_password) < 8 then raise exception 'Mật khẩu tối thiểu 8 ký tự.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  delete from auth.sessions where user_id = p_user;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'fit_admin_list_users()', 'fit_admin_set_plan(uuid,text,int)', 'fit_admin_list_payments(text)',
    'fit_admin_review_payment(uuid,boolean,text)',
    'fit_admin_save_plan(text,text,int,int,int,text,boolean,boolean,int)', 'fit_admin_delete_plan(text)',
    'fit_admin_set_banned(uuid,boolean)', 'fit_admin_set_password(uuid,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ───────────────────────── Dữ liệu khởi tạo ─────────────────────────
-- Tài khoản của bạn là Pro:
select public.fit__grant_plan(id, 'pro', null) from auth.users where lower(email) = 'nguyenngoctuyen11032003@gmail.com';

-- Quản trị viên: tài khoản phải ĐÃ ĐĂNG KÝ (trang Đăng ký của app, hoặc Dashboard → Authentication → Add user).
-- Nếu chưa có, chạy lại đúng câu lệnh dưới sau khi tạo tài khoản.
insert into public.fit_admins (user_id) select id from auth.users where lower(email) = 'tt98tuyen@gmail.com'
on conflict do nothing;
