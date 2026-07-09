const API = "https://api.alquran.cloud/v1";
const ADHKAR_REMOTE = "https://raw.githubusercontent.com/rn0x/Adhkar-json/refs/heads/main/adhkar.json";
const BASMALAH_TEXT = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
const BASMALAH_NORMALIZED = "بسم الله الرحمن الرحيم";

const RECITERS = [
  { id: "ar.alafasy", name: "مشاري العفاسي" },
  { id: "ar.abdulbasitmurattal", name: "عبد الباسط" },
  { id: "ar.husary", name: "الحصري" },
  { id: "ar.minshawi", name: "المنشاوي" },
  { id: "ar.mahermuaiqly", name: "ماهر المعيقلي" }
];

const STORAGE = {
  theme: "zikra_theme",
  favorites: "zikra_favorites",
  khatmah: "zikra_khatmah",
  lastRead: "zikra_last_read",
  font: "zikra_font_size",
  reciter: "zikra_reciter",
  readerMode: "zikra_reader_mode",
  tasbeeh: "zikra_tasbeeh"
};

const fallbackAzkar = [
  {
    id: 1,
    category: "أذكار الصباح والمساء",
    array: [
      { id: 1, text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", count: 100 },
      { id: 2, text: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ", count: 100 },
      { id: 3, text: "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ", count: 10 }
    ]
  },
  {
    id: 2,
    category: "أذكار النوم",
    array: [
      { id: 1, text: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا", count: 1 },
      { id: 2, text: "اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ", count: 1 }
    ]
  }
];

let state = {
  route: "home",
  surahs: [],
  currentSurah: null,
  currentTafsir: null,
  currentAudio: null,
  azkar: [],
  selectedAzkarId: null,
  searchScope: "all",
  favorites: readJSON(STORAGE.favorites, []),
  fontSize: Number(localStorage.getItem(STORAGE.font)) || 1.85,
  readerMode: localStorage.getItem(STORAGE.readerMode) || "cards",
  reciter: localStorage.getItem(STORAGE.reciter) || "ar.husary",
  activeAudio: null,
  audioSession: 0,
  quranIndex: null,
  autoSaveTimer: null,
  clockTimer: null,
  prayerLoaded: false,
  prayerTimings: null,
  nextPrayerKey: null,
  tasbeeh: readJSON(STORAGE.tasbeeh, { phrase: "سُبْحَانَ اللَّهِ", count: 0 })
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

init();

async function init() {
  applyTheme();
  applyFontSize();
  populateReciters();
  bindEvents();
  startClock();
  renderSkeletons();
  updateMiniStats();
  renderFavorites();
  renderTasbeeh();
  await Promise.all([loadSurahs(), loadAzkar()]);
  hydrateKhatmahSelect();
  renderHomeState();
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) {
      event.preventDefault();
      navigate(routeTarget.dataset.route);
    }

    const surahTarget = event.target.closest("[data-surah]");
    if (surahTarget) openSurah(Number(surahTarget.dataset.surah));

    const categoryTarget = event.target.closest("[data-azkar-category]");
    if (categoryTarget) selectAzkarCategory(categoryTarget.dataset.azkarCategory);

    const favTarget = event.target.closest("[data-fav]");
    if (favTarget) toggleFavorite(JSON.parse(decodeURIComponent(favTarget.dataset.fav)));

    const copyTarget = event.target.closest("[data-copy]");
    if (copyTarget) copyText(decodeURIComponent(copyTarget.dataset.copy));

    const shareTarget = event.target.closest("[data-share]");
    if (shareTarget) shareText(decodeURIComponent(shareTarget.dataset.share));

    const tafsirTarget = event.target.closest("[data-tafsir]");
    if (tafsirTarget) {
      const node = $(`#tafsir-${tafsirTarget.dataset.tafsir}`);
      if (node) node.classList.toggle("show");
    }

    const counterTarget = event.target.closest("[data-count]");
    if (counterTarget) handleCounter(counterTarget);

    const openFavTarget = event.target.closest("[data-open-fav]");
    if (openFavTarget) openFavorite(decodeURIComponent(openFavTarget.dataset.openFav));

    const removeFavTarget = event.target.closest("[data-remove-fav]");
    if (removeFavTarget) removeFavorite(decodeURIComponent(removeFavTarget.dataset.removeFav));

    const readerAction = event.target.closest("[data-reader-action]");
    if (readerAction) {
      if (readerAction.dataset.readerAction === "previous") openPreviousSurah();
      if (readerAction.dataset.readerAction === "next") openNextSurah();
    }

    const exitFullscreenAction = event.target.closest("[data-exit-fullscreen]");
    if (exitFullscreenAction) {
      event.preventDefault();
      document.exitFullscreen?.();
    }

    const stopAudioAction = event.target.closest("[data-stop-audio]");
    if (stopAudioAction) {
      event.preventDefault();
      stopActiveAudio();
      toast("تم إيقاف الصوت");
    }

    const continuousAyah = event.target.closest(".continuous-ayah");
    if (continuousAyah && state.readerMode === "continuous") {
      showContinuousTafsir(Number(continuousAyah.dataset.ayahNumber || 1));
    }

    const tasbeehPhrase = event.target.closest("[data-tasbeeh-phrase]");
    if (tasbeehPhrase) {
      chooseTasbeehPhrase(tasbeehPhrase.dataset.tasbeehPhrase);
    }
  });

  window.addEventListener("hashchange", () => navigate(location.hash.replace("#", "") || "home"));
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  window.addEventListener("scroll", scheduleAutoSaveLastRead, { passive: true });
  window.addEventListener("beforeunload", () => saveCurrentRead(true));
  const readerNode = $("#reader");
  if (readerNode) readerNode.addEventListener("scroll", scheduleAutoSaveLastRead, { passive: true });

  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#surahFilter").addEventListener("input", renderSurahs);
  $("#surahTypeFilter").addEventListener("change", renderSurahs);
  $("#azkarFilter").addEventListener("input", () => renderAzkarCategories());
  $("#globalSearchBtn").addEventListener("click", runGlobalSearch);
  $("#globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") runGlobalSearch(); });
  $("#homeSearchBtn").addEventListener("click", () => {
    $("#globalSearch").value = $("#homeSearch").value;
    navigate("search");
    runGlobalSearch();
  });
  $("#homeSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#homeSearchBtn").click();
  });
  const startReadingBtn = $("#homeStartReadingBtn");
  if (startReadingBtn) {
    startReadingBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startReadingFromHome();
    });
  }
  const dailyAzkarBtn = $("#homeDailyAzkarBtn");
  if (dailyAzkarBtn) {
    dailyAzkarBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDailyAzkarFromHome();
    });
  }
  const refreshPrayerBtn = $("#refreshPrayerBtn");
  if (refreshPrayerBtn) refreshPrayerBtn.addEventListener("click", () => loadPrayerTimes(false, true));
  const useMyLocationBtn = $("#useMyLocationBtn");
  if (useMyLocationBtn) useMyLocationBtn.addEventListener("click", () => loadPrayerTimes(true, true));
  $$("[data-search-scope]").forEach(btn => btn.addEventListener("click", () => {
    $$("[data-search-scope]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.searchScope = btn.dataset.searchScope;
    if ($("#globalSearch").value.trim()) runGlobalSearch();
  }));
  $("#fontPlus").addEventListener("click", () => changeFont(.12));
  $("#fontMinus").addEventListener("click", () => changeFont(-.12));
  $("#saveLastRead").addEventListener("click", () => saveCurrentRead(false));
  $("#prevSurahBtn").addEventListener("click", openPreviousSurah);
  $("#nextSurahBtn").addEventListener("click", openNextSurah);
  const stopAudioBtn = $("#stopAudioBtn");
  if (stopAudioBtn) stopAudioBtn.addEventListener("click", () => { stopActiveAudio(); toast("تم إيقاف الصوت"); });
  $("#readerModeToggle").addEventListener("click", toggleReaderMode);
  $("#fullscreenBtn").addEventListener("click", toggleFullscreen);
  $("#reciterSelect").addEventListener("change", handleReciterChange);
  $("#favoriteTypeFilter").addEventListener("change", renderFavorites);
  $("#clearFavorites").addEventListener("click", clearFavorites);
  $("#khatmahForm").addEventListener("submit", saveKhatmah);
  const tasbeehIncrement = $("#tasbeehIncrement");
  if (tasbeehIncrement) tasbeehIncrement.addEventListener("click", incrementTasbeeh);
  const tasbeehReset = $("#tasbeehReset");
  if (tasbeehReset) tasbeehReset.addEventListener("click", resetTasbeeh);
  const tasbeehSave = $("#tasbeehSave");
  if (tasbeehSave) tasbeehSave.addEventListener("click", saveTasbeehToFavorites);

  const initial = location.hash.replace("#", "") || "home";
  navigate(initial, false);
}

function navigate(route, updateHash = true) {
  const safeRoute = $("#" + route) ? route : "home";
  state.route = safeRoute;
  $$(".view").forEach(view => view.classList.remove("active-view"));
  $("#" + safeRoute).classList.add("active-view");
  $$(".top-nav a").forEach(link => link.classList.toggle("active", link.dataset.route === safeRoute));
  if (updateHash) history.replaceState(null, "", "#" + safeRoute);
  if (safeRoute === "favorites") renderFavorites();
  if (safeRoute === "tasbeeh") renderTasbeeh();
  if (safeRoute === "prayer") loadPrayerTimes(false, false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startReadingFromHome() {
  const last = readJSON(STORAGE.lastRead, null);
  if (last?.surah) {
    openSurah(Number(last.surah), Number(last.ayah || 1));
    return;
  }
  navigate("quran");
  toast("اختر السورة التي تريد البدء بها");
}

function openDailyAzkarFromHome() {
  navigate("azkar");
  const chooseCategory = () => {
    if (!state.azkar.length) return;
    const category = state.azkar.find(c => normalizeArabic(c.category || "").includes("الصباح"))
      || state.azkar.find(c => normalizeArabic(c.category || "").includes("المساء"))
      || state.azkar[0];
    selectAzkarCategory(category.id, true);
  };
  if (state.azkar.length) {
    chooseCategory();
  } else {
    setTimeout(chooseCategory, 500);
  }
}

function renderSkeletons() {
  const grid = $("#surahGrid");
  grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card"></div>').join("");
}

async function loadSurahs() {
  try {
    const res = await fetch(`${API}/surah`);
    const json = await res.json();
    state.surahs = json.data || [];
    renderSurahs();
  } catch (error) {
    $("#surahGrid").innerHTML = `<div class="status-note">تعذر تحميل فهرس السور. تأكد من الاتصال بالإنترنت.</div>`;
  }
}

function renderSurahs() {
  const query = normalizeArabic($("#surahFilter")?.value || "");
  const type = $("#surahTypeFilter")?.value || "all";
  const filtered = state.surahs.filter(surah => {
    const matchName = normalizeArabic(`${surah.name} ${surah.englishName} ${surah.number}`).includes(query);
    const matchType = type === "all" || surah.revelationType === type;
    return matchName && matchType;
  });
  $("#surahGrid").innerHTML = filtered.map(surah => `
    <article class="surah-card" data-surah="${surah.number}" data-number="${surah.number}">
      <h3>${surah.name}</h3>
      <p>${surah.englishName} • ${surah.englishNameTranslation || ""}</p>
      <div class="surah-meta">
        <span class="badge">${surah.numberOfAyahs} آية</span>
        <span class="badge">${surah.revelationType === "Meccan" ? "مكية" : "مدنية"}</span>
      </div>
    </article>
  `).join("") || `<div class="status-note">لا توجد نتائج.</div>`;
}

async function openSurah(number, targetAyah = null) {
  navigate("reader");
  stopActiveAudio();
  $("#surahTitle").textContent = "جاري تحميل السورة...";
  $("#readerHint").textContent = "يتم تجهيز القراءة والتفسير والصوت.";
  $("#ayahList").innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div>';
  try {
    const [surahRes, tafsirRes, audioRes] = await Promise.allSettled([
      fetch(`${API}/surah/${number}/quran-uthmani`).then(r => r.json()),
      fetch(`${API}/surah/${number}/ar.muyassar`).then(r => r.json()),
      fetch(`${API}/surah/${number}/${state.reciter}`).then(r => r.json())
    ]);
    state.currentSurah = surahRes.value?.data;
    state.currentTafsir = tafsirRes.value?.data;
    state.currentAudio = audioRes.value?.data;
    renderReader();
    if (targetAyah) scrollToAyah(targetAyah);
  } catch (error) {
    $("#ayahList").innerHTML = `<div class="status-note">حدث خطأ أثناء تحميل السورة.</div>`;
  }
}

function renderReader() {
  const surah = state.currentSurah;
  if (!surah) return;
  $("#surahTitle").textContent = surah.name;
  $("#surahMeta").textContent = `${surah.englishName} • ${surah.revelationType === "Meccan" ? "مكية" : "مدنية"} • ${surah.ayahs.length} آية`;
  renderReaderNav();
  renderReaderHint();
  updateReaderModeButton();

  if (state.readerMode === "continuous") {
    renderContinuousReader();
  } else {
    renderAyahCards();
  }
}

function renderReaderNav() {
  const number = state.currentSurah?.number || 1;
  const prev = state.surahs.find(s => s.number === number - 1);
  const next = state.surahs.find(s => s.number === number + 1);
  const prevBtn = $("#prevSurahBtn");
  const nextBtn = $("#nextSurahBtn");
  prevBtn.disabled = !prev;
  nextBtn.disabled = !next;
  prevBtn.textContent = prev ? `السابق: ${prev.name}` : "لا يوجد سابق";
  nextBtn.textContent = next ? `التالي: ${next.name}` : "لا يوجد تالي";
}

function renderReaderHint() {
  const mode = state.readerMode === "continuous" ? "قراءة متصلة: السورة ظاهرة كنص واحد كامل." : "قراءة آية آية: كل آية في بطاقة منفصلة مع التفسير والصوت.";
  const reciter = RECITERS.find(r => r.id === state.reciter)?.name || "القارئ الحالي";
  $("#readerHint").innerHTML = `<strong>${mode}</strong><span>القارئ: ${reciter}</span>`;
}

function renderAyahCards() {
  const surah = state.currentSurah;
  const tafsirAyahs = state.currentTafsir?.ayahs || [];
  const audioAyahs = state.currentAudio?.ayahs || [];
  $("#ayahList").className = "ayah-list";
  const cards = surah.ayahs.map((ayah, index) => {
    const tafsir = tafsirAyahs[index]?.text || "التفسير غير متاح حاليًا لهذه الآية.";
    const audio = audioAyahs[index]?.audio || "";
    const displayText = getAyahDisplayText(ayah, surah);
    const fav = encodeURIComponent(JSON.stringify({ type: "ayah", title: `${surah.name} ${ayah.numberInSurah}`, text: displayText, meta: `سورة ${surah.name} - آية ${ayah.numberInSurah}`, surah: surah.number, ayah: ayah.numberInSurah }));
    const text = encodeURIComponent(`${displayText}\nسورة ${surah.name} - آية ${ayah.numberInSurah}`);
    return `
      <article class="ayah-card" id="ayah-${ayah.numberInSurah}" data-ayah-number="${ayah.numberInSurah}">
        <div class="ayah-top">
          <span class="ayah-number">${toArabicDigits(ayah.numberInSurah)}</span>
          <span>الجزء ${toArabicDigits(ayah.juz)} • الصفحة ${toArabicDigits(ayah.page)}</span>
        </div>
        <p class="ayah-text">${displayText}</p>
        <div class="ayah-tools">
          ${audio ? `<span class="audio-control-group"><button class="tool-btn icon-only-btn" onclick="playAudio('${audio}')" title="تشغيل الآية" aria-label="تشغيل الآية">▶</button><button class="tool-btn icon-only-btn" data-stop-audio type="button" title="إيقاف الصوت" aria-label="إيقاف الصوت">■</button></span>` : ""}
          <button class="tool-btn" data-tafsir="${ayah.numberInSurah}">التفسير</button>
          <button class="tool-btn" data-copy="${text}">نسخ</button>
          <button class="tool-btn" data-share="${text}">مشاركة</button>
          <button class="tool-btn" data-fav="${fav}">حفظ</button>
        </div>
        <div class="tafsir" id="tafsir-${ayah.numberInSurah}">${tafsir}</div>
      </article>
    `;
  }).join("");
  $("#ayahList").innerHTML = renderStandaloneBasmalah(surah) + cards + renderBottomReaderNav();
}

function renderContinuousReader() {
  const surah = state.currentSurah;
  const tafsirAyahs = state.currentTafsir?.ayahs || [];
  const allText = surah.ayahs.map((ayah, index) => {
    const tafsir = tafsirAyahs[index]?.text || "التفسير غير متاح حاليًا لهذه الآية.";
    const displayText = getAyahDisplayText(ayah, surah);
    return `
      <span class="continuous-unit" id="ayah-${ayah.numberInSurah}" data-ayah-number="${ayah.numberInSurah}">
        <span class="continuous-ayah" data-ayah-number="${ayah.numberInSurah}" title="اضغط لعرض التفسير">
          ${displayText}<span class="inline-ayah-number">۝${toArabicDigits(ayah.numberInSurah)}</span>
        </span>
        <span class="continuous-inline-tafsir" id="continuous-tafsir-${ayah.numberInSurah}">
          <strong>تفسير ${surah.name} — آية ${toArabicDigits(ayah.numberInSurah)}</strong>
          <span>${tafsir}</span>
        </span>
      </span>
    `;
  }).join(" ");
  const basmalahForText = shouldShowStandaloneBasmalah(surah) ? `${BASMALAH_TEXT}\n\n` : "";
  const fullText = `${surah.name}\n\n${basmalahForText}${surah.ayahs.map(ayah => `${getAyahDisplayText(ayah, surah)} ۝${toArabicDigits(ayah.numberInSurah)}`).join(" ")}`;
  const fav = encodeURIComponent(JSON.stringify({ type: "ayah", title: `سورة ${surah.name} كاملة`, text: `${basmalahForText}${surah.ayahs.map(a => getAyahDisplayText(a, surah)).join(" ")}`.trim(), meta: `سورة ${surah.name} كاملة`, surah: surah.number, ayah: 1 }));
  const revelationLabel = surah.revelationType === "Meccan" ? "مكية" : "مدنية";

  $("#ayahList").className = "ayah-list continuous-mode";
  $("#ayahList").innerHTML = `
    <article class="continuous-card glass-card">
      <button class="fullscreen-exit-chip fullscreen-only" data-exit-fullscreen type="button" aria-label="الخروج من وضع الشاشة الكاملة">×</button>
      <div class="continuous-toolbar">
        <div class="continuous-surah-head">
          <strong>${surah.name}</strong>
          <small>${revelationLabel} • ${toArabicDigits(surah.ayahs.length)} آية</small>
        </div>
        <span class="audio-control-group continuous-audio-controls">
          <button class="tool-btn icon-only-btn" onclick="playSurahAudio()" title="تشغيل السورة" aria-label="تشغيل السورة">▶</button>
          <button class="tool-btn icon-only-btn" data-stop-audio type="button" title="إيقاف الصوت" aria-label="إيقاف الصوت">■</button>
        </span>
        <button class="tool-btn" data-copy="${encodeURIComponent(fullText)}">نسخ السورة</button>
        <button class="tool-btn" data-share="${encodeURIComponent(fullText)}">مشاركة</button>
        <button class="tool-btn" data-fav="${fav}">حفظ السورة</button>
      </div>
      ${renderStandaloneBasmalah(surah, "continuous-basmalah")}
      <div class="surah-continuous-text">${allText}</div>
      ${renderBottomReaderNav("continuous-bottom-nav")}
    </article>
  `;
}

function renderBottomReaderNav(extraClass = "") {
  if (!state.currentSurah) return "";
  const number = state.currentSurah.number;
  const prev = state.surahs.find(s => s.number === number - 1);
  const next = state.surahs.find(s => s.number === number + 1);
  return `
    <nav class="reader-bottom-nav ${extraClass} glass-card" aria-label="التنقل بين السور في نهاية القراءة">
      <button class="ghost-btn" type="button" data-reader-action="previous" ${prev ? "" : "disabled"}>${prev ? `السورة السابقة: ${prev.name}` : "لا يوجد سابق"}</button>
      <span class="reader-end-note">نهاية سورة ${state.currentSurah.name}</span>
      <button class="primary-btn" type="button" data-reader-action="next" ${next ? "" : "disabled"}>${next ? `السورة التالية: ${next.name}` : "لا يوجد تالي"}</button>
    </nav>
  `;
}

function showContinuousTafsir(ayahNumber) {
  if (!state.currentSurah) return;
  const unit = $(`.continuous-unit[data-ayah-number="${ayahNumber}"]`);
  const tafsirNode = $(`#continuous-tafsir-${ayahNumber}`);
  if (!unit || !tafsirNode) return;

  const wasOpen = unit.classList.contains("active-tafsir");
  $$(".continuous-unit.active-tafsir").forEach(node => node.classList.remove("active-tafsir"));
  if (!wasOpen) {
    unit.classList.add("active-tafsir");
    setTimeout(() => unit.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }
}

function openPreviousSurah() {
  const number = state.currentSurah?.number;
  if (number && number > 1) openSurah(number - 1);
}

function openNextSurah() {
  const number = state.currentSurah?.number;
  if (number && number < 114) openSurah(number + 1);
}

function toggleReaderMode() {
  state.readerMode = state.readerMode === "continuous" ? "cards" : "continuous";
  localStorage.setItem(STORAGE.readerMode, state.readerMode);
  renderReader();
  toast(state.readerMode === "continuous" ? "تم تفعيل القراءة المتصلة" : "تم تفعيل قراءة الآيات كبطاقات");
}

function updateReaderModeButton() {
  const btn = $("#readerModeToggle");
  btn.textContent = state.readerMode === "continuous" ? "بطاقات الآيات" : "قراءة متصلة";
}

function toggleFullscreen() {
  const reader = $("#reader");
  if (!document.fullscreenElement) {
    if (state.currentSurah && state.readerMode !== "continuous") {
      state.readerMode = "continuous";
      localStorage.setItem(STORAGE.readerMode, state.readerMode);
      renderReader();
    }
    reader.requestFullscreen?.().catch(() => toast("المتصفح لا يسمح بوضع الشاشة الكاملة الآن"));
  } else {
    document.exitFullscreen?.();
  }
}

function updateFullscreenButton() {
  const btn = $("#fullscreenBtn");
  if (!btn) return;
  btn.textContent = document.fullscreenElement ? "⤢ إغلاق الشاشة الكاملة" : "⛶ شاشة كاملة";
}

function populateReciters() {
  const select = $("#reciterSelect");
  if (!select) return;
  if (!RECITERS.some(r => r.id === state.reciter)) state.reciter = "ar.husary";
  select.innerHTML = RECITERS.map(reciter => `<option value="${reciter.id}">${reciter.name}</option>`).join("");
  select.value = state.reciter;
}

function handleReciterChange(event) {
  state.reciter = event.target.value;
  localStorage.setItem(STORAGE.reciter, state.reciter);
  if (state.currentSurah?.number) {
    openSurah(state.currentSurah.number);
    toast("تم تغيير القارئ");
  }
}

async function loadAzkar() {
  try {
    const res = await fetch(ADHKAR_REMOTE, { cache: "force-cache" });
    if (!res.ok) throw new Error("Failed remote azkar");
    const json = await res.json();
    state.azkar = Array.isArray(json) ? json : fallbackAzkar;
    $("#azkarStatus").textContent = `تم تحميل ${toArabicDigits(state.azkar.length)} باب من الأذكار.`;
  } catch (error) {
    state.azkar = fallbackAzkar;
    $("#azkarStatus").textContent = "تم تشغيل نسخة احتياطية مختصرة من الأذكار. لتفعيل البيانات الكاملة افتح الموقع مع اتصال إنترنت.";
  }
  renderAzkarCategories();
}

function renderAzkarCategories() {
  if (!state.azkar.length) return;
  if (!state.selectedAzkarId) state.selectedAzkarId = state.azkar[0].id;
  const rows = [];
  for (let i = 0; i < state.azkar.length; i += 3) rows.push(state.azkar.slice(i, i + 3));
  $("#azkarCategories").innerHTML = rows.map(row => {
    const cards = row.map(category => `
      <button class="category-card ${String(category.id) === String(state.selectedAzkarId) ? "active" : ""}" data-azkar-category="${category.id}">
        ${category.category}
        <small>${toArabicDigits(category.array?.length || 0)} ذكر</small>
      </button>
    `).join("");
    const selectedInRow = row.some(category => String(category.id) === String(state.selectedAzkarId));
    return `
      <div class="azkar-category-row">${cards}</div>
      ${selectedInRow ? renderAzkarItemsPanel(state.selectedAzkarId) : ""}
    `;
  }).join("");
  const legacyItems = $("#azkarItems");
  if (legacyItems) legacyItems.innerHTML = "";
}

function selectAzkarCategory(id, scrollToItems = true) {
  state.selectedAzkarId = id;
  renderAzkarCategories();
  if (scrollToItems) {
    setTimeout(() => {
      const target = $(".azkar-inline-panel");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
  }
}

function renderAzkarItemsPanel(categoryId) {
  const category = state.azkar.find(c => String(c.id) === String(categoryId)) || state.azkar[0];
  const query = normalizeArabic($("#azkarFilter")?.value || "");
  const items = (category?.array || []).filter(item => normalizeArabic(item.text).includes(query));
  return `
    <div class="azkar-inline-panel glass-card" id="azkar-inline-panel">
      <div class="inline-panel-head">
        <div>
          <p class="eyebrow">الأذكار المختارة</p>
          <h3>${category?.category || "الأذكار"}</h3>
        </div>
        <span class="badge">${toArabicDigits(items.length)} ذكر</span>
      </div>
      <div class="azkar-list inline-azkar-list">
        ${items.map(item => renderZekrCard(item, category)).join("") || `<div class="status-note">لا توجد أذكار مطابقة.</div>`}
      </div>
    </div>
  `;
}

function renderAzkarItems(categoryId) {
  state.selectedAzkarId = categoryId || state.selectedAzkarId;
  renderAzkarCategories();
}

function renderZekrCard(item, category) {
  const textForCopy = `${item.text}\n${category.category}`;
  const fav = encodeURIComponent(JSON.stringify({ type: "zekr", title: category.category, text: item.text, meta: `عدد التكرار: ${item.count || 1}` }));
  return `
    <article class="azkar-card">
      <p class="zekr-text">${item.text}</p>
      <div class="counter-row">
        <span class="counter-pill">التكرار: ${toArabicDigits(item.count || 1)}</span>
        <button class="tool-btn" data-count="${item.count || 1}">ابدأ العداد</button>
        <button class="tool-btn" data-copy="${encodeURIComponent(textForCopy)}">نسخ</button>
        <button class="tool-btn" data-share="${encodeURIComponent(textForCopy)}">مشاركة</button>
        <button class="tool-btn" data-fav="${fav}">حفظ</button>
      </div>
    </article>
  `;
}

function handleCounter(btn) {
  const total = Number(btn.dataset.count || 1);
  const current = Number(btn.dataset.current || 0) + 1;
  if (current >= total) {
    btn.dataset.current = 0;
    btn.textContent = "تم ✓ إعادة";
    toast("تم إكمال الذكر");
  } else {
    btn.dataset.current = current;
    btn.textContent = `${toArabicDigits(current)} / ${toArabicDigits(total)}`;
  }
}

async function runGlobalSearch() {
  const query = $("#globalSearch").value.trim();
  const results = $("#searchResults");
  if (!query) {
    results.innerHTML = `<div class="status-note">اكتب كلمة للبحث.</div>`;
    return;
  }
  results.innerHTML = `<div class="skeleton-card"></div>`;
  const chunks = [];
  if (["all", "quran"].includes(state.searchScope)) {
    chunks.push(...await searchQuran(query));
  }
  if (["all", "azkar"].includes(state.searchScope)) {
    chunks.push(...searchAzkar(query));
  }
  results.innerHTML = chunks.length ? chunks.join("") : `<div class="status-note">لا توجد نتائج واضحة.</div>`;
}

async function searchQuran(query) {
  try {
    const index = await loadQuranIndex();
    const normalizedQuery = normalizeArabic(query);
    if (!normalizedQuery) return [];
    const tokens = normalizedQuery.split(" ").filter(Boolean);
    const matches = index.filter(item => {
      const haystack = item.normalized;
      return haystack.includes(normalizedQuery) || tokens.every(token => haystack.includes(token));
    });
    return matches.slice(0, 40).map(match => {
      const displayText = getAyahDisplayText({ text: match.text, numberInSurah: match.numberInSurah }, { number: match.surahNumber });
      const fav = encodeURIComponent(JSON.stringify({ type: "ayah", title: match.surahName, text: displayText, meta: `سورة ${match.surahName} - آية ${match.numberInSurah}`, surah: match.surahNumber, ayah: match.numberInSurah }));
      return `
        <article class="result-card">
          <small>نتيجة من القرآن الكريم</small>
          <h3>${match.surahName} — آية ${toArabicDigits(match.numberInSurah)}</h3>
          <p class="ayah-text">${highlight(displayText, query)}</p>
          <div class="ayah-tools">
            <button class="tool-btn" onclick="openSurah(${match.surahNumber}, ${match.numberInSurah})">فتح الآية</button>
            <button class="tool-btn" data-copy="${encodeURIComponent(displayText)}">نسخ</button>
            <button class="tool-btn" data-fav="${fav}">حفظ</button>
          </div>
        </article>
      `;
    });
  } catch (error) {
    return [`<article class="result-card"><small>تنبيه</small><p>تعذر تجهيز البحث في القرآن الآن بسبب الاتصال.</p></article>`];
  }
}

async function loadQuranIndex() {
  if (state.quranIndex) return state.quranIndex;
  const res = await fetch(`${API}/quran/quran-uthmani`, { cache: "force-cache" });
  if (!res.ok) throw new Error("Failed Quran index");
  const json = await res.json();
  const surahs = json.data?.surahs || [];
  state.quranIndex = surahs.flatMap(surah => (surah.ayahs || []).map(ayah => {
    const meta = `${surah.name} ${surah.englishName || ""} ${surah.number} ${ayah.numberInSurah}`;
    return {
      text: ayah.text,
      surahName: surah.name,
      englishName: surah.englishName,
      surahNumber: surah.number,
      numberInSurah: ayah.numberInSurah,
      normalized: normalizeArabic(`${meta} ${ayah.text}`)
    };
  }));
  return state.quranIndex;
}

function searchAzkar(query) {
  const normalized = normalizeArabic(query);
  const allItems = state.azkar.flatMap(category => (category.array || []).map(item => ({ category, item })));
  return allItems
    .filter(({ category, item }) => normalizeArabic(`${category.category} ${item.text}`).includes(normalized))
    .slice(0, 30)
    .map(({ category, item }) => `
      <article class="result-card">
        <small>نتيجة من الأذكار</small>
        <h3>${category.category}</h3>
        <p class="zekr-text">${highlight(item.text, query)}</p>
        <div class="ayah-tools">
          <button class="tool-btn" onclick="navigate('azkar'); selectAzkarCategory(${category.id})">فتح الباب</button>
          <button class="tool-btn" data-copy="${encodeURIComponent(item.text)}">نسخ</button>
        </div>
      </article>
    `);
}

function toggleFavorite(item) {
  const key = item.key || `${item.type}-${item.title}-${item.meta}`;
  const exists = state.favorites.some(f => f.key === key);
  if (exists) {
    state.favorites = state.favorites.filter(f => f.key !== key);
    toast("تمت الإزالة من المفضلة");
  } else {
    state.favorites.unshift({ ...item, key, createdAt: new Date().toISOString() });
    toast("تم الحفظ في المفضلة");
  }
  persistFavorites();
}

function persistFavorites() {
  localStorage.setItem(STORAGE.favorites, JSON.stringify(state.favorites));
  updateMiniStats();
  renderFavorites();
}

function renderFavorites() {
  const list = $("#favoritesList");
  if (!list) return;
  const type = $("#favoriteTypeFilter")?.value || "all";
  const items = state.favorites.filter(item => type === "all" || item.type === type);
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state glass-card">
        <h3>لا توجد عناصر محفوظة بعد</h3>
        <p>احفظ آية أو ذكر من أزرار الحفظ، وستظهر هنا مباشرة.</p>
        <button class="primary-btn" data-route="quran">ابدأ من القرآن</button>
      </div>
    `;
    return;
  }
  list.innerHTML = items.map(item => {
    const key = encodeURIComponent(item.key);
    const canOpen = item.type === "ayah" && item.surah;
    const text = encodeURIComponent(`${item.text}\n${item.meta || ""}`);
    return `
      <article class="favorite-card glass-card">
        <small>${item.type === "ayah" ? "آية محفوظة" : "ذكر محفوظ"}</small>
        <h3>${item.title}</h3>
        <p class="${item.type === "ayah" ? "ayah-text" : "zekr-text"}">${item.text}</p>
        <div class="favorite-meta">${item.meta || ""}</div>
        <div class="ayah-tools">
          ${canOpen ? `<button class="tool-btn" data-open-fav="${key}">فتح الموضع</button>` : ""}
          <button class="tool-btn" data-copy="${text}">نسخ</button>
          <button class="tool-btn" data-share="${text}">مشاركة</button>
          <button class="tool-btn danger-tool" data-remove-fav="${key}">حذف</button>
        </div>
      </article>
    `;
  }).join("");
}

function openFavorite(key) {
  const item = state.favorites.find(f => f.key === key);
  if (!item) return;
  if (item.type === "ayah" && item.surah) openSurah(Number(item.surah), Number(item.ayah || 1));
}

function removeFavorite(key) {
  state.favorites = state.favorites.filter(item => item.key !== key);
  persistFavorites();
  toast("تم حذف العنصر من المفضلة");
}

function clearFavorites() {
  if (!state.favorites.length) return;
  const ok = confirm("هل تريد حذف كل عناصر المفضلة؟");
  if (!ok) return;
  state.favorites = [];
  persistFavorites();
  toast("تم حذف المفضلة");
}

function saveCurrentRead(silent = false) {
  if (!state.currentSurah) return;
  const ayah = getCurrentVisibleAyah();
  const read = { surah: state.currentSurah.number, name: state.currentSurah.name, ayah, date: new Date().toISOString() };
  localStorage.setItem(STORAGE.lastRead, JSON.stringify(read));
  renderHomeState();
  if (!silent) toast(`تم حفظ الموضع: ${state.currentSurah.name} آية ${toArabicDigits(ayah)}`);
}

function scheduleAutoSaveLastRead() {
  if (state.route !== "reader" || !state.currentSurah) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => saveCurrentRead(true), 700);
}

function getCurrentVisibleAyah() {
  if (!state.currentSurah) return 1;
  const nodes = $$("[data-ayah-number]");
  if (!nodes.length) return 1;
  let best = 1;
  let bestDistance = Infinity;
  nodes.forEach(node => {
    const rect = node.getBoundingClientRect();
    const distance = Math.abs(rect.top - 160);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Number(node.dataset.ayahNumber) || 1;
    }
  });
  return best;
}

function saveKhatmah(event) {
  event.preventDefault();
  const data = {
    surah: Number($("#khatmahSurah").value),
    ayah: Number($("#khatmahAyah").value),
    days: Number($("#khatmahDays").value),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE.khatmah, JSON.stringify(data));
  renderKhatmah();
  toast("تم حفظ تقدم الختمة");
}

function hydrateKhatmahSelect() {
  const select = $("#khatmahSurah");
  select.innerHTML = state.surahs.map(s => `<option value="${s.number}">${s.number} - ${s.name}</option>`).join("");
  const saved = readJSON(STORAGE.khatmah, null);
  if (saved) {
    select.value = saved.surah;
    $("#khatmahAyah").value = saved.ayah;
    $("#khatmahDays").value = saved.days;
  }
  renderKhatmah();
}

function renderKhatmah() {
  const saved = readJSON(STORAGE.khatmah, null);
  if (!saved || !state.surahs.length) return;
  const totalAyahs = 6236;
  let done = 0;
  for (const surah of state.surahs) {
    if (surah.number < saved.surah) done += surah.numberOfAyahs;
  }
  done += Math.max(0, Math.min(saved.ayah, state.surahs.find(s => s.number === saved.surah)?.numberOfAyahs || 1));
  const percent = Math.min(100, Math.round((done / totalAyahs) * 100));
  $("#progressRing").style.setProperty("--progress", `${percent}%`);
  $("#progressText").textContent = `${toArabicDigits(percent)}%`;
  const surah = state.surahs.find(s => s.number === saved.surah);
  $("#khatmahSummary").textContent = `آخر موضع: ${surah?.name || ""}، آية ${toArabicDigits(saved.ayah)}. الهدف: ختمة خلال ${toArabicDigits(saved.days)} يوم.`;
}


function startClock() {
  updateCurrentClock();
  clearInterval(state.clockTimer);
  state.clockTimer = setInterval(updateCurrentClock, 1000);
}

function updateCurrentClock() {
  const now = new Date();
  const clockNode = $("#currentClock");
  const dateNode = $("#gregorianDate");
  if (clockNode) {
    clockNode.textContent = new Intl.DateTimeFormat("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(now);
  }
  if (dateNode) {
    dateNode.textContent = new Intl.DateTimeFormat("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(now);
  }
  updateNextPrayerCountdown();
}

async function loadPrayerTimes(useLocation = false, force = false) {
  const grid = $("#prayerTimesGrid");
  const status = $("#prayerStatus");
  const locationNode = $("#prayerLocation");
  if (!grid) return;
  if (state.prayerLoaded && !force && !useLocation) return;
  grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
  if (status) status.textContent = "يتم تحميل مواقيت الصلاة...";

  try {
    let url = "https://api.aladhan.com/v1/timingsByCity?city=Cairo&country=Egypt&method=5";
    let locationLabel = "القاهرة، مصر";

    if (useLocation) {
      const pos = await getBrowserPosition();
      const { latitude, longitude } = pos.coords;
      url = `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=5`;
      locationLabel = "موقعك الحالي";
    }

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed prayer request");
    const json = await res.json();
    const data = json.data || {};
    state.prayerTimings = data.timings || {};
    renderPrayerTimes(state.prayerTimings);
    renderHijriDate(data.date?.hijri);
    if (locationNode) locationNode.textContent = locationLabel;
    if (status) status.textContent = `آخر تحديث: ${new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date())}`;
    state.prayerLoaded = true;
  } catch (error) {
    renderPrayerFallback(error);
  }
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 1000 * 60 * 20
    });
  });
}

function renderPrayerTimes(timings) {
  const grid = $("#prayerTimesGrid");
  if (!grid) return;
  const next = getNextPrayer(timings);
  state.nextPrayerKey = next?.key || null;
  const prayers = [
    ["Fajr", "الفجر", "بداية اليوم"],
    ["Sunrise", "الشروق", "وقت الشروق"],
    ["Dhuhr", "الظهر", "منتصف النهار"],
    ["Asr", "العصر", "بعد الظهر"],
    ["Maghrib", "المغرب", "غروب الشمس"],
    ["Isha", "العشاء", "نهاية اليوم"]
  ];
  grid.innerHTML = prayers.map(([key, label, hint]) => `
    <article class="prayer-time-card glass-card ${key === state.nextPrayerKey ? "next-active" : ""}" data-prayer-key="${key}">
      <span>${label}</span>
      <strong>${formatPrayerTime(timings[key] || "--:--")}</strong>
      <small>${key === state.nextPrayerKey ? "الصلاة القادمة" : hint}</small>
    </article>
  `).join("");
  updateNextPrayerCountdown();
}

function getNextPrayer(timings) {
  if (!timings) return null;
  const labels = [
    ["Fajr", "الفجر"],
    ["Dhuhr", "الظهر"],
    ["Asr", "العصر"],
    ["Maghrib", "المغرب"],
    ["Isha", "العشاء"]
  ];
  const now = new Date();
  const today = labels.map(([key, label]) => ({ key, label, date: prayerDateFromValue(timings[key], 0), time: timings[key] })).filter(item => item.date);
  let next = today.find(item => item.date > now);
  if (!next && timings.Fajr) next = { key: "Fajr", label: "الفجر", date: prayerDateFromValue(timings.Fajr, 1), time: timings.Fajr };
  return next || null;
}

function prayerDateFromValue(value, dayOffset = 0) {
  const clean = String(value || "").split(" ")[0];
  const [h, m] = clean.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(h, m, 0, 0);
  return date;
}

function updateNextPrayerCountdown() {
  if (!state.prayerTimings) return;
  const next = getNextPrayer(state.prayerTimings);
  const nameNode = $("#nextPrayerName");
  const countdownNode = $("#nextPrayerCountdown");
  const timeNode = $("#nextPrayerTime");
  if (!next || !nameNode || !countdownNode || !timeNode) return;
  state.nextPrayerKey = next.key;
  $$('[data-prayer-key]').forEach(card => card.classList.toggle('next-active', card.dataset.prayerKey === next.key));
  const diff = Math.max(0, next.date.getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  nameNode.textContent = next.label;
  countdownNode.textContent = `${toArabicDigits(String(hours).padStart(2, "0"))}:${toArabicDigits(String(minutes).padStart(2, "0"))}:${toArabicDigits(String(seconds).padStart(2, "0"))}`;
  timeNode.textContent = `موعدها: ${formatPrayerTime(next.time)}`;
}

function renderHijriDate(hijri) {
  const dateNode = $("#hijriDateToday");
  const metaNode = $("#hijriMeta");
  if (!dateNode) return;
  if (hijri?.day && hijri?.month?.ar && hijri?.year) {
    dateNode.textContent = `${toArabicDigits(hijri.day)} ${hijri.month.ar} ${toArabicDigits(hijri.year)} هـ`;
    if (metaNode) metaNode.textContent = `اليوم: ${hijri.weekday?.ar || ""}`;
  } else {
    const now = new Date();
    dateNode.textContent = new Intl.DateTimeFormat("ar-EG-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);
    if (metaNode) metaNode.textContent = "تاريخ هجري تقديري من المتصفح.";
  }
}

function renderPrayerFallback(error) {
  const grid = $("#prayerTimesGrid");
  const status = $("#prayerStatus");
  if (grid) {
    grid.innerHTML = `
      <article class="prayer-time-card glass-card">
        <span>تنبيه</span>
        <strong>غير متاح</strong>
        <small>تعذر تحميل المواقيت الآن. جرّب التحديث أو تأكد من الاتصال بالإنترنت.</small>
      </article>
    `;
  }
  state.prayerTimings = null;
  const nameNode = $("#nextPrayerName");
  const countdownNode = $("#nextPrayerCountdown");
  const timeNode = $("#nextPrayerTime");
  if (nameNode) nameNode.textContent = "غير متاح";
  if (countdownNode) countdownNode.textContent = "--:--:--";
  if (timeNode) timeNode.textContent = "تعذر حساب الصلاة القادمة الآن.";
  renderHijriDate(null);
  if (status) status.textContent = "لم يتم تحميل المواقيت.";
}

function formatPrayerTime(value) {
  const clean = String(value).split(" ")[0];
  const [h, m] = clean.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return clean;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
}

function renderTasbeeh() {
  const data = state.tasbeeh || { phrase: "سُبْحَانَ اللَّهِ", count: 0 };
  const phraseNode = $("#tasbeehPhrase");
  const countNode = $("#tasbeehCount");
  if (phraseNode) phraseNode.textContent = data.phrase;
  if (countNode) countNode.textContent = toArabicDigits(data.count || 0);
  $$('[data-tasbeeh-phrase]').forEach(btn => btn.classList.toggle("active", btn.dataset.tasbeehPhrase === data.phrase));
}

function persistTasbeeh() {
  localStorage.setItem(STORAGE.tasbeeh, JSON.stringify(state.tasbeeh));
  renderTasbeeh();
}

function chooseTasbeehPhrase(phrase) {
  state.tasbeeh = { phrase, count: 0 };
  persistTasbeeh();
  toast("تم تغيير الذكر");
}

function incrementTasbeeh() {
  state.tasbeeh.count = Number(state.tasbeeh.count || 0) + 1;
  persistTasbeeh();
}

function resetTasbeeh() {
  state.tasbeeh.count = 0;
  persistTasbeeh();
  toast("تم تصفير عداد المسبحة");
}

function saveTasbeehToFavorites() {
  const phrase = state.tasbeeh?.phrase || "سُبْحَانَ اللَّهِ";
  toggleFavorite({ type: "zekr", title: "المسبحة الإلكترونية", text: phrase, meta: `آخر عداد: ${toArabicDigits(state.tasbeeh?.count || 0)}` });
}


function renderHomeState() {
  const last = readJSON(STORAGE.lastRead, null);
  $("#lastReadMini").textContent = last ? `${last.name} - آية ${toArabicDigits(last.ayah)}` : "لم تبدأ بعد";
  updateMiniStats();
}

function updateMiniStats() {
  const favNode = $("#favCountMini");
  if (favNode) favNode.textContent = `${toArabicDigits(state.favorites.length)} عناصر`;
}

function playAudio(url) {
  if (!url) return;
  stopActiveAudio();
  const session = ++state.audioSession;
  const audio = new Audio(url);
  state.activeAudio = audio;
  audio.addEventListener("ended", () => {
    if (state.audioSession === session && state.activeAudio === audio) {
      state.activeAudio = null;
    }
  });
  audio.play().catch(() => {
    if (state.audioSession === session) state.activeAudio = null;
    toast("تعذر تشغيل الصوت");
  });
}

function playSurahAudio() {
  const urls = (state.currentAudio?.ayahs || []).map(ayah => ayah.audio).filter(Boolean);
  if (!urls.length) {
    toast("الصوت غير متاح لهذا القارئ الآن");
    return;
  }
  playAudioQueue(urls);
  toast("بدأ تشغيل السورة كاملة");
}

function playAudioQueue(urls, index = 0, session = null) {
  if (!urls[index]) {
    if (session === null || state.audioSession === session) state.activeAudio = null;
    return;
  }
  if (index === 0 || session === null) {
    stopActiveAudio();
    session = ++state.audioSession;
  }
  if (state.audioSession !== session) return;
  const audio = new Audio(urls[index]);
  state.activeAudio = audio;
  audio.addEventListener("ended", () => {
    if (state.audioSession !== session || state.activeAudio !== audio) return;
    if (index + 1 < urls.length) {
      playAudioQueue(urls, index + 1, session);
    } else {
      state.activeAudio = null;
      toast("انتهى تشغيل السورة");
    }
  });
  audio.play().catch(() => {
    if (state.audioSession === session) state.activeAudio = null;
    toast("تعذر تشغيل الصوت");
  });
}

function stopActiveAudio() {
  state.audioSession += 1;
  if (state.activeAudio) {
    state.activeAudio.pause();
    state.activeAudio.currentTime = 0;
    state.activeAudio = null;
  }
  const stopBtn = $("#stopAudioBtn");
  if (stopBtn) stopBtn.textContent = "إيقاف الصوت";
}

function scrollToAyah(ayahNumber) {
  setTimeout(() => {
    const node = $(`#ayah-${ayahNumber}`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.add("highlight-pulse");
      setTimeout(() => node.classList.remove("highlight-pulse"), 1800);
    }
  }, 220);
}

window.playAudio = playAudio;
window.playSurahAudio = playSurahAudio;
window.openSurah = openSurah;
window.navigate = navigate;
window.selectAzkarCategory = selectAzkarCategory;

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE.theme, current);
  applyTheme();
}

function applyTheme() {
  const theme = localStorage.getItem(STORAGE.theme) || "light";
  document.documentElement.dataset.theme = theme;
  $("#themeToggle span").textContent = theme === "dark" ? "☀" : "☾";
}

function changeFont(delta) {
  state.fontSize = Math.max(1.35, Math.min(2.9, state.fontSize + delta));
  localStorage.setItem(STORAGE.font, state.fontSize);
  applyFontSize();
}

function applyFontSize() {
  document.documentElement.style.setProperty("--ayah-size", `${state.fontSize}rem`);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("تم النسخ");
  } catch (error) {
    toast("لم يتم النسخ تلقائيًا");
  }
}

async function shareText(text) {
  if (navigator.share) {
    await navigator.share({ title: "إحسان", text }).catch(() => null);
  } else {
    copyText(text);
  }
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

function shouldShowStandaloneBasmalah(surah) {
  return Number(surah?.number) !== 1 && Number(surah?.number) !== 9;
}

function renderStandaloneBasmalah(surah, extraClass = "") {
  if (!shouldShowStandaloneBasmalah(surah)) return "";
  return `<div class="surah-bismillah ${extraClass}" aria-label="البسملة">${BASMALAH_TEXT}</div>`;
}

function getAyahDisplayText(ayah, surah) {
  if (shouldShowStandaloneBasmalah(surah) && Number(ayah?.numberInSurah) === 1) {
    return stripLeadingBasmalah(ayah.text || "");
  }
  return ayah?.text || "";
}

function stripLeadingBasmalah(text = "") {
  const original = String(text);
  let endIndex = -1;
  for (let i = 0; i < Math.min(original.length, 120); i++) {
    const prefix = normalizeArabic(original.slice(0, i + 1));
    if (prefix === BASMALAH_NORMALIZED || prefix.startsWith(`${BASMALAH_NORMALIZED} `)) {
      endIndex = i + 1;
      break;
    }
  }
  if (endIndex === -1) return original;
  return original
    .slice(endIndex)
    .replace(/^[\s\u064B-\u065F\u0670\u06D6-\u06EDـ۝۞﴾﴿،؛:!؟.\-]+/g, "")
    .trim();
}

function normalizeArabic(value = "") {
  return value
    .toString()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[۝۞﴾﴿()[\]{}.,،؛:!؟\-_/\\|~`'"“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function highlight(text, query) {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), match => `<mark>${match}</mark>`);
}

function toArabicDigits(value) {
  return String(value).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
