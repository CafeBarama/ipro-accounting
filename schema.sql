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
  created_at  timestamptz default now()
);

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
