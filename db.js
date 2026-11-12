// db.js — 本地資料層（IndexedDB）
// ---------------------------------------------------------------------------
// 對應 PRD 的資料主幹：Trip → Place → Moment。
//
// 設計原則（呼應 PRD 3.2）：這一層刻意獨立、不與畫面（app.js）混在一起。
// 呼叫方永遠呼叫這裡定義的函式（db.createPlace()、db.listPlaces()…），
// 內部用瀏覽器本地的 IndexedDB。雲端同步（sync.js，接 Supabase）是加在
// 這一層之上的鏡像，畫面程式碼完全不用改。
//
// 同步用欄位：每筆資料都有
//   - updatedAt：最後修改時間（毫秒）。雙向同步以「較新者為準」。
//   - deleted  ：軟刪除標記（tombstone）。刪除不是真的移除，而是標記，
//                這樣「刪除」這件事才能同步到其他裝置。畫面上的列表會濾掉它。
// ---------------------------------------------------------------------------

const DB_NAME = 'travel-planner';
const DB_VERSION = 2;
const STORES = ['trips', 'places', 'moments']; // 會雲端同步的表(assets 不在內,照片只存本機)

// ---- 分類與狀態常數（對應 PRD 二、資料模型）----------------------------------
export const CATEGORIES = ['景點', '美食', '住宿', '交通', '購物', '其他'];

// Place 狀態：候選 / 已排入 / 已造訪 / 已造訪・未規劃
export const STATUSES = ['候選', '已排入', '已造訪', '已造訪・未規劃'];

// 各類別的預設停留分鐘（PRD：estimated_stay 各類別給預設值）
export const DEFAULT_STAY = {
  景點: 90, 美食: 60, 住宿: 0, 交通: 30, 購物: 60, 其他: 45,
};

// ---- 底層：開啟資料庫、把 request 包成 Promise --------------------------------
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('trips')) idb.createObjectStore('trips', { keyPath: 'id' });
      if (!idb.objectStoreNames.contains('places')) {
        const s = idb.createObjectStore('places', { keyPath: 'id' });
        s.createIndex('tripId', 'tripId', { unique: false });
      }
      if (!idb.objectStoreNames.contains('moments')) {
        const s = idb.createObjectStore('moments', { keyPath: 'id' });
        s.createIndex('placeId', 'placeId', { unique: false });
        s.createIndex('tripId', 'tripId', { unique: false });
      }
      // 照片/語音等大檔:只存本機(不同步雲端),避免拖慢同步、吃免費額度
      if (!idb.objectStoreNames.contains('assets')) {
        idb.createObjectStore('assets', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

const reqToPromise = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

async function put(store, value) {
  const idb = await openDB();
  await reqToPromise(idb.transaction(store, 'readwrite').objectStore(store).put(value));
  return value;
}
async function get(store, id) {
  const idb = await openDB();
  return reqToPromise(idb.transaction(store, 'readonly').objectStore(store).get(id));
}
async function getAll(store) {
  const idb = await openDB();
  return reqToPromise(idb.transaction(store, 'readonly').objectStore(store).getAll());
}
async function getByIndex(store, indexName, value) {
  const idb = await openDB();
  return reqToPromise(idb.transaction(store, 'readonly').objectStore(store).index(indexName).getAll(value));
}
async function del(store, id) {
  const idb = await openDB();
  await reqToPromise(idb.transaction(store, 'readwrite').objectStore(store).delete(id));
}

// crypto.randomUUID：全域唯一，本地與雲端共用同一個 id，合併時才對得起來
function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- 變更通知（讓 sync.js 在本地資料變動後觸發推送）--------------------------
let _onChange = null;
export function onDbChange(fn) { _onChange = fn; }
function notify() { try { _onChange && _onChange(); } catch (_) {} }

const active = (rows) => rows.filter((r) => !r.deleted);

// 欄位級時間戳:記下「哪些欄位在何時被改」,供同步時逐欄位取較新者(避免整筆覆蓋)
function withFts(record, changedKeys, now) {
  const fts = { ...(record.fts || {}) };
  for (const k of changedKeys) fts[k] = now;
  return { ...record, fts, updatedAt: now };
}

// ---- Trip ------------------------------------------------------------------
async function createTrip({ name, startDate = '', endDate = '', people = 1, country = '', ownerId = null, photoRetentionDays = 0 }) {
  const now = Date.now();
  const trip = {
    id: newId(), name: (name || '未命名旅程').trim(),
    startDate, endDate, people: Number(people) || 1,
    country,                        // 主要旅遊國家(ISO 兩碼,如 'KR'):供國旗顯示與定位過濾
    dayStartTime: {},               // 每天的出發時間 { 天: 'HH:MM' },供行程時間軸推算
    ownerId,                        // 這趟的擁有者(登入者 id);列表依此過濾
    members: [],                    // 協作者的 uid 清單(擁有者不列在內)
    inviteCode: '',                 // 邀請碼(產生邀請連結時才填)
    photoRetentionDays,             // 雲端照片保存天數:必須由發起人選 90 或 180;0=未選=不上傳
    public: false,                  // 是否開放公開分享(唯讀)
    fts: {},                        // 欄位級修改時間
    createdAt: now, updatedAt: now, deleted: false,
  };
  await put('trips', trip); notify(); return trip;
}
// 列出「我擁有」或「我是協作成員」的旅程。未登入回傳空陣列。
async function listTrips(userId) {
  if (!userId) return [];
  return active(await getAll('trips'))
    .filter((t) => t.ownerId === userId || (t.members || []).includes(userId))
    .sort((a, b) => b.createdAt - a.createdAt);
}
async function getTrip(id) {
  const t = await get('trips', id);
  return t && !t.deleted ? t : undefined;
}
async function updateTrip(id, patch) {
  const trip = await get('trips', id);
  if (!trip) throw new Error('找不到旅程');
  const next = withFts({ ...trip, ...patch }, Object.keys(patch), Date.now());
  await put('trips', next); notify(); return next;
}
// 刪除旅程：軟刪除，並連同底下 Place、Moment 一併軟刪除（讓刪除能同步）。
// Moment 用 tripId 找(不是每則都有關聯景點);本機的照片/語音大檔直接清掉。
// 回傳 { photoPaths }:這趟已上雲的照片路徑,由呼叫端(有雲端連線的那層)去刪,免得佔雲端空間。
async function deleteTrip(id) {
  const now = Date.now();
  const photoPaths = [];
  const moments = await getByIndex('moments', 'tripId', id);
  for (const m of moments) {
    if (m.photoPath) photoPaths.push(m.photoPath);
    if (m.photoId) await del('assets', m.photoId).catch(() => {});
    if (m.audioId) await del('assets', m.audioId).catch(() => {});
    if (!m.deleted) await put('moments', withFts({ ...m, deleted: true }, ['deleted'], now));
  }
  const places = await getByIndex('places', 'tripId', id);
  for (const p of places) if (!p.deleted) await put('places', withFts({ ...p, deleted: true }, ['deleted'], now));
  const trip = await get('trips', id);
  if (trip) await put('trips', withFts({ ...trip, deleted: true }, ['deleted'], now));
  notify();
  return { photoPaths };
}

// ---- Place -----------------------------------------------------------------
async function createPlace(tripId, data) {
  const now = Date.now();
  const category = CATEGORIES.includes(data.category) ? data.category : '景點';
  const place = {
    id: newId(), tripId,
    name: (data.name || '').trim(), category,
    lat: data.lat ?? null, lng: data.lng ?? null,
    source: data.source || '手動輸入',
    estimatedStay: data.estimatedStay ?? DEFAULT_STAY[category] ?? 60,
    estimatedCost: data.estimatedCost ?? 0,
    openingHours: data.openingHours || '',
    referenceUrl: data.referenceUrl || '',
    // 交通班次資訊(交通類地點用):航空公司/航班號、交通方式、搭乘與抵達時間
    airline: data.airline || '', flightNo: data.flightNo || '',
    transitMode: data.transitMode || '自動', // 估時用:自動/飛機/高鐵/火車/客運/開車/渡輪/步行
    departAt: data.departAt || '', arriveAt: data.arriveAt || '',
    notes: data.notes || '', coverImage: data.coverImage || '',
    status: STATUSES.includes(data.status) ? data.status : '候選',
    pinned: !!data.pinned,
    assignedDay: data.assignedDay ?? null, orderIndex: data.orderIndex ?? null,
    providerIds: data.providerIds || {},
    fts: {},
    createdAt: now, updatedAt: now, deleted: false,
  };
  // 若這趟已開放公開分享,新地點也沿用公開狀態(才會出現在分享頁)
  const parent = await get('trips', tripId);
  place.public = !!parent?.public;
  await put('places', place); notify(); return place;
}

// 設定/取消整趟公開分享:連同底下「地點」一起標記(供權限判斷)。
// 旅途記錄(Moment:日記文字、花費、打卡座標)一律不公開——分享頁只顯示行程,不該連日記一起外流。
async function setTripPublic(tripId, isPublic) {
  const now = Date.now();
  const flag = !!isPublic;
  const trip = await get('trips', tripId);
  if (!trip) return;
  await put('trips', withFts({ ...trip, public: flag }, ['public'], now));
  const places = await getByIndex('places', 'tripId', tripId);
  for (const p of places) await put('places', withFts({ ...p, public: flag }, ['public'], now));
  notify();
}
async function listPlaces(tripId) {
  return active(await getByIndex('places', 'tripId', tripId)).sort((a, b) => a.createdAt - b.createdAt);
}
async function getPlace(id) {
  const p = await get('places', id);
  return p && !p.deleted ? p : undefined;
}
async function updatePlace(id, patch) {
  const place = await get('places', id);
  if (!place) throw new Error('找不到地點');
  const next = withFts({ ...place, ...patch }, Object.keys(patch), Date.now());
  await put('places', next); notify(); return next;
}
// 刪除地點:只刪「規劃」裡的這個點。關聯到它的旅途記錄(照片/日記)保留,改為「不關聯景點」,
// 不會因為整理行程而連帶弄丟回憶。
async function deletePlace(id) {
  const now = Date.now();
  const moments = await getByIndex('moments', 'placeId', id);
  for (const m of moments) if (!m.deleted) await put('moments', withFts({ ...m, placeId: null }, ['placeId'], now));
  const place = await get('places', id);
  if (place) await put('places', withFts({ ...place, deleted: true }, ['deleted'], now));
  notify();
}

// ---- Moment(旅途記錄:文字/照片/打卡/評分/花費)-----------------------------
// 一筆記錄可同時有文字、照片、星等、花費、座標;photoId 指向本機 assets(不同步)。
async function createMoment(tripId, data = {}) {
  const now = Date.now();
  const moment = {
    id: newId(), tripId,
    placeId: data.placeId || null,     // 關聯的景點(可無)
    text: (data.text || '').trim(),    // 文字內容
    rating: Number(data.rating) || 0,  // 0–5 星(0=未評)
    spend: Number(data.spend) || 0,    // 實際花費(0=無)
    currency: data.currency || '',     // 幣別(顯示用,可空)
    lat: data.lat ?? null, lng: data.lng ?? null, // 當下座標(打卡/定位)
    weather: data.weather || null,     // 打卡當下天氣 { code, temp }(可無)
    photoId: data.photoId || null,     // 對應本機 assets 的 id(照片存本機)
    hasPhoto: !!data.photoId,          // 給別台裝置知道「有照片但在對方手機」
    photoPath: data.photoPath || '',   // 照片在雲端 Storage 的路徑(有值=已上傳,協作者可下載)
    audioId: data.audioId || null,     // 語音檔(存本機 assets,不同步)
    hasAudio: !!data.audioId,          // 給別台裝置知道「有語音但在對方手機」
    authorId: data.authorId || null,   // 誰記的(旅伴動態牆顯示用)
    authorName: data.authorName || '', // 記錄當下的暱稱快照
    takenAt: data.takenAt || now,      // 這則的時間(照片可用檔案時間)
    public: false,                     // 旅途記錄一律不公開(分享頁只給行程)
    fts: {}, createdAt: now, updatedAt: now, deleted: false,
  };
  await put('moments', moment); notify(); return moment;
}
async function listMoments(tripId) {
  return active(await getByIndex('moments', 'tripId', tripId)).sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
}
async function updateMoment(id, patch) {
  const m = await get('moments', id);
  if (!m) throw new Error('找不到記錄');
  const next = withFts({ ...m, ...patch }, Object.keys(patch), Date.now());
  await put('moments', next); notify(); return next;
}
async function deleteMoment(id) {
  const m = await get('moments', id);
  if (!m) return;
  if (m.photoId) await del('assets', m.photoId).catch(() => {}); // 照片/語音是本機大檔,直接清掉騰空間
  if (m.audioId) await del('assets', m.audioId).catch(() => {});
  await put('moments', withFts({ ...m, deleted: true, photoId: null, hasPhoto: false, audioId: null, hasAudio: false },
    ['deleted', 'photoId', 'hasPhoto', 'audioId', 'hasAudio'], Date.now()));
  notify();
}

// ---- 本機資產(照片 dataURL 等,不同步雲端)---------------------------------
async function putAsset(dataUrl) {
  const id = newId();
  await put('assets', { id, dataUrl, createdAt: Date.now() });
  return id;
}
// 用指定 id 寫入本機資產(把雲端下載回來的照片快取到同一個 photoId,之後離線也能看)
async function putAssetWithId(id, dataUrl) {
  if (!id || !dataUrl) return id;
  await put('assets', { id, dataUrl, createdAt: Date.now() });
  return id;
}
async function getAsset(id) {
  if (!id) return null;
  const a = await get('assets', id);
  return a?.dataUrl || null;
}
async function deleteAsset(id) {
  if (id) await del('assets', id).catch(() => {});
}

// ---- 一次性資料轉換 --------------------------------------------------------
// 舊資料把分類「餐廳」改名為「美食」。可重複執行(改完就沒有符合的,等於空跑)。
async function migrateCategories() {
  const places = await getAll('places');
  let changed = 0;
  for (const p of places) {
    if (p.category === '餐廳') {
      await put('places', { ...p, category: '美食', updatedAt: Date.now() });
      changed++;
    }
  }
  if (changed) notify();
  return changed;
}

// 一次性修復:舊版開啟「公開分享」時會把旅途記錄也標成公開;全部改回不公開(會同步上雲)。
// 只動「我擁有或我是協作成員」的行程(別人的資料我沒有寫入權限,改了反而會讓同步失敗)。
async function unpublishMoments(userId) {
  if (!userId) return 0;
  const now = Date.now();
  const mine = new Set((await getAll('trips'))
    .filter((t) => t.ownerId === userId || (t.members || []).includes(userId)).map((t) => t.id));
  let n = 0;
  for (const m of await getAll('moments')) {
    if (m.public && mine.has(m.tripId)) { await put('moments', withFts({ ...m, public: false }, ['public'], now)); n++; }
  }
  if (n) notify();
  return n;
}

// 一次性修復:把「沒有擁有者」的本地行程認領為目前使用者(不動 updatedAt,
// 避免誤推翻雲端)。用於修復「登入把關」更新後,舊行程因缺 ownerId 而被過濾消失。
async function claimOwnerlessTrips(userId) {
  if (!userId) return 0;
  const trips = await getAll('trips');
  let n = 0;
  for (const t of trips) {
    if (!t.ownerId && !t.deleted) { await put('trips', { ...t, ownerId: userId }); n++; }
  }
  if (n) notify();
  return n;
}

// ---- 給 sync.js 用的原始存取（含 tombstone，不改動 updatedAt）----------------
const sync = {
  stores: STORES,
  async allRaw(store) { return getAll(store); },        // 全部，包含已刪除
  async putRaw(store, rec) { return put(store, rec); }, // 原樣寫入（雲端→本地）
};

// ---- 對外 API --------------------------------------------------------------
export const db = {
  createTrip, listTrips, getTrip, updateTrip, deleteTrip, setTripPublic,
  createPlace, listPlaces, getPlace, updatePlace, deletePlace,
  createMoment, listMoments, updateMoment, deleteMoment,
  putAsset, putAssetWithId, getAsset, deleteAsset,
  migrateCategories, claimOwnerlessTrips, unpublishMoments,
  _sync: sync,
};
