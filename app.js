/* ============================================================
   حسابداری iPro — منطق برنامه
   ============================================================ */
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const fa = (n) => (n == null || isNaN(n) ? "۰" : Number(Math.round(n)).toLocaleString("fa-IR"));
const toman = (n) => fa(n) + " ت";
const faD = (s) => String(s||"").replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]);
// تبدیل تاریخ میلادی (ISO) به شمسی
function jalali(iso){
  if(!iso) return "";
  const d=new Date(String(iso).length<=10 ? iso+"T00:00:00" : iso);
  if(isNaN(d)) return faD(iso);
  try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d); }
  catch(e){ return faD(iso); }
}
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function todayShamsiStr(){ try{ const d=new Date(); const j=jalaali.toJalaali(d.getFullYear(),d.getMonth()+1,d.getDate());
  return `${j.jy}/${String(j.jm).padStart(2,"0")}/${String(j.jd).padStart(2,"0")}`; }catch(e){ return todayISO(); } }
function isoToShamsi(iso){ if(!iso) return ""; const d=new Date(String(iso).length<=10?iso+"T00:00:00":iso);
  if(isNaN(d)||typeof jalaali==="undefined") return ""; const j=jalaali.toJalaali(d.getFullYear(),d.getMonth()+1,d.getDate());
  return `${j.jy}/${String(j.jm).padStart(2,"0")}/${String(j.jd).padStart(2,"0")}`; }
function shamsiToISO(s){ if(!s) return null; s=String(s).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const m=s.match(/(\d{3,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if(!m||typeof jalaali==="undefined") return null;
  const g=jalaali.toGregorian(+m[1],+m[2],+m[3]); return `${g.gy}-${String(g.gm).padStart(2,"0")}-${String(g.gd).padStart(2,"0")}`; }
let TT; function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(TT); TT=setTimeout(()=>t.classList.remove("show"),4000); }
window.addEventListener("error", e => toast("خطای برنامه: "+(e.message||"")));
window.addEventListener("unhandledrejection", e => toast("خطا: "+((e.reason&&e.reason.message)||e.reason||"")));

let EMPLOYEES=[], PAY=[], FIN=[], FOOD=[], INS=[], SAL=[], ATT=[], LEAVES=[], CURRENT=null;

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
    if(b.dataset.tab==="attendance") renderAttendance();
    if(b.dataset.tab==="leaves") renderLeaves();
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
  const [emp,pay,fin,food,ins,sal,att,lv] = await Promise.all([
    db.from("employees").select("*").order("full_name"),
    db.from("payments").select("*"),
    db.from("fines").select("*"),
    db.from("food_usage").select("*"),
    db.from("insurance").select("*"),
    db.from("salary_changes").select("*"),
    db.from("attendance").select("*"),
    db.from("leave_requests").select("*"),
  ]);
  if(emp.error){ toast("خطا در اتصال — schema را اجرا کردی؟"); console.error(emp.error); }
  EMPLOYEES=emp.data||[]; PAY=pay.data||[]; FIN=fin.data||[]; FOOD=food.data||[]; INS=ins.data||[]; SAL=sal.data||[];
  ATT=att.data||[]; LEAVES=lv.data||[];
  renderStaff(); updateLeaveBadge();
  const activeTab=document.querySelector(".tab.active")?.id;
  if(activeTab==="tab-attendance") renderAttendance();
  if(activeTab==="tab-leaves") renderLeaves();
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
// آیا موعد بازبینی حقوق رسیده؟ (۱ ماه از شروع گذشته و هنوز افزایشی ثبت نشده)
function reviewDue(e){
  if(!e || !e.start_date || e.end_date) return false;
  if(SAL.some(s=>s.employee_id===e.id)) return false;
  const start=new Date(e.start_date), now=new Date();
  return (now-start) >= 30*24*60*60*1000;
}

/* ---------------- لیست نیروها ---------------- */
function renderStaff(){
  const term=$("staffSearch").value.trim();
  const list=EMPLOYEES.filter(e=>!term || (e.full_name||"").includes(term) || (e.phone||"").includes(term));
  $("staffEmpty").style.display = EMPLOYEES.length? "none":"block";
  $("staffList").innerHTML = list.map(e=>{
    return `<div class="emp-card" onclick="openEmployee(${e.id})" style="${e.end_date?'opacity:.7':''}">
      <div class="avatar">${initials(e.full_name)}</div>
      <div style="flex:1">
        <b>${e.full_name}</b> ${e.end_date?`<span class="pill" style="background:#fdecea;color:var(--danger)">ترک کار</span>`:(reviewDue(e)?`<span class="pill" style="background:#fff5e8;color:var(--accent)">موعد بازبینی حقوق</span>`:``)}
        <div class="muted" style="font-size:12.5px;margin-top:4px">${e.position||"—"}</div>
      </div>
    </div>`;
  }).join("");
}
$("staffSearch").oninput = renderStaff;

/* ---------------- افزودن/ویرایش نیرو ---------------- */
const empDlg=$("empDialog");
empDlg.showModal=()=>empDlg.classList.add("open"); empDlg.close=()=>empDlg.classList.remove("open");
function openEmpDialog(e){
  $("empTitle").textContent = e? "ویرایش مشخصات":"نیروی جدید";
  $("e_id").value=e?.id||""; $("e_name").value=e?.full_name||""; $("e_position").value=e?.position||"";
  $("e_national").value=e?.national_id||""; $("e_phone").value=e?.phone||""; $("e_start").value=isoToShamsi(e?.start_date);
  $("e_salary").value=e?.monthly_salary??""; $("e_bank").value=e?.bank_name||""; $("e_account").value=e?.account_number||"";
  $("e_sheba").value=e?.sheba||""; $("e_insnum").value=e?.insurance_number||""; $("e_address").value=e?.address||"";
  $("e_end").value=isoToShamsi(e?.end_date); $("e_end_reason").value=e?.end_reason||"";
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
    phone:$("e_phone").value.trim()||null, start_date:shamsiToISO($("e_start").value),
    monthly_salary:Number($("e_salary").value)||0, bank_name:$("e_bank").value.trim()||null,
    account_number:$("e_account").value.trim()||null, sheba:$("e_sheba").value.trim()||null,
    insurance_number:$("e_insnum").value.trim()||null, address:$("e_address").value.trim()||null,
    end_date:shamsiToISO($("e_end").value), end_reason:$("e_end_reason").value.trim()||null,
    notes:$("e_notes").value.trim()||null
  };
  const id=$("e_id").value;
  let savedId=id;
  if(id){ const {error}=await db.from("employees").update(rec).eq("id",id); if(error){console.error(error);return toast("خطا: "+error.message);} }
  else { const {data,error}=await db.from("employees").insert(rec).select("id").single(); if(error){console.error(error);return toast("خطا: "+error.message);} savedId=data.id; }
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
  $("p_meta").innerHTML=`${e.position||"—"} • شروع: ${e.start_date? jalali(e.start_date) : "—"}`
    + (e.end_date?` • <span style="color:var(--danger);font-weight:700">ترک کار: ${jalali(e.end_date)}${e.end_reason?" ("+e.end_reason+")":""}</span>`:"");
  $("p_avatar").textContent=initials(e.full_name);
  if(e.photo_url){ const s=await db.storage.from(FILES_BUCKET).createSignedUrl(e.photo_url,3600);
    if(s.data) $("p_avatar").innerHTML=`<img src="${s.data.signedUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`; }
  const D=[["کد ملی",e.national_id],["تلفن",e.phone],["حقوق ماهیانه",e.monthly_salary!=null?toman(e.monthly_salary):null],
    ["بانک",e.bank_name],["شماره حساب",e.account_number],["شماره شبا",e.sheba?("IR"+e.sheba):null],
    ["شماره بیمه",e.insurance_number],["تاریخ ترک کار",e.end_date?jalali(e.end_date):null],["علت ترک کار",e.end_reason],
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
  renderAttLink(e);
  renderSalary(id);
  renderFiles(id);
  renderRecList("payment"); renderRecList("fine"); renderRecList("food"); renderRecList("insurance");
}
window.openEmployee=openEmployee;

/* ---------------- لینک حضور و غیاب در پروندهٔ نیرو ---------------- */
function attLinkFor(token){ return token ? new URL("attendance.html?t="+token, location.href).href : ""; }
function renderAttLink(e){
  const link = attLinkFor(e.att_token);
  $("p_attLink").value = link || "— پس از اجرای schema و یک بار ذخیره، لینک ساخته می‌شود —";
  $("p_shiftSel").value = e.shift||"";
  const sp=$("p_shiftPill");
  sp.textContent = e.shift==="morning"?"شیفت ثابت صبح" : e.shift==="evening"?"شیفت ثابت عصر" : "تشخیص خودکار شیفت";
}
$("copyLinkBtn").onclick = async ()=>{
  const v=$("p_attLink").value; if(!v.startsWith("http")) return toast("لینک هنوز ساخته نشده");
  try{ await navigator.clipboard.writeText(v); toast("✓ لینک کپی شد"); }
  catch(_){ $("p_attLink").select(); document.execCommand("copy"); toast("✓ لینک کپی شد"); }
};
$("p_shiftSel").onchange = async (ev)=>{
  if(!CURRENT) return;
  const val=ev.target.value||null;
  const {error}=await db.from("employees").update({shift:val}).eq("id",CURRENT);
  if(error) return toast("خطا در ذخیرهٔ شیفت");
  const e=EMPLOYEES.find(x=>x.id===CURRENT); if(e) e.shift=val;
  renderAttLink(e); toast("✓ شیفت ذخیره شد");
};

/* ---------------- حقوق و افزایش‌ها ---------------- */
function renderSalary(id){
  const e=EMPLOYEES.find(x=>x.id===id)||{};
  $("p_review").innerHTML = reviewDue(e)
    ? `<div style="background:#fff5e8;color:var(--accent);border:1px solid #f3d9a8;border-radius:12px;padding:11px 14px;font-size:13.5px">⏰ بیش از یک ماه از شروع به کار گذشته و هنوز افزایش حقوقی ثبت نشده. بسته به عملکرد، می‌توانی افزایش حقوق ثبت کنی.</div>`
    : "";
  const rows=SAL.filter(s=>s.employee_id===id).sort((a,b)=>(b.change_date||"").localeCompare(a.change_date||""));
  const stars=(n)=> n? "★".repeat(n)+"☆".repeat(5-n) : "";
  $("p_salary").innerHTML = rows.length
    ? `<table><tbody>${rows.map(s=>`<tr>
        <td style="width:120px">${jalali(s.change_date)}</td>
        <td><b>${toman(s.new_salary)}</b></td>
        <td style="color:var(--accent)">${stars(s.rating)}</td>
        <td style="color:var(--muted)">${s.note||""}</td>
        <td style="text-align:left"><button class="btn danger sm" onclick="delRaise(${s.id})">حذف</button></td>
      </tr>`).join("")}</tbody></table>`
    : `<div class="muted" style="font-size:13px">هنوز افزایش حقوقی ثبت نشده. حقوق فعلی: <b>${toman(e.monthly_salary)}</b></div>`;
}
const raiseDlg=$("raiseDialog");
raiseDlg.showModal=()=>raiseDlg.classList.add("open"); raiseDlg.close=()=>raiseDlg.classList.remove("open");
$("addRaiseBtn").onclick=()=>{
  const e=EMPLOYEES.find(x=>x.id===CURRENT)||{};
  $("rz_emp").textContent=`${e.full_name||""} — حقوق فعلی: ${toman(e.monthly_salary)}`;
  $("rz_date").value=todayShamsiStr(); $("rz_salary").value=e.monthly_salary||""; $("rz_rating").value=""; $("rz_note").value="";
  raiseDlg.showModal();
};
$("rzCancel").onclick=()=>raiseDlg.close();
$("rzSave").onclick=async()=>{
  const sal=Number($("rz_salary").value)||0;
  if(!sal) return toast("حقوق جدید را وارد کنید");
  const rec={ employee_id:CURRENT, change_date:shamsiToISO($("rz_date").value)||todayISO(),
    new_salary:sal, rating:$("rz_rating").value?Number($("rz_rating").value):null, note:$("rz_note").value.trim()||null };
  const ins=await db.from("salary_changes").insert(rec);
  if(ins.error){ console.error(ins.error); return toast("خطا — آیا جدول salary_changes ساخته شده؟"); }
  await db.from("employees").update({monthly_salary:sal}).eq("id",CURRENT);   // حقوق فعلی به‌روز می‌شود
  toast("✓ افزایش حقوق ثبت شد"); raiseDlg.close(); await loadAll();
};
window.delRaise=async(id)=>{ if(!confirm("این رکورد حذف شود؟"))return;
  const {error}=await db.from("salary_changes").delete().eq("id",id);
  if(error)return toast("خطا در حذف"); toast("حذف شد"); await loadAll(); };

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
      <td style="width:120px">${jalali(r[c.date])}</td>
      <td><b>${toman(r.amount)}</b></td>
      ${c.kind?`<td>${r.kind||""}</td>`:""}
      <td style="color:var(--muted)">${r[c.txt]||""}</td>
      <td style="text-align:left">${type==='payment'?`<button class="btn ghost sm" onclick="printReceipt(${r.id})">رسید</button> ${r.receipt_path?`<button class="btn gray sm" onclick="viewPayReceipt('${r.receipt_path}')">📎 فایل رسید</button> `:""}<button class="btn gray sm" onclick="uploadPayReceipt(${r.id})">${r.receipt_path?"تعویض فایل":"⬆️ آپلود رسید"}</button> `:""}<button class="btn danger sm" onclick="delRec('${type}',${r.id})">حذف</button></td>
    </tr>`).join("")}</tbody></table>` : `<div class="muted" style="font-size:13px">موردی ثبت نشده.</div>`;
}
const recDlg=$("recDialog");
recDlg.showModal=()=>recDlg.classList.add("open"); recDlg.close=()=>recDlg.classList.remove("open");
window.addRecord=(type)=>{
  const c=REC[type]; $("r_type").value=type; $("recTitle").textContent=c.title;
  $("r_date").value=todayShamsiStr(); $("r_amount").value=""; $("r_text").value="";
  $("r_textLabel").textContent=c.txtLabel;
  $("r_kindWrap").style.display=c.kind?"block":"none";
  $("r_date").previousElementSibling; // noop
  recDlg.showModal();
};
$("recCancel").onclick=()=>recDlg.close();
$("recSave").onclick=async()=>{
  const type=$("r_type").value, c=REC[type];
  const rec={ employee_id:CURRENT, amount:Number($("r_amount").value)||0 };
  rec[c.date]=shamsiToISO($("r_date").value)||todayISO();
  rec[c.txt]=$("r_text").value.trim()||null;
  if(c.kind) rec.kind=$("r_kind").value;
  const {error}=await db.from(c.tbl).insert(rec);
  if(error){ console.error(error); return toast("خطا: "+error.message); }
  toast("✓ ثبت شد"); recDlg.close(); await loadAll();
};
window.delRec=async(type,id)=>{ if(!confirm("حذف شود؟"))return;
  const {error}=await db.from(REC[type].tbl).delete().eq("id",id);
  if(error)return toast("خطا در حذف"); toast("حذف شد"); await loadAll(); };

/* ---------------- آپلود/مشاهدهٔ فایل رسید پرداخت ---------------- */
let _payReceiptTarget=null;
function ensurePayReceiptInput(){
  if($("payReceiptInput")) return;
  const inp=document.createElement("input");
  inp.type="file"; inp.id="payReceiptInput"; inp.accept="image/*,application/pdf"; inp.style.display="none";
  inp.onchange=async()=>{
    const f=inp.files[0], id=_payReceiptTarget; _payReceiptTarget=null;
    if(!f||!id){ inp.value=""; return; }
    const safe=(f.name||"receipt").replace(/[^\w.\-]+/g,"_");
    const path=`receipts/${id}_${Date.now()}_${safe}`;
    toast("در حال آپلود رسید…");
    const up=await db.storage.from(FILES_BUCKET).upload(path,f,{upsert:true});
    inp.value="";
    if(up.error){ console.error(up.error); return toast("خطا در آپلود رسید"); }
    const {error}=await db.from("payments").update({receipt_path:path}).eq("id",id);
    if(error){ console.error(error); return toast("خطا: "+error.message); }
    toast("✓ رسید آپلود شد"); await loadAll();
  };
  document.body.appendChild(inp);
}
window.uploadPayReceipt=(id)=>{ ensurePayReceiptInput(); _payReceiptTarget=id; $("payReceiptInput").click(); };
window.viewPayReceipt=async(path)=>{
  const s=await db.storage.from(FILES_BUCKET).createSignedUrl(path,3600);
  if(s.data) window.open(s.data.signedUrl,"_blank"); else toast("خطا در باز کردن فایل");
};

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
  <div class="meta"><span>شماره رسید: ${faD(p.id)}</span><span>تاریخ: ${jalali(p[REC.payment.date])}</span></div>
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
  <div class="meta"><span>نام نیرو: ${e.full_name||"—"}</span><span>تاریخ تنظیم: ${jalali(today)}</span></div>
  <table>
    ${row("کد ملی", faD(e.national_id||"—"))}
    ${row("سمت", e.position||"—")}
    ${row("تاریخ شروع به کار", e.start_date?jalali(e.start_date):"—")}
    ${row("تاریخ ترک کار", e.end_date?jalali(e.end_date):"—", "color:#d8584f")}
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

/* ---------------- حضور و غیاب: ابزار تاریخ ---------------- */
const J_MONTHS=["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const SHIFT_FA={morning:"صبح",evening:"عصر"};
const pad2=(n)=>String(n).padStart(2,"0");
function jToday(){ const d=new Date(); return jalaali.toJalaali(d.getFullYear(),d.getMonth()+1,d.getDate()); }
function jMonthRange(jy,jm){
  const g1=jalaali.toGregorian(jy,jm,1), len=jalaali.jalaaliMonthLength(jy,jm), g2=jalaali.toGregorian(jy,jm,len);
  return { start:`${g1.gy}-${pad2(g1.gm)}-${pad2(g1.gd)}`, end:`${g2.gy}-${pad2(g2.gm)}-${pad2(g2.gd)}` };
}
function clockOf(ts){ if(!ts) return "—"; const d=new Date(ts); return faD(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`); }
const dailySalary=(e)=> (+(e&&e.monthly_salary)||0)/30;

/* ---------------- نشان مرخصی‌های در انتظار ---------------- */
function updateLeaveBadge(){
  const n=LEAVES.filter(l=>l.status==="pending").length;
  const b=$("leaveBadge"); if(!b) return;
  b.style.display = n? "inline-block":"none"; b.textContent = faD(n);
}

/* ---------------- مرخصی‌ها ---------------- */
const LV_TYPE={daily:"روزانه",hourly:"ساعتی"};
const LV_BADGE={pending:'<span class="pill" style="background:#fff5e8;color:var(--accent)">در انتظار</span>',
  approved:'<span class="pill" style="background:#e6f4f0;color:var(--ok)">تأیید شد</span>',
  rejected:'<span class="pill" style="background:#fdecea;color:var(--danger)">رد شد</span>'};
function renderLeaves(){
  const filter=$("lvFilter").value;
  const rows=LEAVES.filter(l=>filter==="all"||l.status===filter).sort((a,b)=>b.id-a.id);
  $("leavesEmpty").style.display=rows.length?"none":"block";
  $("leavesList").innerHTML=rows.map(l=>{
    const e=EMPLOYEES.find(x=>x.id===l.employee_id)||{};
    const when = l.type==="hourly"
      ? `${jalali(l.start_date)} • ${faD(l.hours)} ساعت`
      : `${jalali(l.start_date)} تا ${jalali(l.end_date)} (${faD(((new Date(l.end_date)-new Date(l.start_date))/86400000)+1)} روز)`;
    return `<div class="card" style="margin-bottom:12px">
      <div class="row"><div class="avatar">${initials(e.full_name)}</div>
        <div style="flex:1"><b>${e.full_name||"—"}</b> <span class="pill">${LV_TYPE[l.type]||l.type}</span>
          <div class="muted" style="font-size:12.5px;margin-top:3px">${when}</div></div>
        <div>${LV_BADGE[l.status]||""}</div></div>
      ${l.reason?`<div style="font-size:13px;margin-top:10px"><span class="muted">توضیح نیرو:</span> ${l.reason}</div>`:""}
      ${l.admin_note?`<div style="font-size:13px;margin-top:6px;color:var(--accent)">پاسخ مدیر: ${l.admin_note}</div>`:""}
      ${l.status==="pending"?`
        <div class="row" style="margin-top:12px">
          <input id="lvnote_${l.id}" placeholder="یادداشت برای نیرو (اختیاری)" style="flex:1">
          <button class="btn sm" style="background:var(--ok)" onclick="decideLeave(${l.id},'approved')">✓ تأیید</button>
          <button class="btn sm" style="background:var(--danger)" onclick="decideLeave(${l.id},'rejected')">✕ رد</button>
        </div>`:""}
    </div>`;
  }).join("");
}
$("lvFilter").onchange=renderLeaves;
window.decideLeave=async(id,status)=>{
  const note=($("lvnote_"+id)?.value||"").trim()||null;
  const {error}=await db.from("leave_requests").update({status,admin_note:note,decided_at:new Date().toISOString()}).eq("id",id);
  if(error) return toast("خطا: "+error.message);
  toast(status==="approved"?"✓ مرخصی تأیید شد":"درخواست رد شد");
  await loadAll();
};

/* ---------------- گزارش ماهانهٔ حضور و غیاب ---------------- */
function fillAttSelectors(){
  if($("att_year").options.length) return;
  const j=jToday();
  for(let y=j.jy; y>=j.jy-2; y--){ const o=document.createElement("option"); o.value=y; o.textContent=faD(y); $("att_year").appendChild(o); }
  J_MONTHS.forEach((nm,i)=>{ const o=document.createElement("option"); o.value=i+1; o.textContent=nm; $("att_month").appendChild(o); });
  $("att_year").value=j.jy; $("att_month").value=j.jm;
  $("att_year").onchange=renderAttendance; $("att_month").onchange=renderAttendance;
}
function renderAttendance(){
  fillAttSelectors();
  const jy=+$("att_year").value, jm=+$("att_month").value;
  const {start,end}=jMonthRange(jy,jm);
  const inRange=(d)=> d && d>=start && d<=end;
  const monthAtt=ATT.filter(a=>inRange(a.work_date));
  const monthLeave=LEAVES.filter(l=>l.status==="approved" && inRange(l.start_date));

  // ردیف هر نیرو
  const ids=[...new Set([...monthAtt.map(a=>a.employee_id), ...monthLeave.map(l=>l.employee_id)])];
  const tb=$("attTable").querySelector("tbody");
  $("attEmpty").style.display = ids.length? "none":"block";
  tb.innerHTML=ids.map(id=>{
    const e=EMPLOYEES.find(x=>x.id===id)||{}; const ds=dailySalary(e);
    const recs=monthAtt.filter(a=>a.employee_id===id);
    const days=new Set(recs.filter(a=>a.check_in).map(a=>a.work_date)).size;
    const totalLate=recs.reduce((s,a)=>s+(+a.late_minutes||0),0);
    const lateDed=recs.reduce((s,a)=>s+Math.max(0,(+a.late_minutes||0)-10)*ds/480,0);
    const lvHours=monthLeave.filter(l=>l.employee_id===id).reduce((s,l)=>s+(+l.hours||0),0);
    const excess=Math.max(0,lvHours-16);
    const leaveDed=excess*ds/8;
    const total=Math.round(lateDed+leaveDed);
    return `<tr>
      <td><b>${e.full_name||"—"}</b></td>
      <td>${faD(days)}</td>
      <td>${totalLate>0?faD(totalLate)+" د":"—"}</td>
      <td style="color:var(--danger)">${lateDed>0?toman(lateDed):"—"}</td>
      <td>${lvHours>0?faD(lvHours)+" س":"—"}</td>
      <td>${excess>0?faD(excess)+" س":"—"}</td>
      <td style="color:var(--danger)">${leaveDed>0?toman(leaveDed):"—"}</td>
      <td><b style="color:var(--danger)">${total>0?toman(total):"۰"}</b></td>
      <td style="text-align:left">${total>0?`<button class="btn ghost sm" onclick="applyAttDeduction(${id},${jy},${jm},${total})">ثبت کسر</button>`:""}</td>
    </tr>`;
  }).join("");

  // جدول جزئیات
  const log=monthAtt.slice().sort((a,b)=> (b.work_date||"").localeCompare(a.work_date||"") || a.employee_id-b.employee_id);
  const lb=$("attLogTable").querySelector("tbody");
  $("attLogEmpty").style.display=log.length?"none":"block";
  lb.innerHTML=log.map(a=>{ const e=EMPLOYEES.find(x=>x.id===a.employee_id)||{}; return `<tr>
    <td>${jalali(a.work_date)}</td><td>${e.full_name||"—"}</td>
    <td>${SHIFT_FA[a.shift]||"—"}</td><td>${clockOf(a.check_in)}</td><td>${clockOf(a.check_out)}</td>
    <td style="${a.late_minutes>10?'color:var(--danger);font-weight:700':''}">${a.late_minutes>0?faD(a.late_minutes)+" د":"—"}</td>
  </tr>`; }).join("");
}
window.applyAttDeduction=async(empId,jy,jm,amount)=>{
  if(amount<=0) return toast("کسری برای ثبت نیست");
  const reason=`کسر حضور و غیاب ${faD(jy+"/"+pad2(jm))} (تأخیر + مرخصی)`;
  if(FIN.some(f=>f.employee_id===empId && f.reason===reason)){
    if(!confirm("برای این ماه قبلاً کسر ثبت شده. دوباره ثبت شود؟")) return;
  } else if(!confirm(`ثبت کسر ${toman(amount)} به‌عنوان جریمه برای این نیرو؟`)) return;
  const {error}=await db.from("fines").insert({employee_id:empId, fine_date:jMonthRange(jy,jm).end, amount, reason});
  if(error) return toast("خطا: "+error.message);
  toast("✓ کسر به‌عنوان جریمه ثبت شد"); await loadAll();
};

/* ---------------- شروع ---------------- */
if(typeof jalaliDatepicker!=="undefined") jalaliDatepicker.startWatch({time:false,persianDigit:true,autoHide:true});
checkAuth();
db.auth.onAuthStateChange((_e,session)=>{ if(!session) showLogin(); });
