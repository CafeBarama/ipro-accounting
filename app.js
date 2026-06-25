/* ============================================================
   حسابداری iPro — منطق برنامه
   ============================================================ */
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const fa = (n) => (n == null || isNaN(n) ? "۰" : Number(Math.round(n)).toLocaleString("fa-IR"));
const toman = (n) => fa(n) + " ت";
const faD = (s) => String(s||"").replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]);
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
let TT; function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(TT); TT=setTimeout(()=>t.classList.remove("show"),2400); }

let EMPLOYEES=[], PAY=[], FIN=[], FOOD=[], INS=[], CURRENT=null;

/* ---------------- ورود / احراز هویت ---------------- */
async function checkAuth(){
  const { data:{ session } } = await db.auth.getSession();
  if (session){ enterApp(session.user); } else { showLogin(); }
}
function showLogin(){ $("loginView").style.display="flex"; $("appView").style.display="none"; }
function enterApp(user){
  $("loginView").style.display="none"; $("appView").style.display="block";
  $("whoami").textContent = user.email;
  loadAll();
}
$("loginBtn").onclick = async () => {
  $("loginErr").style.display="none";
  const email=$("lg_email").value.trim(), password=$("lg_pass").value;
  if(!email||!password) return ($("loginErr").style.display="block", $("loginErr").textContent="ایمیل و رمز را وارد کنید");
  const { error } = await db.auth.signInWithPassword({ email, password });
  if(error){ $("loginErr").style.display="block"; $("loginErr").textContent="ورود ناموفق: "+error.message; return; }
  checkAuth();
};
$("signupBtn").onclick = async () => {
  $("loginErr").style.display="none";
  const email=$("lg_email").value.trim(), password=$("lg_pass").value;
  if(!email||password.length<6) return ($("loginErr").style.display="block", $("loginErr").textContent="ایمیل و یک رمز حداقل ۶ کاراکتری وارد کنید");
  const { data, error } = await db.auth.signUp({ email, password });
  if(error){ $("loginErr").style.display="block"; $("loginErr").textContent="خطا: "+error.message; return; }
  if(data.session) checkAuth();
  else { $("loginErr").style.display="block"; $("loginErr").style.background="#e6f4f0"; $("loginErr").style.color="#2e7d6b"; $("loginErr").textContent="حساب ساخته شد. اگر تأیید ایمیل لازم بود، ایمیلت را چک کن، بعد وارد شو."; }
};
$("logoutBtn").onclick = async () => { await db.auth.signOut(); showLogin(); };

/* ---------------- تب‌ها ---------------- */
document.querySelectorAll("#nav button[data-tab]").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll("#nav button[data-tab]").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); $("tab-"+b.dataset.tab).classList.add("active");
    if(b.dataset.tab==="report") renderReport();
  };
});
$("backBtn").onclick = ()=> showTab("staff");
function showTab(name){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  $("tab-"+name).classList.add("active");
  document.querySelectorAll("#nav button[data-tab]").forEach(x=>x.classList.toggle("active", x.dataset.tab===name));
}

/* ---------------- بارگذاری داده ---------------- */
async function loadAll(){
  const [emp,pay,fin,food,ins] = await Promise.all([
    db.from("employees").select("*").order("full_name"),
    db.from("payments").select("*"),
    db.from("fines").select("*"),
    db.from("food_usage").select("*"),
    db.from("insurance").select("*"),
  ]);
  if(emp.error){ toast("خطا در اتصال — schema را اجرا کردی؟"); console.error(emp.error); }
  EMPLOYEES=emp.data||[]; PAY=pay.data||[]; FIN=fin.data||[]; FOOD=food.data||[]; INS=ins.data||[];
  renderStaff();
  if(CURRENT) openEmployee(CURRENT, true);
}
function totals(id){
  const sum=(arr)=>arr.filter(r=>r.employee_id===id).reduce((a,r)=>a+(+r.amount||0),0);
  const e=EMPLOYEES.find(x=>x.id===id)||{};
  const salary=+e.monthly_salary||0, fines=sum(FIN), food=sum(FOOD), ins=sum(INS), paid=sum(PAY);
  const net=salary-fines-food-ins;
  return { salary, fines, food, ins, paid, net, remaining: net-paid };
}
const initials=(name)=> (name||"؟").trim().charAt(0);

/* ---------------- لیست نیروها ---------------- */
function renderStaff(){
  const term=$("staffSearch").value.trim();
  const list=EMPLOYEES.filter(e=>!term || (e.full_name||"").includes(term) || (e.phone||"").includes(term));
  $("staffEmpty").style.display = EMPLOYEES.length? "none":"block";
  $("staffList").innerHTML = list.map(e=>{
    const t=totals(e.id);
    return `<div class="emp-card" onclick="openEmployee(${e.id})" style="${e.end_date?'opacity:.7':''}">
      <div class="avatar">${initials(e.full_name)}</div>
      <div style="flex:1">
        <b>${e.full_name}</b> ${e.end_date?`<span class="pill" style="background:#fdecea;color:var(--danger)">ترک کار</span>`:``}
        <div class="muted" style="font-size:12.5px">${e.position||"—"} • حقوق ${toman(e.monthly_salary)}</div>
        <div style="font-size:12.5px;margin-top:4px">مانده: <b style="color:${t.remaining>0?'var(--danger)':'var(--ok)'}">${toman(t.remaining)}</b></div>
      </div>
    </div>`;
  }).join("");
}
$("staffSearch").oninput = renderStaff;

/* ---------------- افزودن/ویرایش نیرو ---------------- */
const empDlg=$("empDialog");
function openEmpDialog(e){
  $("empTitle").textContent = e? "ویرایش مشخصات":"نیروی جدید";
  $("e_id").value=e?.id||""; $("e_name").value=e?.full_name||""; $("e_position").value=e?.position||"";
  $("e_national").value=e?.national_id||""; $("e_phone").value=e?.phone||""; $("e_start").value=e?.start_date||"";
  $("e_salary").value=e?.monthly_salary??""; $("e_bank").value=e?.bank_name||""; $("e_account").value=e?.account_number||"";
  $("e_sheba").value=e?.sheba||""; $("e_insnum").value=e?.insurance_number||""; $("e_address").value=e?.address||"";
  $("e_end").value=e?.end_date||""; $("e_end_reason").value=e?.end_reason||"";
  $("e_notes").value=e?.notes||""; $("e_photo").value="";
  empDlg.showModal();
}
$("newEmpBtn").onclick=()=>openEmpDialog(null);
$("editEmpBtn").onclick=()=>openEmpDialog(EMPLOYEES.find(e=>e.id===CURRENT));
$("empCancel").onclick=()=>empDlg.close();
$("empSave").onclick=async()=>{
  const name=$("e_name").value.trim(); if(!name) return toast("نام را وارد کنید");
  const rec={
    full_name:name, position:$("e_position").value.trim()||null, national_id:$("e_national").value.trim()||null,
    phone:$("e_phone").value.trim()||null, start_date:$("e_start").value||null,
    monthly_salary:Number($("e_salary").value)||0, bank_name:$("e_bank").value.trim()||null,
    account_number:$("e_account").value.trim()||null, sheba:$("e_sheba").value.trim()||null,
    insurance_number:$("e_insnum").value.trim()||null, address:$("e_address").value.trim()||null,
    end_date:$("e_end").value||null, end_reason:$("e_end_reason").value.trim()||null,
    notes:$("e_notes").value.trim()||null
  };
  const id=$("e_id").value;
  let savedId=id;
  if(id){ const {error}=await db.from("employees").update(rec).eq("id",id); if(error)return toast("خطا در ذخیره"); }
  else { const {data,error}=await db.from("employees").insert(rec).select("id").single(); if(error)return toast("خطا در ذخیره"); savedId=data.id; }
  // عکس
  const pf=$("e_photo").files[0];
  if(pf){ const path=`photos/${savedId}_${pf.name}`;
    const up=await db.storage.from(FILES_BUCKET).upload(path, pf, {upsert:true});
    if(!up.error) await db.from("employees").update({photo_url:path}).eq("id",savedId);
  }
  toast("✓ ذخیره شد"); empDlg.close(); await loadAll();
  if(!id) openEmployee(savedId);
};

/* ---------------- پروندهٔ نیرو ---------------- */
async function openEmployee(id, keepTab){
  CURRENT=id; if(!keepTab) showTab("profile");
  const e=EMPLOYEES.find(x=>x.id===id); if(!e) return;
  $("p_name").textContent=e.full_name;
  $("p_meta").innerHTML=`${e.position||"—"} • شروع: ${e.start_date? faD(e.start_date) : "—"}`
    + (e.end_date?` • <span style="color:var(--danger);font-weight:700">ترک کار: ${faD(e.end_date)}${e.end_reason?" ("+e.end_reason+")":""}</span>`:"");
  $("p_avatar").textContent=initials(e.full_name);
  if(e.photo_url){ const s=await db.storage.from(FILES_BUCKET).createSignedUrl(e.photo_url,3600);
    if(s.data) $("p_avatar").innerHTML=`<img src="${s.data.signedUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`; }
  const D=[["کد ملی",e.national_id],["تلفن",e.phone],["حقوق ماهیانه",e.monthly_salary!=null?toman(e.monthly_salary):null],
    ["بانک",e.bank_name],["شماره حساب",e.account_number],["شماره شبا",e.sheba?("IR"+e.sheba):null],
    ["شماره بیمه",e.insurance_number],["تاریخ ترک کار",e.end_date],["علت ترک کار",e.end_reason],
    ["آدرس",e.address],["یادداشت",e.notes]];
  $("p_details").innerHTML=D.map(([k,v])=>`<div class="stat"><small>${k}</small><b style="font-size:14px">${v? String(v).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]) : "—"}</b></div>`).join("");
  // خلاصه
  const t=totals(id);
  $("p_summary").innerHTML=`
    <div class="stat"><small>حقوق ماهیانه</small><b>${toman(t.salary)}</b></div>
    <div class="stat red"><small>جریمه‌ها</small><b>${toman(t.fines)}</b></div>
    <div class="stat red"><small>هزینهٔ غذا</small><b>${toman(t.food)}</b></div>
    <div class="stat red"><small>بیمه (سهم نیرو)</small><b>${toman(t.ins)}</b></div>
    <div class="stat"><small>خالص قابل پرداخت</small><b>${toman(t.net)}</b></div>
    <div class="stat green"><small>پرداخت‌شده</small><b>${toman(t.paid)}</b></div>
    <div class="stat ${t.remaining>0?'red':'green'}"><small>مانده</small><b>${toman(t.remaining)}</b></div>`;
  renderFiles(id);
  renderRecList("payment"); renderRecList("fine"); renderRecList("food"); renderRecList("insurance");
}
window.openEmployee=openEmployee;

/* ---------------- فایل‌ها ---------------- */
async function renderFiles(id){
  const { data } = await db.from("employee_files").select("*").eq("employee_id",id).order("id",{ascending:false});
  $("p_files").innerHTML = (data&&data.length)? data.map(f=>`
    <div class="file-item">
      <span class="pill">${f.kind||"فایل"}</span>
      <span style="flex:1">${f.file_name||""}</span>
      <button class="btn ghost sm" onclick="viewFile('${f.path}')">مشاهده</button>
      <button class="btn danger sm" onclick="delFile(${f.id},'${f.path}')">حذف</button>
    </div>`).join("") : `<div class="muted" style="font-size:13px">فایلی آپلود نشده.</div>`;
}
$("uploadBtn").onclick=async()=>{
  const f=$("f_file").files[0]; if(!f) return toast("یک فایل انتخاب کنید");
  const path=`${CURRENT}/${Date.now()}_${f.name}`;
  const up=await db.storage.from(FILES_BUCKET).upload(path,f);
  if(up.error){ console.error(up.error); return toast("خطا در آپلود"); }
  await db.from("employee_files").insert({employee_id:CURRENT, kind:$("f_kind").value, file_name:f.name, path});
  $("f_file").value=""; toast("✓ آپلود شد"); renderFiles(CURRENT);
};
window.viewFile=async(path)=>{ const s=await db.storage.from(FILES_BUCKET).createSignedUrl(path,3600);
  if(s.data) window.open(s.data.signedUrl,"_blank"); else toast("خطا در باز کردن فایل"); };
window.delFile=async(id,path)=>{ if(!confirm("این فایل حذف شود؟"))return;
  await db.storage.from(FILES_BUCKET).remove([path]); await db.from("employee_files").delete().eq("id",id);
  toast("حذف شد"); renderFiles(CURRENT); };

/* ---------------- رکوردهای مالی ---------------- */
const REC={
  payment:{tbl:"payments", date:"pay_date", txt:"note", el:"p_payments", title:"ثبت پرداخت", txtLabel:"توضیح", kind:true},
  fine:   {tbl:"fines", date:"fine_date", txt:"reason", el:"p_fines", title:"ثبت جریمه", txtLabel:"علت جریمه", kind:false},
  food:   {tbl:"food_usage", date:"usage_date", txt:"item", el:"p_food", title:"ثبت مصرف مواد غذایی", txtLabel:"شرح مورد", kind:false},
  insurance:{tbl:"insurance", date:"period", txt:"ins_number", el:"p_insurance", title:"ثبت بیمه", txtLabel:"شماره بیمه", kind:false},
};
function dataOf(type){ return {payment:PAY,fine:FIN,food:FOOD,insurance:INS}[type]; }
function renderRecList(type){
  const c=REC[type]; const rows=dataOf(type).filter(r=>r.employee_id===CURRENT).sort((a,b)=>(b[c.date]||"").localeCompare(a[c.date]||""));
  $(c.el).innerHTML = rows.length? `<table><tbody>${rows.map(r=>`<tr>
      <td style="width:120px">${String(r[c.date]||"").replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d])}</td>
      <td><b>${toman(r.amount)}</b></td>
      ${c.kind?`<td>${r.kind||""}</td>`:""}
      <td style="color:var(--muted)">${r[c.txt]||""}</td>
      <td style="text-align:left">${type==='payment'?`<button class="btn ghost sm" onclick="printReceipt(${r.id})">رسید</button> `:""}<button class="btn danger sm" onclick="delRec('${type}',${r.id})">حذف</button></td>
    </tr>`).join("")}</tbody></table>` : `<div class="muted" style="font-size:13px">موردی ثبت نشده.</div>`;
}
const recDlg=$("recDialog");
window.addRecord=(type)=>{
  const c=REC[type]; $("r_type").value=type; $("recTitle").textContent=c.title;
  $("r_date").value=todayISO(); $("r_amount").value=""; $("r_text").value="";
  $("r_textLabel").textContent=c.txtLabel;
  $("r_kindWrap").style.display=c.kind?"block":"none";
  $("r_date").previousElementSibling; // noop
  recDlg.showModal();
};
$("recCancel").onclick=()=>recDlg.close();
$("recSave").onclick=async()=>{
  const type=$("r_type").value, c=REC[type];
  const rec={ employee_id:CURRENT, amount:Number($("r_amount").value)||0 };
  rec[c.date]=$("r_date").value||todayISO();
  rec[c.txt]=$("r_text").value.trim()||null;
  if(c.kind) rec.kind=$("r_kind").value;
  const {error}=await db.from(c.tbl).insert(rec);
  if(error){ console.error(error); return toast("خطا در ذخیره"); }
  toast("✓ ثبت شد"); recDlg.close(); await loadAll();
};
window.delRec=async(type,id)=>{ if(!confirm("حذف شود؟"))return;
  const {error}=await db.from(REC[type].tbl).delete().eq("id",id);
  if(error)return toast("خطا در حذف"); toast("حذف شد"); await loadAll(); };

/* ---------------- رسید پرداخت حقوق ---------------- */
window.printReceipt=(payId)=>{
  const p=PAY.find(x=>x.id===payId); if(!p) return;
  const e=EMPLOYEES.find(x=>x.id===p.employee_id)||{};
  const t=totals(e.id);
  const row=(k,v,c)=>`<tr><td class="k">${k}</td><td class="v" style="${c||''}">${v}</td></tr>`;
  const html=`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
<title>رسید پرداخت حقوق</title>
<link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
<style>
  *{box-sizing:border-box;font-family:Vazirmatn,system-ui,sans-serif}
  body{margin:0;background:#eef0f5;color:#1f2430;padding:20px}
  .sheet{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e7e9f0;border-radius:16px;padding:26px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
  .hd{text-align:center;border-bottom:2px solid #3b5bdb;padding-bottom:12px;margin-bottom:14px}
  .hd b{font-size:20px;color:#3b5bdb} .hd div{color:#7a8194;font-size:13px;margin-top:3px}
  .meta{display:flex;justify-content:space-between;font-size:12.5px;color:#7a8194;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:9px 6px;border-bottom:1px solid #eef0f5}
  td.k{color:#7a8194;width:45%} td.v{font-weight:700;text-align:left}
  .amount{background:#eaeefe;color:#3b5bdb;border-radius:12px;padding:14px;text-align:center;margin:16px 0;font-size:22px;font-weight:800}
  .amount small{display:block;color:#7a8194;font-weight:500;font-size:12px;margin-bottom:4px}
  .sign{display:flex;justify-content:space-between;margin-top:34px;font-size:13px;color:#7a8194}
  .sign div{text-align:center;width:45%} .sign .line{margin-top:40px;border-top:1px dashed #aab;padding-top:6px}
  .btn{display:block;margin:18px auto 0;background:#3b5bdb;color:#fff;border:0;padding:11px 22px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
  @media print{ body{background:#fff;padding:0} .sheet{box-shadow:none;border:0} .noprint{display:none} }
</style></head><body>
<div class="sheet">
  <div class="hd"><b>رسید پرداخت حقوق</b><div>کافه باراما — حسابداری iPro</div></div>
  <div class="meta"><span>شماره رسید: ${faD(p.id)}</span><span>تاریخ: ${faD(p[REC.payment.date]||"")}</span></div>
  <table>
    ${row("نام نیرو", e.full_name||"—")}
    ${row("کد ملی", faD(e.national_id||"—"))}
    ${row("سمت", e.position||"—")}
    ${row("بابت", p.kind||"حقوق")}
    ${p.note?row("توضیح", p.note):""}
  </table>
  <div class="amount"><small>مبلغ پرداختی</small>${faD((+p.amount||0).toLocaleString("en-US"))} تومان</div>
  <table>
    ${row("حقوق ماهیانه", toman(t.salary))}
    ${row("کسورات (جریمه+غذا+بیمه)", toman(t.fines+t.food+t.ins), "color:#d8584f")}
    ${row("خالص قابل پرداخت", toman(t.net))}
    ${row("کل پرداخت‌شده تا کنون", toman(t.paid), "color:#2e7d6b")}
    ${row("مانده", toman(t.remaining))}
  </table>
  <div class="sign"><div><div class="line">امضای پرداخت‌کننده</div></div><div><div class="line">امضای دریافت‌کننده</div></div></div>
  <button class="btn noprint" onclick="window.print()">🖨️ چاپ / ذخیره PDF</button>
</div></body></html>`;
  const w=window.open("","_blank","width=560,height=780");
  if(!w){ toast("اجازهٔ باز شدن پنجره را بده (popup)"); return; }
  w.document.write(html); w.document.close();
};

/* ---------------- برگهٔ ترک کار / تسویه‌حساب ---------------- */
$("settleBtn").onclick = ()=> printSettlement(CURRENT);
function printSettlement(id){
  const e=EMPLOYEES.find(x=>x.id===id); if(!e) return;
  const t=totals(id);
  const row=(k,v,c)=>`<tr><td class="k">${k}</td><td class="v" style="${c||''}">${v}</td></tr>`;
  const today=todayISO();
  const html=`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
<title>برگهٔ ترک کار و تسویه‌حساب</title>
<link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
<style>
  *{box-sizing:border-box;font-family:Vazirmatn,system-ui,sans-serif}
  body{margin:0;background:#eef0f5;color:#1f2430;padding:20px}
  .sheet{max-width:540px;margin:0 auto;background:#fff;border:1px solid #e7e9f0;border-radius:16px;padding:28px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
  .hd{text-align:center;border-bottom:2px solid #3b5bdb;padding-bottom:12px;margin-bottom:16px}
  .hd b{font-size:20px;color:#3b5bdb} .hd div{color:#7a8194;font-size:13px;margin-top:3px}
  .meta{display:flex;justify-content:space-between;font-size:12.5px;color:#7a8194;margin-bottom:14px}
  p.txt{font-size:13.5px;line-height:2;color:#333;margin:14px 0}
  table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}
  td{padding:9px 6px;border-bottom:1px solid #eef0f5}
  td.k{color:#7a8194;width:48%} td.v{font-weight:700;text-align:left}
  .final{background:#eaeefe;color:#3b5bdb;border-radius:12px;padding:14px;text-align:center;margin:16px 0;font-size:20px;font-weight:800}
  .final small{display:block;color:#7a8194;font-weight:500;font-size:12px;margin-bottom:4px}
  .sign{display:flex;justify-content:space-between;margin-top:40px;font-size:13px;color:#7a8194}
  .sign div{text-align:center;width:45%} .sign .line{margin-top:44px;border-top:1px dashed #aab;padding-top:6px}
  .btn{display:block;margin:18px auto 0;background:#3b5bdb;color:#fff;border:0;padding:11px 22px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
  @media print{ body{background:#fff;padding:0} .sheet{box-shadow:none;border:0} .noprint{display:none} }
</style></head><body>
<div class="sheet">
  <div class="hd"><b>برگهٔ ترک کار و تسویه‌حساب</b><div>کافه باراما — حسابداری iPro</div></div>
  <div class="meta"><span>نام نیرو: ${e.full_name||"—"}</span><span>تاریخ تنظیم: ${faD(today)}</span></div>
  <table>
    ${row("کد ملی", faD(e.national_id||"—"))}
    ${row("سمت", e.position||"—")}
    ${row("تاریخ شروع به کار", e.start_date?faD(e.start_date):"—")}
    ${row("تاریخ ترک کار", e.end_date?faD(e.end_date):"—", "color:#d8584f")}
    ${e.end_reason?row("علت ترک کار", e.end_reason):""}
  </table>
  <p class="txt">بدین‌وسیله گواهی می‌شود همکاری آقای/خانم <b>${e.full_name||"—"}</b> با کافه باراما در تاریخ فوق خاتمه یافته و حساب‌وکتاب مالی ایشان به شرح زیر تسویه گردید:</p>
  <table>
    ${row("حقوق ماهیانه", toman(t.salary))}
    ${row("جمع جریمه‌ها", toman(t.fines), "color:#d8584f")}
    ${row("جمع هزینهٔ غذا", toman(t.food), "color:#d8584f")}
    ${row("جمع بیمه (سهم نیرو)", toman(t.ins), "color:#d8584f")}
    ${row("خالص قابل پرداخت", toman(t.net))}
    ${row("کل پرداخت‌شده", toman(t.paid), "color:#2e7d6b")}
  </table>
  <div class="final"><small>${t.remaining>=0?"مبلغ قابل پرداخت به نیرو (تسویه)":"بدهی نیرو به کافه"}</small>${toman(Math.abs(t.remaining))}</div>
  <p class="txt">اینجانب با امضای این برگه، دریافت مبلغ تسویه را تأیید نموده و هیچ‌گونه ادعای مالی دیگری نسبت به کافه باراما ندارم.</p>
  <div class="sign"><div><div class="line">امضای کارفرما</div></div><div><div class="line">امضای نیرو</div></div></div>
  <button class="btn noprint" onclick="window.print()">🖨️ چاپ / ذخیره PDF</button>
</div></body></html>`;
  const w=window.open("","_blank","width=580,height=820");
  if(!w){ toast("اجازهٔ باز شدن پنجره را بده (popup)"); return; }
  w.document.write(html); w.document.close();
}

/* ---------------- گزارش کلی ---------------- */
function renderReport(){
  const tb=$("reportTable").querySelector("tbody");
  tb.innerHTML=EMPLOYEES.map(e=>{ const t=totals(e.id); return `<tr>
    <td><b>${e.full_name}</b></td>
    <td>${fa(t.salary)}</td><td style="color:var(--danger)">${fa(t.fines)}</td>
    <td style="color:var(--danger)">${fa(t.food)}</td><td style="color:var(--danger)">${fa(t.ins)}</td>
    <td><b>${fa(t.net)}</b></td><td style="color:var(--ok)">${fa(t.paid)}</td>
    <td><b style="color:${t.remaining>0?'var(--danger)':'var(--ok)'}">${fa(t.remaining)}</b></td>
  </tr>`; }).join("");
}

/* ---------------- شروع ---------------- */
checkAuth();
db.auth.onAuthStateChange((_e,session)=>{ if(!session) showLogin(); });
