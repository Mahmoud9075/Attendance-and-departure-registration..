/* ========= إعدادات عامة ========= */

// رابط Google Apps Script (الوسيط بدل الاتصال المباشر مع Airtable)
const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyltIxNss4C1MQanIB9HrvX94AvIxvIemC1SxwbcSqvCkBLKW6Szw79RqUlTSEr4gyU/exec";

// (اختياري) رابط Airtable Webhook المباشر (سيتم تعطيله لتفادي CORS)
const AIRTABLE_WEBHOOK_URL = "";

/* ===== تخزين/عرض محلي: نحتفظ بآخر تسجيل لكل موظف فقط ===== */
const SAVE_LOCALLY   = true;  // نخزن آخر تسجيل (يستبدل القديم)
const SHOW_LOCAL_LOG = true;  // نعرض بطاقة واحدة بآخر تسجيل للموظف المختار

// أسماء الموظفين
const EMPLOYEES = [
  "Amna Al-Shehhi","Saman","Sufiyan","Subhan","Vangelyn","Swaroop","Nada Farag","Aya","Maysa",
  "Rajeh","Jaber","Ali amallah","Riham Al-Abri","Maryam Al-Futaisi","Salma Al-Shibli","Raqia Al-Suri",
  "Jihad | Operations","Nada | Operations","Aisha | Operations","Kholoud | Operations","Israa – Hormuz Designer",
  "Mona Ibrahim","Trusila Thuo","Kholoud | Marketing","Alia | Marketing"
];

/* ========= مراجع عناصر الواجهة ========= */
const searchInput    = document.getElementById("search");
const suggestionsEl  = document.getElementById("suggestions");
const employeeSelect = document.getElementById("employee");
const btnIn          = document.getElementById("btn-in");
const btnOut         = document.getElementById("btn-out");
const submitBtn      = document.getElementById("submitBtn");
const clearLocalBtn  = document.getElementById("clearLocalBtn");
const statusDot      = document.getElementById("statusDot");
const accuracyBadge  = document.getElementById("accuracyBadge");
const hint           = document.getElementById("hint");
const logBody        = document.getElementById("logBody");

let currentAction = "دخول";

/* ========= تهيئة ========= */
(function init(){
  fillEmployees(EMPLOYEES);
  setActionButton("دخول");

  if (!SHOW_LOCAL_LOG && logBody)      logBody.style.display = "none";
  if (!SAVE_LOCALLY  && clearLocalBtn) clearLocalBtn.style.display = "none";

  if (SHOW_LOCAL_LOG) renderLocalLog();
})();

/* ========= تعبئة قائمة الأسماء ========= */
function fillEmployees(list){
  if (!employeeSelect) return;
  employeeSelect.querySelectorAll("option:not(:first-child)").forEach(o=>o.remove());
  list.forEach(name=>{
    const opt=document.createElement("option");
    opt.value=name; opt.textContent=name;
    employeeSelect.appendChild(opt);
  });
}

/* ========= اقتراحات البحث ========= */
function showSuggestions(items){
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = "";
  if(!items.length){ suggestionsEl.classList.add("hidden"); return; }
  items.forEach(name=>{
    const li=document.createElement("li");
    li.textContent=name;
    li.addEventListener("mousedown", e=>{
      e.preventDefault();
      if (searchInput) searchInput.value = name;
      suggestionsEl.classList.add("hidden");
      fillEmployees([name]);
      if (employeeSelect) employeeSelect.value = name;
      if (SHOW_LOCAL_LOG) renderLocalLog();
    });
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.classList.remove("hidden");
}

if (searchInput){
  searchInput.addEventListener("input", ()=>{
    const q = searchInput.value.trim().toLowerCase();
    const filtered = EMPLOYEES.filter(n => n.toLowerCase().includes(q));
    fillEmployees(filtered.length ? filtered : EMPLOYEES);
    if(q){ showSuggestions(filtered.slice(0,20)); }
    else if (suggestionsEl) { suggestionsEl.classList.add("hidden"); }
  });

  searchInput.addEventListener("focus", ()=>{
    const q = searchInput.value.trim().toLowerCase();
    if(!q) return;
    const filtered = EMPLOYEES.filter(n => n.toLowerCase().includes(q));
    showSuggestions(filtered.slice(0,20));
  });

  document.addEventListener("click", (e)=>{
    if(!e.target.closest(".search-wrap") && suggestionsEl){
      suggestionsEl.classList.add("hidden");
    }
  });
}

/* ========= تبديل الحركة ========= */
if (btnIn)  btnIn.addEventListener("click",()=> setActionButton("دخول"));
if (btnOut) btnOut.addEventListener("click",()=> setActionButton("انصراف"));

function setActionButton(action){
  currentAction = action;
  if(!btnIn || !btnOut) return;
  if(action==="دخول"){ btnIn.classList.add("btn-primary"); btnOut.classList.remove("btn-primary"); }
  else               { btnOut.classList.add("btn-primary"); btnIn.classList.remove("btn-primary"); }
}

/* ========= زر تسجيل الآن ========= */
if (submitBtn){
  submitBtn.addEventListener("click", onSubmit);
}

async function onSubmit(){
  if (hint) hint.textContent="";
  const name=(employeeSelect?.value||"").trim();
  if(!name){ return setStatus("err","اختر اسم الموظف أولًا."); }

  setStatus("warn","جارٍ تحسين دقة الموقع...");
  try{
    const pos = await getBestPosition({ desiredAccuracy: 30, hardTimeoutMs: 10000 });
    const { latitude, longitude, accuracy } = pos.coords;

    const pretty = await reverseGeocodePrecise(latitude, longitude);

    const now = new Date();
    const record = {
      name,
      action: currentAction,
      address_text: pretty.text,
      lat: latitude,
      lon: longitude,
      accuracy: Math.round(accuracy),
      timestamp_iso: now.toISOString(),
      time_hhmm: now.toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})
    };

    if (SAVE_LOCALLY) upsertLocalRecord(record);

    // إرسال للـ Google Apps Script (الوسيط)
    try{
      await fetch(GOOGLE_APPS_SCRIPT_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(record)
      });
    }catch(err){ console.error("Google Apps Script error", err); }

    setStatus("ok","تم التسجيل بنجاح.");
    if (accuracyBadge) accuracyBadge.textContent = `دقة: ${record.accuracy}م`;
    if (hint)           hint.textContent = `الموقع: ${record.address_text}`;

    if (SHOW_LOCAL_LOG) renderLocalLog();

  }catch(err){
    console.error(err);
    setStatus("err","تعذّر تحديد الموقع بدقة. فعّل GPS وحاول مجددًا.");
    if (accuracyBadge) accuracyBadge.textContent = "دقة: —";
  }
}

/* ========= تحديد الموقع ========= */
function getBestPosition({ desiredAccuracy = 30, hardTimeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
    let best = null; let resolved = false;
    const success = (pos) => {
      const { accuracy } = pos.coords;
      if (!best || accuracy < best.coords.accuracy) best = pos;
      if (!resolved && accuracy <= desiredAccuracy) {
        resolved = true;
        navigator.geolocation.clearWatch(wid);
        clearTimeout(timer);
        resolve(pos);
      }
    };
    const error = (err) => { if (!best) reject(err); };
    const wid = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 15000
    });
    const timer = setTimeout(() => {
      navigator.geolocation.clearWatch(wid);
      if (best) { resolved = true; resolve(best); }
      else reject(new Error("Timeout: لم نتمكن من الحصول على موقع جيد"));
    }, hardTimeoutMs);
  });
}

/* ========= Reverse Geocoding ========= */
async function reverseGeocodePrecise(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ar&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  const data = await res.json();
  const a = data.address || {};
  const country     = a.country || "";
  const governorate = a.state || a.region || "";
  const city        = a.city || a.town || a.village || "";
  const exactParts = [a.road, a.neighbourhood].filter(Boolean);
  const exact = exactParts.join("، ");
  const text = [country, governorate, exact || city].filter(Boolean).join(" – ");
  return { text: text || "غير محدد" };
}

/* ========= تخزين/عرض محلي ========= */
function getLocalMap(){
  try{ return JSON.parse(localStorage.getItem("attendanceLastByName") || "{}"); }
  catch{ return {}; }
}
function setLocalMap(map){ localStorage.setItem("attendanceLastByName", JSON.stringify(map)); }
function upsertLocalRecord(rec){ const map = getLocalMap(); map[rec.name] = rec; setLocalMap(map); }
function getLastRecordFor(name){ return getLocalMap()[name] || null; }
function renderLocalLog(){
  if (!SHOW_LOCAL_LOG || !logBody) return;
  const selected=(employeeSelect?.value||"").trim();
  logBody.innerHTML="";
  const r = getLastRecordFor(selected);
  if (!r){
    const div=document.createElement("div");
    div.className="empty"; div.textContent="لا يوجد تسجيل سابق لهذا الموظف";
    logBody.appendChild(div); return;
  }
  const wrap=document.createElement("div"); wrap.className="row-item";
  const name=document.createElement("div"); name.textContent=r.name;
  const action=document.createElement("div");
  const badge=document.createElement("span");
  badge.className="badge " + (r.action==="دخول" ? "in" : "out");
  badge.textContent=r.action; action.appendChild(badge);
  const loc=document.createElement("div"); loc.className="location"; loc.textContent=r.address_text || "—";
  const time=document.createElement("div"); time.className="time";
  const dt=new Date(r.timestamp_iso);
  time.innerHTML=`<span style="direction:ltr; display:inline-block;">${dt.toLocaleDateString("ar-EG")} ${dt.toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</span>`;
  wrap.appendChild(name); wrap.appendChild(action); wrap.appendChild(loc); wrap.appendChild(time);
  logBody.appendChild(wrap);
}

/* ========= حالة الواجهة ========= */
function setStatus(kind, text){
  if (!statusDot) return;
  statusDot.classList.remove("ok","warn","err");
  statusDot.classList.add(kind);
  statusDot.textContent=text;
}
