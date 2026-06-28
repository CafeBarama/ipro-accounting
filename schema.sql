-- ============================================================
--  حسابداری و منابع انسانی کافه باراما
--  این فایل را یک‌بار در Supabase > SQL Editor اجرا کنید.
--  دسترسی فقط برای ایمیل مالک (owner) باز است.
-- ============================================================

-- 🔑 ایمیل مالک: فقط این ایمیل بعد از ورود به داده‌ها دسترسی دارد.
--    اگر خواستی عوضش کنی، همه‌جای 'habib@ldora.org' را در همین فایل تغییر بده.

-- ---------- نیروها ----------
create table if not exists employees (
  id              bigint generated always as identity primary key,
  full_name       text not null,         -- نام و نام خانوادگی
  national_id     text,                  -- کد ملی
  phone           text,                  -- تلفن
  address         text,                  -- آدرس
  position        text,                  -- سمت
  photo_url       text,                  -- عکس (مسیر فایل در باکت)
  start_date      date,                  -- تاریخ شروع به کار
  monthly_salary  numeric default 0,     -- حقوق ماهیانه (تومان)
  bank_name       text,                  -- نام بانک
  account_number  text,                  -- شماره حساب
  sheba           text,                  -- شماره شبا
  insurance_number text,                 -- شماره بیمه
  end_date        date,                  -- تاریخ ترک کار
  end_reason      text,                  -- علت ترک کار
  notes           text,
  active          boolean default true,
  created_at      timestamptz default now()
);
-- اگر جدول employees از قبل ساخته شده:
alter table employees add column if not exists end_date date;
alter table employees add column if not exists end_reason text;

-- ---------- پرداختی‌ها ----------
create table if not exists payments (
  id          bigint generated always as identity primary key,
  employee_id bigint references employees(id) on delete cascade,
  pay_date    date default current_date,
  amount      numeric default 0,         -- مبلغ (تومان)
  kind        text default 'حقوق',       -- حقوق / علی‌الحساب / پاداش / سایر
  note        text,
  receipt_path text,                      -- مسیر فایل رسید واریزی در باکت hr-files
  created_at  timestamptz default now()
);
alter table payments add column if not exists receipt_path text;

-- ---------- جریمه‌ها ----------
create table if not exists fines (
  id          bigint generated always as identity primary key,
  employee_id bigint references employees(id) on delete cascade,
  fine_date   date default current_date,
  amount      numeric default 0,         -- مبلغ جریمه (تومان)
  reason      text,
  created_at  timestamptz default now()
);

-- ---------- مصرف مواد غذایی ----------
create table if not exists food_usage (
  id          bigint generated always as identity primary key,
  employee_id bigint references employees(id) on delete cascade,
  usage_date  date default current_date,
  item        text,                      -- شرح/نام مورد مصرفی
  amount      numeric default 0,         -- هزینه (تومان)
  note        text,
  created_at  timestamptz default now()
);

-- ---------- بیمه (سهم کسر از حقوق نیرو) ----------
create table if not exists insurance (
  id          bigint generated always as identity primary key,
  employee_id bigint references employees(id) on delete cascade,
  period      text,                      -- ماه/دوره (مثلاً ۱۴۰۴-۰۴)
  amount      numeric default 0,         -- مبلغ کسر بیمه (تومان)
  ins_number  text,                      -- شماره بیمه
  note        text,
  created_at  timestamptz default now()
);

-- ---------- فایل‌های هر نیرو (مدرک/قرارداد) ----------
create table if not exists employee_files (
  id          bigint generated always as identity primary key,
  employee_id bigint references employees(id) on delete cascade,
  kind        text,                      -- مدرک / قرارداد
  file_name   text,
  path        text,                      -- مسیر در باکت hr-files
  created_at  timestamptz default now()
);

-- ---------- افزایش حقوق / سابقهٔ حقوق ----------
create table if not exists salary_changes (
  id          bigint generated always as identity primary key,
  employee_id bigint references employees(id) on delete cascade,
  change_date date default current_date,   -- تاریخ افزایش
  new_salary  numeric default 0,           -- حقوق جدید (تومان)
  rating      numeric,                     -- امتیاز عملکرد (۱ تا ۵)
  note        text,                        -- توضیح عملکرد
  created_at  timestamptz default now()
);

create index if not exists payments_emp_idx  on payments(employee_id);
create index if not exists fines_emp_idx      on fines(employee_id);
create index if not exists food_emp_idx       on food_usage(employee_id);
create index if not exists ins_emp_idx        on insurance(employee_id);
create index if not exists files_emp_idx      on employee_files(employee_id);

-- ============================================================
--  امنیت: فقط ایمیل مالک بعد از ورود دسترسی دارد
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['employees','payments','fines','food_usage','insurance','employee_files','salary_changes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format($f$create policy owner_all on %I for all to authenticated
       using ((auth.jwt()->>'email') = 'habib@ldora.org')
       with check ((auth.jwt()->>'email') = 'habib@ldora.org')$f$, t);
  end loop;
end $$;

-- ============================================================
--  باکت خصوصی برای فایل‌ها (مدارک/قرارداد/عکس)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('hr-files','hr-files', false)
on conflict (id) do nothing;

drop policy if exists owner_hr_files on storage.objects;
create policy owner_hr_files on storage.objects for all to authenticated
  using (bucket_id = 'hr-files' and (auth.jwt()->>'email') = 'habib@ldora.org')
  with check (bucket_id = 'hr-files' and (auth.jwt()->>'email') = 'habib@ldora.org');

-- ============================================================
--  حضور و غیاب + مرخصی   (این بخش را هم یک‌بار اجرا کنید)
--  • هر نیرو یک «توکن» دائمی دارد؛ لینک حضور و غیابش:
--      https://cafebarama.github.io/ipro-accounting/attendance.html?t=TOKEN
--  • صفحهٔ کارکنان بدون ورود کار می‌کند ولی امنیت با توکن + توابع
--    SECURITY DEFINER تأمین می‌شود (کلید عمومی به جدول‌ها دسترسی ندارد).
--  • ثبت ورود/خروج فقط داخل شعاع ۵۰ متری مختصات کافه مجاز است و
--    تشخیص شیفت/تأخیر سمت سرور (به وقت تهران) انجام می‌شود.
-- ============================================================

-- توکن دائمی لینک حضور و غیاب برای هر نیرو (به‌صورت خودکار برای نیروهای جدید هم ساخته می‌شود)
alter table employees add column if not exists att_token text default replace(gen_random_uuid()::text,'-','');
update employees set att_token = replace(gen_random_uuid()::text,'-','') where att_token is null;
create unique index if not exists employees_att_token_idx on employees(att_token);
-- شیفت دستی (اختیاری؛ خالی = تشخیص خودکار بر اساس زمان ورود)
alter table employees add column if not exists shift text;

-- ---------- ثبت ورود/خروج ----------
create table if not exists attendance (
  id            bigint generated always as identity primary key,
  employee_id   bigint references employees(id) on delete cascade,
  work_date     date not null,                 -- تاریخ کاری (به وقت تهران)
  shift         text,                          -- morning / evening
  check_in      timestamptz,
  check_out     timestamptz,
  check_in_lat  double precision,
  check_in_lng  double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  late_minutes  integer default 0,             -- دقایق تأخیر از شروع شیفت
  created_at    timestamptz default now()
);
create index if not exists attendance_emp_date_idx on attendance(employee_id, work_date);

-- ---------- درخواست مرخصی ----------
create table if not exists leave_requests (
  id            bigint generated always as identity primary key,
  employee_id   bigint references employees(id) on delete cascade,
  type          text not null,                 -- daily / hourly
  start_date    date not null,
  end_date      date not null,                 -- برای روزانه بازهٔ پایان؛ ساعتی = همان start_date
  hours         numeric,                       -- ساعتی: همان ساعت‌ها؛ روزانه: روزها×۸
  reason        text,
  status        text default 'pending',        -- pending / approved / rejected
  admin_note    text,
  decided_at    timestamptz,
  created_at    timestamptz default now()
);
create index if not exists leave_emp_idx on leave_requests(employee_id);

-- RLS: مدیر (owner) دسترسی کامل؛ کارکنان فقط از طریق توابع پایین
alter table attendance enable row level security;
alter table leave_requests enable row level security;
drop policy if exists owner_all on attendance;
create policy owner_all on attendance for all to authenticated
  using ((auth.jwt()->>'email') = 'habib@ldora.org')
  with check ((auth.jwt()->>'email') = 'habib@ldora.org');
drop policy if exists owner_all on leave_requests;
create policy owner_all on leave_requests for all to authenticated
  using ((auth.jwt()->>'email') = 'habib@ldora.org')
  with check ((auth.jwt()->>'email') = 'habib@ldora.org');

-- ---------- فاصلهٔ جغرافیایی (هاورساین) بر حسب متر ----------
create or replace function att_distance_m(lat1 double precision, lng1 double precision,
                                          lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2*6371000*asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)
  ));
$$;

-- ---------- وضعیت فعلی نیرو (برای صفحهٔ کارکنان) ----------
create or replace function att_whoami(p_token text)
returns json language plpgsql security definer set search_path=public as $$
declare e record; loc_ts timestamp; today date; rec record;
begin
  select * into e from employees where att_token = p_token and end_date is null;
  if not found then raise exception 'TOKEN_INVALID'; end if;
  loc_ts := now() at time zone 'Asia/Tehran';
  today  := loc_ts::date;
  select * into rec from attendance where employee_id=e.id and work_date=today order by id desc limit 1;
  return json_build_object(
    'employee_id', e.id,
    'name', e.full_name,
    'today', to_char(today,'YYYY-MM-DD'),
    'server_minutes', (extract(hour from loc_ts)*60 + extract(minute from loc_ts))::int,
    'open', (rec.check_in is not null and rec.check_out is null),
    'checked_in',  (rec.check_in is not null),
    'checked_out', (rec.check_out is not null),
    'shift', rec.shift,
    'late_minutes', coalesce(rec.late_minutes,0)
  );
end $$;

-- ---------- ثبت ورود ----------
create or replace function att_check_in(p_token text, p_lat double precision, p_lng double precision)
returns json language plpgsql security definer set search_path=public as $$
declare e record; loc_ts timestamp; today date; mins int; sh text; startm int; late int; dist double precision; existing record;
  c_lat constant double precision := 29.633853437124454;
  c_lng constant double precision := 52.47678888090585;
  c_radius constant double precision := 50;
begin
  select * into e from employees where att_token=p_token and end_date is null;
  if not found then raise exception 'TOKEN_INVALID'; end if;
  if p_lat is null or p_lng is null then raise exception 'NO_LOCATION'; end if;
  dist := att_distance_m(p_lat,p_lng,c_lat,c_lng);
  if dist > c_radius then raise exception 'OUT_OF_RANGE:%', round(dist); end if;
  loc_ts := now() at time zone 'Asia/Tehran';
  today  := loc_ts::date;
  select * into existing from attendance where employee_id=e.id and work_date=today and check_out is null order by id desc limit 1;
  if found then raise exception 'ALREADY_IN'; end if;
  mins := extract(hour from loc_ts)*60 + extract(minute from loc_ts);
  -- شیفت دستی در صورت تعیین، وگرنه تشخیص خودکار بر اساس زمان ورود (مرز ۱۳:۳۰)
  if e.shift in ('morning','evening') then sh := e.shift;
  elsif mins < 810 then sh := 'morning'; else sh := 'evening'; end if;
  if sh = 'morning' then startm := 480; else startm := 900; end if;   -- ۰۸:۰۰ / ۱۵:۰۰
  late := greatest(0, mins - startm);
  insert into attendance(employee_id,work_date,shift,check_in,check_in_lat,check_in_lng,late_minutes)
    values(e.id,today,sh,now(),p_lat,p_lng,late);
  return json_build_object('ok',true,'shift',sh,'late_minutes',late,'distance',round(dist));
end $$;

-- ---------- ثبت خروج ----------
create or replace function att_check_out(p_token text, p_lat double precision, p_lng double precision)
returns json language plpgsql security definer set search_path=public as $$
declare e record; loc_ts timestamp; today date; dist double precision; rec record;
  c_lat constant double precision := 29.633853437124454;
  c_lng constant double precision := 52.47678888090585;
  c_radius constant double precision := 50;
begin
  select * into e from employees where att_token=p_token and end_date is null;
  if not found then raise exception 'TOKEN_INVALID'; end if;
  if p_lat is null or p_lng is null then raise exception 'NO_LOCATION'; end if;
  dist := att_distance_m(p_lat,p_lng,c_lat,c_lng);
  if dist > c_radius then raise exception 'OUT_OF_RANGE:%', round(dist); end if;
  loc_ts := now() at time zone 'Asia/Tehran';
  today  := loc_ts::date;
  select * into rec from attendance where employee_id=e.id and work_date=today and check_out is null order by id desc limit 1;
  if not found then raise exception 'NO_OPEN_CHECKIN'; end if;
  update attendance set check_out=now(), check_out_lat=p_lat, check_out_lng=p_lng where id=rec.id;
  return json_build_object('ok',true);
end $$;

-- ---------- درخواست مرخصی ----------
create or replace function att_request_leave(p_token text, p_type text, p_start date, p_end date, p_hours numeric, p_reason text)
returns json language plpgsql security definer set search_path=public as $$
declare e record; days int; hrs numeric;
begin
  select * into e from employees where att_token=p_token and end_date is null;
  if not found then raise exception 'TOKEN_INVALID'; end if;
  if p_type not in ('daily','hourly') then raise exception 'BAD_TYPE'; end if;
  if p_start is null then raise exception 'BAD_DATE'; end if;
  if p_type='daily' then
    if p_end is null or p_end < p_start then raise exception 'BAD_RANGE'; end if;
    days := (p_end - p_start) + 1; hrs := days*24;
    insert into leave_requests(employee_id,type,start_date,end_date,hours,reason)
      values(e.id,'daily',p_start,p_end,hrs,p_reason);
  else
    if p_hours is null or p_hours<=0 then raise exception 'BAD_HOURS'; end if;
    insert into leave_requests(employee_id,type,start_date,end_date,hours,reason)
      values(e.id,'hourly',p_start,p_start,p_hours,p_reason);
  end if;
  return json_build_object('ok',true);
end $$;

-- ---------- تاریخچهٔ خود نیرو (برای صفحهٔ کارکنان) ----------
create or replace function att_my_status(p_token text)
returns json language plpgsql security definer set search_path=public as $$
declare e record;
begin
  select * into e from employees where att_token=p_token and end_date is null;
  if not found then raise exception 'TOKEN_INVALID'; end if;
  return json_build_object(
    'attendance', (select coalesce(json_agg(row_to_json(a) order by a.work_date desc),'[]'::json) from (
        select work_date, shift, check_in, check_out, late_minutes
        from attendance where employee_id=e.id order by work_date desc limit 15) a),
    'leaves', (select coalesce(json_agg(row_to_json(l) order by l.id desc),'[]'::json) from (
        select id, type, start_date, end_date, hours, reason, status, admin_note
        from leave_requests where employee_id=e.id order by id desc limit 15) l)
  );
end $$;

-- اجازهٔ فراخوانی توابع برای کلید عمومی (anon) — فقط همین توابع، نه جدول‌ها
grant execute on function att_whoami(text)                                              to anon, authenticated;
grant execute on function att_check_in(text,double precision,double precision)          to anon, authenticated;
grant execute on function att_check_out(text,double precision,double precision)         to anon, authenticated;
grant execute on function att_request_leave(text,text,date,date,numeric,text)           to anon, authenticated;
grant execute on function att_my_status(text)                                           to anon, authenticated;
