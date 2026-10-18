/* ================= config ================= */
const API_BASE = "";
const APP_NAME = "Deadline: JLPT drill";
const EXAM_NAME = "JLPT N1";
const FIXED_EXAM_DATE = "2026-12-06";
const FIXED_TOTAL_CHAPTERS = 31;
const EMOJI_PALETTE = ["🌸","🌼","🌻","🌷","🌹","🌱","🍀","🌿","🌊","🔥","⭐","🌙","☀️","❄️","🍡","🍙"];
const DEFAULT_EMOJI = "🌱";
const LAST_USERNAME_KEY = "kanji-last-username-v1";
const SPRINT_SKIP_DATE_KEY = "kanji-sprint-skip-date-v1";
const ONBOARDED_KEY = "kanji-onboarded-v1";
const LAST_USER_ID_KEY = "kanji-last-user-id-v1";

const MAX_BOX = 3;
const SOLID_THRESHOLD = 0.70;
const MASTER_THRESHOLD = 0.90;
const DEFAULT_DAILY_GOAL = 20;
const INTERLEAVE_RATIO = 0.20;

/* ================= storage keys ================= */
const K_LOCAL_CHAPTERS = "kanji-local-chapters-v1";
const K_LOCAL_PROGRESS = "kanji-local-progress-v1";
const K_LOCAL_STREAKS = "kanji-local-streaks-v1";
const K_SETTINGS = "kanji-settings-v1";
const K_QUICKSTATS = "kanji-quickstats-v1";
const K_WEAKSTATS = "kanji-weakstats-v1";
const K_TOKEN = "kanji-auth-token-v1";
const K_USER = "kanji-auth-user-v1";
const K_DAILY = "kanji-daily-v1";
const K_CURRENT_CHAPTER = "kanji-current-chapter-v1";
const K_SETTINGS_DIRTY = "kanji-settings-dirty-v1";
const K_WEAK_DIRTY = "kanji-weak-dirty-v1";
const K_MODE_CHOSEN = "kanji-mode-chosen-v1";

const DEFAULT_SETTINGS = {
  shuffle: true,
  requeueGap: 3,
  learnBatchSize: 6,
  learnCumulative: true,
  studyMode: "free",
  interleaving: true,
  dailyGoal: DEFAULT_DAILY_GOAL,
  soundEnabled: true
};

/* ================= IndexedDB ================= */
let idbPromise = null;
function openDB(){
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve)=>{
    if (!("indexedDB" in window)) { resolve(null); return; }
    const req = indexedDB.open("kanji-srs-db", 1);
    req.onupgradeneeded = (e)=>{ e.target.result.createObjectStore("kv"); };
    req.onsuccess = (e)=> resolve(e.target.result);
    req.onerror = ()=> resolve(null);
  });
  return idbPromise;
}
function idbGet(db, key){
  return new Promise((resolve)=>{
    try {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(key);
      req.onsuccess = ()=> resolve(req.result != null ? req.result : null);
      req.onerror = ()=> resolve(null);
    } catch(e) { resolve(null); }
  });
}
function idbSet(db, key, val){
  return new Promise((resolve)=>{
    try {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(val, key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> resolve(false);
    } catch(e) { resolve(false); }
  });
}
function idbDelete(db, key){
  return new Promise((resolve)=>{
    try {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete(key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> resolve(false);
    } catch(e) { resolve(false); }
  });
}
async function storeGet(key){
  const db = await openDB();
  if (db) return idbGet(db, key);
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
async function storeSet(key, val){
  const db = await openDB();
  if (db) return idbSet(db, key, val);
  try { localStorage.setItem(key, val); return true; } catch(e) { return false; }
}
async function storeDel(key){
  const db = await openDB();
  if (db) return idbDelete(db, key);
  try { localStorage.removeItem(key); return true; } catch(e) { return false; }
}

/* ================= auth ================= */
let authToken = null;
let authUser = null;

function loadAuth(){
  try {
    authToken = localStorage.getItem(K_TOKEN);
    const u = localStorage.getItem(K_USER);
    authUser = u ? JSON.parse(u) : null;
  } catch(e) { authToken = null; authUser = null; }
}
function saveAuth(token, user){
  authToken = token; authUser = user;
  try {
    localStorage.setItem(K_TOKEN, token);
    localStorage.setItem(K_USER, JSON.stringify(user));
  } catch(e) {}
}
function updateCachedUser(user){
  authUser = user;
  try { localStorage.setItem(K_USER, JSON.stringify(user)); } catch(e) {}
}
function clearAuth(){
  stopPresenceLoop();
  notifications = [];
  unreadNotifCount = 0;
  authToken = null; authUser = null;
  try {
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_USER);
  } catch(e) {}
}
function getLastUsername(){
  try { return localStorage.getItem(LAST_USERNAME_KEY) || ""; } catch(e){ return ""; }
}
function setLastUsername(u){
  try { localStorage.setItem(LAST_USERNAME_KEY, u); } catch(e){}
}

function userScopedKey(baseKey){
  const id = (authUser && authUser.id) ? String(authUser.id) : "_anonymous";
  return baseKey + "-u" + id;
}
function hasOnboarded(){
  try { return localStorage.getItem(userScopedKey(ONBOARDED_KEY)) === "1"; } catch(e){ return false; }
}
function setOnboarded(){
  try { localStorage.setItem(userScopedKey(ONBOARDED_KEY), "1"); } catch(e){}
}
function hasChosenMode(){
  try { return localStorage.getItem(userScopedKey(K_MODE_CHOSEN)) === "1"; } catch(e){ return false; }
}
function setChosenMode(){
  try { localStorage.setItem(userScopedKey(K_MODE_CHOSEN), "1"); } catch(e){}
}
function getLastUserId(){
  try { return localStorage.getItem(LAST_USER_ID_KEY) || ""; } catch(e){ return ""; }
}
function setLastUserId(id){
  try { localStorage.setItem(LAST_USER_ID_KEY, String(id)); } catch(e){}
}

function userDisplayName(){
  if (!authUser) return "";
  return authUser.display_name || authUser.username;
}
function userEmoji(){
  if (!authUser) return DEFAULT_EMOJI;
  return authUser.avatar_emoji || DEFAULT_EMOJI;
}
function isAdmin(){
  return !!(authUser && authUser.is_admin);
}
function avatarHtml(size){
  const cls = size ? " " + size : "";
  return `<span class="avatar-bubble${cls}">${userEmoji()}</span>`;
}
function cleanChapterName(name){
  return String(name).replace(/^(Chapter)\s*-\s*(\d+)/i, "$1 $2");
}

async function api(path, opts = {}){
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (authToken) headers.Authorization = "Bearer " + authToken;
  const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  let body = null;
  try { body = await res.json(); } catch(e) {}
  return { ok: res.ok, status: res.status, body };
}

/* ================= state ================= */
let chapters = [];
let progress = {};
let streakDates = {};
let dirtyStreakDates = new Set();
let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let quickStats = {};
let weakStats = {};
let VOCAB = [];
let lastSyncAt = null;
let syncing = false;
let currentChapterId = null;
let dailyData = { date: "", seen: [] };
let previousChapterStatuses = {};
let settingsDirty = false;
let weakDirty = false;

let screen = "login";
let activeChapterId = null;
let isNewAccount = false;

// Match State (Global so we can clear the interval)
let matchPollTimer = null;
let currentMatchId = null;
let currentRaceQueue = [];
let myRaceScore = 0;
let myRaceDone = false;
let currentMatchPlayers = [];

// notifications
let notifications = [];
let unreadNotifCount = 0;

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function shuffleArr(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function orderCards(ids){ return settings.shuffle ? shuffleArr(ids) : ids.slice(); }
function cardKey(chapterId, idx){ return chapterId + "_" + idx; }

function chapterNumberFromName(name){
  const m = String(name).match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}
function sortChapters(){
  chapters.sort((a, b)=>{
    const na = chapterNumberFromName(a.name);
    const nb = chapterNumberFromName(b.name);
    if (na !== nb) return na - nb;
    const sa = a.serverId || Infinity;
    const sb = b.serverId || Infinity;
    return sa - sb;
  });
}

function clampBox(b){
  b = Number(b) || 0;
  if (b > MAX_BOX) return MAX_BOX;
  if (b < 0) return 0;
  return b;
}

function rebuildVocab(){
  sortChapters();
  VOCAB = [];
  chapters.forEach(ch=>{
    ch.cards.forEach((c, i)=>{
      const key = cardKey(ch.id, i);
      VOCAB.push({ id: key, chapterId: ch.id, chapterName: ch.name, k:c.k, r:c.r, m:c.m, s:c.s, serverCardId: c.serverId || null });
    });
  });
  VOCAB.forEach(v=>{
    if (!progress[v.id]) progress[v.id] = { box:0, due:null, misses:0, last_seen:null, dirty:0, priority:0 };
    else {
      progress[v.id].box = clampBox(progress[v.id].box);
      if (progress[v.id].priority === undefined) progress[v.id].priority = 0;
    }
  });
}

async function saveLocalChapters(){ await storeSet(K_LOCAL_CHAPTERS, JSON.stringify(chapters)); }
async function saveLocalProgress(){ await storeSet(K_LOCAL_PROGRESS, JSON.stringify(progress)); }
async function saveLocalStreaks(){ await storeSet(K_LOCAL_STREAKS, JSON.stringify({ dates: streakDates, dirty: Array.from(dirtyStreakDates) })); }
async function saveSettings(){
  await storeSet(K_SETTINGS, JSON.stringify(settings));
  settingsDirty = true;
  await storeSet(K_SETTINGS_DIRTY, "1");
}
async function saveQuickStats(){ await storeSet(K_QUICKSTATS, JSON.stringify(quickStats)); }
async function saveWeakStats(){
  await storeSet(K_WEAKSTATS, JSON.stringify(weakStats));
  weakDirty = true;
  await storeSet(K_WEAK_DIRTY, "1");
}
async function saveDaily(){ await storeSet(K_DAILY, JSON.stringify(dailyData)); }
async function saveCurrentChapter(){ await storeSet(K_CURRENT_CHAPTER, currentChapterId || ""); }

function todayKey(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function ensureDailyIsToday(){
  const t = todayKey();
  if (dailyData.date !== t) dailyData = { date: t, seen: [] };
}

async function wipeUserLocalCache(){
  await Promise.all([
    storeDel(K_LOCAL_PROGRESS), storeDel(K_LOCAL_STREAKS), storeDel(K_SETTINGS),
    storeDel(K_QUICKSTATS), storeDel(K_WEAKSTATS), storeDel(K_DAILY),
    storeDel(K_CURRENT_CHAPTER), storeDel(K_SETTINGS_DIRTY), storeDel(K_WEAK_DIRTY),
  ]);
  progress = {}; streakDates = {}; dirtyStreakDates = new Set();
  settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  quickStats = {}; weakStats = {}; dailyData = { date: "", seen: [] };
  currentChapterId = null; settingsDirty = false; weakDirty = false;
}

async function loadLocal(){
  const [cRaw, pRaw, sRaw, setRaw, qsRaw, wsRaw, dailyRaw, curRaw, setDirtyRaw, weakDirtyRaw] = await Promise.all([
    storeGet(K_LOCAL_CHAPTERS), storeGet(K_LOCAL_PROGRESS), storeGet(K_LOCAL_STREAKS),
    storeGet(K_SETTINGS), storeGet(K_QUICKSTATS), storeGet(K_WEAKSTATS),
    storeGet(K_DAILY), storeGet(K_CURRENT_CHAPTER),
    storeGet(K_SETTINGS_DIRTY), storeGet(K_WEAK_DIRTY)
  ]);
  
  if (cRaw) { try { chapters = JSON.parse(cRaw); } catch(e){ chapters = []; } }
  if (pRaw) { try { progress = JSON.parse(pRaw); } catch(e){ progress = {}; } }
  if (sRaw) {
    try {
      const obj = JSON.parse(sRaw);
      streakDates = obj.dates || {};
      dirtyStreakDates = new Set(obj.dirty || []);
    } catch(e){ streakDates = {}; }
  }
  if (setRaw) { try { settings = Object.assign(deepClone(DEFAULT_SETTINGS), JSON.parse(setRaw)); } catch(e){} }
  if (qsRaw) { try { quickStats = JSON.parse(qsRaw); } catch(e){ quickStats = {}; } }
  if (wsRaw) { try { weakStats = JSON.parse(wsRaw); } catch(e){ weakStats = {}; } }
  if (dailyRaw) { try { dailyData = JSON.parse(dailyRaw); } catch(e){ dailyData = { date: "", seen: [] }; } }
  ensureDailyIsToday();
  if (curRaw) currentChapterId = curRaw || null;
  settingsDirty = setDirtyRaw === "1";
  weakDirty = weakDirtyRaw === "1";
  rebuildVocab();
}

function showTopbar(loggedIn){
  document.getElementById("menuBtn").style.display = loggedIn ? "" : "none";
  const notifBtn = document.getElementById("notifBtn");
  if (notifBtn) notifBtn.style.display = loggedIn ? "" : "none";
  document.getElementById("streakBadge").style.display = loggedIn && computeCurrentStreak() > 0 ? "" : "none";
  document.getElementById("storageNote").style.display = loggedIn ? "flex" : "none";
  if (!loggedIn) document.getElementById("statusPill").style.display = "none";
}

function setStatus(kind, text){
  const el = document.getElementById("statusPill");
  if (!el) return;
  el.style.display = "";
  el.className = "status-pill " + kind;
  el.textContent = text;
}

async function syncNow(opts = {}){
  if (syncing) return;
  if (!authToken) return;
  syncing = true;
  setStatus("syncing", "syncing…");
  try {
    const dirtyItems = Object.entries(progress)
      .filter(([_, p]) => p.dirty)
      .map(([cardKeyStr, p]) => {
        const v = VOCAB.find(x => x.id === cardKeyStr);
        if (!v || !v.serverCardId) return null;
        return {
          card_type: "kanji", card_id: v.serverCardId, box: p.box, due: p.due, misses: p.misses,
          last_seen: p.last_seen || new Date().toISOString()
        };
      }).filter(Boolean);

    if (dirtyItems.length > 0) {
      const r = await api("/api/progress", { method: "POST", body: JSON.stringify({ items: dirtyItems }) });
      if (r.ok) {
        Object.keys(progress).forEach(k => { if (progress[k].dirty) progress[k].dirty = 0; });
        await storeSet(K_LOCAL_PROGRESS, JSON.stringify(progress));
      } else if (r.status === 401) { handleAuthExpired(); return; }
    }

    if (dirtyStreakDates.size > 0) {
      const r = await api("/api/streak", { method: "POST", body: JSON.stringify({ dates: Array.from(dirtyStreakDates) }) });
      if (r.ok) { dirtyStreakDates.clear(); await saveLocalStreaks(); }
    }

    if (settingsDirty) {
      const r = await api("/api/settings", { method: "POST", body: JSON.stringify({ data: settings }) });
      if (r.ok) { settingsDirty = false; await storeSet(K_SETTINGS_DIRTY, "0"); }
    }

    if (weakDirty) {
      const weakItems = Object.keys(weakStats)
        .map(id => {
          const v = VOCAB.find(x => x.id === id);
          if (!v || !v.serverCardId) return null;
          return { card_type: "kanji", card_id: v.serverCardId, misses: weakStats[id].misses || 0 };
        }).filter(Boolean);
      if (weakItems.length > 0) {
        const r = await api("/api/weak", { method: "POST", body: JSON.stringify({ items: weakItems }) });
        if (r.ok) { weakDirty = false; await storeSet(K_WEAK_DIRTY, "0"); }
      } else {
        weakDirty = false; await storeSet(K_WEAK_DIRTY, "0");
      }
    }

    ensureDailyIsToday();
    if (dailyData.seen.length > 0) {
      const dailyCardIds = dailyData.seen
        .map(id => {
          const v = VOCAB.find(x => x.id === id);
          return v && v.serverCardId ? v.serverCardId : null;
        }).filter(Boolean);
      if (dailyCardIds.length > 0) {
        await api("/api/daily", { method: "POST", body: JSON.stringify({ date: dailyData.date, card_ids: dailyCardIds, card_type: "kanji" }) });
      }
    }

    const listRes = await api("/api/chapters");
    if (!listRes.ok) {
      if (listRes.status === 401) { handleAuthExpired(); return; }
      throw new Error("list failed");
    }
    const serverChapters = listRes.body.chapters || [];
    const serverIds = new Set(serverChapters.map(sc => sc.id));
    const before = chapters.length;
    chapters = chapters.filter(ch => !ch.serverId || serverIds.has(ch.serverId));
    if (chapters.length !== before) { await saveLocalChapters(); rebuildVocab(); }
    for (const sc of serverChapters) {
      const local = chapters.find(c => c.serverId === sc.id);
      if (!local) {
        const detail = await api("/api/chapters/" + sc.id);
        if (detail.ok) {
          chapters.push({
            id: "srv_" + sc.id, serverId: sc.id, name: detail.body.chapter.name,
            cards: detail.body.cards.map(c => ({
              serverId: c.id, k: c.kanji, r: c.reading, m: c.meaning, s: c.sentence || ""
            }))
          });
        }
      } else if (local.name !== sc.name) {
        local.name = sc.name;
      }
    }
    sortChapters();
    await saveLocalChapters();
    rebuildVocab();
    await saveLocalProgress();

    const pRes = await api("/api/progress?card_type=kanji");
    if (pRes.ok) {
      const serverProgress = pRes.body.progress || [];
      for (const sp of serverProgress) {
        const v = VOCAB.find(x => x.serverCardId === sp.card_id);
        if (!v) continue;
        const local = progress[v.id];
        const serverSeen = sp.last_seen ? new Date(sp.last_seen).getTime() : 0;
        const localSeen = local.last_seen ? new Date(local.last_seen).getTime() : 0;
        if (local.dirty && localSeen >= serverSeen) continue;
        progress[v.id] = {
          box: clampBox(sp.box), due: sp.due, misses: sp.misses,
          last_seen: sp.last_seen, dirty: 0, priority: local.priority || 0
        };
      }
      await saveLocalProgress();
    }

    const sRes = await api("/api/streak");
    if (sRes.ok) {
      (sRes.body.dates || []).forEach(d => { streakDates[d] = true; });
      await saveLocalStreaks();
    }

    if (!settingsDirty) {
      const setRes = await api("/api/settings");
      if (setRes.ok && setRes.body.data) {
        settings = Object.assign(deepClone(DEFAULT_SETTINGS), setRes.body.data);
        await storeSet(K_SETTINGS, JSON.stringify(settings));
      }
    }

    if (!weakDirty) {
      const wRes = await api("/api/weak?card_type=kanji");
      if (wRes.ok) {
        const remote = wRes.body.weak || [];
        for (const wr of remote) {
          const v = VOCAB.find(x => x.serverCardId === wr.card_id);
          if (!v) continue;
          const local = weakStats[v.id];
          const localMisses = local ? local.misses : 0;
          if (wr.misses > localMisses) weakStats[v.id] = { misses: wr.misses };
        }
        await storeSet(K_WEAKSTATS, JSON.stringify(weakStats));
      }
    }

    const meRes = await api("/api/me");
    if (meRes.ok && meRes.body.user) { updateCachedUser(meRes.body.user); updateUserLine(); }
    lastSyncAt = Date.now();
    setStatus("online", "synced");
    showTopbar(true);
    if (opts.afterSync) opts.afterSync();
  } catch(e) {
    console.error("Sync error:", e);
    setStatus("offline", "offline");
  } finally {
    syncing = false;
  }
}

function handleAuthExpired(){
  clearAuth();
  toast("Session expired — please log in again");
  renderLogin();
}

function updateUserLine(){
  const el = document.getElementById("storageNote");
  if (!el || !authUser) return;
  const badge = authUser.is_admin ? '<span class="admin-badge">admin</span>' : "";
  const syncText = lastSyncAt
    ? "last sync " + Math.max(0, Math.round((Date.now()-lastSyncAt)/60000)) + "m ago"
    : "sync pending";
  el.innerHTML = `${avatarHtml()}<span><b>${userDisplayName()}</b>${badge} · ${syncText}</span>`;
}

function dateStrOffset(daysAgo){
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function todayStr(){ return dateStrOffset(0); }
async function recordStreakToday(){
  const t = todayStr();
  if (!streakDates[t]) { streakDates[t] = true; dirtyStreakDates.add(t); await saveLocalStreaks(); }
  updateStreakBadge();
}
function updateStreakBadge(){
  const el = document.getElementById("streakBadge");
  if (!el) return;
  const n = computeCurrentStreak();
  if (n <= 0) { el.style.display = "none"; el.textContent = ""; }
  else { el.style.display = ""; el.textContent = "🔥 " + n; }
}
function computeCurrentStreak(){
  let streak = 0;
  let offset = streakDates[todayStr()] ? 0 : 1;
  while (streakDates[dateStrOffset(offset)]) { streak++; offset++; }
  return streak;
}
function computeLongestStreak(){
  const days = Object.keys(streakDates).sort();
  if (!days.length) return 0;
  let longest = 1, current = 1;
  for (let i=1;i<days.length;i++){
    const diff = Math.round((new Date(days[i]) - new Date(days[i-1])) / 86400000);
    if (diff === 1) current++; else if (diff > 1) current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function markCardSeen(cardId){
  ensureDailyIsToday();
  if (!dailyData.seen.includes(cardId)) {
    dailyData.seen.push(cardId);
    saveDaily();
  }
}
function dailyProgress(){
  ensureDailyIsToday();
  return { done: dailyData.seen.length, goal: Math.max(1, settings.dailyGoal || DEFAULT_DAILY_GOAL) };
}

function chapterMastery(chapterId){
  const cards = chapterCards(chapterId);
  if (!cards.length) return { total: 0, box2Plus: 0, box3: 0, ratio2: 0, ratio3: 0 };
  let box2Plus = 0, box3 = 0;
  cards.forEach(v => {
    const p = progress[v.id] || { box: 0 };
    if (p.box >= 2) box2Plus++;
    if (p.box >= MAX_BOX) box3++;
  });
  return {
    total: cards.length, box2Plus, box3,
    ratio2: cards.length ? box2Plus / cards.length : 0,
    ratio3: cards.length ? box3 / cards.length : 0
  };
}
function chapterStatus(chapterId){
  const m = chapterMastery(chapterId);
  const anyAboveZero = chapterCards(chapterId).some(v => (progress[v.id]?.box || 0) > 0);
  if (!anyAboveZero) return { key: "none", label: "Not started", cls: "status-none", sub: "start studying" };
  if (m.ratio3 >= MASTER_THRESHOLD) return { key: "mastered", label: "Mastered", cls: "status-mastered", sub: `${m.box3}/${m.total} learned` };
  if (m.ratio2 >= SOLID_THRESHOLD) return { key: "solid", label: "Solid", cls: "status-solid", sub: `${m.box2Plus}/${m.total} getting there` };
  return { key: "practicing", label: "Practicing", cls: "status-practicing", sub: `${m.box2Plus}/${m.total} getting there` };
}
function isMastered(chapterId){ return chapterStatus(chapterId).key === "mastered"; }
function isUnlocked(chapterId){
  if (settings.studyMode !== "guided") return true;
  sortChapters();
  const idx = chapters.findIndex(c => c.id === chapterId);
  if (idx <= 0) return true;
  for (let i = 0; i < idx; i++) {
    const st = chapterStatus(chapters[i].id).key;
    if (st !== "solid" && st !== "mastered") return false;
  }
  return true;
}
function firstUnmasteredChapterId(){
  sortChapters();
  for (const ch of chapters) { if (!isMastered(ch.id)) return ch.id; }
  return chapters[0]?.id || null;
}
function nextUnmasteredAfter(chapterId){
  sortChapters();
  const idx = chapters.findIndex(c => c.id === chapterId);
  if (idx < 0) return firstUnmasteredChapterId();
  for (let i = idx + 1; i < chapters.length; i++) { if (!isMastered(chapters[i].id)) return chapters[i].id; }
  for (let i = 0; i < idx; i++) { if (!isMastered(chapters[i].id)) return chapters[i].id; }
  return chapterId;
}
function detectDemotions(){
  let demoted = [];
  chapters.forEach(ch => {
    const cur = chapterStatus(ch.id).key;
    const prev = previousChapterStatuses[ch.id];
    if (prev === "mastered" && cur !== "mastered") demoted.push(ch);
    previousChapterStatuses[ch.id] = cur;
  });
  if (demoted.length) toast(`📉 ${demoted.map(c => cleanChapterName(c.name)).join(", ")} lost Mastered`);
}

function weakPoolIds(){
  return Object.keys(weakStats)
    .filter(id => weakStats[id] && weakStats[id].misses > 0 && findVocab(id))
    .sort((a,b) => weakStats[b].misses - weakStats[a].misses);
}
function globalReviewPoolIds(){
  const ids = new Set(weakPoolIds());
  VOCAB.forEach(v => {
    const p = progress[v.id];
    if (!p) return;
    const b = clampBox(p.box);
    if (b >= 1 && b < MAX_BOX) ids.add(v.id);
  });
  return [...ids].sort((a, b) => {
    const ma = (weakStats[a]?.misses || 0), mb = (weakStats[b]?.misses || 0);
    if (ma !== mb) return mb - ma;
    const ba = clampBox(progress[a]?.box ?? 0), bb = clampBox(progress[b]?.box ?? 0);
    if (ba !== bb) return ba - bb;
    const sa = progress[a]?.last_seen ? new Date(progress[a].last_seen).getTime() : 0;
    const sb = progress[b]?.last_seen ? new Date(progress[b].last_seen).getTime() : 0;
    return sa - sb;
  });
}
async function recordMiss(id){
  weakStats[id] = weakStats[id] || { misses: 0 };
  weakStats[id].misses += 1;
  await saveWeakStats();
}

/* ================= TTS Audio ================= */
function playAudio(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

/* ================= sounds ================= */
let audioCtx = null;
function getAudioCtx(){
  if (!audioCtx) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    } catch(e) { return null; }
  }
  return audioCtx;
}
function playTone(freq, startAt, duration, volume, type){
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(()=>{});
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
  gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}
function playReactionSound(emoji){
  if (!settings.soundEnabled) return;
  try {
    if (emoji === "🔥") {
      playTone(660, 0, 0.12, 0.09, "triangle");
      playTone(880, 0.08, 0.18, 0.09, "triangle");
      playTone(1320, 0.16, 0.22, 0.08, "triangle");
    } else if (emoji === "👋") {
      playTone(880, 0, 0.14, 0.1, "sine");
      playTone(660, 0.12, 0.18, 0.1, "sine");
    } else if (emoji === "💪") {
      playTone(220, 0, 0.18, 0.11, "sine");
      playTone(330, 0.08, 0.22, 0.08, "sine");
    } else if (emoji === "😅") {
      playTone(1200, 0, 0.06, 0.07, "square");
      playTone(1100, 0.08, 0.06, 0.07, "square");
    } else if (emoji === "🤔") {
      playTone(440, 0, 0.14, 0.09, "sine");
      playTone(587, 0.14, 0.22, 0.09, "sine");
    } else if (emoji === "🎮") {
      playTone(523, 0, 0.1, 0.09, "triangle");
      playTone(659, 0.09, 0.1, 0.09, "triangle");
      playTone(784, 0.18, 0.15, 0.09, "triangle");
    } else {
      playTone(720, 0, 0.15, 0.08, "sine");
    }
  } catch(e) {}
}

/* ================= presence ================= */
let presenceUsers = [];
let presenceTimer = null;
let currentActivityChapterId = null;
let currentActivityKind = null;
let activityThrottleTimer = null;

function presenceStatus(lastActiveAt){
  if (!lastActiveAt) return "offline";
  const t = new Date(lastActiveAt).getTime();
  if (isNaN(t)) return "offline";
  const diff = Date.now() - t;
  if (diff < 2 * 60 * 1000) return "online";
  if (diff < 10 * 60 * 1000) return "recent";
  return "offline";
}
function describeActivity(u){
  if (!u || !u.last_active_at) return "offline";
  const st = presenceStatus(u.last_active_at);
  if (st === "offline") return "offline";
  if (u.current_activity && u.current_chapter_name) {
    const verb = u.current_activity === "browse" ? "reading"
      : u.current_activity === "learn" ? "learning"
      : u.current_activity === "quick" ? "practicing"
      : u.current_activity === "review" ? "reviewing"
      : "studying";
    return `${verb} ${cleanChapterName(u.current_chapter_name)}`;
  }
  if (u.current_activity) return u.current_activity;
  return st === "online" ? "online" : "recently active";
}

async function fetchPresence(){
  if (!authToken) return;
  try {
    const r = await api("/api/presence");
    if (r.ok && r.body && r.body.users) {
      presenceUsers = r.body.users;
      if (screen === "home") renderPresenceStrip();
    }
  } catch(e) {}
}

function serverChapterIdFromLocal(clientId){
  if (!clientId) return null;
  const ch = chapterById(clientId);
  return ch && ch.serverId ? ch.serverId : null;
}
async function pushActivity(chapterId, activity){
  if (!authToken) return;
  currentActivityChapterId = chapterId || null;
  currentActivityKind = activity || null;
  clearTimeout(activityThrottleTimer);
  activityThrottleTimer = setTimeout(async ()=>{
    try {
      const serverChId = serverChapterIdFromLocal(currentActivityChapterId);
      await api("/api/activity", {
        method: "POST",
        body: JSON.stringify({ chapter_id: serverChId, activity: currentActivityKind })
      });
      if (screen === "home") fetchPresence();
    } catch(e) {}
  }, 150);
}

function renderPresenceStrip(){
  const el = document.getElementById("presenceStrip");
  if (!el) return;
  const others = presenceUsers.filter(u => String(u.id) !== String(authUser.id));
  const me = presenceUsers.find(u => String(u.id) === String(authUser.id));
  const list = [...(me ? [me] : []), ...others];
  if (list.length === 0) { el.innerHTML = ""; return; }
  const bubbles = list.map(u => {
    const st = presenceStatus(u.last_active_at);
    const isMe = String(u.id) === String(authUser.id);
    const emoji = u.avatar_emoji || DEFAULT_EMOJI;
    const name = u.display_name || u.username;
    return `<button class="presence-bubble ${st} ${isMe ? "you" : ""}" data-uid="${u.id}">
      <span class="presence-avatar">${emoji}<span class="presence-dot"></span></span>
      <span class="presence-name">${isMe ? "you" : name}</span>
    </button>`;
  }).join("");
  el.innerHTML = `<div class="presence-label">Study buddies</div><div class="presence-strip">${bubbles}</div>`;
  el.querySelectorAll(".presence-bubble").forEach(btn => {
    btn.addEventListener("click", ()=>{
      const uid = btn.dataset.uid;
      const u = presenceUsers.find(x => String(x.id) === String(uid));
      if (u) openUserCard(u);
    });
  });
}

function openUserCard(u){
  const st = presenceStatus(u.last_active_at);
  const isMe = String(u.id) === String(authUser.id);
  const emoji = u.avatar_emoji || DEFAULT_EMOJI;
  const name = u.display_name || u.username;
  const activity = describeActivity(u);
  const overlay = document.createElement("div");
  overlay.className = "user-card-overlay";
  const actionsHtml = isMe
    ? ""
    : `<div class="reaction-row">
        ${["🔥","👋","💪","😅","🤔"].map(e => `<button class="reaction-btn" data-emoji="${e}">${e}</button>`).join("")}
      </div>
      <button class="small-btn" id="ucInvite" style="margin-bottom:8px;">🎮 Invite to quiz</button>`;
  overlay.innerHTML = `<div class="user-card">
    <div class="user-card-head">
      <div class="user-card-avatar ${st}">${emoji}</div>
      <div class="user-card-name">${name}</div>
      <div class="user-card-username">@${u.username}</div>
    </div>
    <div class="user-card-status ${st}">
      <span class="sts-dot"></span>${activity}
    </div>
    ${actionsHtml}
    <button class="user-card-close" id="ucClose">Close</button>
  </div>`;
  document.body.appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.addEventListener("click", (e)=>{ if (e.target === overlay) close(); });
  document.getElementById("ucClose").addEventListener("click", close);
  const inviteBtn = document.getElementById("ucInvite");
  if (inviteBtn) inviteBtn.addEventListener("click", ()=>{
    close();
    renderInvitePicker(u);
  });
  overlay.querySelectorAll(".reaction-btn").forEach(btn => {
    btn.addEventListener("click", async ()=>{
      const emoji = btn.dataset.emoji;
      btn.disabled = true;
      const r = await api("/api/reactions", {
        method: "POST",
        body: JSON.stringify({ to_user_id: Number(u.id), emoji })
      });
      if (r.ok) {
        toast(`Sent ${emoji} to ${name}`);
        close();
      } else {
        btn.disabled = false;
        toast(r.body && r.body.error ? r.body.error : "Failed to send");
      }
    });
  });
}

function renderInvitePicker(targetUser){
  screen = "invite-picker";
  showTopbar(true);
  const app = document.getElementById("app");
  
  const unlocked = chapters.filter(c => isUnlocked(c.id));
  let rows = unlocked.map(ch => {
    return `<div class="manage-row" style="cursor:pointer;" onclick="sendInvite(${targetUser.id}, ${ch.serverId}, '${cleanChapterName(ch.name)}')">
      <span class="rname" style="font-weight:700;">${cleanChapterName(ch.name)}</span>
      <div style="font-size:12px; color:var(--seal); font-weight:700;">Invite →</div>
    </div>`;
  }).join("");

  app.innerHTML = `<div class="backrow"><button id="backBtn">← cancel</button><span class="screen-title">Invite ${targetUser.display_name || targetUser.username}</span></div>
    <div class="panel" style="margin-bottom:12px;">
      <div style="font-size:13px; color:var(--muted); text-align:center; margin-bottom:16px;">
        Pick a chapter to study together. They'll get a notification to join.
      </div>
      ${rows || '<div class="empty"><p>No unlocked chapters yet.</p></div>'}
    </div>`;
  document.getElementById("backBtn").addEventListener("click", renderHome);
}

window.sendInvite = async function(toUserId, chapterServerId, chapterName) {
  const r = await api("/api/match/create", {
    method: "POST",
    body: JSON.stringify({ chapter_id: Number(chapterServerId) })
  });

  if (r.ok) {
    toast(`Invite sent to opponent!`);
    await api("/api/reactions", {
      method: "POST",
      body: JSON.stringify({ 
        to_user_id: Number(toUserId), 
        emoji: "🎮", 
        kind: "quiz_invite",
        payload: { match_id: r.body.match_id, chapter_id: Number(chapterServerId), chapter_name: chapterName }
      })
    });
    const localCh = chapters.find(c => String(c.serverId) === String(chapterServerId));
    startMatchRace(r.body.match_id, localCh.id);
  } else {
    toast("Failed to create match");
  }
};

async function checkUnseenReactions(){
  if (!authToken) return;
  try {
    const r = await api("/api/reactions/unseen");
    if (!r.ok || !r.body || !r.body.reactions) return;
    const list = r.body.reactions;
    if (list.length === 0) return;
    
    if (list.length > 15) list.splice(0, list.length - 15);

    const ids = [];
    for (const rx of list) {
      const kind = rx.kind || "reaction";
      playReactionSound(rx.emoji);
      const el = document.createElement("div");
      el.className = "reaction-toast";
      
      let text = `<b>${rx.from_display_name}</b> sent you a reaction`;
      if (kind === "quiz_invite" && rx.payload && rx.payload.chapter_name) {
        text = `<b>${rx.from_display_name}</b> invited you to study ${rx.payload.chapter_name}!`;
      }

      el.innerHTML = `<span class="rt-emoji">${rx.emoji}</span><span class="rt-text">${text}</span>`;
      document.body.appendChild(el);
      setTimeout(()=> el.remove(), 4000);
      
      notifications.push({
        id: rx.id, emoji: rx.emoji, kind, payload: rx.payload,
        from_user_id: rx.from_user_id, from_display_name: rx.from_display_name, created_at: rx.created_at,
      });
      ids.push(rx.id);
    }
    unreadNotifCount = notifications.length;
    updateNotifBadge();
    await api("/api/reactions/seen", { method: "POST", body: JSON.stringify({ ids }) });
  } catch(e) { console.error("Reaction error:", e); }
}

function updateNotifBadge(){
  const btn = document.getElementById("notifBtn");
  if (!btn) return;
  if (unreadNotifCount > 0) {
    btn.innerHTML = '🔔<span class="notif-badge"></span>';
  } else {
    btn.textContent = "🔔";
  }
}

async function renderNotificationsScreen(){
  screen = "notifications";
  showTopbar(true);
  const app = document.getElementById("app");
  unreadNotifCount = 0;
  updateNotifBadge();
  let listHtml = "";
  
  if (notifications.length === 0) {
    listHtml = `<div class="card"><div class="empty"><div class="big">🔔</div>
      <div style="font-size:15px;font-weight:700;">No notifications yet</div>
      <p>Reactions and study invites will show up here.</p></div></div>`;
  } else {
    listHtml = `<div class="panel" style="padding:0;">` + notifications.slice().reverse().map(n => {
      let title = `${n.from_display_name} sent ${n.emoji}`;
      if (n.kind === "quiz_invite" && n.payload) {
        title = `${n.from_display_name} wants to study ${n.payload.chapter_name}`;
      }
      
      let actionBtn = "";
      if (n.kind === "quiz_invite" && n.payload) {
        const ageMin = (Date.now() - new Date(n.created_at).getTime()) / 60000;
        if (ageMin < 15) {
          actionBtn = `<button class="small-btn" style="margin:8px 0 0 0; padding:6px 12px; font-size:11px;" onclick="acceptInvite('${n.id}', '${n.payload.match_id}', '${n.payload.chapter_id}')">Accept & Study ⚡</button>`;
        } else {
          actionBtn = `<span style="font-size:11px; color:var(--danger);">Expired</span>`;
        }
      }

      return `<div class="notif-row">
        <div class="nr-emoji">${n.emoji}</div>
        <div class="nr-body">
          <div class="nr-title">${title}</div>
          <div class="nr-sub">${actionBtn || "Tap their bubble on home to react back."}</div>
        </div>
      </div>`;
    }).join("") + `</div>`;
  }
  
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Notifications</span></div>
    ${listHtml}
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
}

window.acceptInvite = async function(notifId, matchId, serverChapterId) {
  const localCh = chapters.find(c => String(c.serverId) === String(serverChapterId));
  if (!localCh) return toast("Couldn't find that chapter.");
  
  const r = await api("/api/match/join/" + matchId, { method: "POST" });
  if (r.ok) {
    startMatchRace(matchId, localCh.id);
  } else {
    toast(r.body && r.body.error ? r.body.error : "Failed to join match");
  }
};

async function startMatchRace(matchId, localChapterId){
  screen = "match-lobby";
  showTopbar(true);
  currentMatchId = matchId;
  const app = document.getElementById("app");
  
  app.innerHTML = `<div class="card"><div class="empty"><div class="big">⏳</div>
    <div style="font-size:20px;font-weight:700;">Waiting for players...</div>
    <p>Get ready to race!</p>
  </div></div>`;
  
  clearInterval(matchPollTimer);
  matchPollTimer = setInterval(async () => {
    const r = await api("/api/match/status/" + matchId);
    if (!r.ok) return;
    const m = r.body.match;
    
    if (m.status === "playing") {
      clearInterval(matchPollTimer); // STOP POLLING!
      startLiveQuiz(matchId, localChapterId);
    }
    if (m.status === "finished") {
      clearInterval(matchPollTimer);
      toast("Match finished!");
      renderHome();
    }
  }, 2000);
}

async function startLiveQuiz(matchId, localChapterId) {
  screen = "match-quiz";
  
  const cards = chapterCards(localChapterId).map(v => v.id);
  currentRaceQueue = shuffleArr(cards).slice(0, 10);
  myRaceScore = 0;
  myRaceDone = false;

  // One final fetch to get current players list
  const r = await api("/api/match/status/" + matchId);
  if (r.ok) currentMatchPlayers = r.body.match.players;
  
  // Poll for live scores
  matchPollTimer = setInterval(async () => {
    if (screen !== "match-quiz" && screen !== "match-results") return;
    const res = await api("/api/match/status/" + matchId);
    if (!res.ok) return;
    
    currentMatchPlayers = res.body.match.players;
    
    if (screen === "match-quiz") {
      renderRaceQuestion(localChapterId);
    }
  }, 2000);

  renderRaceQuestion(localChapterId);
}

function renderRaceQuestion(localChapterId){
  const app = document.getElementById("app");
  
  // Check if everyone is done
  const allDone = currentMatchPlayers.every(p => p.done);
  if (allDone) {
    screen = "match-results";
    clearInterval(matchPollTimer);
    
    // Sort players by score
    const sorted = currentMatchPlayers.slice().sort((a,b) => b.score - a.score);
    
    let podium = sorted.map((p, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`;
      const isMe = p.id === authUser.id;
      return `<div class="manage-row" style="background:${isMe ? 'var(--accent-soft)' : 'transparent'}; border-radius:8px; padding:12px;">
        <span style="font-size:16px; width:32px; text-align:center;">${medal}</span>
        <span style="font-size:20px; margin:0 8px;">${p.emoji || DEFAULT_EMOJI}</span>
        <span class="rname" style="font-size:14px;">${p.name} ${isMe ? '(you)' : ''}</span>
        <div style="font-weight:700; color:var(--seal);">${p.score} pts</div>
      </div>`;
    }).join("");

    app.innerHTML = `<div class="card"><div class="empty" style="padding:20px;">
      <div class="big">🏁</div>
      <h2>Race Complete!</h2>
      <div style="margin-top:20px; width:100%;">${podium}</div>
      <button class="small-btn" style="margin-top:20px;" onclick="renderHome()">Back to Home</button>
    </div></div>`;
    return;
  }

  // If I am done but others aren't
  const me = currentMatchPlayers.find(p => p.id === authUser.id);
  if (me && me.done) {
    app.innerHTML = `<div class="card"><div class="empty"><div class="big">⏳</div>
      <h2>You finished!</h2>
      <p>Waiting for everyone else to finish...</p>
    </div></div>`;
    return;
  }

  // Render next card
  if (currentRaceQueue.length === 0) {
    myRaceDone = true;
    api("/api/match/score/" + currentMatchId, {
      method: "POST",
      body: JSON.stringify({ score: myRaceScore, done: true })
    });
    return;
  }

  const v = findVocab(currentRaceQueue[0]);
  
  // Build live scoreboard
  const scoreboard = currentMatchPlayers.map(p => {
    const isMe = p.id === authUser.id;
    return `<span style="margin-right:12px; font-weight:${isMe?'700':'400'}; color:${isMe?'var(--seal)':'var(--ink)'};">
      ${p.name}: ${p.score}
    </span>`;
  }).join("");

  app.innerHTML = `
    <div class="session-progress" style="flex-wrap:wrap;">
      ${scoreboard}
    </div>
    <div class="progressbar"><div style="width:${(10-currentRaceQueue.length)*10}%"></div></div>
    <div class="card tapzone" id="tapzone">
      <div class="chaptertag">⚡ LIVE RACE · ${cleanChapterName(chapterById(localChapterId).name)}</div>
      <div class="kanji">${v.k}</div>
      <div class="reveal-hint" id="hint">tap to reveal</div>
    </div>
    <div id="gradeArea"></div>
  `;
  
  document.getElementById("tapzone").addEventListener("click", ()=>{
    document.getElementById("hint").outerHTML = `<div style="margin-top:16px;">
      <div class="reading">${v.r}</div>
      <div class="meaning">${v.m}</div>
    </div>`;
    document.getElementById("gradeArea").innerHTML = `<div class="grade-row">
      <button class="g-wrong" id="markWrong">✗ Wrong</button>
      <button class="g-right" id="markRight">✓ Correct</button>
    </div>`;
    document.getElementById("markRight").addEventListener("click", ()=> raceAnswer(true));
    document.getElementById("markWrong").addEventListener("click", ()=> raceAnswer(false));
  });
}

async function raceAnswer(correct){
  currentRaceQueue.shift(); 
  if (correct) myRaceScore++;
  
  await api("/api/match/score/" + currentMatchId, {
    method: "POST",
    body: JSON.stringify({ 
      score: myRaceScore, 
      done: currentRaceQueue.length === 0 
    })
  });
  
  renderRaceQuestion(quickChapterId); // Pass the local chapter ID stored in a global variable or scope
}

function startPresenceLoop(){
  clearInterval(presenceTimer);
  fetchPresence();
  checkUnseenReactions();
  presenceTimer = setInterval(()=>{
    if (authToken) {
      fetchPresence();
      checkUnseenReactions();
    }
  }, 5000);
}
function stopPresenceLoop(){
  clearInterval(presenceTimer);
  presenceTimer = null;
}

let toastTimer = null;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove("show"), 2600);
}
function showDialog(title, message, meta){
  const el = document.createElement("div");
  el.className = "dialog-overlay";
  el.innerHTML = `<div class="dialog">
    <h3>${title}</h3>
    <p>${message}</p>
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    <button id="dlgOk">OK</button>
  </div>`;
  document.body.appendChild(el);
  const close = ()=> el.remove();
  el.querySelector("#dlgOk").addEventListener("click", close);
  el.addEventListener("click", (e)=>{ if (e.target === el) close(); });
}

function findVocab(id){ return VOCAB.find(v=>v.id===id); }
function chapterCards(chapterId){ return VOCAB.filter(v=>v.chapterId===chapterId); }
function chapterById(id){ return chapters.find(c=>c.id===id); }

function isSameDay(aIso, bIso){
  if (!aIso || !bIso) return false;
  return aIso.slice(0,10) === bIso.slice(0,10);
}
function applyAnswer(cardId, correct){
  const p = progress[cardId] || { box:0, due:null, misses:0, last_seen:null, dirty:0, priority:0 };
  const now = new Date().toISOString();
  const prevBox = clampBox(p.box);
  if (correct) {
    p.box = Math.min(MAX_BOX, prevBox + 1);
    p.priority = 0;
  } else {
    p.box = prevBox === 0 ? 0 : 1;
    p.misses = (p.misses || 0) + 1;
    p.priority = 1;
  }
  p.last_seen = now;
  p.dirty = 1;
  progress[cardId] = p;
}

function buildQuickQueue(chapterId){
  const currentIds = chapterCards(chapterId).map(v => v.id);
  const queue = currentIds.slice();
  if (settings.interleaving) {
    const extras = Math.round(currentIds.length * INTERLEAVE_RATIO);
    if (extras > 0) {
      const candidates = VOCAB
        .filter(v => v.chapterId !== chapterId)
        .filter(v => {
          const b = progress[v.id]?.box ?? 0;
          return b > 0 && b < MAX_BOX;
        })
        .map(v => v.id);
      queue.push(...shuffleArr(candidates).slice(0, extras));
    }
  }
  const priorityIds = queue.filter(id => (progress[id]?.priority || 0) > 0);
  const rest = queue.filter(id => !(progress[id]?.priority || 0));
  return [...shuffleArr(priorityIds), ...shuffleArr(rest)];
}

function buildMCChoices(correctCard){
  const correctReading = correctCard.r;
  const pool = chapterCards(correctCard.chapterId).filter(v => v.id !== correctCard.id).map(v => v.r);
  const seen = new Set([correctReading]);
  const unique = [];
  pool.forEach(r => { if (!seen.has(r)) { seen.add(r); unique.push(r); } });
  const targetLen = correctReading.length;
  unique.sort((a, b) => Math.abs(a.length - targetLen) - Math.abs(b.length - targetLen));
  let distractors = unique.slice(0, 3);
  if (distractors.length < 3) {
    const allReadings = VOCAB.map(v => v.r).filter(r => r !== correctReading && !distractors.includes(r));
    distractors.push(...shuffleArr(allReadings).slice(0, 3 - distractors.length));
  }
  const choices = [
    { text: correctReading, correct: true },
    ...distractors.map(r => ({ text: r, correct: false })),
  ];
  return shuffleArr(choices);
}

/* ================= MODE CHOOSER ================= */
function renderModeChooser(){
  screen = "modechooser";
  showTopbar(false);
  const app = document.getElementById("app");
  app.innerHTML = `<div class="mode-choose-wrap">
    <div class="mode-choose-title">How do you want to study?</div>
    <div class="mode-choose-sub">You can change this later in Settings. Pick the one that fits how you think you'll use the app.</div>
    <div class="mode-options">
      <div class="mode-option" data-mode="guided">
        <div class="mo-icon">📖</div>
        <div class="mo-text">
          <div class="mo-title">Guided</div>
          <div class="mo-desc">One chapter at a time. The next unlocks as you progress. Reminders when earlier chapters still have cards to advance.</div>
          <div class="mo-recommend">Recommended for solo study</div>
        </div>
      </div>
      <div class="mode-option" data-mode="free">
        <div class="mo-icon">🆓</div>
        <div class="mo-text">
          <div class="mo-title">Free</div>
          <div class="mo-desc">All chapters open. Study whatever you want, in any order. No unlock gates, no reminders.</div>
          <div class="mo-recommend">Recommended if you're reviewing a specific lesson</div>
        </div>
      </div>
    </div>
  </div>`;
  document.querySelectorAll("[data-mode]").forEach(el=>{
    el.addEventListener("click", async ()=>{
      settings.studyMode = el.dataset.mode;
      setChosenMode();
      await saveSettings();
      syncNow();
      proceedAfterModeChooser();
    });
  });
}

function proceedAfterModeChooser(){
  if (!hasOnboarded()) {
    onboardSlide = 0;
    renderOnboarding();
  } else if (!authUser.display_name && !authUser.avatar_emoji) {
    renderProfile({ firstTime: true });
  } else {
    renderHome();
  }
}

/* ================= ONBOARDING ================= */
let onboardSlide = 0;
let onboardAutoTimer = null;

const ONBOARD_SLIDES = [
  {
    icon: "📚",
    title: "Welcome to Deadline",
    body: `<p>This is a shared study app for the <b>${EXAM_NAME}</b> exam on <b>${FIXED_EXAM_DATE}</b>.</p>
    <p>You and everyone else study the same chapters. Your progress is yours alone.</p>`
  },
  {
    icon: "🗂️",
    title: "Chapters unlock as you go",
    body: `<p>Every chapter has 40-50 verbs. Study them one at a time.</p>
    <p>Once a chapter is Solid, the next one unlocks. Once it's Mastered, it moves to your Collection.</p>`
  },
  {
    icon: "⚡",
    title: "Quick Sessions are the core",
    body: `<p>Get a card <b>right</b> → it climbs a level. Get it <b>wrong</b> → it drops back and reappears later.</p>
    <p>Cards need 3 correct recalls to be Mastered.</p>`
  },
  {
    icon: "🎯",
    title: "Every day counts",
    body: `<p>There's a <b>daily goal</b> (default 20 cards). Hit it to keep your streak alive.</p>
    <p>Consistency beats cramming. The exam is a marathon, not a sprint.</p>`
  }
];

function renderOnboarding(){
  screen = "onboarding";
  showTopbar(false);
  onboardSlide = 0;
  drawOnboarding();
  startOnboardAutoAdvance();
}

function drawOnboarding(){
  const app = document.getElementById("app");
  const total = ONBOARD_SLIDES.length;
  const slidesHtml = ONBOARD_SLIDES.map((s, i) => `
    <div class="onboard-slide ${i === onboardSlide ? "active" : ""}" data-slide="${i}">
      <div class="onboard-card">
        <div class="onboard-icon">${s.icon}</div>
        <div class="onboard-title">${s.title}</div>
        <div class="onboard-body">${s.body}</div>
      </div>
    </div>
  `).join("");
  const dotsHtml = ONBOARD_SLIDES.map((_, i) =>
    `<div class="onboard-dot ${i === onboardSlide ? "active" : ""}" data-dot="${i}"></div>`
  ).join("");
  const isLast = onboardSlide === total - 1;
  app.innerHTML = `<div class="onboard-wrap">
    <div class="onboard-slides" id="onboardSlides" style="transform:translateX(-${onboardSlide*100}%)">
      ${slidesHtml}
    </div>
    <div class="onboard-dots" id="onboardDots">${dotsHtml}</div>
    <div class="onboard-actions">
      <button class="onboard-skip" id="onboardSkip">Skip</button>
      <button class="onboard-next" id="onboardNext">${isLast ? "Start studying →" : "Next →"}</button>
    </div>
  </div>`;
  wireOnboardingInteractions();
}

function wireOnboardingInteractions(){
  const track = document.getElementById("onboardSlides");
  const dots = document.querySelectorAll("[data-dot]");

  document.getElementById("onboardSkip").addEventListener("click", ()=>{
    stopOnboardAutoAdvance();
    setOnboarded();
    proceedAfterOnboarding();
  });

  document.getElementById("onboardNext").addEventListener("click", ()=>{
    stopOnboardAutoAdvance();
    if (onboardSlide === ONBOARD_SLIDES.length - 1) {
      setOnboarded();
      proceedAfterOnboarding();
    } else {
      onboardSlide++;
      drawOnboarding();
    }
  });

  dots.forEach(d => {
    d.addEventListener("click", ()=>{
      stopOnboardAutoAdvance();
      onboardSlide = Number(d.dataset.dot);
      drawOnboarding();
    });
  });

  if (track) {
    let startX = null;
    let startIdx = onboardSlide;
    let dragging = false;
    track.addEventListener("touchstart", e=>{
      startX = e.touches[0].clientX;
      startIdx = onboardSlide;
      dragging = true;
      track.style.transition = "none";
      stopOnboardAutoAdvance();
    }, {passive:true});
    track.addEventListener("touchmove", e=>{
      if (!dragging || startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const pct = (dx / window.innerWidth) * 100;
      track.style.transform = `translateX(calc(-${startIdx*100}% + ${pct}%))`;
    }, {passive:true});
    track.addEventListener("touchend", e=>{
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const threshold = 60;
      let newIdx = onboardSlide;
      if (dx < -threshold && onboardSlide < ONBOARD_SLIDES.length - 1) newIdx = onboardSlide + 1;
      else if (dx > threshold && onboardSlide > 0) newIdx = onboardSlide - 1;
      onboardSlide = newIdx;
      drawOnboarding();
      startOnboardAutoAdvance();
    });
  }
}

function startOnboardAutoAdvance(){
  stopOnboardAutoAdvance();
  onboardAutoTimer = setInterval(()=>{
    if (screen !== "onboarding") { clearInterval(onboardAutoTimer); return; }
    if (onboardSlide >= ONBOARD_SLIDES.length - 1) {
      stopOnboardAutoAdvance();
      return;
    }
    onboardSlide++;
    drawOnboarding();
  }, 5000);
}
function stopOnboardAutoAdvance(){
  if (onboardAutoTimer) { clearInterval(onboardAutoTimer); onboardAutoTimer = null; }
}

function proceedAfterOnboarding(){
  if (!authUser.display_name && !authUser.avatar_emoji) {
    renderProfile({ firstTime: true });
  } else {
    renderHome();
  }
}

/* ================= HOW IT WORKS ================= */
function renderHowItWorks(){
  screen = "howitworks";
  showTopbar(true);
  const app = document.getElementById("app");
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">How it works</span></div>
    <div class="panel hiw">
      <h2>What is this app?</h2>
      <p>Deadline is a spaced-repetition study tool for the <b>${EXAM_NAME}</b> exam on <b>${FIXED_EXAM_DATE}</b>. It drills the verb kanji from your textbook, chapter by chapter.</p>
      <p>Chapters are <b>shared</b> — everyone studies the same cards. But your <b>progress is private</b>. What you get right, what you get wrong, is yours alone.</p>

      <h2>How a session works</h2>
      <p>Tap <b>⚡ Quick Session</b> on the current chapter. You'll pick an input mode:</p>
      <ul>
        <li><b>Flashcard</b> — see the kanji, tap to reveal, grade yourself Correct or Wrong.</li>
        <li><b>Multiple Choice</b> — see the kanji, pick the right reading from 4 options.</li>
      </ul>

      <h2>How cards level up</h2>
      <p>Every card has a <b>level</b> from 0 to 3. Higher = more solid.</p>
      <ul>
        <li>Get a card <b>right</b> → level +1 (max 3).</li>
        <li>Get a card <b>wrong</b> → drops back to level 1 (or stays at 0 if new).</li>
        <li>Three correct recalls take a card to level 3 (Mastered).</li>
      </ul>

      <h2>Chapter statuses</h2>
      <ul>
        <li><b>Not started</b> — you haven't studied this chapter yet.</li>
        <li><b>Practicing</b> — you've started, but fewer than 70% of cards are at level 2+.</li>
        <li><b>Solid</b> — 70% or more of cards are at level 2+. The next chapter unlocks.</li>
        <li><b>Mastered</b> — 90% or more are at level 3. The chapter moves to your Collection.</li>
      </ul>

      <div class="highlight">💡 <b>Tip:</b> Consistency beats cramming. Twenty minutes a day for 6 months will beat ten hours the week before the exam. Every time.</div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", renderHome);
}

/* ================= LOGIN ================= */
function renderLogin(mode){
  mode = mode || "login";
  screen = "login";
  showTopbar(false);
  const app = document.getElementById("app");
  const lastUsername = getLastUsername();
  const welcomeBack = (mode === "login" && lastUsername)
    ? `<div class="welcome-back">
        <span class="avatar-bubble lg">${DEFAULT_EMOJI}</span>
        <div class="wb-text">Welcome back, <b>${lastUsername}</b></div>
      </div>`
    : "";
  const explainer = (mode === "register")
    ? `<div class="login-explainer">
        <b>What you're signing up for</b><br>
        A shared ${EXAM_NAME} study tool. Chapters are shared with everyone; your progress stays private. No email needed.
      </div>`
    : "";
  app.innerHTML = `<div class="login-wrap">
    <div class="login-brand">
      <div class="brand-mark">🎯</div>
      <div class="brand-name">Deadline<span class="accent">.</span></div>
      <div class="brand-sub">JLPT drill</div>
      <div class="brand-ornament">· 日本語 ·</div>
    </div>
    <div class="login-card">
      ${welcomeBack}
      ${explainer}
      <label>Username</label>
      <input id="usernameInput" autocomplete="username" autocapitalize="off" value="${mode === "login" ? lastUsername.replace(/"/g,'&quot;') : ""}">
      <label>Password</label>
      <div class="pw-wrap">
        <input id="passwordInput" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}">
        <button type="button" class="pw-toggle" id="pwToggle" title="Show password">👁</button>
      </div>
      <div class="err" id="errMsg"></div>
      <button class="submit" id="submitBtn">${mode === "login" ? "Log in" : "Create account"}</button>
      <div class="switch">
        ${mode === "login" ? `No account? <a id="switchLink">Register</a>` : `Have an account? <a id="switchLink">Log in</a>`}
      </div>
    </div>
  </div>`;
  document.getElementById("switchLink").addEventListener("click", ()=> renderLogin(mode === "login" ? "register" : "login"));
  document.getElementById("pwToggle").addEventListener("click", ()=>{
    const input = document.getElementById("passwordInput");
    const btn = document.getElementById("pwToggle");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.classList.toggle("on", !showing);
  });
  const submit = async ()=>{
    const username = document.getElementById("usernameInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    const errEl = document.getElementById("errMsg");
    errEl.textContent = "";
    if (!username || !password) { errEl.textContent = "Enter username and password"; return; }
    const btn = document.getElementById("submitBtn");
    btn.disabled = true;
    const origLabel = btn.textContent;
    btn.textContent = mode === "login" ? "Signing in…" : "Creating…";
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const r = await api(path, { method: "POST", body: JSON.stringify({ username, password }) });
      if (!r.ok) {
        btn.disabled = false; btn.textContent = origLabel;
        errEl.textContent = r.body && r.body.error ? r.body.error : "Something went wrong";
        return;
      }
      setLastUsername(r.body.user.username);
      saveAuth(r.body.token, r.body.user);
      isNewAccount = (mode === "register");
      await afterLogin();
    } catch(e) {
      btn.disabled = false; btn.textContent = origLabel;
      errEl.textContent = "Couldn't reach the server. Is it running?";
    }
  };
  document.getElementById("submitBtn").addEventListener("click", submit);
  document.getElementById("passwordInput").addEventListener("keydown", (e)=>{ if (e.key === "Enter") submit(); });
  document.getElementById("usernameInput").addEventListener("keydown", (e)=>{ if (e.key === "Enter") document.getElementById("passwordInput").focus(); });
  if (mode === "login" && lastUsername) setTimeout(()=> document.getElementById("passwordInput").focus(), 50);
  else setTimeout(()=> document.getElementById("usernameInput").focus(), 50);
}

async function afterLogin(){
  showTopbar(true);
  const lastUserId = getLastUserId();
  const currentUserId = String(authUser.id);
  if (lastUserId && lastUserId !== currentUserId) {
    await wipeUserLocalCache();
  }
  setLastUserId(currentUserId);

  try {
    const scopedOnboard = userScopedKey(ONBOARDED_KEY);
    const scopedMode = userScopedKey(K_MODE_CHOSEN);
    if (!localStorage.getItem(scopedOnboard) && localStorage.getItem(ONBOARDED_KEY) === "1") {
      localStorage.setItem(scopedOnboard, "1");
    }
    if (!localStorage.getItem(scopedMode) && localStorage.getItem(K_MODE_CHOSEN) === "1") {
      localStorage.setItem(scopedMode, "1");
    }
  } catch(e) {}

  await loadLocal();
  updateStreakBadge();
  updateUserLine();
  previousChapterStatuses = {};
  chapters.forEach(ch => { previousChapterStatuses[ch.id] = chapterStatus(ch.id).key; });
  
  await syncNow({ afterSync: () => {
    previousChapterStatuses = {};
    chapters.forEach(ch => { previousChapterStatuses[ch.id] = chapterStatus(ch.id).key; });
    decidePostLoginScreen();
  } });

  if (screen !== "home" && screen !== "profile" && screen !== "modechooser" && screen !== "onboarding") decidePostLoginScreen();
  setInterval(()=> {
    if (authToken && !syncing) {
      syncNow({ afterSync: () => { if (screen === "home") renderHome(); } });
    }
  }, 120000);
  setInterval(()=> updateUserLine(), 30000);
  startPresenceLoop();
}

function decidePostLoginScreen(){
  notifications = [];
  unreadNotifCount = 0;
  updateNotifBadge();
  if (isNewAccount && !hasChosenMode()) {
    isNewAccount = false;
    renderModeChooser();
    return;
  }
  if (!hasOnboarded()) {
    onboardSlide = 0;
    renderOnboarding();
    return;
  }
  if (!authUser.display_name && !authUser.avatar_emoji) {
    renderProfile({ firstTime: true });
    return;
  }
  renderHome();
}

/* ================= PROFILE ================= */
let profileDraft = null;
function renderProfile(opts = {}){
  screen = "profile";
  showTopbar(true);
  const firstTime = !!opts.firstTime;
  profileDraft = {
    display_name: authUser.display_name || authUser.username,
    avatar_emoji: authUser.avatar_emoji || DEFAULT_EMOJI,
  };
  drawProfile(firstTime);
}
function drawProfile(firstTime){
  const app = document.getElementById("app");
  const emojiGrid = EMOJI_PALETTE.map(e =>
    `<button class="emoji-pick ${e === profileDraft.avatar_emoji ? "selected" : ""}" data-emoji="${e}">${e}</button>`
  ).join("");
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← ${firstTime ? "skip" : "home"}</button><span class="screen-title">${firstTime ? "Set up your profile" : "Profile"}</span></div>
    <div class="panel">
      ${firstTime ? `<div style="font-size:13px;color:#4a4232;margin-bottom:14px;line-height:1.6;">Pick an emoji and set a display name so other people can tell it's you.</div>` : ""}
      <div class="profile-head">
        <div class="avatar-bubble xl" id="draftEmoji">${profileDraft.avatar_emoji}</div>
        <div style="font-size:12px;color:var(--muted);">Logged in as <b>${authUser.username}</b>${authUser.is_admin ? '<span class="admin-badge">admin</span>' : ""}</div>
      </div>
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:5px;">Pick an emoji</label>
      <div class="emoji-grid" id="emojiGrid">${emojiGrid}</div>
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:5px;margin-top:6px;">Display name</label>
      <input id="displayNameInput" type="text" maxlength="50" class="text-input" value="${(profileDraft.display_name || "").replace(/"/g,'&quot;')}">
      <button class="small-btn" id="saveProfileBtn">Save profile</button>
    </div>
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  document.querySelectorAll(".emoji-pick").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      profileDraft.avatar_emoji = btn.dataset.emoji;
      document.getElementById("draftEmoji").textContent = profileDraft.avatar_emoji;
      document.querySelectorAll(".emoji-pick").forEach(b => b.classList.toggle("selected", b.dataset.emoji === profileDraft.avatar_emoji));
    });
  });
  document.getElementById("saveProfileBtn").addEventListener("click", async ()=>{
    const dn = document.getElementById("displayNameInput").value.trim();
    profileDraft.display_name = dn || authUser.username;
    const r = await api("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ display_name: profileDraft.display_name, avatar_emoji: profileDraft.avatar_emoji })
    });
    if (!r.ok) { toast(r.body && r.body.error ? r.body.error : "Save failed"); return; }
    updateCachedUser(r.body.user);
    updateUserLine();
    toast("Profile saved");
    renderHome();
  });
}

/* ================= CHANGE PASSWORD ================= */
function renderChangePassword(){
  screen = "changepw";
  showTopbar(true);
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Change password</span></div>
    <div class="panel">
      <div class="setting-row">
        <label>Current password</label>
        <div class="pw-wrap">
          <input id="curPw" type="password" autocomplete="current-password" class="text-input">
          <button type="button" class="pw-toggle" data-target="curPw">👁</button>
        </div>
      </div>
      <div class="setting-row">
        <label>New password</label>
        <div class="pw-wrap">
          <input id="newPw" type="password" autocomplete="new-password" class="text-input">
          <button type="button" class="pw-toggle" data-target="newPw">👁</button>
        </div>
        <div class="hint">At least 6 characters.</div>
      </div>
      <div class="setting-row">
        <label>Confirm new password</label>
        <div class="pw-wrap">
          <input id="confPw" type="password" autocomplete="new-password" class="text-input">
          <button type="button" class="pw-toggle" data-target="confPw">👁</button>
        </div>
      </div>
      <div class="err" id="cpErr" style="color:var(--seal);font-size:12px;min-height:16px;"></div>
      <button class="small-btn" id="savePwBtn">Change password</button>
    </div>
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  document.querySelectorAll(".pw-toggle[data-target]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const input = document.getElementById(btn.dataset.target);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.classList.toggle("on", !showing);
    });
  });
  document.getElementById("savePwBtn").addEventListener("click", async ()=>{
    const cur = document.getElementById("curPw").value;
    const nw = document.getElementById("newPw").value;
    const cf = document.getElementById("confPw").value;
    const err = document.getElementById("cpErr");
    err.textContent = "";
    if (!cur || !nw || !cf) { err.textContent = "Fill in all three fields"; return; }
    if (nw !== cf) { err.textContent = "New passwords don't match"; return; }
    if (nw.length < 6) { err.textContent = "New password must be at least 6 characters"; return; }
    if (nw === cur) { err.textContent = "New password must be different"; return; }
    const btn = document.getElementById("savePwBtn");
    btn.disabled = true; btn.textContent = "Changing…";
    const r = await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: cur, new_password: nw })
    });
    btn.disabled = false; btn.textContent = "Change password";
    if (!r.ok) { err.textContent = r.body && r.body.error ? r.body.error : "Couldn't change password"; return; }
    toast("Password changed");
    renderHome();
  });
}

/* ================= MENU ================= */
function renderMenu(){
  screen = "menu";
  showTopbar(true);
  const app = document.getElementById("app");
  const inGuided = settings.studyMode === "guided";
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Menu</span></div>
    <div class="panel" style="padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">
      ${avatarHtml("lg")}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;">${userDisplayName()}${authUser.is_admin ? '<span class="admin-badge">admin</span>' : ""}</div>
        <div style="font-size:11px;color:var(--muted);">@${authUser.username} · ${inGuided ? "Guided mode" : "Free mode"}</div>
      </div>
    </div>
    <div class="panel" style="padding:6px 0;">
      <div class="menu-item" id="m-how" style="padding:14px 16px;">💡 How it works</div>
      <div class="menu-item" id="m-profile" style="padding:14px 16px;">👤 Profile</div>
      <div class="menu-item" id="m-changepw" style="padding:14px 16px;">🔑 Change password</div>
      <div class="menu-item" id="m-notifs" style="padding:14px 16px;">🔔 Notifications</div>
      <div class="menu-item" id="m-collection" style="padding:14px 16px;">🏆 Mastered chapters</div>
      <div class="menu-item" id="m-leaderboard" style="padding:14px 16px;">🏅 Leaderboard</div>
      <div class="menu-item" id="m-invite" style="padding:14px 16px;">🔗 Share App with Classmates</div>
      ${authUser.is_admin ? `
      <div class="menu-item" id="m-import" style="padding:14px 16px;">📥 Import chapter</div>
      <div class="menu-item" id="m-manage" style="padding:14px 16px;">📂 Manage chapters</div>
      ` : ""}
      <div class="menu-item" id="m-stats" style="padding:14px 16px;">📊 Stats &amp; streak</div>
      <div class="menu-item" id="m-settings" style="padding:14px 16px;">⚙️ Settings</div>
      <div class="menu-item" id="m-sync" style="padding:14px 16px;">🔄 Sync now</div>
      <div class="menu-item danger" id="m-logout" style="padding:14px 16px;">🚪 Log out</div>
    </div>
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  document.getElementById("m-how").addEventListener("click", renderHowItWorks);
  document.getElementById("m-profile").addEventListener("click", ()=> renderProfile());
  document.getElementById("m-changepw").addEventListener("click", renderChangePassword);
  document.getElementById("m-notifs").addEventListener("click", renderNotificationsScreen);
  document.getElementById("m-collection").addEventListener("click", renderCollection);
  document.getElementById("m-leaderboard").addEventListener("click", renderLeaderboard);
  
  document.getElementById("m-invite").addEventListener("click", () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url).then(() => {
      toast("Link copied! Send it to your classmates.");
    }).catch(() => {
      showDialog("Share the app", "Copy this link and send it to your classmates:<br><br><b>" + url + "</b>");
    });
  });

  const importBtn = document.getElementById("m-import");
  if (importBtn) importBtn.addEventListener("click", ()=> document.getElementById("importFile").click());
  const manageBtn = document.getElementById("m-manage");
  if (manageBtn) manageBtn.addEventListener("click", renderManage);
  document.getElementById("m-stats").addEventListener("click", renderStatsScreen);
  document.getElementById("m-settings").addEventListener("click", renderSettings);
  document.getElementById("m-sync").addEventListener("click", ()=>{ toast("Syncing…"); syncNow({ afterSync: ()=> toast("Sync complete") }); });
  document.getElementById("m-logout").addEventListener("click", ()=>{
    if (!confirm("Log out? Your local cache stays, but you'll need to log in again.")) return;
    clearAuth();
    renderLogin();
  });
}

/* ================= LEADERBOARD ================= */
async function renderLeaderboard(){
  screen = "leaderboard";
  showTopbar(true);
  const app = document.getElementById("app");
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Leaderboard</span></div>
    <div class="panel"><div class="empty"><p>Loading...</p></div></div>`;
  
  document.getElementById("backBtn").addEventListener("click", renderHome);

  const r = await api("/api/leaderboard");
  if (!r.ok) {
    app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Leaderboard</span></div>
      <div class="card"><div class="empty"><p>Could not load leaderboard.</p></div></div>`;
    return;
  }

  const list = r.body.leaderboard || [];
  let rows = list.map((u, i) => {
    const isMe = String(u.id) === String(authUser.id);
    const emoji = u.avatar_emoji || DEFAULT_EMOJI;
    const name = u.display_name || u.username;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`;
    return `<div class="manage-row" style="background:${isMe ? 'var(--accent-soft)' : 'transparent'}; border-radius:8px; padding:12px 10px;">
      <span style="font-size:16px; width:32px; text-align:center;">${medal}</span>
      <span style="font-size:20px; margin:0 8px;">${emoji}</span>
      <span class="rname" style="font-size:14px;">${name} ${isMe ? '(you)' : ''}</span>
      <div style="font-weight:700; color:var(--seal);">${u.today_count} today</div>
    </div>`;
  }).join("");

  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Leaderboard</span></div>
    <div class="panel" style="margin-bottom:12px;">
      <div style="font-size:13px; color:var(--muted); text-align:center; margin-bottom:16px;">
        Ranked by cards studied today. Study more to climb!
      </div>
      ${rows || '<div class="empty"><p>No one has studied today yet.</p></div>'}
    </div>`;
  document.getElementById("backBtn").addEventListener("click", renderHome);
}

/* ================= HOME ================= */

function daysUntil(dateStr){
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}
let focusSlides = [], focusSlideIdx = 0;
function buildFocusSlides(){
  const slides = [];
  if (FIXED_EXAM_DATE) {
    const days = daysUntil(FIXED_EXAM_DATE);
    const d = new Date(FIXED_EXAM_DATE + "T00:00:00");
    const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
    slides.push(`<div class="focus-label">📅 Exam countdown</div>
      <div class="focus-name">${days > 0 ? days + " day" + (days===1?"":"s") + " until " + EXAM_NAME : days === 0 ? "It's today!" : "Exam day has passed"}</div>
      <div class="focus-sub">${FIXED_EXAM_DATE} (${weekday})</div>
      <div class="focus-hint">${days > 60 ? "Plenty of time. Steady pace wins." : days > 30 ? "Getting close. Stay consistent." : days > 0 ? "Final stretch. Review what you've got." : ""}</div>`);
  }
  const total = FIXED_TOTAL_CHAPTERS;
  const mastered = chapters.filter(ch => isMastered(ch.id)).length;
  slides.push(`<div class="focus-label">📖 Progress</div>
    <div class="focus-name">${mastered} / ${total} chapters mastered</div>
    <div class="focus-sub">${Math.round(100*mastered/total)}% of your syllabus</div>
    <div class="focus-hint">A chapter is mastered when 90% of its cards have reached level 3.</div>`);
  return slides;
}
function renderFocusSlider(){
  focusSlides = buildFocusSlides();
  if (!focusSlides.length) return "";
  if (focusSlideIdx >= focusSlides.length) focusSlideIdx = 0;
  const track = focusSlides.map(s=>`<div class="focus-slide"><div class="focus-card">${s}</div></div>`).join("");
  const dots = focusSlides.length > 1
    ? `<div class="focus-dots">${focusSlides.map((_,i)=>`<div class="focus-dot ${i===focusSlideIdx?"active":""}" data-dot="${i}"></div>`).join("")}</div>`
    : "";
  return `<div class="focus-slider" id="focusSlider">
    <div class="focus-track" id="focusTrack" style="transform:translateX(-${focusSlideIdx*100}%)">${track}</div>
    ${dots}
  </div>`;
}
function updateFocusSliderPosition(){
  const track = document.getElementById("focusTrack");
  if (track) track.style.transform = `translateX(-${focusSlideIdx*100}%)`;
  document.querySelectorAll("#focusSlider [data-dot]").forEach((d,i)=> d.classList.toggle("active", i===focusSlideIdx));
}
let focusAutoTimer = null;
function startFocusAutoplay(){
  clearInterval(focusAutoTimer);
  if (focusSlides.length > 1) {
    focusAutoTimer = setInterval(()=>{
      if (screen !== "home") { clearInterval(focusAutoTimer); return; }
      focusSlideIdx = (focusSlideIdx + 1) % focusSlides.length;
      updateFocusSliderPosition();
    }, 8000);
  }
}
function wireFocusSlider(){
  document.querySelectorAll("#focusSlider [data-dot]").forEach(d=>{
    d.addEventListener("click", ()=>{ focusSlideIdx = Number(d.dataset.dot); updateFocusSliderPosition(); startFocusAutoplay(); });
  });
  const track = document.getElementById("focusTrack");
  if (track) {
    let startX = null;
    track.addEventListener("touchstart", e=>{ startX = e.touches[0].clientX; }, {passive:true});
    track.addEventListener("touchend", e=>{
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) {
        if (dx < 0 && focusSlideIdx < focusSlides.length-1) focusSlideIdx++;
        else if (dx > 0 && focusSlideIdx > 0) focusSlideIdx--;
        updateFocusSliderPosition();
        startFocusAutoplay();
      }
      startX = null;
    });
  }
  startFocusAutoplay();
}

function renderDailyGoal(){
  const { done, goal } = dailyProgress();
  const pct = Math.min(1, done / goal);
  const r = 17;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const doneText = done >= goal ? "✓" : `${done}`;
  return `<div class="goal-strip">
    <div class="goal-ring">
      <svg width="42" height="42">
        <circle class="gr-bg" cx="21" cy="21" r="${r}" stroke-width="4" fill="none"></circle>
        <circle class="gr-fill" cx="21" cy="21" r="${r}" stroke-width="4" fill="none"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"></circle>
      </svg>
      <div class="gr-num">${doneText}</div>
    </div>
    <div class="goal-text">
      <div class="gt-title">Daily goal</div>
      <div class="gt-sub">${done} / ${goal} cards today${done >= goal ? " · done!" : ""}</div>
      <div class="gt-hint">Study ${goal} cards today to keep your streak alive.</div>
    </div>
  </div>`;
}

function renderCurrentChapterCard(chapterId){
  const ch = chapterById(chapterId);
  if (!ch) return "";
  const st = chapterStatus(ch.id);
  const m = chapterMastery(ch.id);
  const pctMastered = m.total ? Math.round(100 * m.ratio3) : 0;
  const displayName = cleanChapterName(ch.name);
  return `<div class="current-card" data-ch="${ch.id}">
    <div class="cc-toprow">
      <div class="cc-number">${chapterNumberFromName(ch.name)}</div>
    </div>
    <div class="cc-name">${displayName}</div>
    <div class="cc-sub">${ch.cards.length} verbs · ${m.box3} of ${m.total} mastered</div>
    <div class="cc-progressbar"><div style="width:${pctMastered}%"></div></div>
    <div class="cc-statusrow">
      <span class="cc-status-badge ${st.cls}">${st.label}</span>
      <span style="font-size:11px;color:var(--muted);">${pctMastered}% mastered</span>
    </div>
    <div class="cc-btnrow">
      <button class="primary quick-btn" data-ch="${ch.id}">⚡ Quick Session<span class="btn-sub">test your recall right now</span></button>
      <button data-mode="browse" data-ch="${ch.id}">👁 Browse<span class="btn-sub">read through all cards</span></button>
      <button data-mode="learn" data-ch="${ch.id}">📘 Learn<span class="btn-sub">study in small batches</span></button>
    </div>
  </div>`;
}

function renderCarousel(chapterIds){
  if (!chapterIds.length) return "";
  const idx = Math.max(0, chapterIds.indexOf(currentChapterId));
  const slides = chapterIds.map(id => `<div class="carousel-slide">${renderCurrentChapterCard(id)}</div>`).join("");
  const dots = chapterIds.length > 1
    ? `<div class="carousel-dots">${chapterIds.map((_,i)=>`<div class="carousel-dot ${i===idx?"active":""}" data-carousel-dot="${i}"></div>`).join("")}</div>`
    : "";
  return `<div class="carousel-wrap" id="carouselWrap">
    <div class="carousel-track" id="carouselTrack" style="transform:translateX(-${idx*100}%)">${slides}</div>
    <button class="carousel-arrow prev" id="carouselPrev" ${idx<=0?"disabled":""}>‹</button>
    <button class="carousel-arrow next" id="carouselNext" ${idx>=chapterIds.length-1?"disabled":""}>›</button>
    ${dots}
  </div>`;
}
function wireCarousel(chapterIds){
  const track = document.getElementById("carouselTrack");
  const dots = document.querySelectorAll("[data-carousel-dot]");
  const prevBtn = document.getElementById("carouselPrev");
  const nextBtn = document.getElementById("carouselNext");
  const wrap = document.getElementById("carouselWrap");
  let idx = Math.max(0, chapterIds.indexOf(currentChapterId));
  let animating = false;
  function applyPosition(){
    if (!track) return;
    track.style.transition = "transform .38s cubic-bezier(0.22, 1, 0.36, 1)";
    track.style.transform = `translateX(-${idx*100}%)`;
    dots.forEach((d, j) => d.classList.toggle("active", j === idx));
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= chapterIds.length - 1;
  }
  function setIdx(i){
    if (i < 0 || i >= chapterIds.length) return;
    if (animating) return;
    animating = true;
    idx = i;
    currentChapterId = chapterIds[i];
    saveCurrentChapter();
    applyPosition();
    setTimeout(() => { animating = false; renderHome(); }, 420);
  }
  if (prevBtn) prevBtn.addEventListener("click", ()=> setIdx(idx-1));
  if (nextBtn) nextBtn.addEventListener("click", ()=> setIdx(idx+1));
  dots.forEach((d, i) => d.addEventListener("click", ()=> setIdx(i)));
  if (track && wrap) {
    let startX = null;
    let startIdx = idx;
    let dragging = false;
    track.addEventListener("touchstart", e=>{
      startX = e.touches[0].clientX;
      startIdx = idx;
      dragging = true;
      track.style.transition = "none";
    }, {passive:true});
    track.addEventListener("touchmove", e=>{
      if (!dragging || startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const pct = (dx / wrap.clientWidth) * 100;
      track.style.transform = `translateX(calc(-${startIdx*100}% + ${pct}%))`;
    }, {passive:true});
    track.addEventListener("touchend", e=>{
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const threshold = Math.min(80, wrap.clientWidth * 0.15);
      let moved = false;
      if (dx < -threshold && idx < chapterIds.length - 1) {
        idx++; currentChapterId = chapterIds[idx]; saveCurrentChapter(); moved = true;
      } else if (dx > threshold && idx > 0) {
        idx--; currentChapterId = chapterIds[idx]; saveCurrentChapter(); moved = true;
      }
      applyPosition();
      startX = null;
      if (moved) setTimeout(()=> renderHome(), 420);
    });
  }
}

function renderKanjiHome(){
  let html = "";

  if (chapters.length === 0) {
    html += `<div class="card" style="margin-bottom:16px;"><div class="empty"><div class="big">📥</div>
      <div style="font-size:16px;font-weight:700;">No kanji chapters yet</div>
      <p>${isAdmin() ? "Open the ☰ menu → \"Import chapter\" to add your first one." : "Ask Tobi to import some chapters."}</p></div></div>`;
    if (isAdmin()) html += `<button class="small-btn" id="firstImport" style="margin-bottom:16px;">Import a chapter</button>`;
  } else {
    sortChapters();
    if (!currentChapterId || !chapterById(currentChapterId)) {
      currentChapterId = firstUnmasteredChapterId();
      saveCurrentChapter();
    }
    
    const visibleIds = settings.studyMode === "guided"
      ? chapters.filter(c => isUnlocked(c.id) && !isMastered(c.id)).map(c => c.id)
      : chapters.filter(c => !isMastered(c.id)).map(c => c.id);
      
    if (!visibleIds.includes(currentChapterId)) {
      currentChapterId = visibleIds[0] || firstUnmasteredChapterId() || chapters[0].id;
      saveCurrentChapter();
    }
    
    if (visibleIds.length > 0) {
      html += renderCarousel(visibleIds);
    }
  }

  const reviewCount = globalReviewPoolIds().length;
  html += `<div class="all-card">
      <div class="ac-row">
        <div>
          <div class="cname">🔁 Review Kanji</div>
          <div class="mini-stat">${reviewCount ? reviewCount + " card" + (reviewCount>1?"s":"") + " need practice" : "nothing to review — nice"}</div>
        </div>
        <button id="reviewBtn">Practice</button>
      </div>
      <div class="ac-hint">Cards you've missed, plus anything you've studied that hasn't reached L3 yet.</div>
    </div>`;

  const masteredChapters = chapters.filter(ch => isMastered(ch.id));
  if (masteredChapters.length > 0) {
    const totalMasteredCards = masteredChapters.reduce((s, ch) => s + ch.cards.length, 0);
    html += `<div class="all-card" style="background: var(--green-soft);">
      <div class="ac-row">
        <div>
          <div class="cname">🏆 Mastered</div>
          <div class="mini-stat">${masteredChapters.length} chapter${masteredChapters.length>1?"s":""} · ${totalMasteredCards} cards</div>
        </div>
        <button id="masteredBtn" style="background: var(--green);">Review</button>
      </div>
      <div class="ac-hint">Chapters you've fully locked in. They stay here, safe. You can always come back to review them.</div>
    </div>`;
  }

  html += `<div class="list-toggle" id="listToggle">▾ All kanji chapters (${chapters.length})</div>`;
  html += `<div class="list-hint">Tap to see every chapter and its progress</div>`;
  html += `<div id="allChaptersList" style="display:none;">`;
  chapters.forEach((ch, idx)=>{
    const st = chapterStatus(ch.id);
    const unlocked = isUnlocked(ch.id);
    const lockedCls = unlocked ? "" : " locked";
    const tabCls = st.key === "mastered" ? "chapter-tab mastered" : (unlocked ? "chapter-tab" : "chapter-tab locked");
    const m = chapterMastery(ch.id);
    const displayName = cleanChapterName(ch.name);
    html += `<div class="chapter-row${lockedCls}" data-goto="${ch.id}">
      <div class="${tabCls}">${idx+1}</div>
      <div class="chapter-body">
        <div class="chapter-head">
          <div><div class="cname">${displayName}</div><div class="ccount">${ch.cards.length} verbs · ${m.box3}/${m.total} mastered</div></div>
          <div style="text-align:right;">
            <span class="status-badge ${st.cls}">${unlocked ? st.label : "Locked"}</span>
          </div>
        </div>
      </div>
    </div>`;
  });
  html += `</div>`;
  return html;
}

function renderHome(){
  screen = "home"; activeChapterId = null;
  showTopbar(true);
  pushActivity(null, null);
  const app = document.getElementById("app");
  updateStreakBadge();
  updateUserLine();
  detectDemotions();

  const topHtml = `
    <div id="presenceStrip"></div>
    ${renderFocusSlider()}
    ${renderDailyGoal()}
  `;

  const contentHtml = renderKanjiHome();

  app.innerHTML = topHtml + contentHtml;

  wireFocusSlider();
  renderPresenceStrip();

  if (chapters.length > 0) {
    const visibleIds = settings.studyMode === "guided"
      ? chapters.filter(c => isUnlocked(c.id) && !isMastered(c.id)).map(c => c.id)
      : chapters.filter(c => !isMastered(c.id)).map(c => c.id);
    if (visibleIds.length > 0) wireCarousel(visibleIds);
  }

  const fb = document.getElementById("firstImport");
  if (fb) fb.addEventListener("click", ()=> document.getElementById("importFile").click());

  const reviewBtn = document.getElementById("reviewBtn");
  if (reviewBtn) reviewBtn.addEventListener("click", startGlobalReview);

  const masteredBtn = document.getElementById("masteredBtn");
  if (masteredBtn) masteredBtn.addEventListener("click", renderCollection);

  document.querySelectorAll("[data-mode]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const ch = btn.dataset.ch, mode = btn.dataset.mode;
      if (mode==="browse") startBrowse(ch);
      else if (mode==="learn") startLearn(ch);
    });
  });
  document.querySelectorAll(".quick-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> startQuickPicker(btn.dataset.ch));
  });

  const lt = document.getElementById("listToggle");
  const list = document.getElementById("allChaptersList");
  if (lt && list) {
    lt.addEventListener("click", ()=>{
      const open = list.style.display !== "none";
      list.style.display = open ? "none" : "block";
      lt.textContent = `${open ? "▾" : "▴"} All kanji chapters (${chapters.length})`;
    });
    document.querySelectorAll("[data-goto]").forEach(row=>{
      row.addEventListener("click", ()=>{
        const id = row.dataset.goto;
        if (!isUnlocked(id)) { showDialog("Locked chapter", "Reach Solid in earlier chapters to unlock this one. Or switch to Free mode in Settings."); return; }
        if (isMastered(id)) { 
          showDialog("Chapter mastered 🏆", "This chapter is fully locked in. You can review it from the Mastered section on the home screen.", "Open Menu → 🏆 Mastered chapters to practice it."); 
          return; 
        }
        currentChapterId = id;
        saveCurrentChapter();
        renderHome();
      });
    });
  }
}
function backHome(){ pushActivity(null, null); renderHome(); }

/* ================= COLLECTION ================= */
function renderCollection(){
  screen = "collection";
  showTopbar(true);
  const app = document.getElementById("app");
  const mastered = chapters.filter(ch => isMastered(ch.id));
  const totalCards = mastered.reduce((sum, ch) => sum + ch.cards.length, 0);
  let stragglers = 0;
  mastered.forEach(ch => { chapterCards(ch.id).forEach(v => { if ((progress[v.id]?.box || 0) < MAX_BOX) stragglers++; }); });
  let rows = mastered.map(ch => {
    const m = chapterMastery(ch.id);
    const stragglerCount = chapterCards(ch.id).filter(v => (progress[v.id]?.box || 0) < MAX_BOX).length;
    return `<div class="manage-row">
      <span class="rname">${cleanChapterName(ch.name)} <span style="color:var(--muted);font-weight:400;">(${m.box3}/${m.total})</span>
        ${stragglerCount ? `<div style="font-size:10.5px;color:var(--amber);margin-top:2px;">${stragglerCount} card${stragglerCount>1?"s":""} not yet locked</div>` : ""}
      </span>
      <div class="manage-actions">
        <button class="link-btn2" data-browse="${ch.id}">browse</button>
      </div>
    </div>`;
  }).join("");
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Mastered chapters</span></div>
    <div class="panel" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:12px;">
        <div><div style="font-size:22px;font-weight:700;">${mastered.length}</div><div class="ccount">chapters</div></div>
        <div><div style="font-size:22px;font-weight:700;">${totalCards}</div><div class="ccount">cards</div></div>
        <div><div style="font-size:22px;font-weight:700;color:${stragglers ? 'var(--amber)' : 'var(--green)'};">${stragglers}</div><div class="ccount">not yet locked</div></div>
      </div>
      ${mastered.length ? `<button class="small-btn" id="reviewMasteredBtn">🎯 Review all mastered chapters</button>` : ""}
    </div>
    ${mastered.length ? `<div class="panel">${rows}</div>` : `<div class="card"><div class="empty"><div class="big">🌱</div><div style="font-size:15px;font-weight:700;">No mastered chapters yet</div><p>When a chapter hits 90% at level 3, it'll move here. Study the current chapter in Quick Sessions to get there.</p></div></div>`}
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  const reviewBtn = document.getElementById("reviewMasteredBtn");
  if (reviewBtn) reviewBtn.addEventListener("click", ()=> startReviewMastered(null));
  document.querySelectorAll("[data-browse]").forEach(btn=>{
    btn.addEventListener("click", ()=> startBrowse(btn.dataset.browse));
  });
}

/* ================= REVIEW MASTERED ================= */
function startReviewMastered(chapterId){
  screen = "review-mastered";
  if (chapterId) pushActivity(chapterId, "review");
  const pool = [];
  if (chapterId) {
    const ch = chapterById(chapterId);
    if (ch) chapterCards(ch.id).forEach(v => pool.push(v.id));
  } else {
    chapters.filter(ch => isMastered(ch.id)).forEach(ch => { chapterCards(ch.id).forEach(v => pool.push(v.id)); });
  }
  if (!pool.length) { showDialog("Nothing to review", "You don't have mastered chapters yet."); return; }
  const stragglers = pool.filter(id => (progress[id]?.box || 0) < MAX_BOX);
  const fourteenDaysAgo = Date.now() - 14 * 86400000;
  const refresh = pool
    .filter(id => (progress[id]?.box || 0) >= MAX_BOX)
    .filter(id => {
      const ls = progress[id]?.last_seen;
      return !ls || new Date(ls).getTime() < fourteenDaysAgo;
    });
  const queue = [...shuffleArr(stragglers), ...shuffleArr(refresh).slice(0, 20)];
  if (queue.length === 0) queue.push(...shuffleArr(pool).slice(0, 15));
  launchQuickWithQueue(queue, chapterId ? cleanChapterName(chapterById(chapterId).name) : "Mastered review", true);
}

/* ================= QUICK PICKER ================= */
function startQuickPicker(chapterId){
  screen = "quick-picker";
  activeChapterId = chapterId;
  showTopbar(true);
  const ch = chapterById(chapterId);
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Quick · ${cleanChapterName(ch.name)}</span></div>
    <div style="text-align:center;margin:14px 0 20px;">
      <div style="font-size:14px;color:var(--muted);">Choose how you want to be tested</div>
    </div>
    <div class="picker-row">
      <div class="picker-card" id="pickFlash">
        <div class="pc-icon">📇</div>
        <div class="pc-title">Flashcard</div>
        <div class="pc-sub">See the kanji, tap to reveal the answer, grade yourself.</div>
      </div>
      <div class="picker-card" id="pickMC">
        <div class="pc-icon">🎯</div>
        <div class="pc-title">Multiple choice</div>
        <div class="pc-sub">See the kanji, pick the right reading from 4 options.</div>
      </div>
    </div>
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  document.getElementById("pickFlash").addEventListener("click", ()=> startQuick(chapterId, "flash"));
  document.getElementById("pickMC").addEventListener("click", ()=> startQuick(chapterId, "mc"));
}

/* ================= QUICK ================= */
let quickQueue = [], quickTotal = 0, quickMiss = {}, quickCorrectCount = 0;
let quickInputMode = "flash";
let quickChapterId = null;
let quickIsReview = false;
let quickChapterLabel = "";
let lastAction = null; // For Undo

function startQuick(chapterId, inputMode){
  quickInputMode = inputMode || "flash";
  quickChapterId = chapterId;
  quickIsReview = false;
  pushActivity(chapterId, "quick");
  const queue = buildQuickQueue(chapterId);
  launchQuickWithQueue(queue, cleanChapterName(chapterById(chapterId).name), false);
}
function launchQuickWithQueue(queue, label, isReview){
  screen = "quick";
  quickQueue = queue.slice();
  quickTotal = queue.length;
  quickMiss = {};
  quickCorrectCount = 0;
  quickIsReview = !!isReview;
  quickChapterLabel = label;
  lastAction = null;
  renderQuick();
}

function renderQuick(){
  const app = document.getElementById("app");
  if (!quickQueue.length) {
    const missedCards = Object.keys(quickMiss).filter(k=>quickMiss[k]>0).length;
    const acc = quickTotal ? Math.round(100*(quickTotal-missedCards)/quickTotal) : 100;
    let milestoneText = "";
    if (quickChapterId && !quickIsReview) {
      const m = chapterMastery(quickChapterId);
      const pct3 = m.total ? Math.round(100 * m.ratio3) : 0;
      const pct2 = m.total ? Math.round(100 * m.ratio2) : 0;
      if (m.ratio3 >= MASTER_THRESHOLD) milestoneText = `🏆 ${m.box3}/${m.total} cards mastered — chapter locked in!`;
      else if (m.ratio2 >= SOLID_THRESHOLD) milestoneText = `${pct3}% mastered · next: 90% to lock in`;
      else milestoneText = `${pct2}% getting there · aim for 70% to reach Solid`;
    }
    app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">${quickIsReview ? "Review" : "Quick"} · ${quickChapterLabel}</span></div>
      <div class="card"><div class="empty"><div class="big">🏁</div>
      <div style="font-size:16px;font-weight:700;">Session complete — ${acc}%</div>
      <p>${quickTotal} cards · ${missedCards ? missedCards + " needed a retry" : "no mistakes — great run"}</p>
      ${milestoneText ? `<p style="margin-top:10px;font-size:12px;color:#4a4232;">${milestoneText}</p>` : ""}
      </div></div>
      <button class="small-btn" id="again">Run again</button>
      <button class="small-btn ghost" id="backHomeFromQuick">← home</button>`;
    document.getElementById("backBtn").addEventListener("click", ()=> { syncNow(); renderHome(); });
    document.getElementById("backHomeFromQuick").addEventListener("click", ()=> { syncNow(); renderHome(); });
    document.getElementById("again").addEventListener("click", ()=> {
      if (quickIsReview) startReviewMastered(quickChapterId);
      else startQuick(quickChapterId, quickInputMode);
    });
    if (quickChapterId && !quickIsReview && isMastered(quickChapterId)) {
      const next = nextUnmasteredAfter(quickChapterId);
      if (next && next !== quickChapterId) { currentChapterId = next; saveCurrentChapter(); }
    }
    return;
  }
  const remaining = new Set(quickQueue).size;
  const doneCount = quickTotal - remaining;
  const v = findVocab(quickQueue[0]);

  const undoBtnHtml = lastAction ? `<button class="small-btn ghost" id="undoBtn" style="width:auto; padding:4px 8px; font-size:11px; margin:0; position:absolute; top:14px; right:14px;">↩️ Undo</button>` : "";

  if (quickInputMode === "mc") {
    const choices = buildMCChoices(v);
    app.innerHTML = `
      <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">${quickIsReview ? "Review" : "Quick"} · ${quickChapterLabel}</span></div>
      <div class="session-progress"><span>${doneCount} / ${quickTotal}</span><span>${remaining} left</span></div>
      <div class="progressbar"><div style="width:${Math.round((doneCount/quickTotal)*100)}%"></div></div>
      <div class="card" style="position:relative;">
        ${undoBtnHtml}
        <div class="chaptertag">${cleanChapterName(v.chapterName)}</div>
        <div class="kanji">${v.k}</div>
        <div class="choice-list" id="choiceList">
          ${choices.map((c, i) => `<button class="choice-btn" data-i="${i}">${c.text}</button>`).join("")}
        </div>
        <div id="mcFeedback" style="margin-top:14px;min-height:22px;"></div>
      </div>
    `;
    document.getElementById("backBtn").addEventListener("click", ()=> { syncNow(); renderHome(); });
    if (lastAction) document.getElementById("undoBtn").addEventListener("click", undoAnswer);
    document.querySelectorAll(".choice-btn").forEach((btn, i)=>{
      btn.addEventListener("click", ()=>{
        const choice = choices[i];
        const buttons = document.querySelectorAll(".choice-btn");
        buttons.forEach(b => b.disabled = true);
        if (choice.correct) {
          btn.classList.add("correct");
          document.getElementById("mcFeedback").innerHTML = `<div class="reading">${v.r}</div><div class="meaning">${v.m}</div><div class="sentence">${v.s}</div>`;
          setTimeout(()=> quickAnswer(true), 600);
        } else {
          btn.classList.add("wrong");
          const correctIdx = choices.findIndex(c => c.correct);
          buttons[correctIdx].classList.add("correct");
          document.getElementById("mcFeedback").innerHTML = `<div class="reading">${v.r}</div><div class="meaning">${v.m}</div><div class="sentence">${v.s}</div>`;
          setTimeout(()=> quickAnswer(false), 1300);
        }
      });
    });
  } else {
    app.innerHTML = `
      <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">${quickIsReview ? "Review" : "Quick"} · ${quickChapterLabel}</span></div>
      <div class="session-progress"><span>${doneCount} / ${quickTotal}</span><span>${remaining} left</span></div>
      <div class="progressbar"><div style="width:${Math.round((doneCount/quickTotal)*100)}%"></div></div>
      <div class="card tapzone" id="tapzone" style="position:relative;">
        ${undoBtnHtml}
        <div class="chaptertag">${cleanChapterName(v.chapterName)}</div>
        <div class="kanji">${v.k}</div>
        <div class="reveal-hint" id="hint">tap to reveal reading &amp; meaning</div>
      </div>
      <div id="gradeArea"></div>
    `;
    document.getElementById("backBtn").addEventListener("click", ()=> { syncNow(); renderHome(); });
    if (lastAction) document.getElementById("undoBtn").addEventListener("click", undoAnswer);
    document.getElementById("tapzone").addEventListener("click", ()=>{
      markCardSeen(v.id);
      document.getElementById("hint").outerHTML = `<div style="margin-top:16px;">
        <div class="reading" style="cursor:pointer;" onclick="playAudio('${v.k}')">${v.r} 🔊</div>
        <div class="meaning">${v.m}</div>
        <div class="sentence">${v.s}</div>
      </div>`;
      document.getElementById("gradeArea").innerHTML = `<div class="grade-row">
        <button class="g-wrong" id="markWrong">✗ Wrong</button>
        <button class="g-right" id="markRight">✓ Correct</button>
      </div>`;
      document.getElementById("markRight").addEventListener("click", ()=> quickAnswer(true));
      document.getElementById("markWrong").addEventListener("click", ()=> quickAnswer(false));
    });
  }
}
async function quickAnswer(correct){
  const id = quickQueue.shift();
  markCardSeen(id);
  await recordStreakToday();
  
  // Cache for undo
  const prevP = JSON.parse(JSON.stringify(progress[id] || {}));
  lastAction = { id, prevP, correct, queued: false };

  applyAnswer(id, correct);
  
  if (correct) { 
    quickCorrectCount++; 
  } else {
    quickMiss[id] = (quickMiss[id]||0) + 1;
    await recordMiss(id);
    const gap = Math.max(1, settings.requeueGap);
    const pos = Math.min(quickQueue.length, gap);
    quickQueue.splice(pos, 0, id);
    lastAction.queued = true;
  }
  await saveLocalProgress();
  if (quickQueue.length === 0) await recordQuickSession();
  renderQuick();
  syncNow();
}

function undoAnswer() {
  if (!lastAction) return;
  const { id, prevP, correct, queued } = lastAction;
  
  // Restore progress
  if (Object.keys(prevP).length === 0) delete progress[id];
  else progress[id] = prevP;

  // Un-requeue if it was wrong
  if (queued) {
    const idx = quickQueue.indexOf(id);
    if (idx > -1) quickQueue.splice(idx, 1);
  }
  
  // Put the card back at the front
  quickQueue.unshift(id);
  lastAction = null;
  toast("Undone");
  renderQuick();
  saveLocalProgress();
}

async function recordQuickSession(){
  const chapterId = quickChapterId;
  if (!chapterId) return;
  const missedCards = Object.keys(quickMiss).filter(k=>quickMiss[k]>0).length;
  const accuracy = quickTotal ? Math.round(100*(quickTotal-missedCards)/quickTotal) : 100;
  const st = quickStats[chapterId] || { sessions: 0, lastAccuracy: null, bestAccuracy: null, lastPlayedAt: null };
  st.sessions += 1;
  st.lastAccuracy = accuracy;
  st.bestAccuracy = st.bestAccuracy === null ? accuracy : Math.max(st.bestAccuracy, accuracy);
  st.lastPlayedAt = new Date().toISOString();
  quickStats[chapterId] = st;
  await saveQuickStats();
}

/* ================= BROWSE ================= */
let browseList = [], browseIdx = 0, browseFlagged = new Set(), browseView = "grid", browseShowFlaggedOnly = false;

function startBrowse(chapterId){
  screen = "browse"; activeChapterId = chapterId;
  showTopbar(true);
  pushActivity(chapterId, "browse");
  browseList = orderCards(chapterCards(chapterId).map(v=>v.id));
  browseFlagged = new Set();
  browseView = "grid"; browseShowFlaggedOnly = false;
  renderBrowse();
}
function renderBrowse(){ if (browseView === "grid") renderBrowseGrid(); else renderBrowseCard(); }
function renderBrowseGrid(){
  const app = document.getElementById("app");
  const chName = cleanChapterName(chapterById(activeChapterId).name);
  const idsToShow = browseShowFlaggedOnly ? browseList.filter(id=>browseFlagged.has(id)) : browseList;
  const tiles = idsToShow.map(id=>{
    const v = findVocab(id);
    const p = progress[id] || { box: 0 };
    const box = p.box;
    const flaggedCls = browseFlagged.has(id) ? " flagged" : "";
    const boxBadge = box >= MAX_BOX ? `<div style="position:absolute;top:6px;left:8px;font-size:10px;color:var(--green);font-weight:700;">L3</div>` :
                     box >= 2 ? `<div style="position:absolute;top:6px;left:8px;font-size:10px;color:var(--blue);font-weight:700;">L2</div>` :
                     box >= 1 ? `<div style="position:absolute;top:6px;left:8px;font-size:10px;color:var(--amber);font-weight:700;">L1</div>` : "";
    return `<div class="grid-tile${flaggedCls}" data-id="${id}">
      ${browseFlagged.has(id) ? '<span class="tile-star">★</span>' : ''}
      ${boxBadge}
      <div class="tile-kanji">${v.k}</div>
      <div class="tile-reading">${v.r}</div>
      <div class="tile-meaning">${v.m}</div>
    </div>`;
  }).join("");
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Browse · ${chName}</span></div>
    <div class="session-progress">
      <span>${idsToShow.length} card${idsToShow.length===1?'':'s'}</span>
      <span>${browseFlagged.size ? '<button class="link-mini" id="toggleFlagged">' + (browseShowFlaggedOnly ? 'show all' : '★ ' + browseFlagged.size + ' flagged') + '</button>' : ''}</span>
    </div>
    <div class="card-grid">${tiles || '<div class="empty" style="grid-column:1/-1;"><p>No flagged cards.</p></div>'}</div>
  `;
  document.getElementById("backBtn").addEventListener("click", backHome);
  const tf = document.getElementById("toggleFlagged");
  if (tf) tf.addEventListener("click", ()=>{ browseShowFlaggedOnly = !browseShowFlaggedOnly; renderBrowseGrid(); });
  document.querySelectorAll(".grid-tile").forEach(tile=>{
    tile.addEventListener("click", ()=>{
      browseIdx = browseList.indexOf(tile.dataset.id);
      browseView = "card";
      renderBrowse();
    });
  });
}
function renderBrowseCard(){
  const app = document.getElementById("app");
  const v = findVocab(browseList[browseIdx]);
  const isFlagged = browseFlagged.has(v.id);
  const p = progress[v.id] || { box: 0 };
  app.innerHTML = `
    <div class="backrow"><button id="gridBtn">← all cards</button><span class="screen-title">${browseIdx+1} / ${browseList.length}</span></div>
    <div class="browse-nav">
      <button class="nav-arrow" id="prevBtn" ${browseIdx===0?"disabled":""}>‹</button>
      <div class="card" id="tapzone">
        <button class="star-toggle ${isFlagged?"on":""}" id="starBtn" title="Flag for redo">★</button>
        <div class="chaptertag">${cleanChapterName(v.chapterName)} · level ${p.box}</div>
        <div class="kanji">${v.k}</div>
        <div class="reading" style="cursor:pointer;" onclick="playAudio('${v.k}')">${v.r} 🔊</div>
        <div class="meaning">${v.m}</div>
        <div class="sentence">${v.s}</div>
      </div>
      <button class="nav-arrow" id="nextBtn" ${browseIdx===browseList.length-1?"disabled":""}>›</button>
    </div>
  `;
  document.getElementById("gridBtn").addEventListener("click", ()=>{ browseView="grid"; renderBrowse(); });
  document.getElementById("starBtn").addEventListener("click", (e)=>{
    e.stopPropagation();
    if (browseFlagged.has(v.id)) browseFlagged.delete(v.id); else browseFlagged.add(v.id);
    renderBrowseCard();
  });
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  if (!prevBtn.disabled) prevBtn.addEventListener("click", ()=>{ browseIdx--; renderBrowseCard(); });
  if (!nextBtn.disabled) nextBtn.addEventListener("click", ()=>{ browseIdx++; renderBrowseCard(); });
}

/* ================= LEARN ================= */
let learnBatches = [], learnBatchIdx = 0, learnPhase = "study";
let learnTestQueue = [], learnTestTotal = 0, learnTestMiss = {}, learnMastered = [];

function chunkArr(arr, size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }

function startLearn(chapterId){
  screen = "learn"; activeChapterId = chapterId;
  showTopbar(true);
  pushActivity(chapterId, "learn");
  const ids = orderCards(chapterCards(chapterId).map(v=>v.id));
  const size = Math.max(3, Math.min(10, settings.learnBatchSize || 6));
  learnBatches = chunkArr(ids, size);
  learnBatchIdx = 0;
  learnMastered = [];
  enterLearnStudy();
}
function enterLearnStudy(){ learnPhase = "study"; renderLearn(); }
function enterLearnTest(){
  learnPhase = "test";
  const newWords = learnBatches[learnBatchIdx];
  const pool = settings.learnCumulative !== false ? [...newWords, ...learnMastered] : newWords.slice();
  learnTestQueue = orderCards(pool);
  learnTestTotal = learnTestQueue.length;
  learnTestMiss = {};
  renderLearn();
}
function renderLearn(){
  if (learnPhase === "study") renderLearnStudy();
  else if (learnPhase === "test") renderLearnTest();
  else if (learnPhase === "batchdone") renderLearnBatchDone();
  else renderLearnChapterDone();
}
function renderLearnStudy(){
  const app = document.getElementById("app");
  const chName = cleanChapterName(chapterById(activeChapterId).name);
  const batch = learnBatches[learnBatchIdx];
  const items = batch.map(id=>{
    const v = findVocab(id);
    return `<div class="learn-item">
      <div class="learn-item-head"><span class="learn-kanji">${v.k}</span><span class="learn-reading">${v.r}</span></div>
      <div class="learn-meaning">${v.m}</div>
      <div class="learn-sentence">${v.s}</div>
    </div>`;
  }).join("");
  const retestNote = (settings.learnCumulative !== false && learnMastered.length)
    ? `<div style="margin-bottom:10px;font-size:11px;color:var(--muted);">The test will also re-check ${learnMastered.length} word${learnMastered.length>1?'s':''} from earlier batches.</div>`
    : "";
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Learn · ${chName}</span></div>
    <div class="session-progress"><span>Batch ${learnBatchIdx+1} of ${learnBatches.length}</span><span>${batch.length} new words</span></div>
    <div class="learn-list">${items}</div>
    ${retestNote}
    <button class="small-btn" id="testMeBtn">Test me on these ${batch.length} words</button>
  `;
  document.getElementById("backBtn").addEventListener("click", backHome);
  document.getElementById("testMeBtn").addEventListener("click", enterLearnTest);
}
function renderLearnTest(){
  const app = document.getElementById("app");
  const chName = cleanChapterName(chapterById(activeChapterId).name);
  if (!learnTestQueue.length) {
    learnMastered.push(...learnBatches[learnBatchIdx]);
    if (learnBatchIdx < learnBatches.length - 1) learnPhase = "batchdone";
    else learnPhase = "chapterdone";
    renderLearn();
    return;
  }
  const doneCount = learnTestTotal - new Set(learnTestQueue).size;
  const v = findVocab(learnTestQueue[0]);
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Learn · ${chName}</span></div>
    <div class="session-progress"><span>Batch ${learnBatchIdx+1} of ${learnBatches.length}</span><span>${doneCount} / ${learnTestTotal} got it</span></div>
    <div class="progressbar"><div style="width:${Math.round((doneCount/learnTestTotal)*100)}%"></div></div>
    <div class="card tapzone" id="tapzone">
      <div class="chaptertag">${cleanChapterName(v.chapterName)}</div>
      <div class="kanji">${v.k}</div>
      <div class="reveal-hint" id="hint">tap to reveal reading &amp; meaning</div>
    </div>
    <div id="gradeArea"></div>
  `;
  document.getElementById("backBtn").addEventListener("click", backHome);
  document.getElementById("tapzone").addEventListener("click", ()=>{
    document.getElementById("hint").outerHTML = `<div style="margin-top:16px;">
      <div class="reading" style="cursor:pointer;" onclick="playAudio('${v.k}')">${v.r} 🔊</div>
      <div class="meaning">${v.m}</div>
    </div>`;
    document.getElementById("gradeArea").innerHTML = `<div class="grade-row">
      <button class="g-wrong" id="markWrong">✗ Wrong</button>
      <button class="g-right" id="markRight">✓ Correct</button>
    </div>`;
    document.getElementById("markRight").addEventListener("click", ()=> learnAnswer(true));
    document.getElementById("markWrong").addEventListener("click", ()=> learnAnswer(false));
  });
}
async function learnAnswer(correct){
  const id = learnTestQueue.shift();
  markCardSeen(id);
  await recordStreakToday();
  applyAnswer(id, correct);
  if (!correct) {
    learnTestMiss[id] = (learnTestMiss[id]||0) + 1;
    await recordMiss(id);
    const gap = Math.max(1, settings.requeueGap);
    const pos = Math.min(learnTestQueue.length, gap);
    learnTestQueue.splice(pos, 0, id);
  }
  await saveLocalProgress();
  syncNow();
  renderLearnTest();
}
function renderLearnBatchDone(){
  const app = document.getElementById("app");
  const missed = Object.keys(learnTestMiss).length;
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Learn</span></div>
    <div class="card"><div class="empty"><div class="big">✅</div>
    <div style="font-size:16px;font-weight:700;">Batch ${learnBatchIdx+1} down!</div>
    <p>${missed ? missed + " word" + (missed>1?"s":"") + " needed a couple tries." : "Clean run — nice."}</p></div></div>
    <button class="small-btn" id="nextBatch">Next ${learnBatches[learnBatchIdx+1].length} words →</button>`;
  document.getElementById("backBtn").addEventListener("click", backHome);
  document.getElementById("nextBatch").addEventListener("click", ()=>{ learnBatchIdx++; enterLearnStudy(); });
}
function renderLearnChapterDone(){
  const app = document.getElementById("app");
  const chName = cleanChapterName(chapterById(activeChapterId).name);
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Learn</span></div>
    <div class="card"><div class="empty"><div class="big">🎉</div>
    <div style="font-size:16px;font-weight:700;">All of ${chName} learned!</div>
    <p>${learnBatches.length} batches, ${learnBatches.flat().length} words.</p></div></div>
    <button class="small-btn" id="restartLearn">Go through it again</button>`;
  document.getElementById("backBtn").addEventListener("click", backHome);
  document.getElementById("restartLearn").addEventListener("click", ()=> startLearn(activeChapterId));
}

/* ================= GLOBAL REVIEW ================= */
let reviewQueue = [], reviewTotal = 0;

function startGlobalReview(){
  screen = "review"; activeChapterId = null;
  showTopbar(true);
  const pool = globalReviewPoolIds();
  if (!pool.length) { renderGlobalReview(); return; }
  reviewQueue = orderCards(pool);
  reviewTotal = reviewQueue.length;
  renderGlobalReview();
}
function renderGlobalReview(){
  const app = document.getElementById("app");
  if (!reviewQueue.length) {
    const still = globalReviewPoolIds().length;
    app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Review</span></div>
      <div class="card"><div class="empty"><div class="big">${still ? "🙂" : "✨"}</div>
      <div style="font-size:16px;font-weight:700;">${still ? "Round complete" : "Nothing to review right now"}</div>
      <p>${still ? still + " card" + (still>1?"s":"") + " still need more practice — another round?" : "Cards show up here when you miss them, or when they're still below L3."}</p></div></div>
      ${still ? '<button class="small-btn" id="againBtn">Practice again</button>' : ""}`;
    document.getElementById("backBtn").addEventListener("click", backHome);
    const again = document.getElementById("againBtn");
    if (again) again.addEventListener("click", startGlobalReview);
    return;
  }
  const remaining = new Set(reviewQueue).size;
  const v = findVocab(reviewQueue[0]);
  const misses = (weakStats[v.id] && weakStats[v.id].misses) || 0;
  const box = clampBox(progress[v.id]?.box ?? 0);
  const metaParts = [];
  if (misses > 0) metaParts.push(`missed ${misses}×`);
  metaParts.push(`L${box}`);
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Review</span></div>
    <div class="session-progress"><span>${reviewTotal - remaining + 1} / ${reviewTotal} this round</span><span>${metaParts.join(" · ")}</span></div>
    <div class="progressbar"><div style="width:${Math.round(((reviewTotal-remaining)/reviewTotal)*100)}%"></div></div>
    <div class="card tapzone" id="tapzone">
      <div class="chaptertag">${cleanChapterName(v.chapterName)}</div>
      <div class="kanji">${v.k}</div>
      <div class="reveal-hint" id="hint">tap to reveal reading &amp; meaning</div>
    </div>
    <div id="gradeArea"></div>
  `;
  document.getElementById("backBtn").addEventListener("click", backHome);
  document.getElementById("tapzone").addEventListener("click", ()=>{
    document.getElementById("hint").outerHTML = `<div style="margin-top:16px;">
      <div class="reading" style="cursor:pointer;" onclick="playAudio('${v.k}')">${v.r} 🔊</div>
      <div class="meaning">${v.m}</div>
      <div class="sentence">${v.s}</div>
    </div>`;
    document.getElementById("gradeArea").innerHTML = `<div class="grade-row">
      <button class="g-wrong" id="markWrong">✗ Wrong</button>
      <button class="g-right" id="markRight">✓ Correct</button>
    </div>`;
    document.getElementById("markRight").addEventListener("click", ()=> reviewAnswer(true));
    document.getElementById("markWrong").addEventListener("click", ()=> reviewAnswer(false));
  });
}
async function reviewAnswer(correct){
  const id = reviewQueue.shift();
  markCardSeen(id);
  await recordStreakToday();
  applyAnswer(id, correct);
  if (correct) {
    if (weakStats[id]) {
      weakStats[id].misses = Math.max(0, weakStats[id].misses - 1);
      if (weakStats[id].misses === 0) delete weakStats[id];
      await saveWeakStats();
    }
  } else {
    await recordMiss(id);
    const gap = Math.max(1, settings.requeueGap);
    const pos = Math.min(reviewQueue.length, gap);
    reviewQueue.splice(pos, 0, id);
  }
  await saveLocalProgress();
  syncNow();
  renderGlobalReview();
}

/* ================= STATS ================= */
function renderStatsScreen(){
  screen = "stats";
  showTopbar(true);
  const app = document.getElementById("app");
  const streak = computeCurrentStreak();
  const longest = computeLongestStreak();
  const weakCount = weakPoolIds().length;
  const masteredCount = chapters.filter(ch => isMastered(ch.id)).length;
  const DAYS = 84;
  let cells = "";
  for (let i = DAYS-1; i>=0; i--){
    const ds = dateStrOffset(i);
    const on = !!streakDates[ds];
    cells += `<div class="heat-cell${on?" on":""}" title="${ds}${on?" · practiced":""}"></div>`;
  }
  let chapterRows = chapters.map(ch=>{
    const st = chapterStatus(ch.id);
    const m = chapterMastery(ch.id);
    return `<div class="stat-row">
      <span class="stat-row-name">${cleanChapterName(ch.name)}</span>
      <span class="stat-row-val">${st.label} · ${m.box3}/${m.total} at L3</span>
    </div>`;
  }).join("");
  app.innerHTML = `
    <div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Stats &amp; streak</span></div>
    <div class="panel" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-around;text-align:center;">
        <div><div style="font-size:22px;font-weight:700;">🔥 ${streak}</div><div class="ccount">streak</div></div>
        <div><div style="font-size:22px;font-weight:700;">${longest}</div><div class="ccount">longest</div></div>
        <div><div style="font-size:22px;font-weight:700;color:var(--green);">${masteredCount}</div><div class="ccount">mastered</div></div>
        <div><div style="font-size:22px;font-weight:700;color:var(--seal);">${weakCount}</div><div class="ccount">weak</div></div>
      </div>
    </div>
    <div class="panel" style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Last ${DAYS} days</div>
      <div class="heatmap">${cells}</div>
    </div>
    <div class="panel">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Progress by chapter</div>
      ${chapterRows || '<div class="empty"><p>No chapters yet.</p></div>'}
    </div>
  `;
  document.getElementById("backBtn").addEventListener("click", renderHome);
}

/* ================= MANAGE ================= */
function renderManage(){
  screen = "manage";
  showTopbar(true);
  if (!isAdmin()) { renderHome(); return; }
  const app = document.getElementById("app");
  let rows = chapters.map(ch=>{
    return `<div class="manage-row">
      <span class="rname">${cleanChapterName(ch.name)} <span style="color:var(--muted);font-weight:400;">(${ch.cards.length})</span></span>
      <div class="manage-actions">
        ${ch.serverId ? `
          <button class="link-btn2" data-rename="${ch.id}">rename</button>
          <button class="del-btn" data-del="${ch.id}">delete</button>
        ` : ""}
      </div>
    </div>`;
  }).join("");
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Manage chapters</span></div>
    <div class="panel" style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Kanji chapters</div>
      ${rows || '<div class="hint" style="margin-bottom:6px;">No chapters yet.</div>'}
      <button class="small-btn" id="importFromPanel">+ import a new chapter</button>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  document.getElementById("importFromPanel").addEventListener("click", ()=> document.getElementById("importFile").click());
  document.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if (!confirm("Delete this chapter for everyone? This can't be undone.")) return;
      const id = btn.dataset.del;
      const ch = chapterById(id);
      if (!ch || !ch.serverId) return;
      const r = await api("/api/chapters/" + ch.serverId, { method: "DELETE" });
      if (!r.ok) { toast(r.body && r.body.error ? r.body.error : "Delete failed"); return; }
      chapters = chapters.filter(c=>c.id !== id);
      await saveLocalChapters();
      rebuildVocab();
      await saveLocalProgress();
      toast("Chapter deleted");
      renderManage();
    });
  });
  document.querySelectorAll("[data-rename]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.rename;
      const ch = chapterById(id);
      if (!ch || !ch.serverId) return;
      const currentName = ch.name;
      const newName = prompt("Rename chapter:", currentName);
      if (newName === null) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === currentName) return;
      const r = await api("/api/chapters/" + ch.serverId, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed })
      });
      if (!r.ok) { toast(r.body && r.body.error ? r.body.error : "Rename failed"); return; }
      ch.name = trimmed;
      await saveLocalChapters();
      rebuildVocab();
      toast("Chapter renamed");
      renderManage();
    });
  });
}

/* ================= SETTINGS ================= */
function renderSettings(){
  screen = "settings";
  showTopbar(true);
  const app = document.getElementById("app");
  const guided = settings.studyMode === "guided";
  const free = settings.studyMode !== "guided";
  const interOn = settings.interleaving !== false;
  const interOff = settings.interleaving === false;
  const soundOn = settings.soundEnabled !== false;
  const soundOff = settings.soundEnabled === false;
  app.innerHTML = `<div class="backrow"><button id="backBtn">← home</button><span class="screen-title">Settings</span></div>
    <div class="panel" style="margin-bottom:12px;">
      <div class="setting-row">
        <label>Study mode</label>
        <div class="seg-control">
          <button class="seg-btn ${guided ? "active" : ""}" id="modeGuided">Guided<span class="sg-sub">one at a time</span></button>
          <button class="seg-btn ${free ? "active" : ""}" id="modeFree">Free<span class="sg-sub">all chapters open</span></button>
        </div>
        <div class="hint">Guided: home shows one chapter, unlocks as you go. Free: all chapters open.</div>
      </div>
      <div class="setting-row">
        <label>Mix in older cards</label>
        <div class="seg-control">
          <button class="seg-btn ${interOn ? "active" : ""}" id="interOn">On</button>
          <button class="seg-btn ${interOff ? "active" : ""}" id="interOff">Off</button>
        </div>
        <div class="hint">Adds ~20% cards from other unfinished chapters into Quick sessions.</div>
      </div>
      <div class="setting-row">
        <label>Notification sounds</label>
        <div class="seg-control">
          <button class="seg-btn ${soundOn ? "active" : ""}" id="soundOnBtn">On</button>
          <button class="seg-btn ${soundOff ? "active" : ""}" id="soundOffBtn">Off</button>
        </div>
        <div class="hint">Small chime when you receive a reaction or an invite.</div>
      </div>
      <div class="setting-row">
        <label>Daily goal (cards per day)</label>
        <div class="unit-input">
          <input type="number" min="1" id="dailyGoal" value="${settings.dailyGoal || DEFAULT_DAILY_GOAL}">
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="setting-row">
        <label>Shuffle card order</label>
        <div class="seg-control">
          <button class="seg-btn ${settings.shuffle?"active":""}" id="shuffleOnBtn">On</button>
          <button class="seg-btn ${!settings.shuffle?"active":""}" id="shuffleOffBtn">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <label>Quick Session redo gap</label>
        <div class="unit-input">
          <input type="number" min="1" id="requeueGap" value="${settings.requeueGap}">
          <span class="hint" style="align-self:center;">cards later</span>
        </div>
      </div>
      <div class="setting-row">
        <label>Learn mode batch size</label>
        <div class="unit-input">
          <input type="number" min="3" max="10" id="learnBatchSize" value="${settings.learnBatchSize}">
          <span class="hint" style="align-self:center;">new words per batch</span>
        </div>
      </div>
      <div class="setting-row">
        <label>Retest earlier batches each round</label>
        <div class="seg-control">
          <button class="seg-btn ${settings.learnCumulative!==false?"active":""}" id="cumOnBtn">On</button>
          <button class="seg-btn ${settings.learnCumulative===false?"active":""}" id="cumOffBtn">Off</button>
        </div>
      </div>
      <button class="small-btn" id="saveSettings">Save settings</button>
      <button class="small-btn ghost" id="resetSettings">Reset to defaults</button>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", renderHome);
  document.getElementById("modeGuided").addEventListener("click", ()=>{ settings.studyMode = "guided"; renderSettings(); });
  document.getElementById("modeFree").addEventListener("click", ()=>{ settings.studyMode = "free"; renderSettings(); });
  document.getElementById("interOn").addEventListener("click", ()=>{ settings.interleaving = true; renderSettings(); });
  document.getElementById("interOff").addEventListener("click", ()=>{ settings.interleaving = false; renderSettings(); });
  document.getElementById("soundOnBtn").addEventListener("click", ()=>{ settings.soundEnabled = true; renderSettings(); });
  document.getElementById("soundOffBtn").addEventListener("click", ()=>{ settings.soundEnabled = false; renderSettings(); });
  document.getElementById("shuffleOnBtn").addEventListener("click", ()=>{ settings.shuffle = true; renderSettings(); });
  document.getElementById("shuffleOffBtn").addEventListener("click", ()=>{ settings.shuffle = false; renderSettings(); });
  document.getElementById("cumOnBtn").addEventListener("click", ()=>{ settings.learnCumulative = true; renderSettings(); });
  document.getElementById("cumOffBtn").addEventListener("click", ()=>{ settings.learnCumulative = false; renderSettings(); });
  document.getElementById("saveSettings").addEventListener("click", async ()=>{
    settings.requeueGap = Math.max(1, Number(document.getElementById("requeueGap").value) || 3);
    settings.learnBatchSize = Math.max(3, Math.min(10, Number(document.getElementById("learnBatchSize").value) || 6));
    settings.dailyGoal = Math.max(1, Number(document.getElementById("dailyGoal").value) || DEFAULT_DAILY_GOAL);
    await saveSettings();
    toast("Settings saved");
    syncNow();
    renderHome();
  });
  document.getElementById("resetSettings").addEventListener("click", async ()=>{
    const mode = settings.studyMode;
    settings = deepClone(DEFAULT_SETTINGS);
    settings.studyMode = mode;
    await saveSettings();
    renderSettings();
  });
}

document.getElementById("menuBtn").addEventListener("click", renderMenu);
document.getElementById("notifBtn").addEventListener("click", renderNotificationsScreen);

document.getElementById("importFile").addEventListener("change", async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!(data.cards && Array.isArray(data.cards) && data.cards.length)) throw new Error("unrecognized format");
    const cards = data.cards.map(c => ({
      k: c.kanji || c.k || "", r: c.reading || c.r || "", m: c.meaning || c.m || "", s: c.sentence || c.s || ""
    })).filter(c => c.k && c.r);
    if (!cards.length) throw new Error("no valid cards");
    const name = data.chapterName || data.name || ("Imported chapter " + (chapters.length + 1));
    const r = await api("/api/chapters", { method: "POST", body: JSON.stringify({ name, cards }) });
    if (r.ok) {
      const detail = await api("/api/chapters/" + r.body.id);
      if (detail.ok) {
        chapters.push({
          id: "srv_" + r.body.id, serverId: r.body.id, name: detail.body.chapter.name,
          cards: detail.body.cards.map(c => ({ serverId: c.id, k: c.kanji, r: c.reading, m: c.meaning, s: c.sentence || "" }))
        });
        sortChapters();
        await saveLocalChapters();
        rebuildVocab();
        await saveLocalProgress();
        toast(`Imported "${name}" — ${cards.length} verbs`);
        renderHome();
      } else { toast("Imported, syncing…"); syncNow({ afterSync: renderHome }); }
    } else if (r.status === 409) {
      const existing = r.body.existing;
      showDialog("Already in the shared database",
        `This chapter's kanji match an existing one${existing ? `, "<b>${existing.name}</b>"` : ""}. Nothing was added.`,
        existing && existing.created_at ? `Originally imported ${new Date(existing.created_at).toLocaleDateString()}` : "");
    } else if (r.status === 403) {
      showDialog("Permission denied", "Only the admin can import chapters.");
    } else if (r.status === 401) {
      handleAuthExpired();
    } else {
      showDialog("Import failed", (r.body && r.body.error) ? r.body.error : "Unknown error from server.");
    }
  } catch(err) {
    showDialog("Couldn't read that file", "Make sure it's a JSON export in the expected format: <code>{ \"chapterName\": \"...\", \"cards\": [...] }</code>");
  }
  e.target.value = "";
});

document.addEventListener("keydown", (e)=>{
  if (screen !== "browse" || browseView !== "card") return;
  if (e.key === "ArrowLeft" && browseIdx > 0) { browseIdx--; renderBrowseCard(); }
  else if (e.key === "ArrowRight" && browseIdx < browseList.length-1) { browseIdx++; renderBrowseCard(); }
  else if (e.key === "Escape") { browseView = "grid"; renderBrowse(); }
});

(async function init(){
  loadAuth();
  if (authToken && authUser) {
    await afterLogin();
  } else {
    renderLogin();
  }
})();