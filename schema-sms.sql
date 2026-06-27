-- ============================================================
--  پیامک (SMS) — اتصال به سامانهٔ پیامک‌پنل / ملی‌پیامک
--  • ارسال امن از سمت سرور با pg_net؛ رمز در جدول خصوصی (بدون دسترسی API).
--  • مدیر لاگین‌کرده (یا اجرای مستقیم در SQL) به هر شماره می‌تواند بفرستد؛
--    اپ سفارش‌گیری (بدون لاگین) فقط به شماره‌های ثبت‌شده در سیستم.
--  • سقف روزانه برای جلوگیری از سوءاستفاده از اعتبار.
-- ============================================================
create extension if not exists pg_net;

-- پیکربندی خصوصی پیامک (هیچ policy ندارد → از طریق API خوانده نمی‌شود)
create table if not exists sms_config (
  id        smallint primary key default 1,
  username  text,
  password  text,
  sender    text,                 -- شماره خط ارسال اختصاصی
  daily_cap int  default 200,     -- سقف ارسال روزانه
  base_url  text default 'https://rest.payamak-panel.com/api/SendSMS/SendSMS',
  constraint sms_config_single check (id = 1)
);
alter table sms_config enable row level security;

-- سابقهٔ ارسال‌ها (برای سقف روزانه و گزارش)
create table if not exists sms_log (
  id         bigint generated always as identity primary key,
  to_number  text,
  body       text,
  context    text,                -- order / payment / leave / test / manual
  status     text,
  req_id     bigint,
  created_at timestamptz default now()
);
alter table sms_log enable row level security;
drop policy if exists owner_all on sms_log;
create policy owner_all on sms_log for all to authenticated
  using ((auth.jwt()->>'email') = 'habib@ldora.org')
  with check ((auth.jwt()->>'email') = 'habib@ldora.org');

-- نرمال‌سازی شماره (حذف غیررقم + تبدیل ارقام فارسی)
create or replace function sms_normalize(p text) returns text language sql immutable as $$
  select regexp_replace(translate(coalesce(p,''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '\D', '', 'g');
$$;

-- تابع اصلی ارسال پیامک
create or replace function send_sms(p_to text, p_text text, p_context text default 'manual')
returns json language plpgsql security definer set search_path = public, net as $$
declare cfg sms_config; n text; cnt int; rid bigint; is_owner boolean; known boolean;
begin
  select * into cfg from sms_config where id = 1;
  if cfg.username is null or cfg.password is null or cfg.sender is null then
    raise exception 'SMS_NOT_CONFIGURED'; end if;

  n := sms_normalize(p_to);
  if length(n) < 10 then raise exception 'BAD_NUMBER'; end if;
  if p_text is null or length(trim(p_text)) = 0 then raise exception 'EMPTY_TEXT'; end if;

  -- اجرای مستقیم در SQL (بدون JWT) یا مدیرِ لاگین‌کرده = مورد اعتماد
  is_owner := (auth.jwt() is null) or ((auth.jwt() ->> 'email') = 'habib@ldora.org');

  -- تماس بدون اعتماد (اپ سفارش‌گیری): فقط به شماره‌های موجود در سیستم
  if not is_owner then
    select exists(
      select 1 from orders    where right(sms_normalize(phone),10) = right(n,10)
      union all
      select 1 from employees where right(sms_normalize(phone),10) = right(n,10)
    ) into known;
    if not known then raise exception 'UNKNOWN_NUMBER'; end if;
  end if;

  -- سقف روزانه
  select count(*) into cnt from sms_log
    where created_at::date = (now() at time zone 'Asia/Tehran')::date;
  if cnt >= cfg.daily_cap then raise exception 'DAILY_CAP'; end if;

  -- ارسال (غیرهمزمان) با pg_net
  select net.http_post(
    url     := cfg.base_url,
    body    := jsonb_build_object('username', cfg.username, 'password', cfg.password,
                                  'to', n, 'from', cfg.sender, 'text', p_text),
    headers := jsonb_build_object('Content-Type', 'application/json')
  ) into rid;

  insert into sms_log(to_number, body, context, status, req_id)
    values (n, p_text, p_context, 'queued', rid);
  return json_build_object('ok', true, 'req_id', rid);
end $$;

grant execute on function send_sms(text, text, text) to anon, authenticated;
