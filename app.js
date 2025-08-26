// ========= الإعدادات =========
const SCRIPT_URL = "https://script.google.com/macros/s/PUT_YOUR_EXEC_LINK_HERE/exec"; // ← ضع رابط /exec
// ضيف/عدّل قائمة الموظفين هنا
const EMPLOYEES = [
  "أحمد علي",
  "محمود إبراهيم",
  "محمد حسن",
  "سارة عصام",
  "هند أشرف"
];

// ========= عناصر DOM =========
const employeeSel   = document.getElementById("employee");
const searchInput   = document.getElementById("search");
const suggestionsUl = document.getElementById("suggestions");
const btnIn         = document.getElementById("btn-in");
const btnOut        = document.getElementById("btn-out");
const submitBtn     = document.getElementById("submitBtn");
const clearLocalBtn = document.getElementById("clearLocalBtn");
const statusDot     = document.getElementById("statusDot");
const accuracyBadge = document.getElementById("accuracyBadge");
const logBody       = document.getElementById("logBody");
const hint          = document.getElementById("hint");

// ========= حالة التطبيق =========
let selectedAction = "دخول"; // افتراضي
let lastGeo = { lat: "", lon: "", accuracy: "" };

// ========= وظائف مساعدة =========
function setStatus(text, type = "ok") {
  statusDot.textContent = text;
  statusDot.className = `status ${type}`;
}

function showHint(text, type = "info") {
  hint.textContent = text || "";
  hint.className = `hint ${type}`;
}

function fmtTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const h = d.getHours();
  const m = pad(d.getMinutes());
  const ampm = h < 12 ? "صباحًا" : "مساءً";
  const h12 = ((h + 11) % 12) + 1;
  const date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return { human: `${date} ${h12}:${m} ${ampm}`, iso: d.toISOString() };
}

function saveLocal(record) {
  const arr = JSON.parse(localStorage.getItem("attendance_logs") || "[]");
  arr.unshift(record);
  localStorage.setItem("attendance_logs", JSON.stringify(arr));
}

function loadLocal() {
  return JSON.parse(localStorage.getItem("attendance_logs") || "[]");
}

function renderTable() {
  const data = loadLocal();
  logBody.innerHTML = "";
  if (!data.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "لا توجد سجلات بعد";
    logBody.appendChild(div);
    return;
  }
  for (const r of data) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div>${r.name}</div>
      <div>${r.action}</div>
      <div>${r.locText || (r.lon && r.lat ? `${r.lat}, ${r.lon}` : "—")}</div>
      <div>${r.timeHuman}</div>
    `;
    logBody.appendChild(row);
  }
}

function fillEmployees() {
  for (const n of EMPLOYEES) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    employeeSel.appendChild(opt);
  }
}

// ========= جلب الموقع (اختياري) =========
function fetchGeo() {
  if (!navigator.geolocation) {
    accuracyBadge.textContent = "دقة: —";
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    lastGeo = { lat: latitude.toFixed(6), lon: longitude.toFixed(6), accuracy: Math.round(accuracy) };
    accuracyBadge.textContent = `دقة: ~${lastGeo.accuracy}m`;
  }, () => {
    accuracyBadge.textContent = "دقة: غير متاح";
  }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 });
}

// ========= بحث الأسماء =========
function filterSuggestions(q) {
  if (!q) { suggestionsUl.classList.add("hidden"); suggestionsUl.innerHTML = ""; return; }
  const items = EMPLOYEES.filter(n => n.includes(q.trim())).slice(0, 8);
  suggestionsUl.innerHTML = "";
  if (!items.length) { suggestionsUl.classList.add("hidden"); return; }
  for (const it of items) {
    const li = document.createElement("li");
    li.textContent = it;
    li.addEventListener("click", () => {
      employeeSel.value = it;
      searchInput.value = it;
      suggestionsUl.classList.add("hidden");
    });
    suggestionsUl.appendChild(li);
  }
  suggestionsUl.classList.remove("hidden");
}

// ========= إرسال للسيرفر (GAS) =========
async function sendToServer(payloadObj) {
  // نبعته كـ FormData لتجنّب preflight
  const fd = new FormData();
  Object.entries(payloadObj).forEach(([k, v]) => fd.append(k, v ?? ""));

  const res = await fetch(SCRIPT_URL, { method: "POST", body: fd });
  // قد يرجع JSON أو نص عادي حسب سكربتك — هنعمل محاولة قراءة كنص
  return res.text();
}

// ========= الأحداث =========
btnIn.addEventListener("click", () => {
  selectedAction = "دخول";
  btnIn.classList.add("btn-primary");
  btnOut.classList.remove("btn-primary");
});

btnOut.addEventListener("click", () => {
  selectedAction = "انصراف";
  btnOut.classList.add("btn-primary");
  btnIn.classList.remove("btn-primary");
});

submitBtn.addEventListener("click", async () => {
  const name = (employeeSel.value || "").trim() || (searchInput.value || "").trim();
  if (!name) { showHint("رجاء اختر/اكتب الاسم.", "warn"); return; }

  const t = fmtTime();
  const record = {
    name,
    action: selectedAction,
    timeIso: t.iso,
    timeHuman: t.human,
    lat: lastGeo.lat,
    lon: lastGeo.lon,
    accuracy: lastGeo.accuracy,
    address_text: "" // ممكن تملّيها لاحقًا لو عملت Reverse Geocoding
  };

  try {
    setStatus("جارٍ الإرسال…", "busy");
    const serverResp = await sendToServer({
      name: record.name,
      action: record.action,
      timestamp_iso: record.timeIso,
      lat: record.lat,
      lon: record.lon,
      accuracy: record.accuracy,
      address_text: record.address_text
    });

    saveLocal(record);
    renderTable();
    showHint("تم التسجيل بنجاح ✅", "ok");
    setStatus("جاهز", "ok");
    console.log("Server:", serverResp);
  } catch (e) {
    console.error(e);
    showHint("فشل الإرسال، تم الحفظ محليًا ويمكن الإرسال لاحقًا.", "error");
    setStatus("خطأ", "error");
    // نحفظ محلي برضه علشان مايضيعش
    saveLocal(record);
    renderTable();
  }
});

clearLocalBtn.addEventListener("click", () => {
  localStorage.removeItem("attendance_logs");
  renderTable();
  showHint("تم مسح السجلات المحلية.", "ok");
});

// ========= تشغيل أولي =========
fillEmployees();
renderTable();
fetchGeo();
setInterval(fetchGeo, 20000); // حدّث الموقع كل فترة بسيطة
searchInput.addEventListener("input", (e) => filterSuggestions(e.target.value));
document.addEventListener("click", (e) => {
  if (!suggestionsUl.contains(e.target) && e.target !== searchInput) {
    suggestionsUl.classList.add("hidden");
  }
});
