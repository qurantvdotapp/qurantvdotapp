// Quran TV — Streamlined Cloud & Ayah Timing Studio

const API_BASE = "";

// State
let allReciters = [];
let allSurahs = [];
let remoteReciters = [];
let currentStep = 3; // Timing Studio is the primary default view
let uploadMode = "single"; // 'single' | 'batch'

let selectedReciter = null;
let selectedMoshaf = null;
let selectedSurahId = 1;
let currentSlug = "qurantvapp-husry-hafs";
let uploadedArchiveAudioUrl = "";
let currentTimingData = [];
let focusedAyahIdx = 0;
let archiveBatchJobId = null;
let archiveBatchInterval = null;
let currentRecitersFilter = "all";
let currentSurahsFilter = "all";
let currentCatalogSummary = null;
let currentMushafStatus = null;

// Audio Element & Player Controls
const audioElement = document.getElementById("audioElement");
const step3PlayIcon = document.getElementById("step3PlayIcon");
const step3PauseIcon = document.getElementById("step3PauseIcon");
const step3TimeDisplay = document.getElementById("step3TimeDisplay");
const step3VersesTbody = document.getElementById("step3VersesTbody");

// ----------------- Cloud Status Badges -----------------

async function checkCloudStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/cloud/status`);
    const data = await res.json();

    // Archive.org status
    const iaBadge = document.getElementById("iaStatusBadge");
    if (iaBadge) {
      const isOk = data.archive_org?.ok;
      iaBadge.querySelector(".status-dot").className = `status-dot ${isOk ? "online" : "danger"}`;
      iaBadge.querySelector(".badge-val").textContent = isOk ? "متصل (S3 CDN)" : "غير مهيأ";
    }

    // GitHub status
    const ghBadge = document.getElementById("ghStatusBadge");
    if (ghBadge) {
      const isOk = data.github?.ok;
      ghBadge.querySelector(".status-dot").className = `status-dot ${isOk ? "online" : "danger"}`;
      ghBadge.querySelector(".badge-val").textContent = isOk ? "متصل (Push Ready)" : "غير مهيأ";
    }
  } catch (e) {
    console.error("Cloud status check failed:", e);
  }
}

// ----------------- Slug Generator Helper -----------------

function generateCleanSlug(reciterName, moshafName, moshafObj = null, reciterObj = null) {
  const currentRec = reciterObj || selectedReciter;
  const currentM = moshafObj || selectedMoshaf;

  // Check if reciter/moshaf already has a known slug in reads.json or catalog
  if (currentRec && window.readsMapByServer && currentM?.server) {
    const norm = currentM.server.trim().replace(/\/+$/, "") + "/";
    if (window.readsMapByServer[norm]?.slug) {
      return window.readsMapByServer[norm].slug;
    }
  }

  const rLower = (reciterName || "").toLowerCase();
  const mLower = (moshafName || "").toLowerCase();

  let reciterSlug = "reciter";
  if (rLower.includes("hussary") || rLower.includes("husary") || rLower.includes("حصري")) reciterSlug = "husry";
  else if (rLower.includes("afasy") || rLower.includes("alafasi") || rLower.includes("عفاسي")) reciterSlug = "afasy";
  else if (rLower.includes("minshawi") || rLower.includes("منشاوي")) reciterSlug = "minshawi";
  else if (rLower.includes("abdulbasit") || rLower.includes("عبد الباسط") || rLower.includes("عبدالباسط")) reciterSlug = "abdulbasit";
  else if (rLower.includes("shuraym") || rLower.includes("شريم")) reciterSlug = "shuraym";
  else if (rLower.includes("sudais") || rLower.includes("سديس")) reciterSlug = "sudais";
  else if (rLower.includes("ghamadi") || rLower.includes("غامدي")) reciterSlug = "ghamadi";
  else if (rLower.includes("maher") || rLower.includes("معيقلي")) reciterSlug = "maher";
  else if (rLower.includes("ayyoub") || rLower.includes("ayyub") || rLower.includes("أيوب")) reciterSlug = "ayyoub";
  else if (rLower.includes("tblawi") || rLower.includes("tablawi") || rLower.includes("طبلاوي")) reciterSlug = "tblawi";
  else if (rLower.includes("hudhaify") || rLower.includes("huthifi") || rLower.includes("حذيفي")) reciterSlug = "hudhaify";
  else if (rLower.includes("akdar") || rLower.includes("akhdar") || rLower.includes("اخضر") || rLower.includes("أخضر")) reciterSlug = "ibrahim-al-akdar";
  else if (rLower.includes("asiri") || rLower.includes("عسيري")) reciterSlug = "ibrahim-al-asiri";
  else if (rLower.includes("ajm") || rLower.includes("ajamy") || rLower.includes("عجمي")) reciterSlug = "ajamy";
  else if (rLower.includes("shatri") || rLower.includes("شاطري")) reciterSlug = "shatri";
  else {
    reciterSlug = rLower.replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 18) || `reciter-${currentRec?.id || 1}`;
  }

  // Baseline riwayah detection based on reads.json baseline and moshaf metadata
  let riwayahSlug = "hafs";
  if (mLower.includes("warsh") || mLower.includes("ورش")) riwayahSlug = "warsh";
  else if (mLower.includes("qalon") || mLower.includes("قالون")) riwayahSlug = "qalon";
  else if (mLower.includes("dori") || mLower.includes("douri") || mLower.includes("دوري")) riwayahSlug = "dori";
  else if (mLower.includes("susi") || mLower.includes("سوسي")) riwayahSlug = "susi";
  else if (mLower.includes("bazzi") || mLower.includes("بزي")) riwayahSlug = "bazzi";
  else if (mLower.includes("shuba") || mLower.includes("شعبة")) riwayahSlug = "shuba";
  else if (mLower.includes("mojawwad") || mLower.includes("مجود")) riwayahSlug = "mojawwad";
  else if (mLower.includes("mo-lim") || mLower.includes("معلم")) riwayahSlug = "moallim";

  if (mLower.includes("mojawwad") || mLower.includes("مجود")) {
    riwayahSlug = "mojawwad";
  } else if (mLower.includes("mo-lim") || mLower.includes("معلم")) {
    riwayahSlug = "moallim";
  } else if (mLower.includes("مرتل") || mLower.includes("murattal")) {
    riwayahSlug = `${riwayahSlug}-murattal`;
  }

  // Always prefix with qurantvapp- for global uniqueness on Archive.org
  return `qurantvapp-${reciterSlug}-${riwayahSlug}`;
}

function onStudioSlugInput() {
  const inputEl = document.getElementById("studioSlugInput");
  if (!inputEl) return;
  currentSlug = inputEl.value.trim();
  const step1SlugInput = document.getElementById("step1SlugInput");
  if (step1SlugInput) step1SlugInput.value = currentSlug;
}

function onStudioSlugChange() {
  const inputEl = document.getElementById("studioSlugInput");
  if (!inputEl) return;
  currentSlug = inputEl.value.trim() || generateCleanSlug(selectedReciter?.name_en || selectedReciter?.name_ar, selectedMoshaf?.name);
  inputEl.value = currentSlug;
  const step1SlugInput = document.getElementById("step1SlugInput");
  if (step1SlugInput) step1SlugInput.value = currentSlug;
  
  // Reload timing status with updated custom slug
  onStep3SurahChange();
}

function resetCurrentSlugToDefault() {
  currentSlug = generateCleanSlug(selectedReciter?.name_en || selectedReciter?.name_ar, selectedMoshaf?.name);
  const studioInput = document.getElementById("studioSlugInput");
  if (studioInput) studioInput.value = currentSlug;
  const step1SlugInput = document.getElementById("step1SlugInput");
  if (step1SlugInput) step1SlugInput.value = currentSlug;
  showNotification(`تمت إعادة تعيين الـ Slug إلى: ${currentSlug}`, "info");
  onStep3SurahChange();
}

// ----------------- Navigation -----------------

function goToStep(stepNum) {
  currentStep = stepNum;

  const panelIds = [2, 3, 4];
  panelIds.forEach(id => {
    const indicator = document.getElementById(`stepIndicator${id}`);
    const panel = document.getElementById(`stepPanel${id}`);
    if (indicator) {
      indicator.classList.toggle("active", id === stepNum);
    }
    if (panel) {
      panel.classList.toggle("active", id === stepNum);
    }
  });

  if (stepNum === 2) initStep2();
  if (stepNum === 3) initStep3();
  if (stepNum === 4) initStep4();
}

function jumpToStep(stepNum) {
  goToStep(stepNum);
}

function navigateSurah(delta) {
  const newSurahId = Math.max(1, Math.min(114, selectedSurahId + delta));
  if (newSurahId === selectedSurahId) return;
  selectedSurahId = newSurahId;
  const selectEl = document.getElementById("step3SurahSelect");
  if (selectEl) selectEl.value = selectedSurahId.toString();
  onStep3SurahChange();
}

// ----------------- Step 1 & Catalog Loading -----------------

async function loadRecitersAndSurahs() {
  try {
    const [recitersRes, surahsRes, readsRes] = await Promise.all([
      fetch(`${API_BASE}/api/catalog/reciters-with-moshafs`),
      fetch(`${API_BASE}/api/surahs`),
      fetch(`/data-mirror/timing/reads.json?t=${Date.now()}`).catch(() => null)
    ]);

    allReciters = await recitersRes.json();
    allSurahs = await surahsRes.json();

    if (readsRes && readsRes.ok) {
      try {
        const rList = await readsRes.json();
        window.readsMapByServer = {};
        for (const r of rList) {
          if (r.folder_url) {
            const norm = r.folder_url.trim().replace(/\/+$/, "") + "/";
            window.readsMapByServer[norm] = r;
          }
        }
      } catch (err) {
        console.warn("Could not parse reads.json:", err);
      }
    }

    // Fetch catalog summary in background
    fetchCatalogSummary();

    renderReciterSelect();
    renderSurahOptions();

    onStep1ReciterChange();
    checkCloudStatus();
  } catch (e) {
    showNotification("فشل تحميل الكتالوج: " + e.message, "danger");
  }
}

async function fetchCatalogSummary() {
  try {
    const res = await fetch(`${API_BASE}/api/timing/catalog-filter-summary`);
    currentCatalogSummary = await res.json();
    renderReciterSelect();
  } catch (e) {
    console.warn("Catalog summary fetch failed:", e);
  }
}

function renderReciterSelect() {
  const step1ReciterSelect = document.getElementById("step1ReciterSelect");
  if (!step1ReciterSelect) return;

  const summaryMap = {};
  if (currentCatalogSummary?.reciters) {
    currentCatalogSummary.reciters.forEach(r => { summaryMap[r.id] = r; });
  }

  let filtered = allReciters;
  if (currentRecitersFilter === 'complete') {
    filtered = allReciters.filter(r => summaryMap[r.id]?.is_complete);
  } else if (currentRecitersFilter === 'partial') {
    filtered = allReciters.filter(r => summaryMap[r.id]?.has_timing && !summaryMap[r.id]?.is_complete);
  } else if (currentRecitersFilter === 'untimed') {
    filtered = allReciters.filter(r => !summaryMap[r.id]?.has_timing);
  }

  if (!filtered.length) {
    filtered = allReciters; // fallback
  }

  const curVal = parseInt(step1ReciterSelect.value) || selectedReciter?.id || filtered[0]?.id;

  step1ReciterSelect.innerHTML = filtered.map(r => {
    const sum = summaryMap[r.id];
    let badge = "";
    if (sum) {
      if (sum.is_complete) badge = " [⚡ كامل 114/114]";
      else if (sum.has_timing) badge = ` [✨ ${sum.total_timed_surahs}/114]`;
      else badge = " [⚠️ غير موقت]";
    }
    return `<option value="${r.id}" ${r.id === curVal ? 'selected' : ''}>${r.id}. ${escapeHtml(r.name_ar)}${badge}</option>`;
  }).join("");
}

function setRecitersFilter(filter, el) {
  currentRecitersFilter = filter;
  document.querySelectorAll(".admin-filter-bar #chipReciterAll, #chipReciterComplete, #chipReciterPartial, #chipReciterUntimed").forEach(b => b.classList.remove("active"));
  if (el) el.classList.add("active");
  renderReciterSelect();
  onStep1ReciterChange();
}

function setSurahsFilter(filter, el) {
  currentSurahsFilter = filter;
  document.querySelectorAll(".admin-filter-bar #chipSurahAll, #chipSurahTimed, #chipSurahUntimed").forEach(b => b.classList.remove("active"));
  if (el) el.classList.add("active");
  renderSurahOptions();
}

function renderSurahOptions() {
  const step3SurahSelect = document.getElementById("step3SurahSelect");
  const step2SurahSelect = document.getElementById("step2SurahSelect");
  if (!step3SurahSelect) return;

  const statusMap = {};
  if (currentMushafStatus?.surahs) {
    currentMushafStatus.surahs.forEach(s => { statusMap[s.surah_id] = s; });
  }

  let filtered = allSurahs;
  if (currentSurahsFilter === 'timed') {
    filtered = allSurahs.filter(s => statusMap[s.id]?.has_timing);
  } else if (currentSurahsFilter === 'untimed') {
    filtered = allSurahs.filter(s => !statusMap[s.id]?.has_timing);
  }

  if (!filtered.length) {
    filtered = allSurahs; // fallback
  }

  const curVal = selectedSurahId || filtered[0]?.id || 1;

  const opts = filtered.map(s => {
    const st = statusMap[s.id];
    let tag = "";
    if (st) {
      if (st.is_reviewed) tag = " [🛡️ مُعتمد]";
      else if (st.has_timing) tag = " [⚡ موقت]";
      else tag = " [⚠️ غير موقت]";
    }
    return `<option value="${s.id}" ${s.id === curVal ? 'selected' : ''}>${s.id.toString().padStart(3, '0')}. سورة ${s.name_ar} ${tag}</option>`;
  }).join("");

  step3SurahSelect.innerHTML = opts;
  if (step2SurahSelect) step2SurahSelect.innerHTML = opts;

  // Update filter badge counts
  if (currentMushafStatus) {
    const timedChip = document.getElementById("chipSurahTimed");
    const untimedChip = document.getElementById("chipSurahUntimed");
    if (timedChip) timedChip.textContent = `✅ الموقتة (${currentMushafStatus.timed_count})`;
    if (untimedChip) untimedChip.textContent = `⚠️ غير الموقتة (${currentMushafStatus.untimed_count})`;
  }
}

function onStep1ReciterChange() {
  const reciterId = parseInt(document.getElementById("step1ReciterSelect")?.value) || allReciters[0]?.id;
  selectedReciter = allReciters.find(r => r.id === reciterId);
  if (!selectedReciter) return;

  const moshafSelect = document.getElementById("step1MoshafSelect");
  moshafSelect.innerHTML = (selectedReciter.moshafs || []).map(m => `
    <option value="${m.id}">${escapeHtml(m.name)}</option>
  `).join("");

  onStep1MoshafChange();
}

async function onStep1MoshafChange() {
  const moshafId = parseInt(document.getElementById("step1MoshafSelect").value);
  selectedMoshaf = selectedReciter?.moshafs?.find(m => m.id === moshafId) || selectedReciter?.moshafs?.[0];

  currentSlug = generateCleanSlug(selectedReciter?.name_en || selectedReciter?.name_ar, selectedMoshaf?.name);
  
  const slugInput = document.getElementById("step1SlugInput");
  if (slugInput) slugInput.value = currentSlug;

  const studioSlugInput = document.getElementById("studioSlugInput");
  if (studioSlugInput) studioSlugInput.value = currentSlug;

  // Load Mushaf status matrix
  await loadMushafStatusMatrix(selectedReciter.id, selectedMoshaf?.id);

  // Live reload timing and audio for current surah
  onStep3SurahChange();
}

async function loadMushafStatusMatrix(reciterId, moshafId) {
  try {
    const serverParam = selectedMoshaf?.server ? `&server_url=${encodeURIComponent(selectedMoshaf.server)}` : "";
    const res = await fetch(`${API_BASE}/api/timing/mushaf-status?reciter_id=${reciterId}&moshaf_id=${moshafId || reciterId}${serverParam}`);
    currentMushafStatus = await res.json();
    renderSurahOptions();
    renderStep4MushafMatrix();
  } catch (e) {
    console.warn("Mushaf status matrix fetch failed:", e);
  }
}

// ----------------- Step 2: Archive.org Upload Hub -----------------

function setUploadMode(mode) {
  uploadMode = mode;
  const pillSingle = document.getElementById("pillSingleSurah");
  const pillBatch = document.getElementById("pillFullMushaf");
  const formSingle = document.getElementById("singleUploadForm");
  const formBatch = document.getElementById("batchUploadForm");

  if (mode === "single") {
    pillSingle.classList.add("active");
    pillBatch.classList.remove("active");
    formSingle.style.display = "block";
    formBatch.style.display = "none";
  } else {
    pillSingle.classList.remove("active");
    pillBatch.classList.add("active");
    formSingle.style.display = "none";
    formBatch.style.display = "block";
    document.getElementById("batchBucketDisplay").textContent = currentSlug;
    document.getElementById("batchSourceServerInput").value = selectedMoshaf?.server || "https://server13.mp3quran.net/husr/";
  }
}

function initStep2() {
  currentSlug = document.getElementById("step1SlugInput").value.trim() || currentSlug;
  document.getElementById("batchBucketDisplay").textContent = currentSlug;
  document.getElementById("batchSourceServerInput").value = selectedMoshaf?.server || "https://server13.mp3quran.net/husr/";
  onStep2SurahChange();
}

function onStep2SurahChange() {
  selectedSurahId = parseInt(document.getElementById("step2SurahSelect").value) || 1;
  const filename = `${selectedSurahId.toString().padStart(3, "0")}.mp3`;
  document.getElementById("step2FilenameInput").value = filename;

  const server = selectedMoshaf?.server?.replace(/\/+$/, "") || "https://server13.mp3quran.net/husr";
  document.getElementById("step2SourceUrlInput").value = `${server}/${filename}`;

  const uploadBtn = document.getElementById("step2UploadBtn");
  uploadBtn.textContent = `🚀 رفع السورة إلى Archive.org (${currentSlug}/${filename})`;
}

async function runStep2Upload() {
  currentSlug = document.getElementById("step1SlugInput").value.trim() || currentSlug;
  const filename = `${selectedSurahId.toString().padStart(3, "0")}.mp3`;
  const sourceUrl = document.getElementById("step2SourceUrlInput").value.trim();

  const uploadBtn = document.getElementById("step2UploadBtn");
  const outcomeBox = document.getElementById("step2OutcomeBox");

  uploadBtn.disabled = true;
  uploadBtn.textContent = `⏳ جاري التنزيل والرفع إلى Archive.org (${currentSlug}/${filename})...`;
  outcomeBox.style.display = "block";
  outcomeBox.className = "outcome-alert-box info";
  outcomeBox.innerHTML = `<div>⏳ جاري تنزيل ملف السورة ورفعه إلى عنصر Archive.org (<code>${currentSlug}</code>)... يرجى الانتظار</div>`;

  try {
    const payload = {
      reciter_id: selectedReciter.id,
      moshaf_id: selectedMoshaf.id,
      surah_id: selectedSurahId,
      source_url: sourceUrl.substring(0, sourceUrl.lastIndexOf("/")),
      bucket_identifier: currentSlug,
      title: `Surah ${selectedSurahId} - ${selectedReciter.name_ar} (${selectedMoshaf.name})`,
      creator: selectedReciter.name_ar,
      update_moshaf_server: true
    };

    const res = await fetch(`${API_BASE}/api/archive/upload-surah`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      uploadedArchiveAudioUrl = result.download_url;
      outcomeBox.className = "outcome-alert-box success";
      outcomeBox.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 6px;">✅ تم الرفع بنجاح وتحديث خادم التلاوة إلى Archive.org!</div>
        <div><strong>رابط البث السحابي المباشر (Audio CDN):</strong> <a href="${result.download_url}" target="_blank" class="text-cyan" style="word-break: break-all;">${result.download_url}</a></div>
        <div><strong>صفحة العنصر في Archive:</strong> <a href="${result.item_url}" target="_blank" class="text-cyan">${result.item_url}</a></div>
        <div><strong>الحفظ المحلي للاستخراج:</strong> <code class="text-dim">${result.local_path || 'تم التخزين'}</code></div>
      `;
      checkCloudStatus();
    } else {
      outcomeBox.className = "outcome-alert-box danger";
      outcomeBox.innerHTML = `
        <div style="font-weight: 700;">❌ فشل الرفع إلى Archive.org:</div>
        <div style="margin-top: 4px; word-break: break-all;">${escapeHtml(result.detail || "خطأ غير معروف")}</div>
      `;
    }
  } catch (e) {
    outcomeBox.className = "outcome-alert-box danger";
    outcomeBox.innerHTML = `
      <div style="font-weight: 700;">❌ خطأ في الاتصال بالخادم:</div>
      <div>${escapeHtml(e.message)}</div>
    `;
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = `🚀 رفع السورة إلى Archive.org (${currentSlug}/${filename})`;
  }
}

// Full Mushaf Batch Upload
async function startMushafBatchUpload() {
  const sourceServer = document.getElementById("batchSourceServerInput").value.trim();
  const rangeStr = document.getElementById("batchSurahsRangeInput").value.trim() || "1-114";

  let surahs = [];
  if (rangeStr.includes("-")) {
    const parts = rangeStr.split("-");
    const start = parseInt(parts[0]) || 1;
    const end = parseInt(parts[1]) || 114;
    for (let i = start; i <= end; i++) surahs.push(i);
  } else if (rangeStr.includes(",")) {
    surahs = rangeStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  } else {
    surahs = [parseInt(rangeStr) || 1];
  }

  const startBtn = document.getElementById("btnStartBatchUpload");
  const cancelBtn = document.getElementById("btnCancelBatchUpload");
  const progressCard = document.getElementById("batchProgressCard");

  startBtn.disabled = true;
  cancelBtn.style.display = "inline-flex";
  progressCard.style.display = "block";

  try {
    const payload = {
      reciter_id: selectedReciter.id,
      moshaf_id: selectedMoshaf.id,
      bucket_identifier: currentSlug,
      source_server: sourceServer,
      surahs: surahs,
      creator: selectedReciter.name_ar
    };

    const res = await fetch(`${API_BASE}/api/archive/upload-mushaf-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      archiveBatchJobId = result.job_id;
      pollArchiveBatchStatus();
    } else {
      alert("خطأ: " + (result.detail || "تعذر بدء الرفع الجماعي"));
      startBtn.disabled = false;
      cancelBtn.style.display = "none";
    }
  } catch (e) {
    alert("فشل الاتصال: " + e.message);
    startBtn.disabled = false;
    cancelBtn.style.display = "none";
  }
}

function pollArchiveBatchStatus() {
  if (archiveBatchInterval) clearInterval(archiveBatchInterval);

  archiveBatchInterval = setInterval(async () => {
    if (!archiveBatchJobId) return;

    try {
      const res = await fetch(`${API_BASE}/api/archive/batch-status/${archiveBatchJobId}`);
      const data = await res.json();

      document.getElementById("batchProgressBarFill").style.width = `${data.percent}%`;
      document.getElementById("batchPercentBadge").textContent = `${data.percent}%`;
      document.getElementById("batchStatusHeading").textContent = `جاري رفع السورة (${data.current_surah}) — ${data.completed_count}/${data.total_surahs} مكتمل`;
      document.getElementById("batchSurahsCount").textContent = `${data.completed_count} / ${data.total_surahs}`;

      if (data.metrics) {
        document.getElementById("batchMbUploaded").textContent = `${data.metrics.uploaded_mb} MB`;
        document.getElementById("batchSpeed").textContent = data.metrics.speed_str;
        document.getElementById("batchEta").textContent = data.metrics.remaining_str;
      }

      const logWindow = document.getElementById("batchLogWindow");
      logWindow.innerHTML = (data.logs || []).map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join("");
      logWindow.scrollTop = logWindow.scrollHeight;

      if (data.status === "completed" || data.status === "completed_with_errors" || data.status === "cancelled") {
        clearInterval(archiveBatchInterval);
        document.getElementById("btnStartBatchUpload").disabled = false;
        document.getElementById("btnCancelBatchUpload").style.display = "none";

        if (data.status === "completed") {
          document.getElementById("batchStatusHeading").textContent = `✅ تم رفع كافة السور (${data.total_surahs}) بنجاح إلى Archive.org!`;
          showNotification("تم رفع المصحف كاملاً إلى Archive.org بنجاح!", "success");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, 2000);
}

async function cancelMushafBatchUpload() {
  if (!archiveBatchJobId) return;
  await fetch(`${API_BASE}/api/archive/cancel-batch/${archiveBatchJobId}`, { method: "POST" });
  document.getElementById("btnCancelBatchUpload").textContent = "جاري الإلغاء...";
}

function resetBatchRange() {
  document.getElementById("batchSurahsRangeInput").value = "1-114";
}

// ----------------- Step 3: Timing Studio (Primary Hub) -----------------

async function initStep3() {
  const step3SurahSelect = document.getElementById("step3SurahSelect");
  if (step3SurahSelect && step3SurahSelect.value != selectedSurahId) {
    step3SurahSelect.value = selectedSurahId.toString();
  }
  await onStep3SurahChange();
}

async function onStep3SurahChange() {
  const step3SurahSelect = document.getElementById("step3SurahSelect");
  selectedSurahId = parseInt(step3SurahSelect?.value || selectedSurahId || 1);

  // Sync with step 2
  const step2SurahSelect = document.getElementById("step2SurahSelect");
  if (step2SurahSelect) step2SurahSelect.value = selectedSurahId.toString();

  const filename = `${selectedSurahId.toString().padStart(3, "0")}.mp3`;
  const defaultArchiveUrl = `https://archive.org/download/${currentSlug}/${filename}`;
  const sourceServer = selectedMoshaf?.server?.replace(/\/+$/, "") || "https://server13.mp3quran.net/husr";
  const sourceAudioUrl = `${sourceServer}/${filename}`;
  const inputEl = document.getElementById("step3AudioUrlInput");
  const audioSourceBadge = document.getElementById("step3AudioSourceBadge");

  audioElement.onerror = null;

  // Check if local cached audio file is available
  try {
    const audioCheckRes = await fetch(`${API_BASE}/api/audio/status?bucket=${currentSlug}&surah=${selectedSurahId}`);
    const audioData = await audioCheckRes.json();

    if (audioData.available) {
      const localAudioUrl = `${window.location.origin}${audioData.local_url}`;
      if (inputEl) inputEl.value = localAudioUrl;
      audioElement.src = localAudioUrl;
      if (audioSourceBadge) {
        audioSourceBadge.textContent = `⚡ محلي فوري (${audioData.size_mb} MB)`;
        audioSourceBadge.className = "badge success";
      }
    } else {
      audioElement.onerror = () => {
        console.warn("Archive.org audio file not ready, falling back to source server:", sourceAudioUrl);
        audioElement.onerror = null;
        audioElement.src = sourceAudioUrl;
        if (inputEl) inputEl.value = sourceAudioUrl;
        if (audioSourceBadge) {
          audioSourceBadge.textContent = `🔗 خادم المصدر الأصلي`;
          audioSourceBadge.className = "badge warning";
        }
      };

      if (inputEl) inputEl.value = defaultArchiveUrl;
      audioElement.src = defaultArchiveUrl;
      if (audioSourceBadge) {
        audioSourceBadge.textContent = `🌐 سحابي (Archive.org)`;
        audioSourceBadge.className = "badge info";
      }
    }
  } catch (e) {
    if (inputEl) inputEl.value = sourceAudioUrl;
    audioElement.src = sourceAudioUrl;
    if (audioSourceBadge) {
      audioSourceBadge.textContent = `🔗 المصدر الأصلي`;
      audioSourceBadge.className = "badge warning";
    }
  }

  const statusBadge = document.getElementById("step3TimingStatusBadge");
  const statusPlaceholder = document.getElementById("step3WaveStatus");
  const saveLocalBtn = document.getElementById("step3SaveLocalBtn");
  const directPushBtn = document.getElementById("step3DirectPushBtn");
  const reviewedCheckbox = document.getElementById("step3ReviewedCheckbox");
  const autoDetectBox = document.getElementById("apiAutoDetectBox");
  const statusBox = document.getElementById("step3StatusBox");
  if (statusBox) statusBox.style.display = "none";

  if (statusBadge) {
    statusBadge.textContent = "فحص...";
    statusBadge.className = "badge";
  }

  // 1. Check existing local timing
  let hasLocalTiming = false;
  try {
    const moshafParam = selectedMoshaf?.id ? `&moshaf_id=${selectedMoshaf.id}` : "";
    const slugParam = currentSlug ? `&slug=${encodeURIComponent(currentSlug)}` : "";
    const res = await fetch(`${API_BASE}/api/timing/${selectedReciter?.id || 118}/${selectedSurahId}?t=${Date.now()}${moshafParam}${slugParam}`);
    const data = await res.json();

    if (data.exists && data.entries?.length) {
      hasLocalTiming = true;
      currentTimingData = data.entries;
      renderStep3Verses(data.entries);
      
      const isRev = Boolean(data.reviewed);
      const isPushed = Boolean(data.pushed_to_github);
      if (reviewedCheckbox) reviewedCheckbox.checked = isRev;

      if (statusBadge) {
        if (isPushed) {
          statusBadge.textContent = `🚀 منشور على GitHub (${data.entries.length} آية)`;
          statusBadge.className = "badge success";
        } else if (isRev) {
          statusBadge.textContent = `✅ مُراجع ومُعتمد (${data.entries.length} آية)`;
          statusBadge.className = "badge success";
        } else {
          statusBadge.textContent = `⚡ توقيت جاهز (${data.entries.length} آية)`;
          statusBadge.className = "badge warning";
        }
      }
      if (statusPlaceholder) {
        const pushedTag = isPushed ? " · 🚀 منشور على GitHub" : "";
        const revLabel = isRev ? `🛡️ مُراجع ومُعتمد${pushedTag}` : "⚡ توقيت جاهز";
        statusPlaceholder.innerHTML = `<span style="color: var(--primary); font-weight: 700;">✅ تم تحميل توقيت الرواية (${data.entries.length} آية - ${data.total_duration_sec}s) — [${revLabel}]</span>`;
      }
      if (saveLocalBtn) saveLocalBtn.disabled = false;
      if (directPushBtn) directPushBtn.disabled = false;

      // If pushed to GitHub or reviewed, show banner status
      if (isPushed) {
        const actionContainer = document.getElementById("apiDetectActionContainer");
        const pulseIcon = document.getElementById("apiPulseIcon");
        if (autoDetectBox) {
          autoDetectBox.style.display = "block";
          autoDetectBox.className = "api-auto-detect-card github-pushed mt-2";
          if (pulseIcon) pulseIcon.textContent = "🚀";
          document.getElementById("apiDetectTitle").textContent = `توقيت سورة ${selectedSurahId} منشور ومعتمد على GitHub`;
          document.getElementById("apiDetectDesc").textContent = "ملف التوقيت موجود ومعتمد وموثق في مستودع GitHub للمشروع";
          if (actionContainer) {
            actionContainer.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge-github-pushed">✅ منشور مسبقاً (Pushed)</span>
                ${data.github_url ? `<a href="${data.github_url}" target="_blank" class="btn-github-view" title="عرض الملف على GitHub">🌐 عرض الملف</a>` : ''}
              </div>
            `;
          }
        }
      } else {
        if (autoDetectBox) autoDetectBox.style.display = "none";
      }
    }
  } catch (e) {
    console.error("Local timing check failed:", e);
  }

  // 2. If no local timing, auto-check if external API or GitHub has timing
  if (!hasLocalTiming) {
    currentTimingData = [];
    step3VersesTbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-dim">لا يوجد توقيت مسجل محلياً لرواية (${escapeHtml(selectedMoshaf?.name || '')}) لسورة ${selectedSurahId}.</td></tr>`;
    if (statusBadge) {
      statusBadge.textContent = "⚠️ غير موقت محلياً";
      statusBadge.className = "badge warning";
    }
    if (saveLocalBtn) saveLocalBtn.disabled = true;
    if (directPushBtn) directPushBtn.disabled = true;

    try {
      const serverParam = selectedMoshaf?.server ? `&server_url=${encodeURIComponent(selectedMoshaf.server)}` : "";
      const moshafParam = selectedMoshaf?.id ? `&moshaf_id=${selectedMoshaf.id}` : "";
      const slugParam = currentSlug ? `&slug=${encodeURIComponent(currentSlug)}` : "";
      const checkRes = await fetch(`${API_BASE}/api/import/external-timing/check?reciter_id=${selectedReciter?.id || 118}&surah_id=${selectedSurahId}${moshafParam}${serverParam}${slugParam}`);
      const checkData = await checkRes.json();

      const actionContainer = document.getElementById("apiDetectActionContainer");
      const pulseIcon = document.getElementById("apiPulseIcon");

      if (checkData.available && checkData.pushed_to_github) {
        // Already pushed to GitHub
        detectedApiTiming = checkData;
        if (autoDetectBox) {
          autoDetectBox.style.display = "block";
          autoDetectBox.className = "api-auto-detect-card github-pushed mt-2";
          if (pulseIcon) pulseIcon.textContent = "🚀";
          document.getElementById("apiDetectTitle").textContent = `توقيت سورة ${selectedSurahId} منشور مسبقاً على GitHub`;
          document.getElementById("apiDetectDesc").textContent = "تم اعتماد ونشر ملف التوقيت مسبقاً إلى مستودع GitHub للمشروع";
          if (actionContainer) {
            actionContainer.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge-github-pushed">✅ تم النشر مسبقاً (Pushed)</span>
                ${checkData.github_url ? `<a href="${checkData.github_url}" target="_blank" class="btn-github-view" title="عرض الملف على GitHub">🌐 عرض الملف</a>` : ''}
              </div>
            `;
          }
        }
        if (statusPlaceholder) {
          statusPlaceholder.innerHTML = `<span style="color: #34d399; font-weight: 700;">🚀 توقيت سورة ${selectedSurahId} معتمد ومنشور مسبقاً على مستودع GitHub</span>`;
        }
        if (statusBadge) {
          statusBadge.textContent = "🚀 منشور على GitHub";
          statusBadge.className = "badge success";
        }
      } else if (checkData.available && checkData.source === "mp3quran") {
        detectedApiTiming = checkData;
        if (autoDetectBox) {
          autoDetectBox.style.display = "block";
          autoDetectBox.className = "api-auto-detect-card mt-2";
          if (pulseIcon) pulseIcon.textContent = "⚡";
          document.getElementById("apiDetectTitle").textContent = `توقيت متوفر على mp3quran.net API (${checkData.entries_count} آية)`;
          document.getElementById("apiDetectDesc").textContent = "يمكنك استيراد التوقيت فوراً بنقرة واحدة ومطابقته مع نص المصحف";
          if (actionContainer) {
            actionContainer.innerHTML = `
              <button class="btn btn-sm btn-success" id="btnQuickImportTiming" onclick="quickImportApiTiming()">
                📥 استيراد التوقيت الآن
              </button>
            `;
          }
        }
        if (statusPlaceholder) {
          statusPlaceholder.innerHTML = `<span class="text-cyan font-bold">✨ توقيت سورة ${selectedSurahId} متوفر على الـ API — اضغط "استيراد التوقيت الآن" أدناه</span>`;
        }
      } else {
        detectedApiTiming = null;
        if (autoDetectBox) autoDetectBox.style.display = "none";
        if (statusPlaceholder) {
          statusPlaceholder.textContent = `سورة ${selectedSurahId} غير موقتة بعد — اضغط "بدء استخراج ومحاذاة الآيات" للاستخراج بالذكاء الاصطناعي`;
        }
      }
    } catch (e) {
      if (autoDetectBox) autoDetectBox.style.display = "none";
    }
  }
}

// Quick 1-Click Import from Auto-Detect Banner
async function quickImportApiTiming() {
  const btn = document.getElementById("btnQuickImportTiming");
  btn.disabled = true;
  btn.textContent = "⏳ جاري الاستيراد...";

  try {
    const payload = {
      source: "mp3quran",
      reciter_id: selectedReciter.id,
      moshaf_id: selectedMoshaf.id,
      surah_id: selectedSurahId,
      read_id: detectedApiTiming?.read_id,
      slug: currentSlug,
      reviewed: true
    };

    const res = await fetch(`${API_BASE}/api/import/timing-from-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      currentTimingData = result.entries;
      renderStep3Verses(result.entries);

      document.getElementById("apiAutoDetectBox").style.display = "none";
      document.getElementById("step3TimingStatusBadge").textContent = `✅ مستورد ومُعتمد (${result.count} آية)`;
      document.getElementById("step3TimingStatusBadge").className = "badge success";
      document.getElementById("step3WaveStatus").innerHTML = `<span style="color: var(--primary); font-weight: 700;">✅ تم استيراد التوقيت بنجاح من ${escapeHtml(result.source)} (${result.count} آية)</span>`;
      document.getElementById("step3SaveLocalBtn").disabled = false;
      document.getElementById("step3DirectPushBtn").disabled = false;

      showNotification(`تم استيراد توقيت سورة ${selectedSurahId} بنجاح من ${result.source}!`, "success");
    } else {
      alert("فشل الاستيراد: " + (result.detail || "خطأ غير معروف"));
    }
  } catch (e) {
    alert("خطأ: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "📥 استيراد التوقيت الآن";
  }
}

// ----------------- Faster-Whisper STT Analysis -----------------

async function runStep3Analyze() {
  const analyzeBtn = document.getElementById("step3AnalyzeBtn");
  const audioUrl = document.getElementById("step3AudioUrlInput").value.trim();
  const modelSize = document.getElementById("step3ModelSelect").value;
  const statusPlaceholder = document.getElementById("step3WaveStatus");
  const statusBox = document.getElementById("step3StatusBox");
  const sttProgressBox = document.getElementById("step3SttProgressBox");
  const directPushBtn = document.getElementById("step3DirectPushBtn");
  const saveLocalBtn = document.getElementById("step3SaveLocalBtn");
  const reviewedCheckbox = document.getElementById("step3ReviewedCheckbox");

  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = `<span>⏳ جاري استخراج ومحاذاة الآيات...</span>`;
  statusPlaceholder.textContent = "جاري استخراج الكلمات ومحاذاة الآيات بالذكاء الاصطناعي (Faster-Whisper)...";
  statusBox.style.display = "none";
  sttProgressBox.style.display = "block";

  // Reset Progress HUD
  document.getElementById("sttPercentText").textContent = "0%";
  document.getElementById("sttProgressBarFill").style.width = "0%";
  document.getElementById("sttPhaseMsg").textContent = "تهيئة النموذج وتنزيل الصوت...";
  document.getElementById("sttTimeProcessed").textContent = "0.0s / 0.0s";
  document.getElementById("sttSpeed").textContent = "1.0x";
  document.getElementById("sttWordCount").textContent = "0";
  document.getElementById("sttLiveTranscript").textContent = "جاري بدء التعرف على الكلمات...";

  audioElement.src = audioUrl;

  try {
    const filename = `${selectedSurahId.toString().padStart(3, "0")}.mp3`;
    const sourceServer = selectedMoshaf?.server?.replace(/\/+$/, "") || "https://server13.mp3quran.net/husr";
    const sourceUrl = `${sourceServer}/${filename}`;

    const formData = new FormData();
    formData.append("surah_id", selectedSurahId);
    formData.append("model_size", modelSize);
    formData.append("audio_url", audioUrl);
    formData.append("source_url", sourceUrl);

    const startRes = await fetch(`${API_BASE}/api/process-timing/start`, {
      method: "POST",
      body: formData
    });
    const startData = await startRes.json();

    if (!startData.success || !startData.job_id) {
      throw new Error(startData.detail || "تعذر بدء عملية المعالجة");
    }

    const sttJobId = startData.job_id;

    // Poll Progress
    await new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE}/api/process-timing/status/${sttJobId}`);
          const pollData = await pollRes.json();

          document.getElementById("sttPercentText").textContent = `${pollData.percent}%`;
          document.getElementById("sttProgressBarFill").style.width = `${pollData.percent}%`;
          document.getElementById("sttPhaseMsg").textContent = pollData.message || "جاري التحليل...";
          document.getElementById("sttTimeProcessed").textContent = `${pollData.current_time_sec || 0}s / ${pollData.total_duration_sec || 0}s`;
          document.getElementById("sttSpeed").textContent = pollData.speed_x || "1.0x";
          document.getElementById("sttWordCount").textContent = pollData.words_count || 0;
          if (pollData.last_text) {
            document.getElementById("sttLiveTranscript").textContent = pollData.last_text;
          }

          if (pollData.status === "completed") {
            clearInterval(pollInterval);
            currentTimingData = pollData.entries;
            renderStep3Verses(pollData.entries);

            // Auto save locally
            await saveTimingLocally(false);

            statusPlaceholder.innerHTML = `<span style="color: var(--primary); font-weight: 700;">✅ اكتمل الاستخراج بنجاح (${pollData.entries.length} آية)</span>`;
            document.getElementById("step3TimingStatusBadge").textContent = `✅ مستخرج ومُعتمد (${pollData.entries.length} آية)`;
            document.getElementById("step3TimingStatusBadge").className = "badge success";
            if (saveLocalBtn) saveLocalBtn.disabled = false;
            if (directPushBtn) directPushBtn.disabled = false;
            resolve();
          } else if (pollData.status === "error") {
            clearInterval(pollInterval);
            reject(new Error(pollData.error || "فشلت المعالجة"));
          }
        } catch (err) {
          clearInterval(pollInterval);
          reject(err);
        }
      }, 1000);
    });

  } catch (e) {
    statusPlaceholder.textContent = `❌ حدث خطأ: ${e.message}`;
    statusBox.style.display = "block";
    statusBox.className = "status-callout danger";
    statusBox.textContent = `فشل التحليل: ${e.message}`;
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
      </svg>
      <span>بدء استخراج ومحاذاة الآيات</span>
    `;
    setTimeout(() => { sttProgressBox.style.display = "none"; }, 3000);
  }
}

// ----------------- Interactive Verses Table & Audio Sync -----------------

function renderStep3Verses(entries) {
  const tbody = document.getElementById("step3VersesTbody");
  const countBadge = document.getElementById("currentAyahCountBadge");
  if (countBadge) countBadge.textContent = `${entries.length} آية`;

  if (!entries || !entries.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-dim">لا توجد بيانات توقيت.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map((e, idx) => `
    <tr id="ayahRow_${idx}" class="${idx === focusedAyahIdx ? 'active-row' : ''}">
      <td class="text-center font-bold font-mono">${e.ayah === 0 ? 'ب' : e.ayah}</td>
      <td class="arabic-text">${escapeHtml(e.text || '')}</td>
      <td><input type="number" step="0.01" value="${(e.start_time / 1000).toFixed(2)}" onchange="updateAyahTime(${idx}, 'start', this.value)" class="time-edit-input" /></td>
      <td><input type="number" step="0.01" value="${(e.end_time / 1000).toFixed(2)}" onchange="updateAyahTime(${idx}, 'end', this.value)" class="time-edit-input" /></td>
      <td class="font-mono text-dim text-xs">${((e.end_time - e.start_time) / 1000).toFixed(2)}s</td>
      <td>
        <button class="btn-play-mini" onclick="playSingleAyah(${idx})" title="تشغيل الآية">▶</button>
      </td>
    </tr>
  `).join("");
}

function updateAyahTime(idx, field, valSec) {
  const ms = Math.round(parseFloat(valSec) * 1000);
  if (field === "start") currentTimingData[idx].start_time = ms;
  if (field === "end") currentTimingData[idx].end_time = ms;
  currentTimingData[idx].duration_ms = currentTimingData[idx].end_time - currentTimingData[idx].start_time;
}

function playSingleAyah(idx) {
  if (!currentTimingData || !currentTimingData.length) return;
  if (idx < 0) idx = 0;
  if (idx >= currentTimingData.length) idx = currentTimingData.length - 1;

  focusedAyahIdx = idx;
  const item = currentTimingData[idx];
  if (!item) return;

  audioElement.currentTime = item.start_time / 1000;
  audioElement.play();
  highlightActiveRow(idx);
}

function navigateAyah(delta) {
  if (!currentTimingData || !currentTimingData.length) return;
  let newIdx = focusedAyahIdx + delta;
  if (newIdx < 0) newIdx = 0;
  if (newIdx >= currentTimingData.length) newIdx = currentTimingData.length - 1;
  playSingleAyah(newIdx);
}

function highlightActiveRow(idx) {
  document.querySelectorAll(".verses-table tbody tr").forEach(r => r.classList.remove("active-row"));
  const row = document.getElementById(`ayahRow_${idx}`);
  if (row) {
    row.classList.add("active-row");
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const item = currentTimingData[idx];
  const indicator = document.getElementById("activeAyahIndicator");
  const liveCard = document.getElementById("currentAyahLiveCard");
  const liveText = document.getElementById("currentAyahLiveText");
  const numBadge = document.getElementById("currentAyahNumberBadge");
  const timingBadge = document.getElementById("currentAyahTimingBadge");

  if (item) {
    const ayahLabel = item.ayah === 0 ? 'البسملة' : `الآية ${item.ayah}`;
    if (indicator) indicator.textContent = `الآية: ${item.ayah === 0 ? 'البسملة' : item.ayah}`;
    if (numBadge) numBadge.textContent = ayahLabel;
    if (timingBadge) {
      timingBadge.textContent = `${formatTime(item.start_time / 1000)} - ${formatTime(item.end_time / 1000)} (${((item.end_time - item.start_time) / 1000).toFixed(2)}s)`;
    }
    if (liveText) {
      liveText.textContent = item.text || '...';
    }
    if (liveCard) liveCard.style.display = "block";
  }
}

function toggleAudio() {
  if (audioElement.paused) {
    audioElement.play();
    step3PlayIcon.style.display = "none";
    step3PauseIcon.style.display = "inline";
  } else {
    audioElement.pause();
    step3PlayIcon.style.display = "inline";
    step3PauseIcon.style.display = "none";
  }
}

function replayFocusedAyah() {
  playSingleAyah(focusedAyahIdx);
}

audioElement.addEventListener("timeupdate", () => {
  const cur = audioElement.currentTime;
  const dur = audioElement.duration || 0;
  step3TimeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;

  // Find active ayah
  if (currentTimingData.length) {
    const curMs = cur * 1000;
    const idx = currentTimingData.findIndex(e => curMs >= e.start_time && curMs <= e.end_time);
    if (idx !== -1 && idx !== focusedAyahIdx) {
      focusedAyahIdx = idx;
      highlightActiveRow(idx);
    }
  }
});

audioElement.addEventListener("play", () => {
  step3PlayIcon.style.display = "none";
  step3PauseIcon.style.display = "inline";
});

audioElement.addEventListener("pause", () => {
  step3PlayIcon.style.display = "inline";
  step3PauseIcon.style.display = "none";
});

// ----------------- Save Timing & GitHub Push -----------------

async function saveTimingLocally(showNotify = true) {
  if (!currentTimingData.length) return;

  const isReviewed = document.getElementById("step3ReviewedCheckbox").checked;
  const payload = {
    surah_id: selectedSurahId,
    read_id: selectedReciter.id,
    reciter_id: selectedReciter.id,
    moshaf_id: selectedMoshaf.id,
    slug: currentSlug,
    entries: currentTimingData,
    reviewed: isReviewed
  };

  try {
    const res = await fetch(`${API_BASE}/api/save-timing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success && showNotify) {
      showNotification(`تم حفظ التوقيت محلياً (${data.filename}) بنجاح!`, "success");
    }
  } catch (e) {
    if (showNotify) showNotification("فشل الحفظ: " + e.message, "danger");
  }
}

async function pushCurrentSurahTimingToGithub() {
  if (!currentTimingData.length) return;

  const btn = document.getElementById("step3DirectPushBtn");
  btn.disabled = true;
  btn.textContent = "⏳ جاري الاعتماد والنشر إلى GitHub...";

  const isReviewed = document.getElementById("step3ReviewedCheckbox").checked;
  const payload = {
    surah_id: selectedSurahId,
    read_id: selectedReciter.id,
    reciter_id: selectedReciter.id,
    moshaf_id: selectedMoshaf.id,
    slug: currentSlug,
    reciter_name: selectedReciter.name_ar,
    moshaf_name: selectedMoshaf.name,
    entries: currentTimingData,
    reviewed: isReviewed,
    commit_message: `feat(timing): publish reviewed timing for ${selectedReciter.name_ar} - ${selectedMoshaf.name} - Surah ${selectedSurahId.toString().padStart(3, '0')} (${currentTimingData.length} ayahs)`
  };

  try {
    const res = await fetch(`${API_BASE}/api/timing/publish-single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showNotification(`🚀 تم النشر والاعتماد بنجاح إلى GitHub (${result.commit_sha.substring(0, 7)})!`, "success");
      const statusBox = document.getElementById("step3StatusBox");
      statusBox.style.display = "block";
      statusBox.className = "status-callout success";
      statusBox.innerHTML = `
        <div style="font-weight: 700;">✅ تم النشر المعتمد إلى مستودع GitHub!</div>
        <div class="mt-1"><strong>رابط التوثيق:</strong> <a href="${result.commit_url}" target="_blank" class="text-cyan">${result.commit_url}</a></div>
      `;
      checkCloudStatus();
    } else {
      showNotification("فشل النشر: " + (result.detail || "خطأ غير معروف"), "danger");
    }
  } catch (e) {
    showNotification("خطأ في النشر: " + e.message, "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
      <span>🚀 نشر واعتماد توقيت هذه السورة لـ GitHub</span>
    `;
  }
}

// ----------------- Step 4: Full GitHub Publishing Hub -----------------

function initStep4() {
  document.getElementById("step4ReciterName").textContent = selectedReciter?.name_ar || "--";
  document.getElementById("step4MoshafName").textContent = selectedMoshaf?.name || "--";
  document.getElementById("step4SurahName").textContent = `سورة ${selectedSurahId} (${allSurahs[selectedSurahId-1]?.name_ar || ''})`;
  document.getElementById("step4AudioUrl").textContent = `https://archive.org/download/${currentSlug}/${selectedSurahId.toString().padStart(3, '0')}.mp3`;
  document.getElementById("step4TimingCount").textContent = `${currentTimingData.length} آية (مُعتمد ومُراجع)`;

  // Load status matrix for Full Mushaf mode
  if (selectedReciter && selectedMoshaf) {
    loadMushafStatusMatrix(selectedReciter.id, selectedMoshaf.id);
  }
}

function switchPublishMode(mode) {
  publishMode = mode;
  const pillSingle = document.getElementById("pillPublishSingle");
  const pillMushaf = document.getElementById("pillPublishMushaf");
  const singlePane = document.getElementById("step4SingleSummaryPane");
  const mushafPane = document.getElementById("step4MushafSummaryPane");
  const commitInput = document.getElementById("step4CommitMsg");
  const btnText = document.getElementById("step4PublishBtnText");

  if (mode === "single") {
    pillSingle.classList.add("active");
    pillMushaf.classList.remove("active");
    singlePane.style.display = "block";
    mushafPane.style.display = "none";
    if (commitInput) {
      commitInput.value = `feat(timing): publish reviewed timing for ${selectedReciter?.name_ar} - ${selectedMoshaf?.name} - Surah ${selectedSurahId.toString().padStart(3, '0')}`;
    }
    if (btnText) btnText.textContent = "نشر واعتماد توقيت هذه السورة لـ GitHub";
  } else {
    pillSingle.classList.remove("active");
    pillMushaf.classList.add("active");
    singlePane.style.display = "none";
    mushafPane.style.display = "block";
    const timedCount = currentMushafStatus?.timed_count || 0;
    if (commitInput) {
      commitInput.value = `feat(timing): publish full mushaf timing for ${selectedReciter?.name_ar} - ${selectedMoshaf?.name} (${timedCount} surahs)`;
    }
    if (btnText) btnText.textContent = `🚀 نشر واعتماد المصحف كاملاً إلى GitHub (${timedCount} سورة موقتة)`;
    renderStep4MushafMatrix();
  }
}

function renderStep4MushafMatrix() {
  const container = document.getElementById("step4SurahsMatrixGrid");
  if (!container || !currentMushafStatus) return;

  document.getElementById("step4MushafSubtitle").textContent = `${selectedReciter?.name_ar || ''} - ${selectedMoshaf?.name || ''}`;
  document.getElementById("step4MushafPercentBadge").textContent = `${currentMushafStatus.completion_percent}%`;
  document.getElementById("step4MushafTimedCount").textContent = currentMushafStatus.timed_count;
  document.getElementById("step4MushafReviewedCount").textContent = currentMushafStatus.reviewed_count;
  document.getElementById("step4MushafUntimedCount").textContent = currentMushafStatus.untimed_count;

  container.innerHTML = (currentMushafStatus.surahs || []).map(s => {
    let cls = "untimed";
    let icon = "⚪";
    if (s.is_reviewed) {
      cls = "reviewed";
      icon = "🛡️";
    } else if (s.has_timing) {
      cls = "timed";
      icon = "✅";
    }

    const surahObj = allSurahs.find(x => x.id === s.surah_id);
    const sName = surahObj?.name_ar || `سورة ${s.surah_id}`;

    return `
      <div class="matrix-chip ${cls}" title="${s.surah_id}. ${sName} (${s.entries_count} آية)" onclick="selectSurahFromMatrix(${s.surah_id})">
        <span class="surah-num">${s.surah_id} ${icon}</span>
        <span class="surah-name">${sName}</span>
      </div>
    `;
  }).join("");
}

function selectSurahFromMatrix(surahId) {
  selectedSurahId = surahId;
  const select = document.getElementById("step3SurahSelect");
  if (select) select.value = surahId.toString();
  goToStep(3);
  onStep3SurahChange();
}

function onApprovalCheckChange(el) {
  document.getElementById("step4PublishBtn").disabled = !el.checked;
}

async function runPublishToGitHub() {
  const btn = document.getElementById("step4PublishBtn");
  const commitMsg = document.getElementById("step4CommitMsg").value.trim();
  const outcomeBox = document.getElementById("step4OutcomeBox");

  btn.disabled = true;
  outcomeBox.style.display = "none";

  if (publishMode === "mushaf") {
    btn.textContent = "⏳ جاري توثيق ونشر كافة سور المصحف إلى GitHub...";
    try {
      const payload = {
        reciter_id: selectedReciter.id,
        moshaf_id: selectedMoshaf.id,
        slug: currentSlug,
        reciter_name: selectedReciter.name_ar,
        moshaf_name: selectedMoshaf.name,
        reviewed: true,
        commit_message: commitMsg
      };

      const res = await fetch(`${API_BASE}/api/timing/publish-mushaf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.success) {
        outcomeBox.style.display = "block";
        outcomeBox.className = "outcome-alert-box success";
        outcomeBox.innerHTML = `
          <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 6px;">🎉 تم نشر المصحف كاملاً إلى GitHub بنجاح!</div>
          <div><strong>القارئ والرواية:</strong> ${escapeHtml(selectedReciter?.name_ar || '')} - ${escapeHtml(selectedMoshaf?.name || '')}</div>
          <div><strong>السور المُدرجة في الـ commit:</strong> ${result.published_surahs_count} سورة (${result.files_count} ملف)</div>
          <div style="font-size:0.85em; color: #aaa; margin-top:2px;">💡 ملاحظة: GitHub يُظهر فقط الملفات المُعدَّلة في عرض الـ diff — السور غير المتغيرة موجودة في الـ commit ولكن لا تظهر كـ "changed".</div>
          <div><strong>Commit SHA:</strong> <code>${result.commit_sha}</code></div>
          <div class="mt-1"><strong>رابط التوثيق:</strong> <a href="${result.commit_url}" target="_blank" class="text-cyan" style="word-break: break-all;">${result.commit_url}</a></div>
          <div class="mt-1"><a href="${result.commit_url.replace('/commit/', '/tree/main/')}" target="_blank" class="text-cyan" style="font-size:0.9em;">🌲 عرض كل الملفات في شجرة الـ commit (tree view)</a></div>
        `;
        showNotification(`🎉 تم نشر المصحف (${result.published_surahs_count} سورة) بنجاح إلى GitHub!`, "success");
        loadMushafStatusMatrix(selectedReciter.id, selectedMoshaf.id);
        checkCloudStatus();
      } else {
        outcomeBox.style.display = "block";
        outcomeBox.className = "outcome-alert-box danger";
        outcomeBox.textContent = `❌ فشل النشر: ${result.detail || 'خطأ غير معروف'}`;
      }
    } catch (e) {
      outcomeBox.style.display = "block";
      outcomeBox.className = "outcome-alert-box danger";
      outcomeBox.textContent = `❌ خطأ في الاتصال: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 نشر واعتماد المصحف كاملاً إلى GitHub الآن";
    }
  } else {
    // Single Surah Publish
    btn.textContent = "⏳ جاري نشر وتوثيق السورة إلى GitHub...";
    try {
      const isReviewed = document.getElementById("step3ReviewedCheckbox")?.checked !== false;
      const payload = {
        surah_id: selectedSurahId,
        read_id: selectedMoshaf.id,  // Fixed: moshaf ID == mp3quran read_id
        reciter_id: selectedReciter.id,
        moshaf_id: selectedMoshaf.id,
        slug: currentSlug,
        reciter_name: selectedReciter.name_ar,
        moshaf_name: selectedMoshaf.name,
        entries: currentTimingData,
        reviewed: isReviewed,
        commit_message: commitMsg
      };

      const res = await fetch(`${API_BASE}/api/timing/publish-single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.success) {
        outcomeBox.style.display = "block";
        outcomeBox.className = "outcome-alert-box success";
        outcomeBox.innerHTML = `
          <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 6px;">🎉 تم نشر السورة بنجاح إلى GitHub!</div>
          <div><strong>Commit SHA:</strong> <code>${result.commit_sha}</code></div>
          <div><strong>الملفات المنشورة:</strong> ${result.files_count} ملف</div>
          <div><strong>رابط الـ Commit:</strong> <a href="${result.commit_url}" target="_blank" class="text-cyan" style="word-break: break-all;">${result.commit_url}</a></div>
        `;
        showNotification(`تم نشر سورة ${selectedSurahId} بنجاح إلى GitHub!`, "success");
        loadMushafStatusMatrix(selectedReciter.id, selectedMoshaf.id);
        checkCloudStatus();
      } else {
        outcomeBox.style.display = "block";
        outcomeBox.className = "outcome-alert-box danger";
        outcomeBox.textContent = `❌ فشل النشر: ${result.detail || 'خطأ غير معروف'}`;
      }
    } catch (e) {
      outcomeBox.style.display = "block";
      outcomeBox.className = "outcome-alert-box danger";
      outcomeBox.textContent = `❌ خطأ في الاتصال: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "نشر واعتماد البيانات على GitHub الآن";
    }
  }
}

// ----------------- Rich Multi-Tab API Import Modal -----------------

function openApiImportModal(defaultTab = 'surah') {
  const modal = document.getElementById("apiImportModal");
  modal.style.display = "flex";

  // Populate reciter selectors in modal
  const modalSurahReciterSelect = document.getElementById("modalSurahReciterSelect");
  const modalBatchReciterSelect = document.getElementById("modalBatchReciterSelect");
  const modalSurahSelect = document.getElementById("modalSurahSelect");

  const reciterOpts = allReciters.map(r => `
    <option value="${r.id}" ${r.id === (selectedReciter?.id || 118) ? 'selected' : ''}>${r.id} - ${escapeHtml(r.name_ar)} (${escapeHtml(r.name_en || '')})</option>
  `).join("");

  const surahOpts = allSurahs.map(s => `
    <option value="${s.id}" ${s.id === selectedSurahId ? 'selected' : ''}>${s.id}. سورة ${s.name_ar}</option>
  `).join("");

  if (modalSurahReciterSelect) modalSurahReciterSelect.innerHTML = reciterOpts;
  if (modalBatchReciterSelect) modalBatchReciterSelect.innerHTML = reciterOpts;
  if (modalSurahSelect) modalSurahSelect.innerHTML = surahOpts;

  // Trigger moshaf population
  onModalSurahReciterChange();
  onModalBatchReciterChange();

  switchImportTab(defaultTab);
}

function closeApiImportModal() {
  document.getElementById("apiImportModal").style.display = "none";
}

function switchImportTab(tab) {
  document.querySelectorAll(".modal-tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".import-tab-pane").forEach(p => p.style.display = "none");

  if (tab === "surah") {
    document.getElementById("tabBtnImportSurah")?.classList.add("active");
    document.getElementById("importPaneSurah").style.display = "block";
  } else if (tab === "reciters") {
    document.getElementById("tabBtnImportReciters")?.classList.add("active");
    document.getElementById("importPaneReciters").style.display = "block";
    fetchRemoteReciters();
  } else if (tab === "batch") {
    document.getElementById("tabBtnImportBatch")?.classList.add("active");
    document.getElementById("importPaneBatch").style.display = "block";
  }
}

function onImportSurahSourceChange() {
  const source = document.getElementById("importSurahSourceSelect").value;
  document.getElementById("importCustomUrlGroup").style.display = source === "custom_url" ? "block" : "none";
  document.getElementById("importRawJsonGroup").style.display = source === "raw_json" ? "block" : "none";
}

function onModalSurahReciterChange() {
  const reciterId = parseInt(document.getElementById("modalSurahReciterSelect")?.value) || selectedReciter?.id || 118;
  const reciter = allReciters.find(r => r.id === reciterId);
  const moshafSelect = document.getElementById("modalSurahMoshafSelect");
  if (!moshafSelect || !reciter) return;

  moshafSelect.innerHTML = (reciter.moshafs || []).map(m => `
    <option value="${m.id}" ${m.id === selectedMoshaf?.id ? 'selected' : ''}>${escapeHtml(m.name)} ${m.is_timed ? '⚡ (موقت)' : ''}</option>
  `).join("");

  checkModalSurahStatus();
}

async function checkModalSurahStatus() {
  const indicator = document.getElementById("modalSurahCheckIndicator");
  const btn = document.getElementById("btnRunImportSurahTiming");
  if (!indicator) return;

  const reciterId = parseInt(document.getElementById("modalSurahReciterSelect")?.value);
  const moshafId = parseInt(document.getElementById("modalSurahMoshafSelect")?.value);
  const surahId = parseInt(document.getElementById("modalSurahSelect")?.value);
  if (!reciterId || !surahId) {
    indicator.style.display = "none";
    return;
  }

  const reciter = allReciters.find(r => r.id === reciterId);
  const moshaf = reciter?.moshafs?.find(m => m.id === moshafId) || reciter?.moshafs?.[0];
  const targetSlug = generateCleanSlug(reciter?.name_en || reciter?.name_ar, moshaf?.name, moshaf, reciter);

  try {
    const moshafParam = moshafId ? `&moshaf_id=${moshafId}` : "";
    const serverParam = moshaf?.server ? `&server_url=${encodeURIComponent(moshaf.server)}` : "";
    const slugParam = targetSlug ? `&slug=${encodeURIComponent(targetSlug)}` : "";
    
    // Check local & GitHub timing
    const res = await fetch(`${API_BASE}/api/timing/${reciterId}/${surahId}?t=${Date.now()}${moshafParam}${slugParam}`);
    const data = await res.json();

    if (data.exists && data.pushed_to_github) {
      indicator.style.display = "block";
      indicator.className = "api-auto-detect-card github-pushed mt-3";
      indicator.innerHTML = `
        <div class="flex-between">
          <div class="api-detect-info">
            <span class="api-pulse-icon">🚀</span>
            <div>
              <strong>توقيت سورة ${surahId} منشور ومعتمد على GitHub</strong>
              <span class="text-xs text-dim">ملف التوقيت موجود مسبقاً في مستودع المشروع</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge-github-pushed">✅ تم النشر مسبقاً (Pushed)</span>
            ${data.github_url ? `<a href="${data.github_url}" target="_blank" class="btn-github-view" title="عرض الملف على GitHub">🌐 عرض الملف</a>` : ''}
          </div>
        </div>
      `;
      if (btn) btn.textContent = "⚡ إعادة استيراد / استبدال التوقيت في الاستوديو";
    } else {
      // Check external
      const checkRes = await fetch(`${API_BASE}/api/import/external-timing/check?reciter_id=${reciterId}&surah_id=${surahId}${moshafParam}${serverParam}${slugParam}`);
      const checkData = await checkRes.json();
      if (checkData.available && checkData.pushed_to_github) {
        indicator.style.display = "block";
        indicator.className = "api-auto-detect-card github-pushed mt-3";
        indicator.innerHTML = `
          <div class="flex-between">
            <div class="api-detect-info">
              <span class="api-pulse-icon">🚀</span>
              <div>
                <strong>توقيت سورة ${surahId} منشور ومعتمد على GitHub</strong>
                <span class="text-xs text-dim">ملف التوقيت موجود مسبقاً في مستودع المشروع</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-github-pushed">✅ تم النشر مسبقاً (Pushed)</span>
              ${checkData.github_url ? `<a href="${checkData.github_url}" target="_blank" class="btn-github-view" title="عرض الملف على GitHub">🌐 عرض الملف</a>` : ''}
            </div>
          </div>
        `;
        if (btn) btn.textContent = "⚡ استيراد التوقيت المنشور وفتحه في الاستوديو";
      } else {
        indicator.style.display = "none";
        if (btn) btn.textContent = "⚡ استيراد التوقيت الآن وفتحه في الاستوديو";
      }
    }
  } catch (e) {
    indicator.style.display = "none";
  }
}

function onModalBatchReciterChange() {
  const reciterId = parseInt(document.getElementById("modalBatchReciterSelect")?.value) || selectedReciter?.id || 118;
  const reciter = allReciters.find(r => r.id === reciterId);
  const moshafSelect = document.getElementById("modalBatchMoshafSelect");
  if (!moshafSelect || !reciter) return;

  moshafSelect.innerHTML = (reciter.moshafs || []).map(m => `
    <option value="${m.id}" ${m.id === selectedMoshaf?.id ? 'selected' : ''}>${escapeHtml(m.name)} ${m.is_timed ? '⚡ (توقيت جاهز على API)' : ''}</option>
  `).join("");

  onModalBatchMoshafChange();
}

function onModalBatchMoshafChange() {
  const reciterId = parseInt(document.getElementById("modalBatchReciterSelect")?.value) || selectedReciter?.id || 118;
  const moshafId = parseInt(document.getElementById("modalBatchMoshafSelect")?.value);
  const reciter = allReciters.find(r => r.id === reciterId);
  const moshaf = reciter?.moshafs?.find(m => m.id === moshafId) || reciter?.moshafs?.[0];
  const previewBox = document.getElementById("modalBatchMoshafPreview");
  if (!previewBox || !moshaf) return;

  const targetSlug = generateCleanSlug(reciter?.name_en || reciter?.name_ar, moshaf?.name, moshaf, reciter);

  previewBox.innerHTML = `
    <div class="flex-between">
      <div>
        <strong>📖 ${escapeHtml(moshaf.name)}</strong>
        <span class="text-xs text-dim">(${moshaf.surah_total || 114} سورة)</span>
      </div>
      <div>
        ${moshaf.is_timed ? '<span class="tag-badge timed font-bold">⚡ توقيت جاهز على mp3quran API</span>' : '<span class="tag-badge dim">بدون توقيت مسجل</span>'}
      </div>
    </div>
    <div class="mt-2 text-xs font-mono text-dim">
      <div><strong>خادم الصوت:</strong> ${escapeHtml(moshaf.server || '')}</div>
      <div><strong>المعرف السحابي (Slug):</strong> <span class="text-cyan">${escapeHtml(targetSlug)}</span></div>
    </div>
  `;
}

async function runImportSurahTiming() {
  const source = document.getElementById("importSurahSourceSelect").value;
  const reciterId = parseInt(document.getElementById("modalSurahReciterSelect").value);
  const moshafId = parseInt(document.getElementById("modalSurahMoshafSelect")?.value) || selectedMoshaf?.id;
  const surahId = parseInt(document.getElementById("modalSurahSelect").value);
  const customUrl = document.getElementById("importCustomUrlInput")?.value.trim();
  const rawJson = document.getElementById("importRawJsonTextarea")?.value.trim();
  const btn = document.getElementById("btnRunImportSurahTiming");
  const outcomeBox = document.getElementById("importSurahOutcomeBox");

  const reciter = allReciters.find(r => r.id === reciterId);
  const moshaf = reciter?.moshafs?.find(m => m.id === moshafId) || reciter?.moshafs?.[0];
  const targetSlug = generateCleanSlug(reciter?.name_en || reciter?.name_ar, moshaf?.name, moshaf, reciter);

  btn.disabled = true;
  btn.textContent = "⏳ جاري الاتصال واستيراد التوقيت...";
  outcomeBox.style.display = "none";

  try {
    const payload = {
      source: source,
      reciter_id: reciterId,
      moshaf_id: moshafId,
      surah_id: surahId,
      custom_url: customUrl,
      raw_json: rawJson,
      slug: targetSlug,
      reviewed: true
    };

    const res = await fetch(`${API_BASE}/api/import/timing-from-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      outcomeBox.style.display = "block";
      outcomeBox.className = "outcome-alert-box success";
      outcomeBox.innerHTML = `
        <div style="font-weight: 700;">✅ تم استيراد التوقيت بنجاح من ${escapeHtml(result.source)}!</div>
        <div><strong>القارئ والرواية:</strong> ${escapeHtml(reciter?.name_ar || '')} - ${escapeHtml(moshaf?.name || '')}</div>
        <div><strong>عدد الآيات:</strong> ${result.count} آية | <strong>المدة:</strong> ${result.total_duration_sec}s</div>
      `;

      // Update main studio if current surah matches
      if (surahId === selectedSurahId && reciterId === selectedReciter?.id) {
        currentTimingData = result.entries;
        renderStep3Verses(result.entries);
        document.getElementById("step3TimingStatusBadge").textContent = `✅ مستورد ومُعتمد (${result.count} آية)`;
        document.getElementById("step3TimingStatusBadge").className = "badge success";
        document.getElementById("step3SaveLocalBtn").disabled = false;
        document.getElementById("step3DirectPushBtn").disabled = false;
      }

      showNotification(`تم استيراد ومعايرة توقيت سورة ${surahId} بنجاح!`, "success");
      setTimeout(() => {
        closeApiImportModal();
        onStep3SurahChange();
      }, 1200);
    } else {
      outcomeBox.style.display = "block";
      outcomeBox.className = "outcome-alert-box danger";
      outcomeBox.textContent = `❌ فشل الاستيراد: ${result.detail || 'خطأ غير معروف'}`;
    }
  } catch (e) {
    outcomeBox.style.display = "block";
    outcomeBox.className = "outcome-alert-box danger";
    outcomeBox.textContent = `❌ خطأ في الاتصال: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ استيراد التوقيت الآن وفتحه في الاستوديو";
  }
}

// Remote Reciters Search & 1-Click Import
let searchDebounceTimer = null;

function onRemoteReciterSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchRemoteReciters();
  }, 300);
}

async function fetchRemoteReciters(force = false) {
  const container = document.getElementById("remoteRecitersGrid");
  const query = document.getElementById("remoteReciterSearchInput")?.value.trim() || "";

  container.innerHTML = `<div class="text-center py-4 text-dim">جاري البحث في خوادم mp3quran.net...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/import/remote-reciters/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    remoteReciters = data.reciters || [];

    if (!remoteReciters.length) {
      container.innerHTML = `<div class="text-center py-4 text-dim">لا توجد نتائج مطابقة لـ "${escapeHtml(query)}"</div>`;
      return;
    }

    container.innerHTML = remoteReciters.map(r => `
      <div class="remote-reciter-card">
        <div style="flex: 1; min-width: 0;">
          <div class="flex-between">
            <div>
              <span class="reciter-meta-title">${r.id} - ${escapeHtml(r.name_ar)}</span>
              <span class="text-xs text-dim">(${escapeHtml(r.name_en || '')})</span>
            </div>
            <div>
              ${r.in_local_catalog ? `
                <button class="btn btn-sm btn-secondary" onclick="selectLocalReciter(${r.id})">اختيار في الاستوديو</button>
              ` : `
                <button class="btn btn-sm btn-primary" onclick="importRemoteReciter(${r.id})">📥 استيراد القارئ وكافة رواياته (${r.moshafs_count})</button>
              `}
            </div>
          </div>
          
          <div class="reciter-meta-badges mt-1">
            <span class="tag-badge dim">${r.moshafs_count} رواية/مصحف</span>
            ${r.pushed_to_github ? '<span class="tag-badge" style="background: rgba(52, 211, 153, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4);">🚀 منشور على GitHub</span>' : (r.has_timing ? '<span class="tag-badge timed">⚡ يتضمن توقيت جاهز</span>' : '')}
            ${r.in_local_catalog ? '<span class="tag-badge catalog">✓ مضاف للكتالوج</span>' : ''}
            ${r.local_timed_count ? `<span class="tag-badge" style="background: rgba(6, 182, 212, 0.15); color: #38bdf8;">💾 ${r.local_timed_count} سورة موقتة</span>` : ''}
          </div>

          <!-- All Recitations / Moshafs for this reciter -->
          <div class="remote-moshaf-list mt-2">
            ${(r.moshaf || []).map(m => {
              const isPushed = Boolean(m.pushed_to_github);
              const isComplete = Boolean(m.is_local_complete);
              const timedCount = m.local_timed_count || 0;
              return `
              <div class="remote-moshaf-chip ${isPushed ? 'github-pushed' : (m.is_timed ? 'timed' : '')}">
                <div class="moshaf-info">
                  <span class="moshaf-name">📖 ${escapeHtml(m.name)}</span>
                  <span class="moshaf-server font-mono">${escapeHtml(m.server)}</span>
                </div>
                <div class="moshaf-actions">
                  <span class="text-xs text-dim">(${m.surah_total || 114} سورة)</span>
                  ${isPushed ? `
                    <span class="tag-badge" style="background: rgba(52, 211, 153, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); font-weight: 700;">✅ منشور مسبقاً (${timedCount} سورة)</span>
                    <button class="btn-mini-action" style="background: rgba(52, 211, 153, 0.15); color: #34d399; border-color: rgba(52, 211, 153, 0.4);" onclick="selectLocalReciter(${r.id})" title="فتح هذا القارئ ومصحفه في الاستوديو">📂 فتح في الاستوديو</button>
                  ` : (isComplete ? `
                    <span class="tag-badge" style="background: rgba(6, 182, 212, 0.2); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.4); font-weight: 700;">✓ مكتمل محلياً (114 سورة)</span>
                    <button class="btn-mini-action" onclick="selectLocalReciter(${r.id})" title="فتح هذا القارئ ومصحفه في الاستوديو">📂 فتح في الاستوديو</button>
                  ` : (m.is_timed ? `
                    <span class="tag-badge timed">⚡ توقيت جاهز</span>
                    <button class="btn-mini-action" onclick="jumpToBatchImport(${r.id}, ${m.id})" title="استيراد مصحف كامل لهذه الرواية">⚡ استيراد المصحف</button>
                  ` : `
                    <span class="tag-badge dim">بدون توقيت</span>
                    <button class="btn-mini-action" onclick="jumpToBatchImport(${r.id}, ${m.id})" title="استيراد مصحف كامل لهذه الرواية">⚡ استيراد المصحف</button>
                  `))}
                </div>
              </div>
            `;}).join("")}
          </div>
        </div>
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = `<div class="text-center py-4 text-dim text-danger">فشل البحث: ${escapeHtml(e.message)}</div>`;
  }
}

function jumpToBatchImport(reciterId, moshafId) {
  // 1. Ensure reciter is in catalog or imported
  const reciterObj = remoteReciters.find(r => r.id === reciterId);
  if (reciterObj && !allReciters.some(r => r.id === reciterId)) {
    importRemoteReciter(reciterId).then(() => {
      selectBatchReciterAndMoshaf(reciterId, moshafId);
    });
  } else {
    selectBatchReciterAndMoshaf(reciterId, moshafId);
  }
}

function selectBatchReciterAndMoshaf(reciterId, moshafId) {
  switchImportTab('batch');
  const batchReciterSel = document.getElementById("modalBatchReciterSelect");
  if (batchReciterSel) {
    batchReciterSel.value = reciterId.toString();
    onModalBatchReciterChange();
    const batchMoshafSel = document.getElementById("modalBatchMoshafSelect");
    if (batchMoshafSel && moshafId) {
      batchMoshafSel.value = moshafId.toString();
      onModalBatchMoshafChange();
    }
  }
}

async function importRemoteReciter(reciterId) {
  const reciterObj = remoteReciters.find(r => r.id === reciterId);
  if (!reciterObj) return;

  try {
    const payload = {
      remote_id: reciterObj.id,
      name_ar: reciterObj.name_ar,
      name_en: reciterObj.name_en,
      letter: reciterObj.letter,
      moshafs: reciterObj.moshaf || []
    };

    const res = await fetch(`${API_BASE}/api/import/reciter-from-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      showNotification(`تم استيراد القارئ ${result.name_ar} وكافة رواياته (${result.moshafs_count}) إلى الكتالوج!`, "success");
      await loadRecitersAndSurahs();
      selectLocalReciter(result.id);
      closeApiImportModal();
    } else {
      alert("فشل الاستيراد: " + (result.detail || "خطأ غير معروف"));
    }
  } catch (e) {
    alert("خطأ: " + e.message);
  }
}

function selectLocalReciter(reciterId) {
  const selectEl = document.getElementById("step1ReciterSelect");
  if (selectEl) {
    selectEl.value = reciterId.toString();
    onStep1ReciterChange();
    closeApiImportModal();
    showNotification(`تم اختيار القارئ #${reciterId} في الاستوديو`, "info");
  }
}

// Batch Import Full Mushaf
async function runBatchApiImport() {
  const reciterId = parseInt(document.getElementById("modalBatchReciterSelect").value);
  const moshafId = parseInt(document.getElementById("modalBatchMoshafSelect")?.value) || selectedMoshaf?.id;
  const rangeStr = document.getElementById("modalBatchSurahsRange").value.trim() || "1-114";
  const btn = document.getElementById("btnRunBatchApiImport");
  const outcomeBox = document.getElementById("modalBatchOutcomeBox");

  const reciter = allReciters.find(r => r.id === reciterId);
  const moshaf = reciter?.moshafs?.find(m => m.id === moshafId) || reciter?.moshafs?.[0];
  const targetSlug = generateCleanSlug(reciter?.name_en || reciter?.name_ar, moshaf?.name, moshaf, reciter);

  let surahs = [];
  if (rangeStr.includes("-")) {
    const parts = rangeStr.split("-");
    const start = parseInt(parts[0]) || 1;
    const end = parseInt(parts[1]) || 114;
    for (let i = start; i <= end; i++) surahs.push(i);
  } else {
    surahs = rangeStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  }

  btn.disabled = true;
  btn.textContent = `⏳ جاري استيراد ومعايرة ${surahs.length} سورة لرواية (${moshaf?.name || ''}) من mp3quran API...`;
  outcomeBox.style.display = "none";

  try {
    // NOTE: moshafId equals the mp3quran API read_id (imported with same ID from remote)
    const payload = {
      source: "mp3quran",
      reciter_id: reciterId,
      moshaf_id: moshafId,
      read_id: moshafId,  // Fixed: moshafId == mp3quran read_id, not reciterId
      slug: targetSlug,
      surahs: surahs,
      reviewed: true
    };

    const res = await fetch(`${API_BASE}/api/import/batch-timing-from-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      outcomeBox.style.display = "block";
      outcomeBox.className = "outcome-alert-box success";
      outcomeBox.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 4px;">🎉 تم استيراد مصحف (${escapeHtml(moshaf?.name || '')}) بنجاح!</div>
        <div><strong>القارئ:</strong> ${escapeHtml(reciter?.name_ar || '')} | <strong>الرواية:</strong> ${escapeHtml(moshaf?.name || '')}</div>
        <div><strong>السور المكتملة:</strong> ${result.imported_count} سورة</div>
        ${result.failed_count > 0 ? `<div class="text-warning">السور غير المتوفرة: ${result.failed_count}</div>` : ''}
        <div style="margin-top: 8px;">
          <button class="btn btn-sm btn-primary" onclick="switchToImportedReciterAndPublish(${reciterId}, ${moshafId})">🚀 تبديل للقارئ ونشر المصحف إلى GitHub الآن</button>
        </div>
      `;
      showNotification(`تم استيراد ${result.imported_count} سورة لرواية ${moshaf?.name || ''} بنجاح!`, "success");

      // Update selectedReciter/selectedMoshaf if they differ from the imported ones
      if (selectedReciter?.id !== reciterId || selectedMoshaf?.id !== moshafId) {
        // Update Step 1 selector to point to the imported reciter
        const step1Sel = document.getElementById("step1ReciterSelect");
        if (step1Sel) {
          step1Sel.value = reciterId.toString();
          onStep1ReciterChange();
          // After reciter change, ensure moshaf is also selected
          const step1MoshafSel = document.getElementById("step1MoshafSelect");
          if (step1MoshafSel) {
            step1MoshafSel.value = moshafId.toString();
            onStep1MoshafChange();
          }
        }
      } else {
        // Same reciter/moshaf — just refresh mushaf status matrix
        loadMushafStatusMatrix(reciterId, moshafId);
        onStep3SurahChange();
      }
    } else {
      outcomeBox.style.display = "block";
      outcomeBox.className = "outcome-alert-box danger";
      outcomeBox.textContent = `❌ فشل الاستيراد: ${result.detail || 'خطأ غير معروف'}`;
    }
  } catch (e) {
    outcomeBox.style.display = "block";
    outcomeBox.className = "outcome-alert-box danger";
    outcomeBox.textContent = `❌ خطأ في الاتصال: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ بدء الاستيراد الدفعي للمصحف كاملاً";
  }
}

// Switch to a specific reciter/moshaf in the studio and go to Step 4 (mushaf publish)
async function switchToImportedReciterAndPublish(reciterId, moshafId) {
  closeApiImportModal();

  // Update step 1 selectors
  const step1Sel = document.getElementById("step1ReciterSelect");
  if (step1Sel) {
    step1Sel.value = reciterId.toString();
    onStep1ReciterChange();
    const step1MoshafSel = document.getElementById("step1MoshafSelect");
    if (step1MoshafSel) {
      step1MoshafSel.value = moshafId.toString();
      await onStep1MoshafChange();
    }
  }

  // Navigate to Step 4 in mushaf mode
  goToStep(4);
  switchPublishMode("mushaf");
}

// ----------------- Manual Reciter Modal -----------------

function openAddReciterModal() {
  document.getElementById("reciterModal").style.display = "flex";
}

function closeReciterModal() {
  document.getElementById("reciterModal").style.display = "none";
}

async function submitReciterModal() {
  const nameAr = document.getElementById("modalNameAr").value.trim();
  const nameEn = document.getElementById("modalNameEn").value.trim();
  if (!nameAr) return alert("يرجى إدخال اسم القارئ بالعربية");

  try {
    const res = await fetch(`${API_BASE}/api/reciters/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_ar: nameAr, name_en: nameEn })
    });
    const result = await res.json();
    if (result.success) {
      closeReciterModal();
      await loadRecitersAndSurahs();
      selectLocalReciter(result.id);
    }
  } catch (e) {
    alert("فشل الحفظ: " + e.message);
  }
}

// ----------------- Utilities -----------------

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showNotification(msg, type = "info") {
  const banner = document.getElementById("globalNotification");
  if (!banner) return;
  banner.className = `alert-banner ${type}`;
  banner.textContent = msg;
  banner.style.display = "block";
  setTimeout(() => { banner.style.display = "none"; }, 4000);
}

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

  if (e.code === "Space") {
    e.preventDefault();
    toggleAudio();
  } else if (e.code === "KeyR" || e.code === "Enter") {
    e.preventDefault();
    replayFocusedAyah();
  } else if (e.code === "ArrowLeft" || e.code === "ArrowDown") {
    // Navigate to NEXT ayah (forward in reading sequence)
    e.preventDefault();
    navigateAyah(1);
  } else if (e.code === "ArrowRight" || e.code === "ArrowUp") {
    // Navigate to PREVIOUS ayah (backward in reading sequence)
    e.preventDefault();
    navigateAyah(-1);
  } else if (e.code === "PageDown") {
    // Next Surah
    e.preventDefault();
    navigateSurah(1);
  } else if (e.code === "PageUp") {
    // Previous Surah
    e.preventDefault();
    navigateSurah(-1);
  }
});

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  loadRecitersAndSurahs();
});
