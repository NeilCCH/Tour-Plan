// app.js — 旅遊規劃 App 的畫面與互動
// ---------------------------------------------------------------------------
// 第一步（現在）：資料主幹 + 手動輸入。
//   - 建立/管理「旅程 Trip」
//   - 在旅程底下手動新增「地點 Place」，依狀態分組顯示
//   - 資料存在手機本地（IndexedDB，見 db.js），完全離線可用
//
// 後續步驟會往上疊：地圖顯示 → 分享連結匯入 → 拖拉排行程 → 旅途記錄 → 遊記生成。
// 每一步都是往上加，不會打掉重練。
// ---------------------------------------------------------------------------

import { db, CATEGORIES, STATUSES, DEFAULT_STAY } from './db.js';
import { geocode, geocodeCandidates, legModes, modeEstimate, orderFromStart, nearestOrder, kmeansDays, orderClusters, haversine } from './geo.js';

const APP_VERSION = 'v80'; // 顯示在帳號視窗,方便確認手機跑的是哪一版
const app = document.getElementById('app');
const header = document.getElementById('header');

// ---- 小工具 ----------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 自繪 SVG 圖示（取代 emoji;單色,跟著文字顏色與大小）----------------------
const ICONS = {
  walk: '<circle cx="12" cy="4.2" r="1.7"/><path d="M12 7v5.5M12 9.2 9 11M12 9.2 15 10.7M12 12.5 9.6 19M12 12.5 14.4 19"/>',
  bus: '<rect x="4.5" y="4" width="15" height="12.5" rx="2.5"/><path d="M4.5 11h15M8.5 16.5V19M15.5 16.5V19"/><circle cx="8.5" cy="13.7" r=".7"/><circle cx="15.5" cy="13.7" r=".7"/>',
  metro: '<rect x="5" y="3.5" width="14" height="13" rx="3"/><path d="M5 11h14M9 16.5 7 20M15 16.5 17 20"/><circle cx="9" cy="13.8" r=".8"/><circle cx="15" cy="13.8" r=".8"/>',
  car: '<path d="M4 13 6 8.2A2 2 0 0 1 7.8 7h8.4a2 2 0 0 1 1.8 1.2L20 13"/><rect x="3.5" y="12.5" width="17" height="5" rx="2"/><circle cx="7.5" cy="17.6" r="1.3"/><circle cx="16.5" cy="17.6" r="1.3"/>',
  plane: '<path d="M21 15.5 13.5 12V6a1.5 1.5 0 0 0-3 0v6L3 15.5v2l7.5-2v3l-2 1.4V22l3-1 3 1v-1.6l-2-1.4v-3l7.5 2z"/>',
  ship: '<path d="M4 14 5.5 9.7h13L20 14M6.5 9.7V6.6h5V9.7M12 4.2v2.4M3.4 15c1.4 1.7 2.9 1.7 4.3 0s2.9-1.7 4.3 0 2.9 1.7 4.3 0"/>',
  pin: '<path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.3 2"/>',
  cash: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.6 9.4a2.2 2.2 0 0 1 2.1-1.5h.8a2 2 0 0 1 0 4h-1a2 2 0 0 0 0 4h.8a2.2 2.2 0 0 0 2.1-1.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><rect x="6.8" y="12.3" width="4" height="4" rx="1.2"/>',
  chevrons: '<path d="M5 6.5l5 5.5-5 5.5M11 6.5l5 5.5-5 5.5M17 6.5l5 5.5-5 5.5"/>',
  hotel: '<path d="M3.5 7v12M3.5 13.5h17V19M20.5 19v-4a2.5 2.5 0 0 0-2.5-2.5H9.5V15"/><circle cx="7" cy="11" r="1.6"/>',
  suitcase: '<rect x="4" y="7.5" width="16" height="12.5" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M4 13.5h16"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.5.3l2-2a4 4 0 0 0-5.6-5.6l-1 .9"/><path d="M14 11a4 4 0 0 0-5.5-.3l-2 2a4 4 0 0 0 5.6 5.6l1-.9"/>',
  pushpin: '<path fill-rule="evenodd" d="M12 2a6.5 6.5 0 0 0-6.5 6.5C5.5 13 12 21 12 21s6.5-8 6.5-12.5A6.5 6.5 0 0 0 12 2zm0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>',
  sparkle: '<path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2V20z"/><path d="M14.5 7.5l2.8 2.8"/>',
  camera: '<path d="M4 8.8A2 2 0 0 1 6 6.8h1.3l.9-1.5a1 1 0 0 1 .9-.5h5.8a1 1 0 0 1 .9.5l.9 1.5H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.6" r="3.1"/>',
};
const FILLED = new Set(['pushpin', 'sparkle', 'plane']);
function ic(name) {
  const p = ICONS[name]; if (!p) return '';
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  const stroke = FILLED.has(name) ? 'none' : 'currentColor';
  return `<span class="ic"><svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
}

// 依需要載入 Leaflet 地圖(使用者瀏覽器從 CDN 取得,只載一次)
let _leafletPromise = null;
function loadLeaflet() {
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = (async () => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const mod = await import('https://esm.sh/leaflet@1.9.4');
    return mod.default || mod;
  })();
  return _leafletPromise;
}

// ---- 顏色:交通模式、地點分類各給一色(淺色塊)------------------------------
const MODE_COLORS = { walk: '#22b34a', bus: '#f97316', metro: '#8b5cf6', car: '#3b82f6', plane: '#0ea5e9', ship: '#0891b2' };
const CATEGORY_COLORS = { 景點: '#22b34a', 美食: '#f97316', 住宿: '#8b5cf6', 交通: '#3b82f6', 購物: '#ec4899', 其他: '#94a3b8' };
const catTag = (c) => `<span class="tag cat" style="--c:${CATEGORY_COLORS[c] || '#64748b'}">${esc(c)}</span>`;

// ---- 主要旅遊國家:供國旗顯示 + 定位搜尋限定國別 ----------------------------
// code 是 ISO 3166-1 兩碼(Nominatim 的 countrycodes 也用它)。常見旅遊目的地。
const COUNTRIES = [
  { code: 'JP', name: '日本' }, { code: 'KR', name: '韓國' }, { code: 'TW', name: '台灣' },
  { code: 'CN', name: '中國' }, { code: 'HK', name: '香港' }, { code: 'MO', name: '澳門' },
  { code: 'TH', name: '泰國' }, { code: 'VN', name: '越南' }, { code: 'SG', name: '新加坡' },
  { code: 'MY', name: '馬來西亞' }, { code: 'ID', name: '印尼' }, { code: 'PH', name: '菲律賓' },
  { code: 'KH', name: '柬埔寨' }, { code: 'IN', name: '印度' }, { code: 'AE', name: '阿聯(杜拜)' },
  { code: 'TR', name: '土耳其' }, { code: 'US', name: '美國' }, { code: 'CA', name: '加拿大' },
  { code: 'GB', name: '英國' }, { code: 'FR', name: '法國' }, { code: 'DE', name: '德國' },
  { code: 'IT', name: '義大利' }, { code: 'ES', name: '西班牙' }, { code: 'CH', name: '瑞士' },
  { code: 'NL', name: '荷蘭' }, { code: 'AT', name: '奧地利' }, { code: 'CZ', name: '捷克' },
  { code: 'AU', name: '澳洲' }, { code: 'NZ', name: '紐西蘭' }, { code: 'EG', name: '埃及' },
];
const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name || '';
// 各國常用幣別(旅途花費預設帶入,可自行改)
const CURRENCY = {
  JP: 'JPY', KR: 'KRW', TW: 'NTD', CN: 'CNY', HK: 'HKD', MO: 'MOP', TH: 'THB', VN: 'VND',
  SG: 'SGD', MY: 'MYR', ID: 'IDR', PH: 'PHP', KH: 'KHR', IN: 'INR', AE: 'AED', TR: 'TRY',
  US: 'USD', CA: 'CAD', GB: 'GBP', FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', AT: 'EUR',
  NL: 'EUR', CH: 'CHF', CZ: 'CZK', AU: 'AUD', NZ: 'NZD', EG: 'EGP',
};
const countryCurrency = (code) => CURRENCY[code] || '';
// 幣別下拉選單:常用旅遊幣別排前面(值就是花費前面顯示的字串)
const CURRENCIES = [
  { v: 'NTD', name: '台幣 NTD' }, { v: 'JPY', name: '日圓 JPY' }, { v: 'KRW', name: '韓元 KRW' },
  { v: 'USD', name: '美元 USD' }, { v: 'THB', name: '泰銖 THB' }, { v: 'HKD', name: '港幣 HKD' },
  { v: 'MOP', name: '澳門幣 MOP' }, { v: 'CNY', name: '人民幣 CNY' }, { v: 'SGD', name: '新加坡幣 SGD' },
  { v: 'MYR', name: '馬幣 MYR' }, { v: 'VND', name: '越南盾 VND' }, { v: 'IDR', name: '印尼盾 IDR' },
  { v: 'PHP', name: '菲國披索 PHP' }, { v: 'EUR', name: '歐元 EUR' }, { v: 'GBP', name: '英鎊 GBP' },
  { v: 'AUD', name: '澳幣 AUD' }, { v: 'NZD', name: '紐幣 NZD' }, { v: 'CAD', name: '加幣 CAD' },
  { v: 'CHF', name: '瑞士法郎 CHF' }, { v: 'TRY', name: '土耳其里拉 TRY' }, { v: 'AED', name: '阿聯迪拉姆 AED' },
  { v: 'INR', name: '印度盧比 INR' }, { v: 'EGP', name: '埃及鎊 EGP' },
];
// 產生幣別選項;selected 若不在清單內(舊資料)也補進去
function currencyOptions(selected) {
  const list = CURRENCIES.slice();
  if (selected && !list.some((c) => c.v === selected)) list.unshift({ v: selected, name: selected });
  return `<option value="">(不填)</option>`
    + list.map((c) => `<option value="${esc(c.v)}" ${c.v === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}
// ISO 兩碼 → 國旗 emoji(用區域指示符號組成;iOS 會顯示成真正的旗子)
function flagOf(code) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function fmtDateRange(a, b) {
  if (!a && !b) return '尚未設定日期';
  if (a && b) return `${a} – ${b}`;
  return a || b;
}
// 日期區:三個「右側三角形」色塊(同色系深→淺)—— 日曆 / 出發日 / 回程日,取代箭頭
function dateFlowHtml(a, b) {
  const ico = `<span class="df seg-ico" style="--c:#0d7d76">${ic('calendar')}</span>`;
  if (!a && !b) return `<div class="dateflow">${ico}<span class="df seg-b" style="--c:#81d8d0">尚未設定日期</span></div>`;
  const start = a || b, end = (a && b) ? b : '';
  let s = `<div class="dateflow">${ico}<span class="df seg-a" style="--c:#14b8a6">${esc(start)}</span>`;
  if (end) s += `<span class="df seg-b" style="--c:#81d8d0">${esc(end)}</span>`;
  return s + `</div>`;
}

function stayText(min) {
  if (!min) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} 小時${m ? ` ${m} 分` : ''}` : `${m} 分`;
}

// 時間顯示單位（'min' 只用分 / 'hr' 滿 60 分改用小時,例如 90 分→1.5 小時）
let timeUnit = localStorage.getItem('timeUnit') || 'hr';
function fmtTime(min) {
  if (!min) return '0 分';
  if (timeUnit === 'min' || min < 60) return `${min} 分`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} 小時`;
}

// 目前登入者(從 localStorage 還原,讓離線/重開時也知道是誰;登入狀態變動時更新)
let currentUser = localStorage.getItem('authUserId')
  ? { id: localStorage.getItem('authUserId'), email: localStorage.getItem('authUserEmail') || '' }
  : null;
let nickname = localStorage.getItem('authNickname') || '';
const displayName = () => nickname || (currentUser?.email ? currentUser.email.split('@')[0] : '');

// 其他使用者的暱稱快取(顯示發起人/協作者名稱)
const profileCache = {};
async function ensureNames(ids) {
  const missing = ids.filter((id) => id && !(id in profileCache));
  if (!missing.length || !cloud || !cloud.getProfiles) return;
  missing.forEach((id) => { profileCache[id] = profileCache[id] || null; }); // 佔位避免重覆抓
  const profs = await cloud.getProfiles(missing).catch(() => []);
  profs.forEach((p) => { profileCache[p.id] = p; });
  render();
}
function nameFor(id) {
  if (!id) return '';
  if (id === currentUser?.id) return displayName();
  const p = profileCache[id];
  return p ? (p.nickname || p.email || '協作者') : '協作者';
}

function setHeader(title, showBack) {
  header.classList.toggle('has-back', !!showBack);
  header.querySelector('h1').textContent = title;
}

// ---- 路由 ------------------------------------------------------------------
function parseRoute() {
  const h = location.hash.replace(/^#/, '');
  const jm = h.match(/^\/join\/([^/]+)\/(.+)$/);
  if (jm) return { view: 'join', tripId: jm[1], code: jm[2] };
  const sm = h.match(/^\/share\/(.+)$/);
  if (sm) return { view: 'share', tripId: sm[1] };
  const m = h.match(/^\/trip\/(.+)$/);
  if (m) return { view: 'trip', tripId: m[1] };
  return { view: 'home' };
}

// 我是否能存取這趟(擁有者或協作成員)
function canAccess(trip) {
  return !!trip && currentUser
    && (trip.ownerId === currentUser.id || (trip.members || []).includes(currentUser.id));
}

// ---- 協作即時狀態(Realtime)------------------------------------------------
let joinedTripId = null;
let presencePeers = [];   // 目前也在這趟的其他人 [{id,nickname}]
let editingBy = {};       // userId -> { placeId, nickname }:誰正在編輯哪個地點

function ensureTripPresence(tripId) {
  if (!cloud || !cloud.joinTripChannel || !currentUser) return;
  if (joinedTripId === tripId) return;
  leaveTripPresence();
  joinedTripId = tripId; presencePeers = []; editingBy = {};
  cloud.joinTripChannel(tripId, { id: currentUser.id, nickname: displayName() }, {
    onChanged: () => { cloud.fullSync().then(() => render()).catch(() => {}); },
    onPresence: (state) => {
      const peers = [], ids = new Set();
      Object.values(state || {}).forEach((arr) => arr.forEach((p) => {
        ids.add(p.id);
        if (p.id !== currentUser.id) { peers.push(p); markSeen(tripId, p.id); } // 看到就記時間
      }));
      presencePeers = peers;
      for (const uid of Object.keys(editingBy)) if (!ids.has(uid)) delete editingBy[uid]; // 離線者清掉編輯中
      render();
    },
    onEditing: (p) => {
      if (!p || p.id === currentUser.id) return;
      markSeen(tripId, p.id);
      if (p.placeId) editingBy[p.id] = { placeId: p.placeId, nickname: p.nickname };
      else delete editingBy[p.id];
      render();
    },
  });
}
function leaveTripPresence() {
  if (cloud && cloud.leaveTripChannel) cloud.leaveTripChannel();
  joinedTripId = null; presencePeers = []; editingBy = {};
}
function editingNames(placeId) {
  return Object.values(editingBy).filter((e) => e.placeId === placeId).map((e) => e.nickname || '協作者');
}

// 記錄「上次看到某協作者在線/編輯」的時間(裝置本地;協作名單離線時顯示用)
let presenceSeen = (() => { try { return JSON.parse(localStorage.getItem('presenceSeen') || '{}'); } catch { return {}; } })();
function markSeen(tripId, userId) {
  if (!tripId || !userId) return;
  presenceSeen[`${tripId}:${userId}`] = Date.now();
  try { localStorage.setItem('presenceSeen', JSON.stringify(presenceSeen)); } catch {}
}
function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '剛剛';
  const m = Math.floor(s / 60); if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo} 個月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

async function render() {
  const r = parseRoute();
  // 離開某趟行程時,退出它的即時協作頻道
  if (joinedTripId && !(r.view === 'trip' && r.tripId === joinedTripId)) { leaveTripPresence(); stopProximity(); }
  // 公開分享頁:任何人(含未登入)都能唯讀檢視
  if (r.view === 'share') { await renderSharedTrip(r.tripId); return; }
  // 加入協作:需登入,加入後導向該行程
  if (r.view === 'join') { await renderJoin(r.tripId, r.code); return; }
  // 未登入:一律顯示登入畫面,看不到任何行程
  if (!currentUser) { renderLoginGate(); return; }
  if (r.view === 'trip') {
    const trip = await db.getTrip(r.tripId);
    // 找不到,或不是我能存取的行程(非擁有者也非協作者)→ 回首頁
    if (!trip || !canAccess(trip)) { location.hash = ''; return; }
    await renderTrip(trip);
  } else {
    await renderHome();
  }
}

// 未登入的把關畫面
function renderLoginGate() {
  setHeader('旅遊規劃', false);
  app.innerHTML = `
    <div class="empty">
      <div class="big">${ic('suitcase')}</div>
      <p><b>請先登入</b><br>登入後才能建立與檢視你的行程。<br>你的行程只有你自己看得到。</p>
      <button class="btn primary" id="gate-login" style="max-width:16rem;margin:1.2rem auto 0">登入 / 註冊</button>
    </div>`;
  app.querySelector('#gate-login').onclick = openAuthSheet;
  setFab(null);
}

// 公開分享的唯讀檢視(不需登入)
async function renderSharedTrip(id) {
  setHeader('分享的行程', false);
  setFab(null);
  app.innerHTML = `<div class="empty"><p>載入中…</p></div>`;
  if (!cloud) { try { cloud = await import('./sync.js'); } catch (_) {} }
  if (!cloud) { app.innerHTML = `<div class="empty"><p>無法載入(可能離線或被網路阻擋)。</p></div>`; return; }
  const trip = await cloud.fetchPublicTrip(id);
  if (!trip || trip.deleted) {
    app.innerHTML = `<div class="empty"><div class="big">${ic('suitcase')}</div>
      <p>找不到這個行程,<br>或它尚未開放公開分享。</p></div>`;
    return;
  }
  const places = await cloud.fetchPublicPlaces(id);
  app.innerHTML = sharedView(trip, places);
}

function sharedView(trip, places) {
  const dayCount = tripDayCount(trip, places);
  const byId = new Map(places.map((p) => [p.id, p]));
  const anchors = anchorIdSet(trip);
  const datesFixed = !!(trip.startDate && trip.endDate);

  let html = `
    <div class="trip-hero">
      <div style="font-size:1.4rem;font-weight:800;margin-bottom:.5rem">${esc(trip.name)}</div>
      ${dateFlowHtml(trip.startDate, trip.endDate)}
      <div class="stats">
        <div class="stat" style="--c:#3b82f6"><div class="v">${dayCount}</div><div class="l">天</div></div>
        <div class="stat" style="--c:#14b8a6"><div class="v">${trip.people || 1}</div><div class="l">人</div></div>
        <div class="stat" style="--c:#8b5cf6"><div class="v">${places.length}</div><div class="l">地點</div></div>
      </div>
      <div class="meta" style="margin-top:.7rem">唯讀分享・不可編輯</div>
    </div>`;

  for (let day = 1; day <= dayCount; day++) {
    const color = dayColor(day);
    const date = datesFixed ? dayDateLabel(trip.startDate, day) : '未設定日期';
    html += `<div class="day-head" style="--dc:${color}"><span class="num">Day ${day}</span><span class="date">${date}</span></div>`;
    const startP = (day > 1 && trip.dayStart?.[day]) ? byId.get(trip.dayStart[day]) : null;
    const endP = (day < dayCount && trip.dayEnd?.[day]) ? byId.get(trip.dayEnd[day]) : null;
    const sights = places.filter((p) => p.assignedDay === day && !anchors.has(p.id))
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const chain = [];
    if (startP) chain.push(['出發', startP]);
    sights.forEach((p) => chain.push(['sight', p]));
    if (endP) chain.push(['回程', endP]);
    if (chain.length === 0) { html += `<div class="day-empty">這天沒有安排</div>`; continue; }
    chain.forEach(([kind, p], idx) => {
      if (idx > 0) html += legHtml(chain[idx - 1][1], p);
      if (kind === 'sight') {
        const bits = placeMetaBits(p);
        html += `<div class="card" style="cursor:default">
          <h3>${p.pinned ? `<span class="pin-badge">${ic('pushpin')}</span>` : ''}${esc(p.name)} ${catTag(p.category)}</h3>
          ${bits.length ? `<div class="meta">${bits.join(' ・ ')}</div>` : ''}
          ${p.notes ? `<div class="meta">${esc(p.notes)}</div>` : ''}</div>`;
      } else {
        html += `<div class="card anchor" style="cursor:default">${ic('hotel')} ${kind}・${esc(p.name)}</div>`;
      }
    });
  }
  return html;
}

// 加入協作:憑邀請連結把自己加入該行程,成功後導向行程
async function renderJoin(tripId, code) {
  setHeader('加入協作', false);
  setFab(null);
  if (!currentUser) {
    app.innerHTML = `
      <div class="empty">
        <div class="big">${ic('link')}</div>
        <p><b>你被邀請一起編輯行程</b><br>請先登入或註冊,再加入協作。</p>
        <button class="btn primary" id="join-login" style="max-width:16rem;margin:1.2rem auto 0">登入 / 註冊</button>
      </div>`;
    app.querySelector('#join-login').onclick = openAuthSheet; // 登入後會重繪,回到本頁自動繼續
    return;
  }
  app.innerHTML = `<div class="empty"><p>加入中…</p></div>`;
  if (!cloud) { try { cloud = await import('./sync.js'); } catch (_) {} }
  if (!cloud) { app.innerHTML = `<div class="empty"><p>無法載入(可能離線或被網路阻擋)。</p></div>`; return; }
  const { error } = await cloud.joinTrip(tripId, code);
  if (error) {
    app.innerHTML = `<div class="empty"><div class="big">${ic('suitcase')}</div>
      <p>加入失敗:${esc(error.message || '邀請連結無效或已失效')}</p>
      <button class="btn ghost" id="join-home" style="max-width:16rem;margin:1rem auto 0">回首頁</button></div>`;
    app.querySelector('#join-home').onclick = () => { location.hash = ''; };
    return;
  }
  await cloud.fullSync().catch(() => {}); // 拉下這趟共享行程
  location.hash = `#/trip/${tripId}`;
}

// ---- 首頁：旅程列表 --------------------------------------------------------
async function renderHome() {
  setHeader('我的旅程', false);
  // 依出發日期排序:先出發的在最上面;未設定出發日的排在最後(日期字串 YYYY-MM-DD 可直接比大小)
  const trips = (await db.listTrips(currentUser.id))
    .sort((a, b) => (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31'));
  const greeting = `<div class="greeting"><b>${esc(displayName())}</b>,您好</div>`;

  if (trips.length === 0) {
    app.innerHTML = greeting + `
      <div class="empty">
        <div class="big">${ic('suitcase')}</div>
        <p>還沒有旅程。<br>點右下角的 <b>＋</b> 建立第一趟旅程。</p>
      </div>`;
  } else {
    // 每趟旅程附帶地點數量
    const counts = await Promise.all(trips.map((t) => db.listPlaces(t.id).then((p) => p.length)));
    app.innerHTML = greeting + trips.map((t, i) => `
      <div class="card trip" data-trip="${esc(t.id)}" style="--tc:${dayColor(i + 1)}">
        ${t.country ? `<span class="flag" title="${esc(countryName(t.country))}">${flagOf(t.country)}</span>` : ''}
        <h3>${esc(t.name)}${t.ownerId !== currentUser.id ? ' <span class="tag">協作</span>' : ''}</h3>
        <div class="meta">${esc(fmtDateRange(t.startDate, t.endDate))} ・ ${t.people} 人 ・ ${counts[i]} 個地點</div>
      </div>`).join('');
    app.querySelectorAll('[data-trip]').forEach((c) =>
      c.addEventListener('click', () => { location.hash = `#/trip/${c.dataset.trip}`; }));
  }

  setFab(() => openTripSheet());
}

// ---- 旅程頁：清單 / 行程 兩個分頁 ------------------------------------------
let tripTab = 'list'; // 'list' 依狀態分組的清單 ・ 'plan' 依天數排的行程

// 這趟有幾天:有起訖日就照日期算,否則用 trip.dayCount / 已用到的最大天數
function tripDayCount(trip, places) {
  if (trip.startDate && trip.endDate) {
    const d = Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / 86400000) + 1;
    if (d >= 1 && d <= 60) return d;
  }
  const maxDay = places.reduce((m, p) => Math.max(m, p.assignedDay || 0), 0);
  return Math.max(1, trip.dayCount || maxDay || 1);
}

function dayDateLabel(startDate, day) {
  const d = new Date(startDate); d.setDate(d.getDate() + (day - 1));
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${wd}）`;
}

function placeMetaBits(p) {
  const bits = [];
  // 交通班次:顯示航班/車次與搭乘時間
  if (p.category === '交通' && (p.flightNo || p.airline || p.departAt)) {
    const label = `${p.airline || ''} ${p.flightNo || ''}`.trim();
    if (label) bits.push(`${ic('plane')} ${esc(label)}`);
    const t = timeOfDatetime(p.departAt);
    if (t != null) bits.push(`${ic('clock')} 搭乘 ${min2hm(t)}`);
  }
  if (p.estimatedStay) bits.push(`${ic('clock')} ${fmtTime(p.estimatedStay)}`);
  if (p.estimatedCost) bits.push(`${ic('cash')} ${p.estimatedCost}`);
  return bits;
}

// 「清單」分頁:依狀態分組（原本的樣子）
function listBody(places, trip) {
  const anchors = anchorIdSet(trip);
  // 已被設為某天出發/回程的住宿,視為「已排入行程」,不再列在「候選」
  const effStatus = (p) => (anchors.has(p.id) && p.status === '候選') ? '已排入' : p.status;
  let body = '';
  for (const status of STATUSES) {
    const group = places.filter((p) => effStatus(p) === status);
    if (group.length === 0) continue;
    body += `<div class="section-title"><span class="dot st-${esc(status)}"></span> ${esc(status)}（${group.length}）</div>`;
    body += group.map((p) => {
      const bits = placeMetaBits(p);
      if (p.openingHours) bits.push(`${ic('clock')} ${esc(p.openingHours)}`);
      return `
        <div class="card" data-place="${esc(p.id)}">
          <h3>${p.pinned ? `<span class="pin-badge">${ic('pushpin')}</span>` : ''}${esc(p.name)}
            ${catTag(p.category)}</h3>
          ${bits.length ? `<div class="meta">${bits.join(' ・ ')}</div>` : ''}
          ${p.notes ? `<div class="meta">${esc(p.notes)}</div>` : ''}
        </div>`;
    }).join('');
  }
  return body;
}

const hasCoord = (p) => p && p.lat != null && p.lng != null;

// 所有被設為某天「出發/回程」錨點的地點 id
function anchorIdSet(trip) {
  const s = new Set();
  for (const m of [trip.dayStart, trip.dayEnd]) {
    if (m) for (const k of Object.keys(m)) if (m[k]) s.add(m[k]);
  }
  return s;
}

// 兩點之間的多模式交通估時（大、可愛的膠囊;兩點都已定位才顯示）
// 若目的地是交通類且指定了交通方式(飛機/渡輪/高鐵…),只顯示該方式的估時。
function legHtml(a, b) {
  if (!(hasCoord(a) && hasCoord(b))) return '';
  const km = haversine(a, b) * 1.25;
  const kmTxt = km < 1 ? '<1 km' : `${km.toFixed(1)} km`;
  let modes, single = false;
  if (b && b.category === '交通' && b.transitMode && b.transitMode !== '自動') {
    const est = modeEstimate(b.transitMode, a, b);
    if (est) { modes = [est]; single = true; } else modes = legModes(a, b).modes;
  } else {
    modes = legModes(a, b).modes;
  }
  const pills = modes.map((m) => `<span class="mp" style="--c:${MODE_COLORS[m.key] || '#1f6feb'}">${ic(m.key)}${fmtTime(m.minutes)}${single && m.label ? ' ' + esc(m.label) : ''}</span>`).join('');
  return `<div class="leg"><span class="km">${ic('pin')} ${kmTxt}</span>${pills}</div>`;
}

function sightCard(p, i, n) {
  const bits = placeMetaBits(p);
  const editing = editingNames(p.id);
  return `
    <div class="card itin" data-move="${esc(p.id)}">
      <div class="itin-main">
        <h3>${p.pinned ? `<span class="pin-badge">${ic('pushpin')}</span>` : ''}${esc(p.name)}
          ${catTag(p.category)}</h3>
        ${bits.length ? `<div class="meta">${bits.join(' ・ ')}</div>` : ''}
        ${editing.length ? `<div class="editing">${esc(editing.join('、'))} 編輯中…</div>` : ''}
      </div>
      <div class="reorder">
        <button data-up="${esc(p.id)}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button data-down="${esc(p.id)}" ${i === n - 1 ? 'disabled' : ''}>▼</button>
      </div>
    </div>`;
}

function anchorRow(role, p) {
  const warn = hasCoord(p) ? '' : ' <span class="warn">未定位</span>';
  return `<div class="card anchor" data-move="${esc(p.id)}">${ic('hotel')} ${role}・${esc(p.name)}${warn}</div>`;
}

// 每一天的代表色(讓每日視覺辨識更明顯)
const DAY_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316', '#22b34a', '#06b6d4', '#a855f7', '#f59e0b', '#6366f1'];
const dayColor = (d) => DAY_COLORS[(d - 1) % DAY_COLORS.length];
function shade(hex) { // 把顏色調暗一點,給漸層用
  const n = parseInt(hex.slice(1), 16);
  const f = 0.72;
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}
let planDay = 'pool'; // 「行程」分頁預設先看「候選」;之後可切到某天(數字)

function poolCard(p) {
  const hint = p.category === '住宿' ? '點一下 → 設為某天的出發/回程點' : '點一下 → 排進某一天';
  return `
    <div class="card" data-move="${esc(p.id)}">
      <h3>${p.pinned ? `<span class="pin-badge">${ic('pushpin')}</span>` : ''}${esc(p.name)}
        ${catTag(p.category)}</h3>
      <div class="meta">${hint}</div>
    </div>`;
}

// ---- 行程時間軸的時間工具 ----
const hm2min = (hm) => { const m = /(\d{1,2}):(\d{2})/.exec(hm || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const min2hm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const timeOfDatetime = (dt) => { const m = /T(\d{2}):(\d{2})/.exec(dt || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
// 兩點之間給時間軸用的單一交通估時:有指定方式用指定的;否則有飛機用飛機,再否則駕車;沒定位回 null
function legMin(a, b) {
  if (!(hasCoord(a) && hasCoord(b))) return null;
  if (b && b.category === '交通' && b.transitMode && b.transitMode !== '自動') {
    const est = modeEstimate(b.transitMode, a, b);
    if (est) return est.minutes;
  }
  const { modes } = legModes(a, b);
  return (modes.find((m) => m.key === 'plane') || modes.find((m) => m.key === 'car') || modes[0]).minutes;
}

// 「行程」分頁:上面日期分頁條,下面顯示選中那一天(每天 出發→景點→回程)
function planBody(trip, places, dayCount) {
  const datesFixed = !!(trip.startDate && trip.endDate);
  const byId = new Map(places.map((p) => [p.id, p]));
  const anchors = anchorIdSet(trip);
  if (planDay !== 'pool' && planDay > dayCount) planDay = 1;

  let body = `<button class="btn primary" id="suggest" style="margin-bottom:12px">${ic('sparkle')} 建議安排</button>`;

  const pool = places.filter((p) => !p.assignedDay && !anchors.has(p.id)).sort((a, b) => a.createdAt - b.createdAt);

  // 「候選」放到 Day 之上,與「時間顯示」同一行
  body += `<div class="plan-top">
    <button class="day-pill ${planDay === 'pool' ? 'on' : ''}" data-day="pool" ${planDay === 'pool' ? 'style="background:#64748b"' : ''}>候選 ${pool.length}</button>
    <span class="unit-inline">時間顯示
      <span class="seg">
        <button class="seg-btn ${timeUnit === 'min' ? 'on' : ''}" data-unit="min">分</button>
        <button class="seg-btn ${timeUnit === 'hr' ? 'on' : ''}" data-unit="hr">時</button>
      </span></span>
  </div>`;

  // 日期分頁條(只有各天)
  body += `<div class="day-strip">`;
  for (let d = 1; d <= dayCount; d++) {
    const on = planDay === d;
    body += `<button class="day-pill ${on ? 'on' : ''}" data-day="${d}" ${on ? `style="background:${dayColor(d)}"` : ''}>Day ${d}</button>`;
  }
  if (!datesFixed) body += `<button class="day-pill" id="add-day">＋</button>`;
  body += `</div>`;

  // 候選池
  if (planDay === 'pool') {
    if (pool.length === 0) body += `<div class="day-empty">沒有待排的地點。到「清單」按右下 ＋ 新增。</div>`;
    else body += pool.map(poolCard).join('');
    return body;
  }

  // 某一天
  const day = planDay;
  const color = dayColor(day);
  const date = datesFixed ? dayDateLabel(trip.startDate, day) : '未設定日期';
  body += `<div class="day-head" style="--dc:${color}">
    <span class="num">Day ${day}</span><span class="date">${date}</span>
    <label class="day-start">${ic('clock')} 出發<input type="time" id="day-start-time" value="${esc(trip.dayStartTime?.[day] || '')}"></label>
  </div>`;

  // 第一天不放「出發飯店」,最後一天不放「回程飯店」
  const startP = (day > 1 && trip.dayStart?.[day]) ? byId.get(trip.dayStart[day]) : null;
  const endP = (day < dayCount && trip.dayEnd?.[day]) ? byId.get(trip.dayEnd[day]) : null;
  const sights = places.filter((p) => p.assignedDay === day && !anchors.has(p.id))
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const chain = [];
  if (startP) chain.push(['出發', startP]);
  sights.forEach((p) => chain.push(['sight', p]));
  if (endP) chain.push(['回程', endP]);

  // 時間軸:有設「出發時間」才推算(起點時間 + 停留 + 交通估時;有訂位班次以其時間為錨)
  let clock = hm2min(trip.dayStartTime?.[day]);
  const timed = clock != null;

  if (chain.length === 0) {
    body += `<div class="day-empty">這天還沒安排 — 切到「候選」把地點排進來。</div>`;
  } else {
    chain.forEach(([kind, p], idx) => {
      if (idx > 0) {
        body += legHtml(chain[idx - 1][1], p);
        if (timed) { const lm = legMin(chain[idx - 1][1], p); if (lm != null) clock += lm; }
      }
      // 這一站的時間標籤
      let badge = '';
      if (timed) {
        if (idx === 0 && kind === '出發') {
          badge = `出發 ${min2hm(clock)}`;
        } else if (kind === 'sight' && p.category === '交通' && p.departAt) {
          const board = timeOfDatetime(p.departAt), dest = timeOfDatetime(p.arriveAt), atStation = clock;
          const late = board != null && atStation > board + 1;
          clock = dest != null ? dest : (board != null ? board + (p.estimatedStay || 0) : clock + (p.estimatedStay || 0));
          badge = `搭乘 ${board != null ? min2hm(board) : '—'}${dest != null ? ` → 抵達 ${min2hm(dest)}` : ''}`
            + (late ? ` ⚠ 推算到站 ${min2hm(atStation)},可能趕不上` : '');
        } else if (kind === 'sight') {
          const arrive = clock; clock += (p.estimatedStay || 0);
          badge = `抵 ${min2hm(arrive)} · 離 ${min2hm(clock)}`;
        } else if (kind === '回程') {
          badge = `回到 ${min2hm(clock)}`;
        }
      }
      if (badge) body += `<div class="tl-time${/⚠/.test(badge) ? ' warn' : ''}">${ic('clock')} ${badge}</div>`;
      if (kind === 'sight') body += sightCard(p, sights.indexOf(p), sights.length);
      else body += anchorRow(kind, p);
    });
    if (sights.length) {
      const stay = sights.reduce((s, p) => s + (p.estimatedStay || 0), 0);
      const cost = sights.reduce((s, p) => s + (p.estimatedCost || 0), 0);
      const full = stay > 600 ? ' ・ <span class="warn">這天有點滿</span>' : '';
      body += `<div class="day-sum">共 ${sights.length} 站 ・ ${ic('clock')} ${fmtTime(stay)} ・ ${ic('cash')} ${cost}${full}</div>`;
    }
  }
  return body;
}

async function renderTrip(trip) {
  setHeader(trip.name, true);
  ensureTripPresence(trip.id); // 加入即時協作頻道(在線狀態/即時同步/編輯中提示)
  ensureNames([trip.ownerId, ...(trip.members || [])]); // 抓發起人/協作者暱稱
  const places = await db.listPlaces(trip.id);
  const dayCount = tripDayCount(trip, places);

  const presenceBar = presencePeers.length
    ? `<div class="presence">${esc(presencePeers.map((p) => p.nickname || '協作者').join('、'))} 也在這趟</div>`
    : '';

  const head = presenceBar + `
    <div class="trip-hero">
      ${dateFlowHtml(trip.startDate, trip.endDate)}
      <div class="owner-line">發起人:${esc(nameFor(trip.ownerId))}${trip.ownerId === currentUser.id ? '（你）' : '　・你是協作者'}</div>
      <div class="stats">
        <div class="stat" style="--c:#3b82f6"><div class="v">${dayCount}</div><div class="l">天</div></div>
        <div class="stat" style="--c:#14b8a6"><div class="v">${trip.people}</div><div class="l">人</div></div>
        <div class="stat" style="--c:#8b5cf6"><div class="v">${places.length}</div><div class="l">地點</div></div>
      </div>
      <div class="hero-actions">
        <button class="btn ghost" style="--c:#0ea5e9" data-edit-trip-btn>${ic('edit')} 編輯旅程</button>
        <button class="btn ghost" style="--c:#f472b6" data-share-btn>${ic('link')} 分享 / 邀請協作</button>
      </div>
    </div>`;

  const tabs = `
    <div class="tabs">
      <button class="tab ${tripTab === 'list' ? 'on' : ''}" data-tab="list">清單</button>
      <button class="tab ${tripTab === 'plan' ? 'on' : ''}" data-tab="plan">行程</button>
      <button class="tab ${tripTab === 'trip' ? 'on' : ''}" data-tab="trip">旅途</button>
      <button class="tab ${tripTab === 'book' ? 'on' : ''}" data-tab="book">回顧</button>
    </div>`;
  let body, moments = [];
  if (tripTab === 'trip' || tripTab === 'book') {
    moments = await db.listMoments(trip.id);
    body = tripTab === 'book' ? bookBody(trip, places, moments) : momentBody(trip, places, moments);
  } else if (places.length === 0) {
    body = `
      <div class="empty">
        <div class="big">${ic('pin')}</div>
        <p>這趟旅程還沒有地點。<br>點右下角的 <b>＋</b> 手動新增第一個地點。</p>
      </div>`;
  } else {
    body = tripTab === 'plan' ? planBody(trip, places, dayCount) : listBody(places, trip);
  }
  app.innerHTML = head + tabs + body;

  // 分頁切換
  app.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { tripTab = b.dataset.tab; render(); }));
  app.querySelector('[data-edit-trip-btn]')?.addEventListener('click', () => openTripSheet(trip));
  app.querySelector('[data-share-btn]')?.addEventListener('click', () => openShareSheet(trip));

  // 清單卡片 → 編輯
  app.querySelectorAll('[data-place]').forEach((c) => {
    const p = places.find((x) => x.id === c.dataset.place);
    c.addEventListener('click', () => openPlaceSheet(trip.id, p));
  });

  // 行程卡片 → 開排程選單；上下箭頭 → 調順序
  app.querySelectorAll('[data-move]').forEach((c) => {
    const p = places.find((x) => x.id === c.dataset.move);
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-up],[data-down]')) return;
      openMoveSheet(trip, places, p, dayCount);
    });
  });
  app.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); reorder(places, places.find((x) => x.id === b.dataset.up), -1);
  }));
  app.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); reorder(places, places.find((x) => x.id === b.dataset.down), 1);
  }));
  // 時間單位切換
  app.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => {
    timeUnit = b.dataset.unit; localStorage.setItem('timeUnit', timeUnit); render();
  }));
  // 日期分頁切換
  app.querySelectorAll('.day-pill[data-day]').forEach((b) => b.addEventListener('click', () => {
    planDay = b.dataset.day === 'pool' ? 'pool' : Number(b.dataset.day);
    render();
  }));
  app.querySelector('#add-day')?.addEventListener('click', async () => {
    await db.updateTrip(trip.id, { dayCount: dayCount + 1 }); planDay = dayCount + 1; render();
  });
  // 每日出發時間:選擇過程完全不動作(避免任何重繪/同步打斷 iOS 時間選擇器);
  // 等選好、離開欄位(blur)才一次存檔 + 重繪時間軸。
  const dstInput = app.querySelector('#day-start-time');
  if (dstInput) {
    dstInput.addEventListener('blur', async () => {
      const cur = (trip.dayStartTime || {})[planDay] || '';
      if (dstInput.value === cur) return; // 沒改就不動
      const dst = { ...(trip.dayStartTime || {}) };
      if (dstInput.value) dst[planDay] = dstInput.value; else delete dst[planDay];
      await db.updateTrip(trip.id, { dayStartTime: dst });
      render();
    });
  }
  app.querySelector('#suggest')?.addEventListener('click', () => suggestArrange(trip, places, dayCount));

  if (tripTab === 'trip') wireMomentTab(trip, places, moments);
  if (tripTab === 'book') wireBookTab(trip, places, moments);
  if (proximityOn) { proximityPlaces = places; startProximity(trip); } // 任一分頁都可啟動靠近提示

  // 回顧頁不需要「新增」浮動鈕(它是唯讀整理),其餘分頁維持
  if (tripTab === 'book') setFab(null);
  else setFab(() => (tripTab === 'trip' ? openMomentSheet(trip, places) : openPlaceSheet(trip.id)));
}

// 建議安排:把「已定位」的地點依距離分成 dayCount 天,每天就近排序（PRD 4.2）
// 建議安排:兩種方式。預設「只優化每天順序」——不把地點跨日移動。
function suggestArrange(trip, places, dayCount) {
  openSheet(`
    <h2>${ic('sparkle')} 建議安排</h2>
    <p class="meta" style="margin-bottom:14px">選一種方式（都只影響已定位的景點）:</p>
    <div class="btn-row">
      <button class="btn primary" id="s-order">只優化每天順序
        <br><span style="font-weight:400;font-size:12.5px;opacity:.85">保留你分好的天,只把每天景點依距離就近重排（有出發點就從那裡起算）</span></button>
      <button class="btn ghost" id="s-recluster">跨日重新分配
        <br><span style="font-size:12.5px;opacity:.8">把所有已定位景點依距離重新分到各天（會改動你目前的分天）</span></button>
      <button class="btn ghost" id="s-cancel">取消</button>
    </div>
  `, (sheet, close) => {
    sheet.querySelector('#s-cancel').onclick = close;
    sheet.querySelector('#s-order').onclick = async () => { close(); await suggestOrderOnly(trip, places, dayCount); };
    sheet.querySelector('#s-recluster').onclick = async () => {
      close();
      if (!confirm('這會把所有已定位景點依距離「重新分到各天」,覆蓋你目前的分天安排。要繼續嗎?')) return;
      await suggestRecluster(trip, places, dayCount);
    };
  });
}

// 只優化每天順序:各天景點依距離就近重排,有出發點就從出發點起算。不跨日移動。
async function suggestOrderOnly(trip, places, dayCount) {
  const anchors = anchorIdSet(trip);
  const byId = new Map(places.map((p) => [p.id, p]));
  let touched = 0;
  for (let day = 1; day <= dayCount; day++) {
    const startP = trip.dayStart?.[day] ? byId.get(trip.dayStart[day]) : null;
    const startCoord = hasCoord(startP) ? { lat: startP.lat, lng: startP.lng } : null;
    const sights = places.filter((p) => p.assignedDay === day && !anchors.has(p.id));
    const located = sights.filter(hasCoord);
    const unlocated = sights.filter((p) => !hasCoord(p));
    if (located.length < 1) continue;
    const ordered = orderFromStart(located.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })), startCoord);
    const ids = [...ordered.map((o) => o.id), ...unlocated.map((u) => u.id)];
    for (let i = 0; i < ids.length; i++) { await db.updatePlace(ids[i], { orderIndex: i + 1 }); touched++; }
  }
  if (!touched) alert('沒有可排序的已定位景點。請先幫景點定位,並把景點排進某天。');
  render();
}

// 跨日重新分配:所有已定位景點依距離分成各天,每天再從出發點就近排序。
async function suggestRecluster(trip, places, dayCount) {
  const anchors = anchorIdSet(trip);
  const byId = new Map(places.map((p) => [p.id, p]));
  const located = places.filter((p) => !anchors.has(p.id) && hasCoord(p));
  if (located.length < 2) { alert('至少要有 2 個已定位的景點才能重新分配。'); return; }
  const clusters = orderClusters(kmeansDays(
    located.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })), dayCount));
  for (let d = 0; d < clusters.length; d++) {
    const day = d + 1;
    const startP = trip.dayStart?.[day] ? byId.get(trip.dayStart[day]) : null;
    const startCoord = hasCoord(startP) ? { lat: startP.lat, lng: startP.lng } : null;
    const ordered = orderFromStart(clusters[d], startCoord);
    for (let i = 0; i < ordered.length; i++) {
      const place = byId.get(ordered[i].id);
      const patch = { assignedDay: day, orderIndex: i + 1 };
      if (place.status === '候選') patch.status = '已排入';
      await db.updatePlace(ordered[i].id, patch);
    }
  }
  render();
}

// ---- 排程操作 --------------------------------------------------------------
// 排進某天:設 assignedDay、排到當天最後,並把「候選」自動轉「已排入」
async function assignToDay(trip, places, place, day) {
  const group = places.filter((p) => p.assignedDay === day);
  const patch = {
    assignedDay: day,
    orderIndex: group.reduce((m, p) => Math.max(m, p.orderIndex ?? 0), 0) + 1,
  };
  if (place.status === '候選') patch.status = '已排入';
  await db.updatePlace(place.id, patch);
  render();
}
// 移回候選池:清掉天數,並把「已排入」自動轉回「候選」（已造訪等狀態不動）
async function moveToPool(place) {
  const patch = { assignedDay: null, orderIndex: null };
  if (place.status === '已排入') patch.status = '候選';
  await db.updatePlace(place.id, patch);
  render();
}
// 同一天內上/下移
async function reorder(places, place, dir) {
  if (!place) return;
  const group = places.filter((p) => p.assignedDay === place.assignedDay)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const idx = group.findIndex((p) => p.id === place.id);
  const swap = idx + dir;
  if (swap < 0 || swap >= group.length) return;
  const a = group[idx], b = group[swap];
  const ao = a.orderIndex ?? idx, bo = b.orderIndex ?? swap;
  await db.updatePlace(a.id, { orderIndex: bo });
  await db.updatePlace(b.id, { orderIndex: ao });
  render();
}

// 複製一份地點到候選池（同名同座標,方便「同一機場進出」等重複使用的交通點）
async function duplicatePlace(trip, place) {
  return db.createPlace(trip.id, {
    name: place.name, category: place.category,
    lat: place.lat, lng: place.lng, source: place.source,
    estimatedStay: place.estimatedStay, estimatedCost: place.estimatedCost,
    openingHours: place.openingHours, referenceUrl: place.referenceUrl,
    notes: place.notes, coverImage: place.coverImage,
    assignedDay: null, orderIndex: null, status: '候選',
  });
}

function openMoveSheet(trip, places, place, dayCount) {
  if (place.category === '住宿') return openAnchorSheet(trip, place, dayCount);
  const cur = place.assignedDay || 0;
  const chips = [`<div class="chip ${cur === 0 ? 'on' : ''}" data-day="0">候選池</div>`];
  for (let d = 1; d <= dayCount; d++) {
    chips.push(`<div class="chip ${cur === d ? 'on' : ''}" data-day="${d}">Day ${d}</div>`);
  }
  // 交通類:提供「複製一份」,讓同一個機場/車站可以重複排(去程一份、回程一份)
  const dupHtml = place.category === '交通'
    ? `<button class="btn ghost" id="m-dup" style="--c:#3b82f6;color:var(--c)">${ic('link')} 複製一份(去程/回程重複用)</button>`
    : '';
  openSheet(`
    <h2>${esc(place.name)}</h2>
    <label class="field"><span class="lab">排到哪一天</span>
      <div class="chips" id="m-days">${chips.join('')}</div></label>
    <div class="btn-row">
      ${dupHtml}
      <button class="btn ghost" id="m-edit">編輯地點內容</button>
      <button class="btn ghost" id="m-cancel">關閉</button>
    </div>
  `, (sheet, close) => {
    sheet.querySelector('#m-days').addEventListener('click', async (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      const day = Number(chip.dataset.day);
      close();
      if (day === 0) await moveToPool(place);
      else await assignToDay(trip, places, place, day);
    });
    const dup = sheet.querySelector('#m-dup');
    if (dup) dup.onclick = async () => {
      close();
      const copy = await duplicatePlace(trip, place);
      render();
      const fresh = await db.listPlaces(trip.id);
      openMoveSheet(trip, fresh, copy, dayCount); // 立刻選要排到回程哪一天
    };
    sheet.querySelector('#m-edit').onclick = () => { close(); openPlaceSheet(trip.id, place); };
    sheet.querySelector('#m-cancel').onclick = close;
  });
}

// 住宿:設為某幾天的「出發點 / 回程點」。
// 便利:設某天「回程」會自動把隔天「出發」也設成同一間(睡哪就從哪出發);
// 「連住整趟」一鍵把每晚都設成這間。
function openAnchorSheet(trip, place, dayCount) {
  const dayStart = { ...(trip.dayStart || {}) };
  const dayEnd = { ...(trip.dayEnd || {}) };
  const gridHtml = () => {
    let r = '';
    for (let d = 1; d <= dayCount; d++) {
      // 第一天不需要出發飯店,最後一天不需要回程飯店
      const startBtn = d > 1
        ? `<button class="chip ${dayStart[d] === place.id ? 'on' : ''}" data-role="start" data-day="${d}">出發</button>`
        : '<span style="width:72px"></span>';
      const endBtn = d < dayCount
        ? `<button class="chip ${dayEnd[d] === place.id ? 'on' : ''}" data-role="end" data-day="${d}">回程</button>`
        : '<span style="width:72px"></span>';
      r += `<div class="anchor-day"><span>Day ${d}</span>${startBtn}${endBtn}</div>`;
    }
    return r;
  };
  const save = () => db.updateTrip(trip.id, { dayStart, dayEnd });

  openSheet(`
    <h2>${ic('hotel')} ${esc(place.name)}</h2>
    <p class="meta" style="margin-bottom:10px">設為哪幾天的出發點 / 回程點。設「回程」會自動把隔天「出發」也設成這間。${hasCoord(place) ? '' : '<b class="warn"> 此地點尚未定位,交通估算會缺這段。</b>'}</p>
    <button class="btn ghost" id="a-all" style="margin-bottom:8px">${ic('link')} 連住整趟（每晚都住這裡）</button>
    <div class="anchor-grid" id="anchor-grid">${gridHtml()}</div>
    <div class="btn-row">
      <button class="btn ghost" id="a-clear">清除此住宿的所有設定</button>
      <button class="btn ghost" id="m-edit">編輯地點內容</button>
      <button class="btn ghost" id="m-close">關閉</button>
    </div>
  `, (sheet, close) => {
    const grid = sheet.querySelector('#anchor-grid');
    const redraw = async () => { grid.innerHTML = gridHtml(); await save(); render(); };

    grid.addEventListener('click', async (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const day = Number(b.dataset.day), role = b.dataset.role;
      const map = role === 'start' ? dayStart : dayEnd;
      const on = map[day] !== place.id;
      if (on) map[day] = place.id; else delete map[day];
      // 自動串連:回程 → 次日出發同一間;取消回程則一併取消次日出發
      if (role === 'end' && day + 1 <= dayCount) {
        if (on) dayStart[day + 1] = place.id;
        else if (dayStart[day + 1] === place.id) delete dayStart[day + 1];
      }
      await redraw();
    });

    sheet.querySelector('#a-all').onclick = async () => {
      for (let d = 1; d <= dayCount; d++) {
        if (d < dayCount) dayEnd[d] = place.id;   // 每晚(最後一天不設回程)
        if (d > 1) dayStart[d] = place.id;        // 隔天出發(第一天不動)
      }
      await redraw();
    };
    sheet.querySelector('#a-clear').onclick = async () => {
      for (let d = 1; d <= dayCount; d++) {
        if (dayStart[d] === place.id) delete dayStart[d];
        if (dayEnd[d] === place.id) delete dayEnd[d];
      }
      await redraw();
    };
    sheet.querySelector('#m-edit').onclick = () => { close(); openPlaceSheet(trip.id, place); };
    sheet.querySelector('#m-close').onclick = () => { close(); render(); };
  });
}

// ---- 浮動新增鈕 ------------------------------------------------------------
let fab = null;
function setFab(handler) {
  if (!fab) {
    fab = document.createElement('button');
    fab.className = 'fab';
    fab.setAttribute('aria-label', '新增');
    fab.textContent = '＋';
    document.body.appendChild(fab);
  }
  if (!handler) { fab.style.display = 'none'; return; } // 未登入等情況隱藏
  fab.style.display = 'flex';
  fab.onclick = handler;
}

// ---- 底部彈出表單（sheet）--------------------------------------------------
function openSheet(innerHTML, onMount) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet"><div class="grabber"></div>${innerHTML}</div>`;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));

  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 250);
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  onMount(backdrop.querySelector('.sheet'), close);
}

// ---- 旅程表單 --------------------------------------------------------------
// 「編輯旅程」獨立分頁:只管旅程本身(名稱/日期/人數/國家),不含分享。
function openTripSheet(trip = null) {
  const editing = !!trip;
  openSheet(`
    <h2>${editing ? '編輯旅程' : '新增旅程'}</h2>
    <label class="field"><span class="lab">旅程名稱</span>
      <input id="f-name" placeholder="例如：關西五日" value="${esc(trip?.name || '')}"></label>
    <div class="row2">
      <label class="field"><span class="lab">出發日</span>
        <input id="f-start" type="date" value="${esc(trip?.startDate || '')}"></label>
      <label class="field"><span class="lab">回程日</span>
        <input id="f-end" type="date" value="${esc(trip?.endDate || '')}"></label>
    </div>
    <label class="field"><span class="lab">人數</span>
      <input id="f-people" type="number" min="1" inputmode="numeric" value="${esc(trip?.people || 1)}"></label>
    <label class="field"><span class="lab">主要旅遊國家（顯示國旗,並讓找地點更準)</span>
      <select id="f-country" class="select">
        <option value="">未設定</option>
        ${COUNTRIES.map((c) => `<option value="${c.code}" ${trip?.country === c.code ? 'selected' : ''}>${flagOf(c.code)} ${esc(c.name)}</option>`).join('')}
      </select></label>
    ${(!editing || trip.ownerId === currentUser?.id) ? `
    <label class="field"><span class="lab">照片雲端保存期限(必選,沒選照片不會上傳;到期只刪雲端,手機原圖保留)</span>
      <select id="f-retain" class="select">
        ${(() => { const cur = Number(editing ? (trip.photoRetentionDays ?? 0) : 0); return `<option value="" ${![90, 180].includes(cur) ? 'selected' : ''}>請選擇（必選才會上傳）</option><option value="90" ${cur === 90 ? 'selected' : ''}>3 個月</option><option value="180" ${cur === 180 ? 'selected' : ''}>6 個月</option>`; })()}
      </select></label>` : ''}
    <div class="btn-row">
      <button class="btn primary" id="f-save">${editing ? '儲存' : '建立旅程'}</button>
      ${editing && trip.ownerId === currentUser?.id ? '<button class="btn danger" id="f-del">刪除這趟旅程</button>' : ''}
      <button class="btn ghost" id="f-cancel">取消</button>
    </div>
  `, (sheet, close) => {
    sheet.querySelector('#f-cancel').onclick = close;
    sheet.querySelector('#f-save').onclick = async () => {
      const data = {
        name: sheet.querySelector('#f-name').value.trim(),
        startDate: sheet.querySelector('#f-start').value,
        endDate: sheet.querySelector('#f-end').value,
        people: sheet.querySelector('#f-people').value,
        country: sheet.querySelector('#f-country').value,
      };
      const retainSel = sheet.querySelector('#f-retain');
      if (retainSel) data.photoRetentionDays = Number(retainSel.value); // 只有擁有者能改
      if (!data.name) { sheet.querySelector('#f-name').focus(); return; }
      if (editing) await db.updateTrip(trip.id, data);
      else { const t = await db.createTrip({ ...data, ownerId: currentUser?.id }); location.hash = `#/trip/${t.id}`; }
      close(); render();
    };
    const delBtn = editing ? sheet.querySelector('#f-del') : null; // 只有發起人有這顆
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`確定刪除「${trip.name}」？底下所有地點與記錄都會一起刪除，無法復原。`)) return;
      await db.deleteTrip(trip.id);
      close(); location.hash = '';
    };
  });
}

// 「分享 / 邀請協作」獨立分頁:公開連結、邀請連結、Email 邀請、協作者名單(暱稱/在線/移除)。
function openShareSheet(trip) {
  const isOwner = trip.ownerId === currentUser?.id;
  openSheet(`
    <h2>${ic('link')} 分享 / 邀請協作</h2>
    <div class="toggle-row">
      <div><b>公開分享</b><div class="desc">開啟後,任何人有連結都能唯讀檢視這趟行程</div></div>
      <div class="chip ${trip.public ? 'on' : ''}" id="f-public">${trip.public ? '已公開' : '未公開'}</div>
    </div>
    <div id="f-sharelink" class="sharelink" style="${trip.public ? '' : 'display:none'}">
      <input id="f-shareurl" readonly value="${esc(location.origin + location.pathname + '#/share/' + trip.id)}">
      <button type="button" class="btn ghost" id="f-copy" style="width:auto;padding:.6rem 1rem">複製</button>
    </div>
    <div class="toggle-row">
      <div><b>邀請協作</b><div class="desc">產生連結,對方登入後可一起編輯</div></div>
      <button type="button" class="chip" id="f-invite">${trip.inviteCode ? '重新產生' : '產生連結'}</button>
    </div>
    <div id="f-invitelink" class="sharelink" style="${trip.inviteCode ? '' : 'display:none'}">
      <input id="f-inviteurl" readonly value="${trip.inviteCode ? esc(location.origin + location.pathname + '#/join/' + trip.id + '/' + trip.inviteCode) : ''}">
      <button type="button" class="btn ghost" id="f-invitecopy" style="width:auto;padding:.6rem 1rem">複製</button>
    </div>
    <label class="field" style="margin-top:.5rem"><span class="lab">或用 Email 邀請(對方會收到 App 內通知)</span>
      <div style="display:flex;gap:.5rem">
        <input id="f-invemail" type="email" placeholder="對方註冊用的 email">
        <button type="button" class="btn ghost" id="f-invsend" style="width:auto;padding:.6rem 1rem">邀請</button>
      </div></label>
    <div id="f-invmsg" class="meta" style="min-height:1.1em;margin-bottom:.6rem"></div>
    <div class="section-title" style="margin-top:.6rem">協作者名單</div>
    <div id="f-members" class="members">載入中…</div>
    <div class="btn-row">
      <button class="btn ghost" id="f-cancel">關閉</button>
    </div>
  `, (sheet, close) => {
    // 公開分享開關
    let pub = !!trip.public;
    const pubChip = sheet.querySelector('#f-public');
    const linkBox = sheet.querySelector('#f-sharelink');
    pubChip.onclick = async () => {
      pub = !pub;
      pubChip.classList.toggle('on', pub);
      pubChip.textContent = pub ? '已公開' : '未公開';
      linkBox.style.display = pub ? '' : 'none';
      await db.setTripPublic(trip.id, pub);
    };
    sheet.querySelector('#f-copy').onclick = () => {
      navigator.clipboard?.writeText(sheet.querySelector('#f-shareurl').value).then(() => {
        const b = sheet.querySelector('#f-copy'); b.textContent = '已複製';
        setTimeout(() => { b.textContent = '複製'; }, 1500);
      }).catch(() => {});
    };

    // 邀請連結
    const inviteBtn = sheet.querySelector('#f-invite');
    const inviteBox = sheet.querySelector('#f-invitelink');
    const inviteInput = sheet.querySelector('#f-inviteurl');
    const linkFor = (code) => location.origin + location.pathname + '#/join/' + trip.id + '/' + code;
    inviteBtn.onclick = async () => {
      const code = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2)).slice(0, 12);
      await db.updateTrip(trip.id, { inviteCode: code });
      trip.inviteCode = code;
      inviteInput.value = linkFor(code);
      inviteBox.style.display = '';
      inviteBtn.textContent = '重新產生';
    };
    sheet.querySelector('#f-invitecopy').onclick = () => {
      navigator.clipboard?.writeText(inviteInput.value).then(() => {
        const b = sheet.querySelector('#f-invitecopy'); b.textContent = '已複製';
        setTimeout(() => { b.textContent = '複製'; }, 1500);
      }).catch(() => {});
    };

    // 協作者名單:暱稱優先→帳號 email;在線(綠點)或最後上線時間;擁有者可移除
    const invMsg = sheet.querySelector('#f-invmsg');
    const membersBox = sheet.querySelector('#f-members');
    const loadMembers = async () => {
      const ids = trip.members || [];
      if (!ids.length) { membersBox.innerHTML = '<div class="meta">目前沒有協作者。</div>'; return; }
      const onlineIds = new Set(presencePeers.map((p) => p.id));
      let byId = new Map();
      if (cloud && cloud.getProfiles) {
        const profs = await cloud.getProfiles(ids).catch(() => []);
        byId = new Map(profs.map((p) => [p.id, p]));
      }
      membersBox.innerHTML = ids.map((id) => {
        const p = byId.get(id);
        const name = (p && (p.nickname || p.email)) || '協作者';
        const online = onlineIds.has(id);
        const seen = presenceSeen[`${trip.id}:${id}`];
        const status = online
          ? '<span class="mstatus on">● 在線</span>'
          : `<span class="mstatus">${seen ? '最後上線 ' + timeAgo(seen) : '離線'}</span>`;
        const rm = isOwner
          ? `<button type="button" class="btn danger" data-rm="${esc(id)}" style="width:auto;padding:.3rem .8rem;font-size:.9rem">移除</button>`
          : '';
        return `<div class="member-row"><span class="minfo"><b>${esc(name)}</b>${status}</span>${rm}</div>`;
      }).join('');
      if (isOwner) membersBox.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
        if (!confirm('移除這位協作者?他將無法再存取這趟行程。')) return;
        if (cloud && cloud.removeMember) await cloud.removeMember(trip.id, b.dataset.rm).catch(() => {});
        trip.members = (trip.members || []).filter((x) => x !== b.dataset.rm);
        await cloud.fullSync?.().catch(() => {});
        loadMembers();
      });
    };
    loadMembers();

    // Email 邀請
    sheet.querySelector('#f-invsend')?.addEventListener('click', async () => {
      const em = sheet.querySelector('#f-invemail').value.trim();
      if (!em) return;
      if (!cloud || !cloud.findProfileByEmail) { invMsg.style.color = 'var(--danger)'; invMsg.textContent = '雲端未載入(可能離線)'; return; }
      invMsg.style.color = 'var(--text-dim)'; invMsg.textContent = '查詢中…';
      const prof = await cloud.findProfileByEmail(em).catch(() => null);
      if (!prof) { invMsg.style.color = 'var(--danger)'; invMsg.textContent = '找不到這個 email(對方需先註冊並登入過一次)'; return; }
      if (prof.id === currentUser.id) { invMsg.style.color = 'var(--danger)'; invMsg.textContent = '不能邀請自己'; return; }
      if ((trip.members || []).includes(prof.id)) { invMsg.style.color = 'var(--danger)'; invMsg.textContent = '對方已經是協作者'; return; }
      const { error } = await cloud.createInvite(trip.id, trip.name, displayName(), prof.id);
      if (error) { invMsg.style.color = 'var(--danger)'; invMsg.textContent = '邀請失敗:' + (error.message || ''); return; }
      invMsg.style.color = 'var(--accent)'; invMsg.textContent = `已邀請 ${prof.nickname || em},對方 App 會收到通知`;
      sheet.querySelector('#f-invemail').value = '';
    });

    sheet.querySelector('#f-cancel').onclick = close;
  });
}

// ---- 行事曆(.ics):把有訂位的交通班次一鍵加入手機行事曆 --------------------
// 日期/時間各自用一個窄輸入(datetime-local 在 iOS 會撐寬版面),存回時再合併
const datePart = (s) => (/(\d{4}-\d{2}-\d{2})/.exec(s || '') || [])[1] || '';
const timePart = (s) => (/(\d{2}:\d{2})/.exec(s || '') || [])[1] || '';
const joinDT = (d, t) => (d && t) ? `${d}T${t}` : (t ? `T${t}` : '');
function icsEscape(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
function toICSDate(local) { // "2026-08-01T09:30" → "20260801T093000"(浮動本地時間)
  const m = String(local || '').match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` : '';
}
function buildICS(ev) {
  const start = toICSDate(ev.departAt);
  if (!start) return null;
  const end = toICSDate(ev.arriveAt) || start;
  const title = (ev.airline || ev.flightNo) ? `${ev.airline || ''} ${ev.flightNo || ''}`.trim() : (ev.name || '行程');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tour//TW//', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${(ev.id || Math.random().toString(36).slice(2))}@tour`, `DTSTAMP:${stamp}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${icsEscape(title)}`,
    ev.name ? `LOCATION:${icsEscape(ev.name)}` : '', 'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}
async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// ---- 地點表單 --------------------------------------------------------------
function openPlaceSheet(tripId, place = null) {
  const editing = !!place;
  const cat = place?.category || '景點';
  const status = place?.status || '候選';

  openSheet(`
    <h2>${editing ? '編輯地點' : '新增地點'}</h2>
    <label class="field"><span class="lab">地點名稱</span>
      <input id="f-name" placeholder="例如：清水寺" value="${esc(place?.name || '')}"></label>

    <label class="field"><span class="lab">位置（給「建議安排」用）</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button type="button" class="chip" id="f-locate">${ic('pin')} 用名稱定位</button>
        <span class="meta" id="f-loc" style="flex:1;min-width:0"></span>
      </div>
      <div id="f-cands" class="cands"></div></label>
    <button type="button" class="btn ghost" id="f-mapbtn" style="width:auto;padding:.4rem 0;font-size:.9rem;margin:-.6rem 0 .4rem">在地圖上拖曳微調</button>
    <div id="f-map" class="mapbox" style="display:none"></div>

    <label class="field"><span class="lab">分類</span>
      <div class="chips" id="f-cat">
        ${CATEGORIES.map((c) => `<div class="chip ${c === cat ? 'on' : ''}" data-v="${esc(c)}">${esc(c)}</div>`).join('')}
      </div></label>

    <div id="f-transport" style="${cat === '交通' ? '' : 'display:none'}">
      <div class="section-title" style="margin:.2rem 0 .5rem">交通班次(選填)</div>
      <label class="field"><span class="lab">交通方式(估時用)</span>
        <select id="f-transitmode" class="select">
          ${['自動', '飛機', '高鐵', '火車', '客運', '開車', '渡輪', '步行'].map((m) => `<option value="${m}" ${(place?.transitMode || '自動') === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select></label>
      <div class="row2">
        <label class="field"><span class="lab">航空公司</span>
          <input id="f-airline" placeholder="如 長榮 / JR" value="${esc(place?.airline || '')}"></label>
        <label class="field"><span class="lab">航班 / 車次</span>
          <input id="f-flightno" placeholder="如 BR182 / のぞみ" value="${esc(place?.flightNo || '')}"></label>
      </div>
      <label class="field"><span class="lab">搭乘日期</span>
        <input id="f-departdate" type="date" value="${datePart(place?.departAt)}"></label>
      <label class="field"><span class="lab">搭乘時間</span>
        <input id="f-departtime" type="time" value="${timePart(place?.departAt)}"></label>
      <div class="row2" style="gap:.5rem;margin-bottom:.6rem">
        <button type="button" class="btn ghost" id="f-flightsearch" style="--c:#0ea5e9;color:#0ea5e9">${ic('plane')} 查航班時刻</button>
        <button type="button" class="btn ghost" id="f-addcal" style="--c:#14b8a6;color:#14b8a6">${ic('calendar')} 加入行事曆</button>
      </div>
    </div>

    <label class="field"><span class="lab">狀態</span>
      <div class="chips" id="f-status">
        ${STATUSES.map((s) => `<div class="chip ${s === status ? 'on' : ''}" data-v="${esc(s)}">${esc(s)}</div>`).join('')}
      </div></label>

    <div class="row2">
      <label class="field"><span class="lab">預估停留（分鐘）</span>
        <input id="f-stay" type="number" min="0" inputmode="numeric"
          placeholder="${DEFAULT_STAY[cat] ?? 60}" value="${place?.estimatedStay ?? ''}"></label>
      <label class="field"><span class="lab">預估花費</span>
        <input id="f-cost" type="number" min="0" inputmode="numeric" value="${place?.estimatedCost || ''}"></label>
    </div>

    <label class="field"><span class="lab">營業時間（選填）</span>
      <input id="f-hours" placeholder="例如：09:00–17:00" value="${esc(place?.openingHours || '')}"></label>
    <label class="field"><span class="lab">參考連結（選填）</span>
      <input id="f-url" type="url" placeholder="貼上 Google 地圖分享連結" value="${esc(place?.referenceUrl || '')}"></label>
    <label class="field"><span class="lab">備註（選填）</span>
      <textarea id="f-notes" placeholder="想吃的、想看的、注意事項…">${esc(place?.notes || '')}</textarea></label>

    <div class="toggle-row">
      <div><b>釘選為固定錨點</b><div class="desc">訂位餐廳、演出、機票等時間固定的點</div></div>
      <div class="chip ${place?.pinned ? 'on' : ''}" id="f-pin">${ic('pushpin')} ${place?.pinned ? '已釘選' : '未釘選'}</div>
    </div>

    <div class="btn-row">
      <button class="btn primary" id="f-save">${editing ? '儲存' : '新增地點'}</button>
      ${editing ? '<button class="btn danger" id="f-del">刪除這個地點</button>' : ''}
      <button class="btn ghost" id="f-cancel">取消</button>
    </div>
  `, (sheet, rawClose) => {
    // 廣播「正在編輯這個地點」給協作者;關閉時清除
    if (editing && cloud && cloud.broadcastEditing) cloud.broadcastEditing(currentUser?.id, place.id, displayName());
    const close = () => {
      if (editing && cloud && cloud.broadcastEditing) cloud.broadcastEditing(currentUser?.id, null);
      rawClose();
    };
    // 單選 chips（分類、狀態）
    const bindSingle = (id) => {
      const box = sheet.querySelector(id);
      box.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip'); if (!chip) return;
        box.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        // 切換分類時，若停留欄空白，更新 placeholder 為該分類預設值;交通類才顯示班次區
        if (id === '#f-cat') {
          sheet.querySelector('#f-stay').placeholder = DEFAULT_STAY[chip.dataset.v] ?? 60;
          const tb = sheet.querySelector('#f-transport');
          if (tb) tb.style.display = chip.dataset.v === '交通' ? '' : 'none';
        }
      });
    };
    bindSingle('#f-cat'); bindSingle('#f-status');

    // 定位（用名稱查座標,列出候選讓使用者挑,精準度較高）
    let coords = (place && place.lat != null && place.lng != null) ? { lat: place.lat, lng: place.lng } : null;
    const locEl = sheet.querySelector('#f-loc');
    const candBox = sheet.querySelector('#f-cands');
    let map = null, marker = null;
    const syncMap = () => { if (map && marker && coords) { map.setView([coords.lat, coords.lng], 16); marker.setLatLng([coords.lat, coords.lng]); } };
    if (coords) locEl.textContent = `已定位 ✓ (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
    sheet.querySelector('#f-locate').onclick = async () => {
      const q = sheet.querySelector('#f-name').value.trim();
      candBox.innerHTML = '';
      if (!q) { locEl.textContent = '請先輸入地點名稱'; return; }
      locEl.textContent = '查詢中…（免費服務,約 1 秒）';
      try {
        const country = (await db.getTrip(tripId))?.country || '';
        let list = await geocodeCandidates(q, country);       // 先限定在主要旅遊國家
        if (!list.length && country) list = await geocodeCandidates(q); // 該國找不到,再全球找
        if (!list.length) { locEl.textContent = '找不到,試更完整的名稱(例如「清水寺 京都」)'; return; }
        locEl.textContent = country
          ? `找到 ${list.length} 個(已優先${countryName(country)}),點選正確的那個:`
          : `找到 ${list.length} 個,點選正確的那個:`;
        candBox.innerHTML = list.map((r, i) =>
          `<button type="button" class="cand" data-i="${i}">${esc(r.label)}</button>`).join('');
        candBox.querySelectorAll('.cand').forEach((b) => b.onclick = () => {
          const r = list[Number(b.dataset.i)];
          coords = { lat: r.lat, lng: r.lng };
          locEl.textContent = '已選:' + r.label.split(',').slice(0, 3).join(',');
          candBox.querySelectorAll('.cand').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          syncMap();
        });
      } catch (e) { locEl.textContent = '定位失敗:' + (e.message || e); }
    };

    // 在地圖上拖曳微調
    sheet.querySelector('#f-mapbtn').onclick = async () => {
      const mapBox = sheet.querySelector('#f-map');
      mapBox.style.display = 'block';
      try {
        const L = await loadLeaflet();
        const start = coords || { lat: 23.7, lng: 121 };
        if (!map) {
          map = L.map(mapBox).setView([start.lat, start.lng], coords ? 16 : 7);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
          const icon = L.divIcon({ className: 'map-pin', html: '<div class="pin-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
          marker = L.marker([start.lat, start.lng], { draggable: true, icon }).addTo(map);
          const apply = (ll) => { coords = { lat: ll.lat, lng: ll.lng }; locEl.textContent = `已定位 ✓ (${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)})`; };
          marker.on('dragend', () => apply(marker.getLatLng()));
          map.on('click', (e) => { marker.setLatLng(e.latlng); apply(e.latlng); });
        }
        setTimeout(() => map.invalidateSize(), 60);
      } catch (e) { locEl.textContent = '地圖載入失敗(可能離線或被網路阻擋)'; }
    };

    // 交通班次:查航班時刻(開新分頁查)/ 加入手機行事曆(.ics)
    sheet.querySelector('#f-flightsearch').onclick = () => {
      const q = (sheet.querySelector('#f-airline').value + ' ' + sheet.querySelector('#f-flightno').value).trim()
        || sheet.querySelector('#f-name').value.trim();
      if (!q) { alert('請先填航空公司/航班號或地點名稱'); return; }
      window.open('https://www.google.com/search?q=' + encodeURIComponent(q + ' 航班時刻 flight status'), '_blank');
    };
    sheet.querySelector('#f-addcal').onclick = async () => {
      const ev = {
        id: place?.id, name: sheet.querySelector('#f-name').value.trim(),
        airline: sheet.querySelector('#f-airline').value.trim(),
        flightNo: sheet.querySelector('#f-flightno').value.trim(),
        departAt: joinDT(sheet.querySelector('#f-departdate').value, sheet.querySelector('#f-departtime').value),
        arriveAt: '',
      };
      if (!datePart(ev.departAt) || !timePart(ev.departAt)) { alert('加入行事曆需要填「搭乘日期」和「搭乘時間」'); return; }
      const ics = buildICS(ev);
      if (!ics) { alert('時間格式有誤'); return; }
      await shareOrDownload(new Blob([ics], { type: 'text/calendar' }), `${ev.flightNo || ev.name || 'event'}.ics`, ev.name || '行程');
    };

    // 釘選開關
    const pinChip = sheet.querySelector('#f-pin');
    let pinned = !!place?.pinned;
    pinChip.onclick = () => {
      pinned = !pinned;
      pinChip.classList.toggle('on', pinned);
      pinChip.innerHTML = `${ic('pushpin')} ${pinned ? '已釘選' : '未釘選'}`;
    };

    sheet.querySelector('#f-cancel').onclick = close;
    sheet.querySelector('#f-save').onclick = async () => {
      const name = sheet.querySelector('#f-name').value.trim();
      if (!name) { sheet.querySelector('#f-name').focus(); return; }
      const selCat = sheet.querySelector('#f-cat .chip.on')?.dataset.v || '景點';
      const stayRaw = sheet.querySelector('#f-stay').value;
      const data = {
        name,
        category: selCat,
        status: sheet.querySelector('#f-status .chip.on')?.dataset.v || '候選',
        estimatedStay: stayRaw === '' ? (DEFAULT_STAY[selCat] ?? 60) : Number(stayRaw),
        estimatedCost: Number(sheet.querySelector('#f-cost').value) || 0,
        openingHours: sheet.querySelector('#f-hours').value.trim(),
        referenceUrl: sheet.querySelector('#f-url').value.trim(),
        airline: sheet.querySelector('#f-airline').value.trim(),
        flightNo: sheet.querySelector('#f-flightno').value.trim(),
        transitMode: sheet.querySelector('#f-transitmode').value,
        departAt: joinDT(sheet.querySelector('#f-departdate').value, sheet.querySelector('#f-departtime').value),
        arriveAt: '',
        notes: sheet.querySelector('#f-notes').value.trim(),
        pinned,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      };
      if (editing) await db.updatePlace(place.id, data);
      else await db.createPlace(tripId, data);
      close(); render();
    };
    if (editing) sheet.querySelector('#f-del').onclick = async () => {
      if (!confirm(`確定刪除「${place.name}」？`)) return;
      await db.deletePlace(place.id);
      close(); render();
    };
  });
}

// ---- 旅途:時間軸記錄(文字/照片/打卡/評分/花費)+ 足跡地圖 -------------------
// 照片壓縮成合理大小的 JPEG(存本機,不上雲端);回傳 dataURL 與拍攝時間。
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: c.toDataURL('image/jpeg', quality), takenAt: file.lastModified || Date.now() });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('讀取圖片失敗')); };
    img.src = url;
  });
}
// Blob → dataURL(語音存本機用)
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
// 抓一次目前位置(僅前景;iOS 無法背景定位)
function getPositionOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('此裝置不支援定位'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}
// WMO 天氣代碼 → emoji(粗分類,給旅途記錄一個天氣快照)
function wmoEmoji(code) {
  if (code == null) return '';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}
// 抓當下天氣(Open-Meteo,免費、免金鑰)。失敗回 null,不影響記錄。
async function fetchWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const c = (await res.json()).current;
    return c ? { code: c.weather_code, temp: Math.round(c.temperature_2m) } : null;
  } catch { return null; }
}
// 找離座標最近、且已定位的景點(回傳 {place, dist(km)})
function nearestPlace(places, coords) {
  let best = null, bd = Infinity;
  for (const p of places) {
    if (p.lat == null || p.lng == null) continue;
    const d = haversine(coords, { lat: p.lat, lng: p.lng });
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { place: best, dist: bd } : null;
}
const two = (n) => String(n).padStart(2, '0');
const hhmm = (ts) => { const d = new Date(ts); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
const dayLabel = (ts) => { const d = new Date(ts); const wd = ['日','一','二','三','四','五','六'][d.getDay()]; return `${d.getMonth() + 1}月${d.getDate()}日（${wd}）`; };
const starsView = (n) => `<span class="m-stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;

// ---- 靠近景點自動提示打卡(僅前景;iOS 無法背景定位)-------------------------
let proximityOn = localStorage.getItem('proxOn') === '1';
let geoWatchId = null, proximityPlaces = [], proxTrip = null, lastPromptPlaceId = null;
function startProximity(trip) {
  if (!navigator.geolocation || geoWatchId != null) return; // 已在監看就不重複
  proxTrip = trip;
  geoWatchId = navigator.geolocation.watchPosition((pos) => {
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const cands = proximityPlaces.filter((p) => p.lat != null && p.status !== '已造訪');
    const near = nearestPlace(cands, coords);
    if (near && near.dist < 0.15 && near.place.id !== lastPromptPlaceId) {
      lastPromptPlaceId = near.place.id;
      showProximityBanner(near.place, coords);
    }
  }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
}
function stopProximity() {
  if (geoWatchId != null) { try { navigator.geolocation.clearWatch(geoWatchId); } catch (_) {} geoWatchId = null; }
  proxTrip = null; lastPromptPlaceId = null;
  document.querySelector('.prox-bar')?.remove();
}
function showProximityBanner(place, coords) {
  document.querySelector('.prox-bar')?.remove();
  const bar = document.createElement('div');
  bar.className = 'prox-bar';
  bar.innerHTML = `<span>${ic('pin')} 你在「${esc(place.name)}」附近</span><button class="go">打卡</button><button class="skip">略過</button>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));
  bar.querySelector('.go').onclick = async () => {
    bar.remove();
    const weather = await fetchWeather(coords.lat, coords.lng);
    openMomentSheet(proxTrip, proximityPlaces, null, { coords, placeId: place.id, weather });
  };
  bar.querySelector('.skip').onclick = () => bar.remove();
}

// 「旅途」分頁內容:摘要 + 足跡地圖 + 時間軸
function momentBody(trip, places, moments) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const visited = places.filter((p) => p.status === '已造訪').length;
  const totalSpend = moments.reduce((s, m) => s + (Number(m.spend) || 0), 0);
  const summary = `
    <div class="moment-summary">
      <div class="ms-item" style="--c:#f472b6"><b>${moments.length}</b><span>記錄</span></div>
      <div class="ms-item" style="--c:#22b34a"><b>${visited}</b><span>造訪地</span></div>
      <div class="ms-item" style="--c:#f59e0b"><b>${totalSpend ? totalSpend.toLocaleString() : 0}</b><span>花費合計</span></div>
    </div>
    <div class="moment-tools">
      <button class="btn ghost" id="moment-mapbtn" style="--c:#22b34a;color:#22b34a">${ic('pin')} 足跡地圖</button>
      <button class="btn ghost" id="moment-batchbtn" style="--c:#0ea5e9;color:#0ea5e9">${ic('camera')} 批次匯入照片</button>
      <button class="btn ghost" id="moment-drivebtn" style="--c:#16a34a;color:#16a34a">☁️ 備份到 Drive</button>
      <input type="file" accept="image/*" multiple id="moment-batchfile" hidden>
    </div>
    <label class="prox-row">${ic('pin')} 靠近景點自動提示打卡<span class="chip ${proximityOn ? 'on' : ''}" id="prox-toggle">${proximityOn ? '開' : '關'}</span></label>
    ${(() => {
      if (retentionChosen(trip) || !moments.some((m) => m.photoId)) return '';
      const isOwner = trip.ownerId === currentUser?.id;
      return isOwner
        ? '<div class="retain-warn">⚠️ 照片還沒上雲。請到「編輯旅程」選擇<b>照片雲端保存期限(3 或 6 個月)</b>,選定後照片才會上傳、協作者才看得到。</div>'
        : '<div class="retain-warn">☁️ 發起人尚未設定照片保存期限,照片目前只存在本機、還沒分享給大家。</div>';
    })()}
    <div id="moment-map" class="mapbox" style="display:none;margin:.2rem 0 1rem"></div>`;

  if (!moments.length) {
    return summary + `
      <div class="empty">
        <div class="big">${ic('sparkle')}</div>
        <p>旅途中的第一筆記錄從這裡開始。<br>點右下角的 <b>＋</b> 記下當下的照片、心情或位置。</p>
      </div>`;
  }

  // 依日期分組(已由 db 依 takenAt 由新到舊排序)
  let html = summary + '<div class="timeline">';
  let curKey = null;
  for (const m of moments) {
    const k = dayKey(m.takenAt);
    if (k !== curKey) { curKey = k; html += `<div class="tl-day">${dayLabel(m.takenAt)}</div>`; }
    const place = m.placeId ? byId.get(m.placeId) : null;
    const photo = m.photoId
      ? `<div class="m-photo"><img data-asset="${esc(m.photoId)}" data-path="${esc(m.photoPath || '')}" alt="旅途照片"></div>`
      : (m.hasPhoto ? '<div class="m-photo ph">📷 照片存在拍攝的裝置上</div>' : '');
    const audio = m.audioId
      ? `<div class="m-audio"><audio data-audio="${esc(m.audioId)}" controls preload="none"></audio></div>`
      : (m.hasAudio ? '<div class="m-audio ph">🎤 語音存在錄製的裝置上</div>' : '');
    const metaBits = [];
    if (place) metaBits.push(`${ic('pin')} ${esc(place.name)}`);
    else if (m.lat != null) metaBits.push(`${ic('pin')} 已定位`);
    if (m.weather) metaBits.push(`${wmoEmoji(m.weather.code)} ${esc(String(m.weather.temp))}°`);
    if (m.spend) metaBits.push(`${ic('cash')} ${esc(m.currency || '')}${Number(m.spend).toLocaleString()}`);
    const mine = !m.authorId || m.authorId === currentUser?.id;
    const authorTag = (!mine && m.authorName) ? `<span class="m-author">${esc(m.authorName)}</span>` : '';
    html += `
      <div class="moment-card" data-moment="${esc(m.id)}">
        ${photo}
        <div class="m-body">
          <div class="m-top"><span class="m-time">${hhmm(m.takenAt)}</span>${m.rating ? starsView(m.rating) : ''}${authorTag}</div>
          ${m.text ? `<div class="m-text">${esc(m.text)}</div>` : ''}
          ${audio}
          ${metaBits.length ? `<div class="m-meta">${metaBits.map((b) => `<span>${b}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }
  html += '</div>';
  return html;
}

// dataURL → Blob(給 Drive 備份上傳用)
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
// 檔名用的時間戳 YYYYMMDD-HHMM
function photoStamp(ts) {
  const d = new Date(ts || Date.now()); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// 取一張照片:本機優先;本機沒有但雲端有(協作者拍的)就下載並快取回本機。
async function loadMomentPhoto(assetId, path) {
  if (assetId) {
    const local = await db.getAsset(assetId).catch(() => null);
    if (local) return local;
  }
  if (path && cloud && cloud.downloadPhoto) {
    try {
      const dataUrl = await cloud.downloadPhoto(path);
      if (dataUrl && assetId) await db.putAssetWithId(assetId, dataUrl).catch(() => {});
      return dataUrl;
    } catch (_) { return null; }
  }
  return null;
}

// 背景把「本機有照片、但雲端還沒上傳」的 moment 一張張上傳,並把路徑寫回(隨同步擴散給協作者)。
// 別台裝置拍的照片(本機沒有原檔)不會由我上傳,交給原裝置處理。
// 保存期限必須由發起人選 3 或 6 個月才算有效;沒選就不上傳。
const retentionChosen = (trip) => [90, 180].includes(Number(trip && trip.photoRetentionDays));
let _photoSyncing = false;
async function syncTripPhotos(tripId) {
  if (_photoSyncing || !cloud || !cloud.uploadPhoto || !currentUser || !navigator.onLine) return;
  const trip = await db.getTrip(tripId).catch(() => null);
  if (!retentionChosen(trip)) return; // 發起人尚未選保存期限 → 照片不上傳
  _photoSyncing = true;
  try {
    const moments = await db.listMoments(tripId);
    for (const m of moments) {
      if (!m.photoId || m.photoPath) continue;
      const dataUrl = await db.getAsset(m.photoId).catch(() => null);
      if (!dataUrl) continue; // 照片不在本機 → 不是我上傳的責任
      try {
        const path = await cloud.uploadPhoto(tripId, m.id, m.photoId, dataUrl);
        await db.updateMoment(m.id, { photoPath: path }); // 觸發同步,協作者才收得到
      } catch (_) { /* 稍後(下次進頁/上線)再試 */ }
    }
  } finally { _photoSyncing = false; }
}

// 照片保存期限:只有擁有者的 App 執行,把超過期限的「雲端」照片刪掉(手機原圖不動),並清掉 photoPath。
async function enforcePhotoRetention(trip) {
  const days = Number(trip.photoRetentionDays) || 0;
  if (!days || !cloud || !cloud.deletePhoto || !currentUser || !navigator.onLine) return;
  if (trip.ownerId !== currentUser.id) return; // 僅擁有者可清共享照片
  const cutoff = Date.now() - days * 86400000;
  const moments = await db.listMoments(trip.id);
  for (const m of moments) {
    if (!m.photoPath) continue;
    if ((m.takenAt || m.createdAt || 0) >= cutoff) continue; // 未到期
    try {
      await cloud.deletePhoto(m.photoPath);
      await db.updateMoment(m.id, { photoPath: '' }); // 清路徑 → 協作者端不再嘗試下載
    } catch (_) { /* 下次再試 */ }
  }
}

// 非同步把照片/語音塞進畫面。照片:本機沒有就從雲端抓(協作者也看得到);語音只存本機。
function fillLocalAssets() {
  app.querySelectorAll('img[data-asset]').forEach(async (im) => {
    const url = await loadMomentPhoto(im.dataset.asset, im.dataset.path || '');
    if (url) im.src = url; else im.closest('.m-photo')?.replaceChildren(document.createTextNode('📷 照片載入不到'));
  });
  app.querySelectorAll('audio[data-audio]').forEach(async (au) => {
    const url = await db.getAsset(au.dataset.audio).catch(() => null);
    if (url) au.src = url; else au.closest('.m-audio')?.replaceChildren(document.createTextNode('🎤 語音存在錄製的裝置上'));
  });
}
// 備份照片到「使用者自己的」Google Drive(drive.file 範圍)。發起人、協作者都能各自備份看得到的照片。
function openDriveBackup(trip, moments) {
  const withPhoto = moments.filter((m) => m.photoId || m.photoPath);
  openSheet(`
    <h2>備份照片到 Google Drive</h2>
    <p class="tip-desktop">把這趟你看得到的照片備份到<b>你自己的</b> Google Drive(資料夾:<b>旅遊App備份 / ${esc(trip.name)}</b>)。到期被雲端清掉也不怕,原圖永久留存。已備份過的會自動略過。</p>
    <div class="meta">可備份:約 ${withPhoto.length} 張</div>
    <div id="dv-msg" class="meta" style="min-height:1.1em;margin:.5rem 0"></div>
    <div class="vm-progress" id="dv-progress" style="display:none"><div class="vm-bar" id="dv-bar"></div></div>
    <div class="btn-row">
      <button class="btn primary" id="dv-go">開始備份</button>
      <button class="btn ghost" id="dv-cancel">關閉</button>
    </div>
  `, (sheet, close) => {
    sheet.querySelector('#dv-cancel').onclick = close;
    sheet.querySelector('#dv-go').onclick = async () => {
      const msg = sheet.querySelector('#dv-msg'); const go = sheet.querySelector('#dv-go');
      const prog = sheet.querySelector('#dv-progress'); const bar = sheet.querySelector('#dv-bar');
      if (!withPhoto.length) { msg.style.color = 'var(--danger)'; msg.textContent = '這趟還沒有照片可備份。'; return; }
      try { if (!cloudDrive) cloudDrive = await import('./drive.js'); }
      catch (_) { msg.style.color = 'var(--danger)'; msg.textContent = '無法載入備份元件(需要網路)'; return; }
      if (!cloudDrive.driveConfigured()) { msg.style.color = 'var(--danger)'; msg.textContent = '尚未完成 Google 設定:請把 OAuth 用戶端 ID 填進 supabase-config.js 的 GOOGLE_CLIENT_ID。'; return; }
      go.disabled = true; msg.style.color = 'var(--text-dim)'; msg.textContent = '連線 Google…';
      try { await cloudDrive.driveConnect(); } // 必須在點擊當下授權
      catch (e) { msg.style.color = 'var(--danger)'; msg.textContent = 'Google 授權未完成:' + (e.message || e); go.disabled = false; return; }
      msg.textContent = '準備照片…';
      const items = [];
      for (const m of withPhoto) {
        const url = await loadMomentPhoto(m.photoId, m.photoPath);
        if (url) items.push({ name: `${photoStamp(m.takenAt)}-${String(m.id).slice(0, 6)}.jpg`, blob: dataUrlToBlob(url) });
      }
      if (!items.length) { msg.style.color = 'var(--danger)'; msg.textContent = '照片都載入不到(可能不在本機也未上雲)。'; go.disabled = false; return; }
      prog.style.display = '';
      try {
        const r = await cloudDrive.backupPhotos(trip.name, items, (done, total) => { bar.style.width = Math.round(done / total * 100) + '%'; msg.textContent = `備份中… ${done}/${total}`; });
        msg.style.color = 'var(--accent)'; msg.textContent = `完成!新增 ${r.uploaded} 張、已存在略過 ${r.skipped} 張。打開 Google Drive 的「旅遊App備份」資料夾即可看到。`;
      } catch (e) { msg.style.color = 'var(--danger)'; msg.textContent = '備份失敗:' + (e.message || e); }
      finally { go.disabled = false; prog.style.display = 'none'; bar.style.width = '0%'; }
    };
  });
}

// 在指定容器畫出足跡地圖(打卡點 + 已定位景點)
async function renderFootprintMap(box, moments, places) {
  const pts = moments.filter((m) => m.lat != null && m.lng != null);
  const placePts = places.filter((p) => p.lat != null && p.lng != null);
  if (!pts.length && !placePts.length) { box.innerHTML = '<div class="meta" style="padding:1rem">還沒有任何帶座標的記錄或景點。打卡或替景點定位後,足跡就會出現在這裡。</div>'; return; }
  try {
    const L = await loadLeaflet();
    const map = L.map(box);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const all = [];
    placePts.forEach((p) => {
      const icon = L.divIcon({ className: 'map-pin', html: '<div class="pin-dot plan"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(esc(p.name));
      all.push([p.lat, p.lng]);
    });
    pts.forEach((m) => {
      const icon = L.divIcon({ className: 'map-pin', html: '<div class="pin-dot foot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([m.lat, m.lng], { icon }).addTo(map).bindPopup(`${hhmm(m.takenAt)}${m.text ? '・' + esc(m.text.slice(0, 20)) : ''}`);
      all.push([m.lat, m.lng]);
    });
    map.fitBounds(all, { padding: [30, 30], maxZoom: 16 });
    setTimeout(() => map.invalidateSize(), 60);
  } catch (e) { box.innerHTML = '<div class="meta" style="padding:1rem">地圖載入失敗(可能離線或被網路阻擋)。</div>'; }
}

// 「旅途」分頁的事件:照片載入、卡片點擊編輯、足跡地圖
function wireMomentTab(trip, places, moments) {
  fillLocalAssets();
  syncTripPhotos(trip.id).catch(() => {}); // 背景把本機新照片上雲(協作者才看得到)
  enforcePhotoRetention(trip).catch(() => {}); // 擁有者:清掉超過保存期限的雲端照片
  // 靠近提示:更新監看用的景點清單,並依開關啟停
  proximityPlaces = places;
  if (proximityOn) startProximity(trip); else stopProximity();
  const proxToggle = app.querySelector('#prox-toggle');
  proxToggle?.addEventListener('click', () => {
    proximityOn = !proximityOn;
    localStorage.setItem('proxOn', proximityOn ? '1' : '0');
    proxToggle.classList.toggle('on', proximityOn);
    proxToggle.textContent = proximityOn ? '開' : '關';
    if (proximityOn) startProximity(trip); else stopProximity();
  });
  // 點卡片 → 編輯該則
  app.querySelectorAll('[data-moment]').forEach((c) => {
    const m = moments.find((x) => x.id === c.dataset.moment);
    c.addEventListener('click', () => openMomentSheet(trip, places, m));
  });
  // 備份到 Google Drive
  app.querySelector('#moment-drivebtn')?.addEventListener('click', () => openDriveBackup(trip, moments));
  // 批次匯入照片:一次多張,每張依檔案時間各成一則,排進時間軸
  const batchFile = app.querySelector('#moment-batchfile');
  const batchBtn = app.querySelector('#moment-batchbtn');
  batchBtn?.addEventListener('click', () => batchFile.click());
  batchFile?.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    let done = 0;
    for (const f of files) {
      batchBtn.textContent = `匯入中… ${++done}/${files.length}`;
      try {
        const { dataUrl, takenAt } = await compressImage(f);
        const photoId = await db.putAsset(dataUrl);
        await db.createMoment(trip.id, { photoId, takenAt, authorId: currentUser?.id, authorName: displayName() });
      } catch (_) {}
    }
    render();
  });
  // 足跡地圖(切換顯示,只建立一次)
  let mapBuilt = false;
  app.querySelector('#moment-mapbtn')?.addEventListener('click', () => {
    const box = app.querySelector('#moment-map');
    const showing = box.style.display !== 'none';
    if (showing) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    if (!mapBuilt) { mapBuilt = true; renderFootprintMap(box, moments, places); }
  });
}

// ---- 回顧(旅遊書):把整趟整理成一本可回味的書 -----------------------------
function bookBody(trip, places, moments) {
  const dayCount = tripDayCount(trip, places);
  const visited = places.filter((p) => p.status === '已造訪');
  const totalSpend = moments.reduce((s, m) => s + (Number(m.spend) || 0), 0);
  const rated = moments.filter((m) => m.rating);
  const avgRating = rated.length ? rated.reduce((s, m) => s + m.rating, 0) / rated.length : 0;

  // 每個景點的代表照片與評分(取自關聯到它的旅途記錄)
  const placePhoto = {}, placeRating = {}, placePath = {};
  moments.forEach((m) => {
    if (!m.placeId) return;
    if (m.photoId && !placePhoto[m.placeId]) { placePhoto[m.placeId] = m.photoId; placePath[m.placeId] = m.photoPath || ''; }
    if (m.rating) placeRating[m.placeId] = Math.max(placeRating[m.placeId] || 0, m.rating);
  });

  const flag = trip.country ? flagOf(trip.country) : '';
  let html = `
    <div class="book">
      <div class="book-cover">
        <div class="bc-flag">${flag || '🧳'}</div>
        <h2>${esc(trip.name)}</h2>
        <div class="bc-sub">${esc(fmtDateRange(trip.startDate, trip.endDate))}${trip.country ? ' ・ ' + esc(countryName(trip.country)) : ''}</div>
      </div>
      <div class="book-stats">
        <div><b>${dayCount}</b><span>天</span></div>
        <div><b>${visited.length}</b><span>造訪地</span></div>
        <div><b>${moments.length}</b><span>點滴</span></div>
        <div><b>${totalSpend ? totalSpend.toLocaleString() : 0}</b><span>花費</span></div>
        ${avgRating ? `<div><b>${avgRating.toFixed(1)}</b><span>平均★</span></div>` : ''}
      </div>
      <div class="book-make">
        <button class="btn primary" id="book-makepdf">${ic('suitcase')} 旅遊書 PDF</button>
        <button class="btn primary" id="book-makevid" style="background:linear-gradient(135deg,#ec4899,#8b5cf6)">🎬 回顧影片</button>
      </div>`;

  // 精選時刻:4★以上,或「有照片又有心情文字」的那幾則
  const highlights = moments.filter((m) => m.rating >= 4 || (m.photoId && m.text)).slice(0, 8);
  if (highlights.length) {
    html += `<div class="book-sec-title">✨ 精選時刻</div><div class="hl-strip">`;
    for (const m of highlights) {
      const ph = m.photoId ? `<img data-asset="${esc(m.photoId)}" data-path="${esc(m.photoPath || '')}" alt="">` : '<div class="hl-noimg">📝</div>';
      html += `<div class="hl-card">${ph}<div class="hl-cap">${m.rating ? starsView(m.rating) : ''}${m.text ? `<span>${esc(m.text.slice(0, 40))}</span>` : ''}</div></div>`;
    }
    html += `</div>`;
  }

  // 逐日回顧:Day 1..N,列出當天景點(造訪✓ / 評分 / 代表照)
  html += `<div class="book-sec-title">📖 逐日回顧</div>`;
  for (let day = 1; day <= dayCount; day++) {
    const dayPlaces = places.filter((p) => p.assignedDay === day).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const dateLabel = trip.startDate ? dayDateLabel(trip.startDate, day) : '';
    html += `<div class="book-day"><div class="bd-head"><b>Day ${day}</b>${dateLabel ? `<span>${dateLabel}</span>` : ''}</div>`;
    if (!dayPlaces.length) {
      html += `<div class="bd-empty">這天沒有安排景點</div>`;
    } else {
      for (const p of dayPlaces) {
        const ph = placePhoto[p.id] ? `<img class="bd-thumb" data-asset="${esc(placePhoto[p.id])}" data-path="${esc(placePath[p.id] || '')}" alt="">` : `<div class="bd-thumb ph">${ic('pin')}</div>`;
        const visitedTag = p.status === '已造訪' ? '<span class="bd-visited">✓ 已造訪</span>' : '';
        const rt = placeRating[p.id] ? starsView(placeRating[p.id]) : '';
        html += `<div class="bd-place">${ph}<div class="bd-info"><div class="bd-name">${esc(p.name)} ${catTag(p.category)}</div>${(visitedTag || rt) ? `<div class="bd-tags">${visitedTag}${rt}</div>` : ''}</div></div>`;
      }
    }
    html += `</div>`;
  }

  html += `
    <div class="book-sec-title">🗺️ 足跡地圖</div>
    <div id="book-map" class="mapbox"></div>
    <p class="meta" style="text-align:center;margin:.6rem 0 0">照片目前只存在拍攝的裝置。要讓旅伴在回顧裡也看到照片,需開啟雲端相簿(Supabase Storage)。</p>
    </div>`;
  return html;
}

// 回顧頁事件:補上本機照片、畫足跡地圖、製作 PDF
function wireBookTab(trip, places, moments) {
  fillLocalAssets();
  const box = app.querySelector('#book-map');
  if (box) renderFootprintMap(box, moments, places);
  app.querySelector('#book-makepdf')?.addEventListener('click', () => openBookMaker(trip, places, moments));
  app.querySelector('#book-makevid')?.addEventListener('click', () => openVideoMaker(trip, places, moments));
}

// ---- 製作旅遊書 PDF:手動挑素材 → 產生可存檔的 PDF -----------------------------
// 產 PDF 用「把畫面拍成圖再組頁」的方式(html2pdf,執行時從 CDN 載入),
// 這樣中文能靠瀏覽器字型正常渲染(純 jsPDF 內建字型不支援中文)。
function openBookMaker(trip, places, moments) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const materials = moments.filter((m) => m.photoId || m.text || m.rating || m.spend);
  const rows = materials.map((m) => {
    const place = m.placeId ? byId.get(m.placeId) : null;
    const label = [hhmm(m.takenAt), place ? place.name : '', m.text ? m.text.slice(0, 18) : ''].filter(Boolean).join(' · ') || '記錄';
    const thumb = m.photoId ? `<img class="bm-thumb" data-asset="${esc(m.photoId)}" data-path="${esc(m.photoPath || '')}" alt="">` : `<div class="bm-thumb ph">${m.text ? '📝' : (m.rating ? '★' : '📍')}</div>`;
    return `<label class="bm-row"><input type="checkbox" class="bm-pick" value="${esc(m.id)}" checked>${thumb}<span>${esc(label)}</span></label>`;
  }).join('');

  openSheet(`
    <h2>製作旅遊書 PDF</h2>
    <p class="tip-desktop">💻 建議在<b>電腦(桌機瀏覽器)</b>生成:速度快、記憶體充足、最穩定。手機也能做,但素材/照片較多時會較慢、較耗記憶體。</p>
    <label class="field"><span class="lab">書名</span>
      <input id="bm-title" value="${esc(trip.name)}"></label>
    <div class="lab" style="margin:.2rem 0 .4rem">要包含的區塊</div>
    <label class="bm-opt"><input type="checkbox" id="bm-cover" checked> 封面</label>
    <label class="bm-opt"><input type="checkbox" id="bm-stats" checked> 數字回顧</label>
    <div class="lab" style="margin:.6rem 0 .4rem">底圖(每頁底部,淡化柔邊)</div>
    <div class="bm-back">
      <img id="bm-back-preview" class="bm-thumb" alt="" style="display:none">
      <div id="bm-back-ph" class="bm-thumb ph">🖼️</div>
      <div style="flex:1">
        <label class="btn ghost" style="width:auto;padding:.5rem .9rem;display:inline-block;cursor:pointer">上傳照片<input type="file" id="bm-back-file" accept="image/*" hidden></label>
        <button type="button" class="chip" id="bm-back-first">用第一張入選照片</button>
        <div class="meta" id="bm-back-note" style="margin-top:.3rem">未選則自動用第一張入選照片</div>
      </div>
    </div>
    <div class="lab" style="margin:.6rem 0 .4rem">選擇素材(預設全選,取消不想放的)</div>
    <div class="bm-actions"><button type="button" class="chip" id="bm-all">全選</button><button type="button" class="chip" id="bm-none">全不選</button></div>
    <div class="bm-list">${materials.length ? rows : '<div class="meta">還沒有可放進旅遊書的記錄。先到「旅途」記幾筆。</div>'}</div>
    <div id="bm-msg" class="meta" style="min-height:1.1em;margin:.5rem 0"></div>
    <div id="bm-result" style="margin:.4rem 0"></div>
    <div class="btn-row">
      <button class="btn primary" id="bm-go">生成並儲存 PDF</button>
      <button class="btn ghost" id="bm-cancel">取消</button>
    </div>
  `, (sheet, close) => {
    sheet.querySelectorAll('img[data-asset]').forEach(async (im) => {
      const u = await loadMomentPhoto(im.dataset.asset, im.dataset.path || '');
      if (u) im.src = u; else im.replaceWith(Object.assign(document.createElement('div'), { className: 'bm-thumb ph', textContent: '📷' }));
    });
    const picks = () => [...sheet.querySelectorAll('.bm-pick')];
    sheet.querySelector('#bm-all').onclick = () => picks().forEach((c) => { c.checked = true; });
    sheet.querySelector('#bm-none').onclick = () => picks().forEach((c) => { c.checked = false; });
    sheet.querySelector('#bm-cancel').onclick = close;

    // 底圖選擇:上傳一張 或 用第一張入選照片(否則生成時自動抓第一張)
    let backdropUrl = '';
    const backPrev = sheet.querySelector('#bm-back-preview');
    const backPh = sheet.querySelector('#bm-back-ph');
    const backNote = sheet.querySelector('#bm-back-note');
    const setBack = (url, note) => {
      backdropUrl = url || '';
      if (url) { backPrev.src = url; backPrev.style.display = ''; backPh.style.display = 'none'; }
      else { backPrev.removeAttribute('src'); backPrev.style.display = 'none'; backPh.style.display = ''; }
      backNote.textContent = note;
    };
    sheet.querySelector('#bm-back-file').onchange = (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => setBack(r.result, '已選:上傳的照片');
      r.readAsDataURL(f);
    };
    sheet.querySelector('#bm-back-first').onclick = async () => {
      const first = picks().filter((c) => c.checked).map((c) => c.value)
        .map((id) => moments.find((m) => m.id === id)).find((m) => m && m.photoId);
      if (!first) { setBack('', '入選素材裡沒有照片可當底圖'); return; }
      const u = await loadMomentPhoto(first.photoId, first.photoPath);
      setBack(u || '', u ? '已選:第一張入選照片' : '照片載入不到');
    };

    sheet.querySelector('#bm-go').onclick = async () => {
      const opts = {
        title: sheet.querySelector('#bm-title').value.trim() || trip.name,
        cover: sheet.querySelector('#bm-cover').checked,
        stats: sheet.querySelector('#bm-stats').checked,
        momentIds: new Set(picks().filter((c) => c.checked).map((c) => c.value)),
        backdropUrl,
      };
      const msg = sheet.querySelector('#bm-msg');
      const go = sheet.querySelector('#bm-go');
      const result = sheet.querySelector('#bm-result');
      if (!opts.momentIds.size && !opts.cover && !opts.stats) { msg.style.color = 'var(--danger)'; msg.textContent = '至少選一個區塊或一則素材。'; return; }
      go.disabled = true; result.innerHTML = ''; msg.style.color = 'var(--text-dim)'; msg.textContent = '產生中…(第一次會下載排版元件,約幾秒,請稍候)';
      let out;
      try {
        out = await generateBookPDF(trip, places, moments, opts);
      } catch (e) {
        msg.style.color = 'var(--danger)'; msg.textContent = '產生失敗:' + (e.message || e);
        go.disabled = false; return;
      }
      const { blob, filename } = out;
      const file = new File([blob], filename, { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // 產生後直接在同一次點擊裡儲存/分享;若手機因生成耗時使授權過期而擋下,再退回讓使用者親手點一次
      const manualBtn = () => {
        result.innerHTML = `<button type="button" class="btn primary" id="bm-save">${ic('suitcase')} 儲存 / 分享 PDF</button>`;
        result.querySelector('#bm-save').onclick = async () => {
          try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: opts.title }); return; }
          } catch (e) { if (e.name === 'AbortError') return; }
          const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        };
      };
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: opts.title });
        } else {
          const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); // 桌機/不支援分享:直接下載
        }
        msg.style.color = 'var(--accent)'; msg.textContent = '完成!';
      } catch (e) {
        if (e.name !== 'AbortError') { msg.style.color = 'var(--text-dim)'; msg.textContent = '已產生好,請按下方「儲存 / 分享 PDF」。'; manualBtn(); }
      } finally {
        go.disabled = false;
      }
    };
  });
}

// 組出旅遊書的列印用 HTML(白底黑字,獨立於 App 主題)
// 依行程日程排序 moments:先依關聯景點的「天」(Day1→最後),同天再依時間先後
function scheduleSortedMoments(moments, places) {
  const dayOf = new Map(places.map((p) => [p.id, p.assignedDay || 99]));
  return moments.slice().sort((a, b) => {
    const da = (a.placeId && dayOf.get(a.placeId)) || 99;
    const db2 = (b.placeId && dayOf.get(b.placeId)) || 99;
    if (da !== db2) return da - db2;
    return (a.takenAt || 0) - (b.takenAt || 0);
  });
}

function pdfBookHtml(trip, places, chosen, opts, photoUrls) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const dayCount = tripDayCount(trip, places);
  let h = '';
  if (opts.cover) {
    const flag = trip.country ? flagOf(trip.country) : '';
    h += `<section class="pb-cover"><div class="pb-flag">${flag || '🧳'}</div>
      <h1>${esc(opts.title || trip.name)}</h1>
      <div class="pb-sub">${esc(fmtDateRange(trip.startDate, trip.endDate))}${trip.country ? ' · ' + esc(countryName(trip.country)) : ''}</div></section>`;
  }
  if (opts.stats) {
    const visited = places.filter((p) => p.status === '已造訪').length;
    const totalSpend = chosen.reduce((s, m) => s + (Number(m.spend) || 0), 0);
    h += `<section class="pb-stats">
      <div><b>${dayCount}</b><span>天</span></div>
      <div><b>${visited}</b><span>造訪地</span></div>
      <div><b>${chosen.length}</b><span>入選點滴</span></div>
      ${totalSpend ? `<div><b>${totalSpend.toLocaleString()}</b><span>花費</span></div>` : ''}</section>`;
  }
  // 依行程日程分組:用關聯景點的「天」(Day1→最後);沒關聯景點的歸「其他」放最後
  const groups = new Map();
  scheduleSortedMoments(chosen, places).forEach((m) => {
    const day = (m.placeId && byId.get(m.placeId)?.assignedDay) || 0;
    const key = day || 9999;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const dayKeys = [...groups.keys()].sort((a, b) => a - b);
  for (const key of dayKeys) {
    const list = groups.get(key);
    const header = key === 9999 ? '其他' : `Day ${key}${trip.startDate ? ' · ' + dayDateLabel(trip.startDate, key) : ''}`;
    h += `<section class="pb-day"><h2>${header}</h2>`;
    for (const m of list) {
      const place = m.placeId ? byId.get(m.placeId) : null;
      const url = photoUrls[m.id];
      const caps = [hhmm(m.takenAt)];
      if (place) caps.push(esc(place.name));
      if (m.weather) caps.push(`${wmoEmoji(m.weather.code)} ${m.weather.temp}°`);
      if (m.rating) caps.push('★'.repeat(m.rating));
      if (m.spend) caps.push(`${esc(m.currency || '')}${Number(m.spend).toLocaleString()}`);
      h += `<div class="pb-item">${url ? `<img src="${url}" alt="">` : ''}
        <div class="pb-cap">${caps.join(' · ')}</div>
        ${m.text ? `<div class="pb-text">${esc(m.text)}</div>` : ''}</div>`;
    }
    h += `</section>`;
  }
  return h;
}

// html2pdf 是瀏覽器 UMD 函式庫,用 script 標籤載入取 window.html2pdf(比 esm 匯入穩定)
let _html2pdfPromise = null;
function loadHtml2pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (_html2pdfPromise) return _html2pdfPromise;
  _html2pdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js';
    s.onload = () => window.html2pdf ? resolve(window.html2pdf) : reject(new Error('排版元件載入異常'));
    s.onerror = () => reject(new Error('無法載入排版元件(需要網路)'));
    document.head.appendChild(s);
  });
  return _html2pdfPromise;
}

// jsPDF UMD 載入
let _jspdfPromise = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (_jspdfPromise) return _jspdfPromise;
  _jspdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
    s.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('排版元件載入異常'));
    s.onerror = () => reject(new Error('無法載入排版元件(需要網路)'));
    document.head.appendChild(s);
  });
  return _jspdfPromise;
}

const PGW = 1190, PGH = 1683; // 頁面畫布(A4 比例);逐頁畫、逐頁貼進 PDF,避免 html2canvas 空白/過大問題
function pdfWrap(ctx, text, x, y, maxW, lineH, maxLines) {
  const lines = []; let line = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  const use = maxLines ? lines.slice(0, maxLines) : lines;
  if (maxLines && lines.length > maxLines && use.length) use[use.length - 1] = use[use.length - 1].slice(0, -1) + '…';
  use.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + use.length * lineH;
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawContain(ctx, img, x, y, boxW, boxH, radius) {
  const f = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * f, h = img.height * f, dx = x + (boxW - w) / 2, dy = y;
  ctx.save();
  if (radius) { roundRectPath(ctx, dx, dy, w, h, radius); ctx.clip(); }
  ctx.drawImage(img, dx, dy, w, h);
  ctx.restore();
  return { w, h, dx, dy };
}
// 底圖:淡化 30% + 柔邊(徑向羽化),置於頁面底部,posKey 決定左/中/右
function drawBackdrop(ctx, img, posKey) {
  const w = Math.round(PGW * 0.52), h = Math.round(w * img.height / img.width);
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, w, h);
  o.globalCompositeOperation = 'destination-in'; // 用羽化遮罩做柔邊
  const g = o.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.12, w / 2, h / 2, Math.max(w, h) * 0.58);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.65, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = g; o.fillRect(0, 0, w, h);
  const margin = PGW * 0.03;
  const x = posKey === 'left' ? margin : posKey === 'right' ? PGW - margin - w : (PGW - w) / 2;
  const y = PGH - h * 0.82; // 底部,略微出血
  ctx.save(); ctx.globalAlpha = 0.3; ctx.drawImage(off, x, y); ctx.restore();
}

// 用 jsPDF + 逐頁 canvas 產生旅遊書 PDF;回傳 { blob, filename }(分享/下載交給呼叫端在使用者點擊時做)
async function generateBookPDF(trip, places, moments, opts) {
  const jsPDF = await loadJsPDF();
  const chosen = moments.filter((m) => opts.momentIds.has(m.id));
  const byId = new Map(places.map((p) => [p.id, p]));
  const dayCount = tripDayCount(trip, places);

  // 底圖影像:優先用使用者上傳的,否則用第一張入選照片
  let backImg = null;
  let backUrl = opts.backdropUrl;
  if (!backUrl) { const fp = chosen.find((m) => m.photoId); if (fp) backUrl = await loadMomentPhoto(fp.photoId, fp.photoPath); }
  if (backUrl) backImg = await loadImg(backUrl).catch(() => null);

  // 依日程分組
  const groups = new Map();
  scheduleSortedMoments(chosen, places).forEach((m) => {
    const key = ((m.placeId && byId.get(m.placeId)?.assignedDay) || 0) || 9999;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m);
  });

  const pages = [];
  const newPage = () => { const c = document.createElement('canvas'); c.width = PGW; c.height = PGH; const ctx = c.getContext('2d'); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PGW, PGH); return { c, ctx }; };

  // 封面
  if (opts.cover) {
    const { c, ctx } = newPage();
    const g = ctx.createLinearGradient(0, 0, PGW, PGH * 0.44);
    g.addColorStop(0, '#14b8a6'); g.addColorStop(1, '#0d7d76');
    ctx.fillStyle = g; ctx.fillRect(0, 0, PGW, PGH * 0.44);
    if (backImg) drawBackdrop(ctx, backImg, 'center');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = '128px sans-serif'; ctx.fillText(trip.country ? flagOf(trip.country) : '🧳', PGW / 2, PGH * 0.17);
    ctx.font = '700 82px sans-serif'; pdfWrap(ctx, opts.title || trip.name, PGW / 2, PGH * 0.27, PGW * 0.82, 96, 2);
    ctx.font = '600 42px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(fmtDateRange(trip.startDate, trip.endDate) + (trip.country ? ' · ' + countryName(trip.country) : ''), PGW / 2, PGH * 0.4);
    if (opts.stats) {
      const visited = places.filter((p) => p.status === '已造訪').length;
      const totalSpend = chosen.reduce((s, m) => s + (Number(m.spend) || 0), 0);
      const cells = [[dayCount, '天'], [visited, '造訪地'], [chosen.length, '點滴']];
      if (totalSpend) cells.push([totalSpend.toLocaleString(), '花費']);
      const cw = PGW * 0.86 / cells.length, sx = PGW * 0.07, sy = PGH * 0.56;
      cells.forEach(([v, l], i) => {
        const cx = sx + cw * i + cw / 2;
        ctx.fillStyle = '#0d7d76'; ctx.font = '700 74px sans-serif'; ctx.fillText(String(v), cx, sy);
        ctx.fillStyle = '#777'; ctx.font = '600 34px sans-serif'; ctx.fillText(l, cx, sy + 54);
      });
    }
    pages.push(c);
  }

  // 每天一頁
  const POS = ['left', 'center', 'right'];
  for (let day = 1; day <= dayCount; day++) {
    const list = groups.get(day) || [];
    const { c, ctx } = newPage();
    if (backImg) drawBackdrop(ctx, backImg, POS[Math.floor(Math.random() * 3)]); // 隨機置底左/中/右
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0d7d76'; ctx.font = '700 78px sans-serif'; ctx.fillText('Day ' + day, 84, 132);
    if (trip.startDate) { ctx.fillStyle = '#666'; ctx.font = '600 40px sans-serif'; ctx.fillText(dayDateLabel(trip.startDate, day), 320, 130); }
    ctx.strokeStyle = '#0d7d76'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(84, 162); ctx.lineTo(PGW - 84, 162); ctx.stroke();

    let y = 226; const bottom = PGH - 90;
    if (!list.length) { ctx.fillStyle = '#999'; ctx.font = '400 42px sans-serif'; ctx.fillText('這天沒有選入的點滴', 88, 280); }
    for (const m of list) {
      if (y > bottom) break;
      const place = m.placeId ? byId.get(m.placeId) : null;
      const caps = [hhmm(m.takenAt)]; if (place) caps.push(place.name);
      if (m.weather) caps.push(`${wmoEmoji(m.weather.code)} ${m.weather.temp}°`);
      if (m.rating) caps.push('★'.repeat(m.rating));
      if (m.photoId) {
        const u = await loadMomentPhoto(m.photoId, m.photoPath);
        if (u) { const im = await loadImg(u).catch(() => null); if (im) { const r = drawContain(ctx, im, 84, y, PGW - 168, 600, 22); y = r.dy + r.h + 12; } }
      }
      ctx.fillStyle = '#0d7d76'; ctx.font = '600 32px sans-serif'; ctx.fillText(caps.join(' · '), 88, y + 30); y += 48;
      if (m.text) { ctx.fillStyle = '#222'; ctx.font = '400 38px sans-serif'; y = pdfWrap(ctx, m.text, 88, y + 32, PGW - 176, 52, 3) + 22; }
      y += 20;
    }
    pages.push(c);
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  pages.forEach((c, i) => { if (i > 0) doc.addPage(); doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, ph); });
  return { blob: doc.output('blob'), filename: `旅遊書-${opts.title || trip.name}.pdf` };
}

// ---- 製作回顧影片:挑照片 → 即時錄成投影片影片(Ken Burns + 淡入淡出)----------
function videoSupported() {
  try {
    const c = document.createElement('canvas');
    return typeof c.captureStream === 'function' && 'MediaRecorder' in window && !!pickVideoMime();
  } catch (_) { return false; }
}
function pickVideoMime() {
  const cands = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of cands) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖片載入失敗')); i.src = url; }); }
function drawCover(ctx, img, W, H, scale) {
  const s = Math.max(W / img.width, H / img.height) * scale;
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}
// 把圖縮成很小的一張(之後放大回畫面 = 平滑模糊,不需 canvas 濾鏡,相容 iOS)
function makeBgSmall(img) {
  const long = 72;
  const s = long / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// 一張投影片:模糊底(cover + Ken Burns)+ 暗化 + 完整照片(contain,不裁切)。
// tf:前景轉場變換 { scale, rotate(弧度), dx, dy(佔畫面比例) },用於進場特效。
function drawSlide(ctx, img, bgSmall, W, H, kbScale, tf) {
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const bs = Math.max(W / bgSmall.width, H / bgSmall.height) * kbScale;
  const bw = bgSmall.width * bs, bh = bgSmall.height * bs;
  ctx.drawImage(bgSmall, (W - bw) / 2, (H - bh) / 2, bw, bh); // 放大模糊底
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H); // 暗化,主體更清楚
  const f = Math.min(W / img.width, H / img.height);           // contain:整張照片,不裁切
  const fw = img.width * f, fh = img.height * f;
  ctx.save();
  ctx.translate(W / 2 + (tf?.dx || 0) * W, H / 2 + (tf?.dy || 0) * H);
  if (tf?.rotate) ctx.rotate(tf.rotate);
  if (tf?.scale && tf.scale !== 1) ctx.scale(tf.scale, tf.scale);
  ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
  ctx.restore();
}
// 進場轉場:style 為特效名稱('fade' 或空 = 只淡入不變形);e=進場進度(0→1)
const VID_TRANSITIONS = ['zoomIn', 'zoomOut', 'rotateCW', 'rotateCCW', 'slideUp', 'slideDown', 'slideLeft', 'slideRight'];
function transitionTf(style, e) {
  const tf = { scale: 1, rotate: 0, dx: 0, dy: 0 };
  if (!style || style === 'fade') return tf;
  const k = 1 - Math.pow(1 - Math.min(1, Math.max(0, e)), 3); // easeOutCubic
  const d = 10 * Math.PI / 180;
  switch (style) {
    case 'zoomIn': tf.scale = 0.78 + 0.22 * k; break;
    case 'zoomOut': tf.scale = 1.25 - 0.25 * k; break;
    case 'rotateCW': tf.rotate = -d + d * k; tf.scale = 0.92 + 0.08 * k; break;
    case 'rotateCCW': tf.rotate = d - d * k; tf.scale = 0.92 + 0.08 * k; break;
    case 'slideUp': tf.dy = 0.28 * (1 - k); break;
    case 'slideDown': tf.dy = -0.28 * (1 - k); break;
    case 'slideLeft': tf.dx = 0.28 * (1 - k); break;
    case 'slideRight': tf.dx = -0.28 * (1 - k); break;
  }
  return tf;
}
function wrapText(ctx, text, cx, cy, maxW, lh) {
  const lines = []; let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  const y0 = cy - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, y0 + i * lh));
}

function openVideoMaker(trip, places, moments) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const photos = scheduleSortedMoments(moments.filter((m) => m.photoId), places); // 依行程日程排序
  const rows = photos.map((m) => {
    const place = m.placeId ? byId.get(m.placeId) : null;
    const label = [hhmm(m.takenAt), place ? place.name : '', m.text ? m.text.slice(0, 16) : ''].filter(Boolean).join(' · ') || '照片';
    return `<label class="bm-row"><input type="checkbox" class="vm-pick" value="${esc(m.id)}" checked><img class="bm-thumb" data-asset="${esc(m.photoId)}" data-path="${esc(m.photoPath || '')}" alt=""><span>${esc(label)}</span></label>`;
  }).join('');
  const supported = videoSupported();

  openSheet(`
    <h2>製作回顧影片</h2>
    <p class="tip-desktop">💻 強烈建議在<b>電腦(桌機瀏覽器)</b>生成:成功率最高、速度最快。影片是「即時錄製」,手機生成時螢幕需全程開著、不能切走 App,較長的影片(90/120 秒)在電腦上體驗更好。</p>
    ${supported ? '' : '<p class="meta" style="color:var(--danger);margin-bottom:.6rem">這台裝置/瀏覽器不支援在網頁內生成影片。請改用電腦的瀏覽器開啟本頁製作。</p>'}
    <div class="lab" style="margin:.2rem 0 .4rem">影片長度</div>
    <div class="chips" id="vm-dur">
      <div class="chip" data-d="30">30 秒</div>
      <div class="chip on" data-d="60">60 秒</div>
      <div class="chip" data-d="90">90 秒</div>
      <div class="chip" data-d="120">120 秒</div>
    </div>
    <div class="lab" style="margin:.7rem 0 .4rem">畫面比例</div>
    <div class="chips" id="vm-fmt">
      <div class="chip on" data-f="v">直式 9:16（限動 / 短影音）</div>
      <div class="chip" data-f="h">橫式 16:9（寬螢幕）</div>
    </div>
    <div class="lab" style="margin:.7rem 0 .4rem">選擇照片(預設全選)</div>
    <div class="bm-actions"><button type="button" class="chip" id="vm-all">全選</button><button type="button" class="chip" id="vm-none">全不選</button></div>
    <div class="bm-list">${photos.length ? rows : '<div class="meta">還沒有照片。先到「旅途」加幾張照片。</div>'}</div>
    <div class="vm-progress" id="vm-progress" style="display:none"><div class="vm-bar" id="vm-bar"></div></div>
    <div id="vm-result" style="margin:.4rem 0"></div>
    <div id="vm-msg" class="meta" style="min-height:1.1em;margin:.5rem 0"></div>
    <div class="btn-row">
      <button class="btn primary" id="vm-go" ${supported ? '' : 'disabled'}>生成影片</button>
      <button class="btn ghost" id="vm-cancel">取消</button>
    </div>
  `, (sheet, close) => {
    sheet.querySelectorAll('img[data-asset]').forEach(async (im) => {
      const u = await loadMomentPhoto(im.dataset.asset, im.dataset.path || '');
      if (u) im.src = u; else im.replaceWith(Object.assign(document.createElement('div'), { className: 'bm-thumb ph', textContent: '📷' }));
    });
    let dur = 60;
    sheet.querySelector('#vm-dur').onclick = (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      dur = Number(chip.dataset.d);
      sheet.querySelectorAll('#vm-dur .chip').forEach((c) => c.classList.toggle('on', c === chip));
    };
    let fmt = 'v'; // v=直式 9:16, h=橫式 16:9
    sheet.querySelector('#vm-fmt').onclick = (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      fmt = chip.dataset.f;
      sheet.querySelectorAll('#vm-fmt .chip').forEach((c) => c.classList.toggle('on', c === chip));
    };
    const picks = () => [...sheet.querySelectorAll('.vm-pick')];
    sheet.querySelector('#vm-all').onclick = () => picks().forEach((c) => { c.checked = true; });
    sheet.querySelector('#vm-none').onclick = () => picks().forEach((c) => { c.checked = false; });
    sheet.querySelector('#vm-cancel').onclick = close;
    sheet.querySelector('#vm-go').onclick = async () => {
      const ids = new Set(picks().filter((c) => c.checked).map((c) => c.value));
      const msg = sheet.querySelector('#vm-msg');
      const go = sheet.querySelector('#vm-go');
      const bar = sheet.querySelector('#vm-bar');
      const prog = sheet.querySelector('#vm-progress');
      if (!ids.size) { msg.style.color = 'var(--danger)'; msg.textContent = '至少選一張照片。'; return; }
      go.disabled = true; prog.style.display = 'block';
      msg.style.color = 'var(--text-dim)'; msg.textContent = `錄製中…約 ${dur} 秒,過程請保持畫面開啟、別切走。`;
      try {
        const chosen = photos.filter((m) => ids.has(m.id));
        const urls = [];
        for (const m of chosen) { const u = await loadMomentPhoto(m.photoId, m.photoPath); if (u) urls.push(u); }
        if (!urls.length) throw new Error('選到的照片都載入不到');
        const imgs = await Promise.all(urls.map(loadImg));
        const dims = fmt === 'h' ? { W: 1920, H: 1080 } : { W: 1080, H: 1920 };
        const blob = await generateVideoBlob(trip.name, imgs, dur, dims, (p) => { bar.style.width = Math.round(p * 100) + '%'; });
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `回顧影片-${trip.name}.${ext}`, { type: blob.type });
        const url = URL.createObjectURL(blob);
        // 錄製要 30~120 秒,原本點擊的授權早就過期 → 不自動分享;顯示預覽 + 讓使用者「親手點」儲存
        const result = sheet.querySelector('#vm-result');
        result.innerHTML = `<video src="${url}" controls playsinline style="width:100%;border-radius:12px;background:#000"></video>
          <button type="button" class="btn primary" id="vm-save" style="margin-top:.5rem">${ic('suitcase')} 儲存 / 分享影片</button>`;
        result.querySelector('#vm-save').onclick = async () => {
          try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: trip.name }); return; }
          } catch (e) { if (e.name === 'AbortError') return; }
          const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); // 後備:下載
        };
        msg.style.color = 'var(--accent)'; msg.textContent = '完成!預覽下方影片,按「儲存 / 分享影片」存到相簿或檔案。';
      } catch (e) {
        msg.style.color = 'var(--danger)'; msg.textContent = '生成失敗:' + (e.message || e);
      } finally {
        go.disabled = false; prog.style.display = 'none'; bar.style.width = '0%';
      }
    };
  });
}

// 即時把照片畫成投影片並錄成影片(dims:直式1080×1920 或 橫式1920×1080,標題卡 + Ken Burns + 淡入淡出)
async function generateVideoBlob(title, imgs, durationSec, dims, onProgress) {
  const W = dims.W, H = dims.H, fps = 30;
  const titleFont = Math.round(Math.min(W, H) * 0.075);
  const mime = pickVideoMime();
  if (!mime) throw new Error('此瀏覽器不支援影片錄製');
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const titleSec = 2.0;
  const n = imgs.length;
  const bgs = imgs.map(makeBgSmall); // 預先做好每張的模糊底(縮圖),錄製時直接放大用
  const perPhoto = (durationSec - titleSec) / n;
  const transDur = Math.min(0.7, perPhoto * 0.4); // 每張出場時的進場時長
  // 每張的進場方式:第一張與多數為單純淡入('fade'),隨機約 40% 跳一個隨機特效
  const styles = imgs.map((_, i) => (i > 0 && Math.random() < 0.4) ? VID_TRANSITIONS[Math.floor(Math.random() * VID_TRANSITIONS.length)] : 'fade');
  const easeOut = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
  rec.start();
  const start = performance.now();
  await new Promise((resolve) => {
    function frame(now) {
      const t = (now - start) / 1000;
      if (t >= durationSec) { resolve(); return; }
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (t < titleSec) {
        ctx.fillStyle = '#0b1f4b'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${titleFont}px sans-serif`;
        wrapText(ctx, title, W / 2, H / 2, W - titleFont * 2, titleFont * 1.25);
      } else {
        const tt = t - titleSec;
        let idx = Math.floor(tt / perPhoto); if (idx >= n) idx = n - 1;
        const local = tt - idx * perPhoto;
        const kb = 1.0 + 0.09 * (local / perPhoto); // 模糊底的輕微 Ken Burns
        if (local < transDur) {
          // 出場時進場一次:前一張墊底,這張淡入(多數)或淡入+特效(隨機)
          const p = easeOut(local / transDur);
          if (idx > 0) drawSlide(ctx, imgs[idx - 1], bgs[idx - 1], W, H, 1.0, null);
          ctx.globalAlpha = p;
          drawSlide(ctx, imgs[idx], bgs[idx], W, H, kb, transitionTf(styles[idx], local / transDur));
          ctx.globalAlpha = 1;
        } else {
          // 穩定顯示:完整照片、不變形(只有模糊底輕微運鏡)
          drawSlide(ctx, imgs[idx], bgs[idx], W, H, kb, null);
        }
      }
      onProgress && onProgress(Math.min(1, t / durationSec));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  rec.stop();
  await stopped;
  return new Blob(chunks, { type: mime });
}

// 「記一筆 / 編輯記錄」表單。prefill:靠近提示打卡時預先帶入 {coords, placeId, weather}。
function openMomentSheet(trip, places, moment = null, prefill = null) {
  const editing = !!moment;
  let pendingDataUrl = null;                         // 這次新選的照片(存檔時才寫入 assets)
  let pendingAudioUrl = null;                        // 這次新錄的語音
  let takenAt = moment?.takenAt || Date.now();
  let coords = (moment && moment.lat != null) ? { lat: moment.lat, lng: moment.lng } : (prefill?.coords || null);
  let rating = moment?.rating || 0;
  let weather = moment?.weather || prefill?.weather || null;
  const prePlaceId = moment?.placeId || (!moment && prefill?.placeId) || null;
  const sortedPlaces = places.slice().sort((a, b) => a.createdAt - b.createdAt);

  openSheet(`
    <h2>${editing ? '編輯記錄' : '記一筆'}</h2>
    <div class="m-photo-pick">
      <input type="file" accept="image/*" id="m-file" hidden>
      <button type="button" class="btn ghost" id="m-photobtn" style="--c:#0ea5e9;color:#0ea5e9">${ic('camera')} 加照片 / 拍照</button>
      <div id="m-preview" class="m-preview"></div>
    </div>
    <div class="m-audio-pick">
      <button type="button" class="btn ghost" id="m-recbtn" style="--c:#ec4899;color:#ec4899">🎤 錄音</button>
      <div id="m-audiopreview" class="m-preview"></div>
    </div>
    <label class="field"><span class="lab">想說的話 / 心情</span>
      <textarea id="m-text" rows="3" placeholder="此刻的心情、看到什麼、吃了什麼…">${esc(moment?.text || '')}</textarea></label>
    <div class="field"><span class="lab">評分</span>
      <div class="starpick" id="m-stars"></div></div>
    <div class="row2">
      <label class="field"><span class="lab">花費(選填)</span>
        <input id="m-spend" type="number" inputmode="decimal" min="0" value="${moment?.spend ? esc(moment.spend) : ''}"></label>
      <label class="field"><span class="lab">幣別</span>
        <select id="m-currency" class="select">${currencyOptions(moment?.currency || countryCurrency(trip.country))}</select></label>
    </div>
    <label class="field"><span class="lab">關聯景點(選填,會標為已造訪)</span>
      <select id="m-place" class="select">
        <option value="">不關聯</option>
        ${sortedPlaces.map((p) => `<option value="${p.id}" ${prePlaceId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></label>
    <button type="button" class="btn ghost" id="m-locate" style="--c:#22b34a;color:#22b34a">${ic('pin')} 打卡:記下我現在的位置</button>
    <div id="m-locmsg" class="meta" style="min-height:1.1em;margin:.2rem 0 .4rem">${coords ? `已記錄座標 (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : ''}</div>
    <div class="btn-row">
      <button class="btn primary" id="m-save">${editing ? '儲存' : '記下來'}</button>
      ${editing ? '<button class="btn danger" id="m-del">刪除這則</button>' : ''}
      <button class="btn ghost" id="m-cancel">取消</button>
    </div>
  `, (sheet, close) => {
    const preview = sheet.querySelector('#m-preview');
    const audioPrev = sheet.querySelector('#m-audiopreview');
    const locMsg = sheet.querySelector('#m-locmsg');
    const placeSel = sheet.querySelector('#m-place');
    // 既有照片/語音先顯示
    if (editing && moment.photoId) db.getAsset(moment.photoId).then((u) => { if (u) preview.innerHTML = `<img src="${u}" alt="">`; });
    if (editing && moment.audioId) db.getAsset(moment.audioId).then((u) => { if (u) audioPrev.innerHTML = `<audio controls src="${u}"></audio>`; });

    // 語音錄音(MediaRecorder;iOS 14.5+ 支援,存本機)
    const recBtn = sheet.querySelector('#m-recbtn');
    let mediaRec = null, chunks = [], recording = false;
    recBtn.onclick = async () => {
      if (recording) { mediaRec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        mediaRec = new MediaRecorder(stream);
        mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: mediaRec.mimeType || 'audio/mp4' });
          pendingAudioUrl = await blobToDataUrl(blob);
          audioPrev.innerHTML = `<audio controls src="${pendingAudioUrl}"></audio>`;
          recBtn.textContent = '🎤 重新錄音'; recBtn.classList.remove('rec'); recording = false;
        };
        mediaRec.start();
        recording = true; recBtn.textContent = '⏹ 停止錄音'; recBtn.classList.add('rec');
      } catch (_) {
        audioPrev.innerHTML = '<div class="meta" style="color:var(--danger)">無法錄音,請允許麥克風權限(iOS 設定 → Safari → 麥克風)。</div>';
      }
    };

    // 星等
    const starBox = sheet.querySelector('#m-stars');
    const drawStars = () => {
      starBox.innerHTML = [1, 2, 3, 4, 5].map((n) =>
        `<button type="button" class="star ${n <= rating ? 'on' : ''}" data-n="${n}">★</button>`).join('')
        + (rating ? `<button type="button" class="star clear" data-n="0">清除</button>` : '');
      starBox.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => {
        const n = Number(b.dataset.n); rating = (n === rating) ? 0 : n; drawStars();
      });
    };
    drawStars();

    // 選照片
    sheet.querySelector('#m-photobtn').onclick = () => sheet.querySelector('#m-file').click();
    sheet.querySelector('#m-file').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      preview.innerHTML = '<div class="meta">處理照片中…</div>';
      try {
        const { dataUrl, takenAt: t } = await compressImage(file);
        pendingDataUrl = dataUrl; takenAt = t;
        preview.innerHTML = `<img src="${dataUrl}" alt="">`;
      } catch (_) { preview.innerHTML = '<div class="meta" style="color:var(--danger)">照片讀取失敗,換一張試試。</div>'; }
    };

    // 打卡定位
    sheet.querySelector('#m-locate').onclick = async () => {
      locMsg.style.color = 'var(--text-dim)'; locMsg.textContent = '定位中…(請允許使用位置)';
      try {
        coords = await getPositionOnce();
        weather = await fetchWeather(coords.lat, coords.lng); // 順手抓當下天氣
        const wx = weather ? `　${wmoEmoji(weather.code)} ${weather.temp}°` : '';
        const near = nearestPlace(places, coords);
        if (near && near.dist < 0.25 && !placeSel.value) {
          placeSel.value = near.place.id;
          locMsg.textContent = `已記錄位置 ✓${wx}　最近景點:${near.place.name}(約 ${Math.round(near.dist * 1000)} 公尺,將標為已造訪)`;
        } else {
          locMsg.textContent = `已記錄位置 ✓${wx} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        }
      } catch (e) {
        locMsg.style.color = 'var(--danger)';
        locMsg.textContent = e.code === 1 ? '你拒絕了定位權限。到 iOS 設定 → Safari → 位置 開啟。' : '定位失敗,請稍後再試。';
      }
    };

    // 儲存
    sheet.querySelector('#m-save').onclick = async () => {
      const text = sheet.querySelector('#m-text').value.trim();
      const spend = parseFloat(sheet.querySelector('#m-spend').value) || 0;
      const currency = sheet.querySelector('#m-currency').value.trim();
      const placeId = placeSel.value || null;
      const hadPhoto = editing && moment.photoId, hadAudio = editing && moment.audioId;
      if (!text && !pendingDataUrl && !pendingAudioUrl && !coords && !rating && !spend && !hadPhoto && !hadAudio) {
        locMsg.style.color = 'var(--danger)'; locMsg.textContent = '至少寫點字、加張照片、錄段語音、打個卡或給個評分吧 🙂'; return;
      }
      let photoId = editing ? moment.photoId : null;
      if (pendingDataUrl) photoId = await db.putAsset(pendingDataUrl);
      let audioId = editing ? moment.audioId : null;
      if (pendingAudioUrl) audioId = await db.putAsset(pendingAudioUrl);
      const patch = {
        text, rating, spend, currency, placeId, weather,
        lat: coords ? coords.lat : (editing ? moment.lat : null),
        lng: coords ? coords.lng : (editing ? moment.lng : null),
        photoId, hasPhoto: !!photoId, audioId, hasAudio: !!audioId, takenAt,
      };
      if (editing) await db.updateMoment(moment.id, patch);
      else await db.createMoment(trip.id, { ...patch, authorId: currentUser?.id, authorName: displayName() });
      if (placeId) await db.updatePlace(placeId, { status: '已造訪' }); // 關聯景點自動標為已造訪
      close(); render();
    };

    const delBtn = sheet.querySelector('#m-del');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('刪除這則記錄?(照片也會一併刪除)')) return;
      if (moment.photoPath && cloud && cloud.deletePhoto) cloud.deletePhoto(moment.photoPath).catch(() => {}); // 順手清雲端照片
      await db.deleteMoment(moment.id);
      close(); render();
    };
    sheet.querySelector('#m-cancel').onclick = close;
  });
}

// ---- 離線狀態 --------------------------------------------------------------
function updateOnline() { document.body.classList.toggle('offline', !navigator.onLine); }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

// ---- 帳號 / 雲端同步（Supabase）-------------------------------------------
// sync.js 是「動態載入」的:萬一離線或 CDN 被擋,載入失敗也只是沒有雲端,
// App 仍能純本地運作。
let cloud = null;         // sync.js 模組（null = 純本地）
let cloudDrive = null;    // drive.js 模組（Google Drive 備份,動態載入）
let cloudUser = null;     // 目前登入者
let cloudState = 'idle';  // idle | syncing | synced | error
let cloudError = '';      // 最近一次同步失敗的原因(顯示在帳號視窗,方便診斷)

const acctBtn = document.createElement('button');
acctBtn.className = 'acct';
acctBtn.addEventListener('click', openAuthSheet);
header.appendChild(acctBtn);

// 邀請通知鈴
let pendingInvites = [];
const notifBtn = document.createElement('button');
notifBtn.className = 'acct notif';
notifBtn.style.display = 'none';
notifBtn.addEventListener('click', openNotifSheet);
header.insertBefore(notifBtn, acctBtn);

function updateNotif() {
  const n = pendingInvites.length;
  notifBtn.style.display = (currentUser && n > 0) ? 'inline-flex' : 'none';
  notifBtn.textContent = '邀請 ' + n;
}
async function refreshInvites() {
  if (!cloud || !cloud.listMyInvites || !currentUser) { pendingInvites = []; updateNotif(); return; }
  try { pendingInvites = await cloud.listMyInvites(); } catch (_) { pendingInvites = []; }
  updateNotif();
}
function openNotifSheet() {
  if (!cloud) { alert('雲端載入失敗,無法查看邀請。'); return; }
  const items = pendingInvites;
  openSheet(`
    <h2>邀請通知</h2>
    ${items.length ? items.map((iv) => `
      <div class="card" style="cursor:default">
        <h3>${esc(iv.inviter_name || '有人')} 邀請你一起編輯</h3>
        <div class="meta">${esc(iv.trip_name || '一趟行程')}</div>
        <div class="btn-row" style="margin-top:.6rem">
          <button class="btn primary" data-acc="${esc(iv.id)}" data-trip="${esc(iv.trip_id)}">接受並加入</button>
          <button class="btn ghost" data-dec="${esc(iv.id)}">拒絕</button>
        </div>
      </div>`).join('') : '<p class="meta">目前沒有待處理的邀請。</p>'}
    <div class="btn-row"><button class="btn ghost" id="n-close">關閉</button></div>
  `, (sheet, close) => {
    sheet.querySelector('#n-close').onclick = close;
    sheet.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => {
      b.textContent = '加入中…';
      const { error } = await cloud.acceptInvite(b.dataset.acc);
      if (error) { b.textContent = '失敗:' + (error.message || ''); return; }
      await cloud.fullSync().catch(() => {});
      await refreshInvites();
      close();
      location.hash = `#/trip/${b.dataset.trip}`;
    });
    sheet.querySelectorAll('[data-dec]').forEach((b) => b.onclick = async () => {
      await cloud.declineInvite(b.dataset.dec).catch(() => {});
      await refreshInvites();
      close();
    });
  });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshInvites(); });

function updateAcct() {
  if (!currentUser) { acctBtn.textContent = '登入'; return; }
  if (!cloud) { acctBtn.textContent = '☁︎ 已登入'; return; }
  acctBtn.textContent = { syncing: '⟳ 同步中', synced: '✓ 已同步', error: '⚠ 未同步' }[cloudState] || '☁︎ 已登入';
}

// 更新登入者(供把關與依使用者過濾),並記到 localStorage 讓重開/離線也記得
function setAuthUser(user, event) {
  cloudUser = user;
  if (event === 'PASSWORD_RECOVERY') { setTimeout(openResetPasswordSheet, 100); } // 忘記密碼回連
  if (user) {
    currentUser = { id: user.id, email: user.email || '' };
    localStorage.setItem('authUserId', user.id);
    localStorage.setItem('authUserEmail', user.email || '');
    // 一次性修復:認領缺少擁有者標記的舊行程(避免更新後行程看似消失)
    if (!localStorage.getItem('ownerRepairDone2')) {
      localStorage.setItem('ownerRepairDone2', '1');
      db.claimOwnerlessTrips(user.id).then((n) => { if (n) render(); }).catch(() => {});
    }
    // 載入暱稱(先用本地快取,再從雲端更新)
    nickname = localStorage.getItem('authNickname') || '';
    if (cloud) cloud.getMyProfile().then((p) => {
      if (p && p.nickname) { nickname = p.nickname; localStorage.setItem('authNickname', nickname); updateAcct(); render(); }
      // 一律確保雲端有 profile(含 email),否則別人用 email 邀請時會查不到你
      cloud.saveProfile(nickname || (user.email ? user.email.split('@')[0] : '')).catch(() => {});
    }).catch(() => {});
    refreshInvites(); // 載入待處理的邀請通知
  } else {
    currentUser = null; nickname = '';
    localStorage.removeItem('authUserId');
    localStorage.removeItem('authUserEmail');
    localStorage.removeItem('authNickname');
    pendingInvites = [];
  }
  updateNotif();
  updateAcct();
  render();
}

// 忘記密碼回連後:設定新密碼
function openResetPasswordSheet() {
  if (!cloud) return;
  openSheet(`
    <h2>設定新密碼</h2>
    <p class="meta" style="margin-bottom:14px">輸入新的密碼(至少 6 碼),之後用新密碼登入。</p>
    <label class="field"><span class="lab">新密碼</span>
      <input id="rp-pw" type="password" autocomplete="new-password" placeholder="至少 6 碼"></label>
    <div id="rp-msg" class="meta" style="min-height:1.1em"></div>
    <div class="btn-row">
      <button class="btn primary" id="rp-save">更新密碼</button>
      <button class="btn ghost" id="rp-cancel">稍後</button>
    </div>
  `, (sheet, close) => {
    const msg = sheet.querySelector('#rp-msg');
    sheet.querySelector('#rp-cancel').onclick = close;
    sheet.querySelector('#rp-save').onclick = async () => {
      const pw = sheet.querySelector('#rp-pw').value;
      if (pw.length < 6) { msg.style.color = 'var(--danger)'; msg.textContent = '密碼至少 6 碼'; return; }
      msg.style.color = 'var(--text-dim)'; msg.textContent = '更新中…';
      const { error } = await cloud.updatePassword(pw);
      if (error) { msg.style.color = 'var(--danger)'; msg.textContent = '更新失敗:' + error.message; return; }
      msg.style.color = 'var(--accent)'; msg.textContent = '密碼已更新!';
      setTimeout(close, 1200);
    };
  });
}

async function initCloud() {
  updateAcct();
  try {
    cloud = await import('./sync.js');
  } catch (e) {
    console.warn('雲端模組載入失敗,以純本地模式運作', e);
    cloud = null; updateAcct(); return;
  }
  cloud.onStatus((s) => {
    if (s === 'syncing') cloudState = 'syncing';
    else if (s === 'synced') { cloudState = 'synced'; cloudError = ''; render(); }
    else if (s && s.startsWith('error')) { cloudState = 'error'; cloudError = s.slice(6); }
    updateAcct();
  });
  await cloud.initAuth(setAuthUser); // 登入狀態變動 → 更新使用者、重繪(含把關)
  updateAcct();
}

// ---- 備份 / 還原(把整個本機資料庫含照片語音打包成一個檔)---------------------
async function exportBackup() {
  const data = {};
  for (const s of ['trips', 'places', 'moments', 'assets']) data[s] = await db._sync.allRaw(s);
  const fname = `tour-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify({ app: 'tour', version: 1, exportedAt: Date.now(), data })], { type: 'application/json' });
  const file = new File([blob], fname, { type: 'application/json' });
  // iOS 優先用分享單(可存到「檔案」/iCloud/寄給自己);不支援才走下載
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '旅程備份' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function importBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (!parsed || parsed.app !== 'tour' || !parsed.data) throw new Error('不是有效的旅程備份檔');
  let n = 0;
  for (const s of ['trips', 'places', 'moments', 'assets']) {
    for (const rec of (parsed.data[s] || [])) { await db._sync.putRaw(s, rec); n++; }
  }
  return n;
}

function openAuthSheet() {
  if (!cloud) { alert('雲端功能載入失敗（可能離線或被網路阻擋）。App 仍可離線使用,資料存在本機。'); return; }

  if (cloudUser) {
    const stTxt = { syncing: '同步中…', synced: '已同步 ✓', error: '上次同步失敗 ⚠' }[cloudState] || '—';
    const errBox = (cloudState === 'error' && cloudError)
      ? `<p class="sync-err">同步錯誤訊息(給開發者看):<br>${esc(cloudError)}</p>`
      : '';
    openSheet(`
      <h2>${esc(displayName())},您好</h2>
      <p class="meta" style="margin-bottom:14px">已登入:<b>${esc(cloudUser.email || '')}</b><br>狀態:${stTxt}　・　版本 ${APP_VERSION}</p>
      ${errBox}
      <label class="field"><span class="lab">暱稱</span>
        <div style="display:flex;gap:.5rem">
          <input id="a-nick" value="${esc(nickname)}" placeholder="例如：Neo">
          <button type="button" class="btn ghost" id="a-nicksave" style="width:auto;padding:.6rem 1rem">儲存</button>
        </div></label>
      <div class="section-title" style="margin-top:.4rem">備份與還原</div>
      <p class="meta" style="margin-bottom:.5rem">文字類資料已在雲端;照片/語音只存本機,建議測試前先匯出一份到「檔案」App / iCloud。</p>
      <input type="file" accept="application/json,.json" id="a-restorefile" hidden>
      <div style="display:flex;gap:.5rem;margin-bottom:1rem">
        <button type="button" class="btn ghost" id="a-backup" style="flex:1;--c:#0ea5e9;color:#0ea5e9">${ic('suitcase')} 匯出備份</button>
        <button type="button" class="btn ghost" id="a-restore" style="flex:1">還原備份</button>
      </div>
      <div class="btn-row">
        <button class="btn primary" id="a-sync">立即同步</button>
        <button class="btn danger" id="a-out">登出</button>
        <button class="btn ghost" id="a-cancel">關閉</button>
      </div>`, (sheet, close) => {
      sheet.querySelector('#a-cancel').onclick = close;
      sheet.querySelector('#a-backup').onclick = async () => {
        const b = sheet.querySelector('#a-backup'); const t = b.innerHTML; b.textContent = '準備中…';
        try { await exportBackup(); b.textContent = '已匯出 ✓'; } catch (_) { b.textContent = '匯出失敗'; }
        setTimeout(() => { b.innerHTML = t; }, 1600);
      };
      const rf = sheet.querySelector('#a-restorefile');
      sheet.querySelector('#a-restore').onclick = () => rf.click();
      rf.onchange = async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        if (!confirm('還原會用備份檔覆蓋本機「相同項目」的資料(以較舊的備份覆蓋現況)。確定要還原?')) { rf.value = ''; return; }
        try {
          const n = await importBackup(f);
          await cloud.fullSync?.().catch(() => {});
          alert(`已還原 ${n} 筆資料(含照片/語音)。`);
          close(); render();
        } catch (err) { alert('還原失敗:' + (err.message || err)); }
      };
      sheet.querySelector('#a-nicksave').onclick = async () => {
        const nk = sheet.querySelector('#a-nick').value.trim();
        if (!nk) return;
        nickname = nk; localStorage.setItem('authNickname', nk);
        await cloud.saveProfile(nk).catch(() => {});
        const b = sheet.querySelector('#a-nicksave'); b.textContent = '已存';
        setTimeout(() => { b.textContent = '儲存'; }, 1200);
        updateAcct(); render();
      };
      sheet.querySelector('#a-sync').onclick = () => { cloud.fullSync().catch(() => {}); close(); };
      sheet.querySelector('#a-out').onclick = async () => {
        await cloud.signOut(); close(); setAuthUser(null);
      };
    });
    return;
  }

  openSheet(`
    <h2>登入雲端</h2>
    <p class="meta" style="margin-bottom:16px">登入後,資料會備份到雲端,換手機也不會不見。</p>
    <label class="field"><span class="lab">Email</span>
      <input id="a-email" type="email" autocomplete="username" placeholder="you@example.com"></label>
    <label class="field"><span class="lab">密碼</span>
      <input id="a-pass" type="password" autocomplete="current-password" placeholder="至少 6 碼"></label>
    <label class="field"><span class="lab">暱稱（註冊用,App 內會顯示）</span>
      <input id="a-nick" placeholder="例如：Neo"></label>
    <div id="a-msg" class="meta" style="min-height:18px"></div>
    <div class="btn-row">
      <button class="btn primary" id="a-login">登入</button>
      <button class="btn ghost" id="a-signup">第一次使用,註冊新帳號</button>
      <button class="btn ghost" id="a-forgot">忘記密碼?</button>
      <button class="btn ghost" id="a-cancel">取消</button>
    </div>`, (sheet, close) => {
    const msg = sheet.querySelector('#a-msg');
    const vals = () => [sheet.querySelector('#a-email').value.trim(), sheet.querySelector('#a-pass').value];
    const fail = (t) => { msg.style.color = 'var(--danger)'; msg.textContent = t; };
    sheet.querySelector('#a-cancel').onclick = close;
    sheet.querySelector('#a-forgot').onclick = async () => {
      const [email] = vals();
      if (!email) return fail('請先在上面輸入你的 Email');
      msg.style.color = 'var(--text-dim)'; msg.textContent = '寄送重設信中…';
      const { error } = await cloud.resetPassword(email);
      if (error) return fail('寄送失敗:' + error.message);
      msg.style.color = 'var(--accent)'; msg.textContent = '重設密碼的信已寄出,請到 Email 點連結後回來設定新密碼。';
    };
    sheet.querySelector('#a-login').onclick = async () => {
      const [email, pass] = vals();
      msg.style.color = 'var(--text-dim)'; msg.textContent = '登入中…';
      const { error } = await cloud.signIn(email, pass);
      if (error) return fail('登入失敗:' + error.message);
      close();
    };
    sheet.querySelector('#a-signup').onclick = async () => {
      const [email, pass] = vals();
      const nick = sheet.querySelector('#a-nick').value.trim();
      if (!email || pass.length < 6) return fail('請輸入 Email 和至少 6 碼密碼');
      msg.style.color = 'var(--text-dim)'; msg.textContent = '註冊中…';
      const { data, error } = await cloud.signUp(email, pass);
      if (error) return fail('註冊失敗:' + error.message);
      if (data.session) {
        // 存暱稱到 profiles(未開啟 Email 驗證時已直接登入)
        const nk = nick || email.split('@')[0];
        nickname = nk; localStorage.setItem('authNickname', nk);
        cloud.saveProfile(nk).catch(() => {});
        close();
      } else {
        if (nick) localStorage.setItem('authNickname', nick); // 待驗證後登入再寫入雲端
        msg.style.color = 'var(--accent)'; msg.textContent = '註冊成功!請收 Email 確認信、點連結後再回來登入。';
      }
    };
  });
}

// ---- 啟動 ------------------------------------------------------------------
window.addEventListener('hashchange', render);
header.querySelector('.back').addEventListener('click', () => { location.hash = ''; });
db.migrateCategories().catch(() => {}).finally(render); // 舊資料「餐廳」→「美食」後再繪製
initCloud();

// ---- Service Worker + 自動更新 --------------------------------------------
// 新版 SW 一裝好就自我接管(見 sw.js 的 skipWaiting);接管的瞬間自動重載,
// 使用者不用看橫幅、也不用手動按更新 —— iOS PWA 卡更新的老問題到此為止。
let swReg = null;
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      swReg = await navigator.serviceWorker.register('./sw.js');
      swReg.update().catch(() => {}); // 載入時主動檢查一次
    } catch (_) {}
  });
  // 回到前景時主動檢查更新(iOS PWA 常不會自動檢查)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && swReg) swReg.update().catch(() => {}); });
  window.addEventListener('focus', () => { if (swReg) swReg.update().catch(() => {}); });
}
