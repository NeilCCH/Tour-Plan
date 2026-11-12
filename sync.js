// sync.js — 雲端同步（Supabase）
// ---------------------------------------------------------------------------
// 本地優先 + 雲端鏡像:App 照樣讀寫本地 IndexedDB(db.js),登入後這裡在背景
// 跟 Supabase 雙向同步。合併規則:同一筆資料以 updatedAt 較新者為準(單人用
// 衝突極少)。刪除是 tombstone(deleted=true),所以也會正確同步到別的裝置。
//
// 這個檔案是「動態載入」的(見 app.js):萬一 CDN 連不到或離線,載入失敗也
// 只是沒有雲端,App 仍能純本地運作。
// ---------------------------------------------------------------------------

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { db, onDbChange } from './db.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, // 處理忘記密碼的回連
});

// ---- 忘記密碼 --------------------------------------------------------------
export const resetPassword = (email) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
export const updatePassword = (newPassword) => supabase.auth.updateUser({ password: newPassword });

// ---- 狀態回報(讓畫面顯示「同步中/已同步/錯誤」)-----------------------------
let statusCb = null;
export function onStatus(fn) { statusCb = fn; }
function setStatus(s, changed) { try { statusCb && statusCb(s, changed); } catch (_) {} }

// ---- 帳號 ------------------------------------------------------------------
export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
// ---- 公開分享:不需登入的唯讀資料 --------------------------------------------
// 優先走後端函式 public_trip / public_places:它們只回傳「已公開」的行程,並拿掉邀請碼、
// 成員名單等不該外流的欄位。資料庫還沒跑新版 schema(函式不存在)時,退回舊的直接讀表。
export async function fetchPublicTrip(id) {
  const viaFn = await supabase.rpc('public_trip', { p_id: id });
  if (!viaFn.error) return viaFn.data ? { ...viaFn.data, id } : null;
  const { data, error } = await supabase.from('trips').select('id,data').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return { ...(data.data || {}), id: data.id };
}
export async function fetchPublicPlaces(tripId) {
  const viaFn = await supabase.rpc('public_places', { p_trip: tripId });
  if (!viaFn.error) return (viaFn.data || []).filter((p) => p && !p.deleted);
  const { data, error } = await supabase.from('places').select('id,data').filter('data->>tripId', 'eq', tripId);
  if (error || !data) return [];
  return data.map((r) => ({ ...(r.data || {}), id: r.id })).filter((p) => !p.deleted);
}

// 加入協作:憑邀請碼把自己加進該行程的 members(由後端 RPC 安全處理)
export async function joinTrip(tripId, code) {
  return supabase.rpc('join_trip', { p_trip_id: tripId, p_code: code });
}

// ---- 使用者暱稱 profiles(供顯示「Neo,您好」與 email 邀請查詢)------------------
// 暱稱對所有登入者公開;Email 不公開(資料庫已把 Email 欄位的讀取權收掉)。
// 寫入與「用 Email 找人」走後端函式;資料庫還沒跑新版 schema(函式不存在)時退回舊做法。
export async function saveProfile(nickname) {
  const user = await currentUser(); if (!user) return;
  const viaFn = await supabase.rpc('save_profile', { p_nickname: nickname });
  if (!viaFn.error) return viaFn;
  return supabase.from('profiles').upsert({ id: user.id, email: user.email, nickname, updated_at: Date.now() });
}
export async function getMyProfile() {
  const user = await currentUser(); if (!user) return null;
  const { data } = await supabase.from('profiles').select('nickname').eq('id', user.id).maybeSingle();
  return data || null;
}
// 用 Email 找人(Email 邀請用):要完整 Email 才查得到,回傳 { id, nickname }
export async function findProfileByEmail(email) {
  const viaFn = await supabase.rpc('find_user_by_email', { p_email: email });
  if (!viaFn.error) return (viaFn.data && viaFn.data[0]) || null;
  const { data } = await supabase.from('profiles').select('id,nickname').ilike('email', email).limit(1);
  return (data && data[0]) || null;
}
export async function getProfiles(ids) {
  if (!ids || !ids.length) return [];
  const { data } = await supabase.from('profiles').select('id,nickname').in('id', ids);
  return data || [];
}

// ---- Email 邀請 + 通知 + 接受 + 協作者管理 ----------------------------------
export async function createInvite(tripId, tripName, inviterName, inviteeId) {
  return supabase.from('invitations').insert({
    trip_id: tripId, trip_name: tripName, inviter_name: inviterName,
    invitee_id: inviteeId, status: 'pending', created_at: Date.now(),
  });
}
export async function listMyInvites() {
  const user = await currentUser(); if (!user) return [];
  const { data } = await supabase.from('invitations').select('*')
    .eq('invitee_id', user.id).eq('status', 'pending');
  return data || [];
}
export async function acceptInvite(id) { return supabase.rpc('accept_invite', { p_invite: id }); }
export async function declineInvite(id) { return supabase.from('invitations').update({ status: 'declined' }).eq('id', id); }
export async function removeMember(tripId, memberId) { return supabase.rpc('remove_member', { p_trip: tripId, p_member: memberId }); }

export const signUp = (email, password) => supabase.auth.signUp({ email, password });
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();

// ---- 照片雲端同步(私有 Storage 桶,只有該行程協作者可讀寫)---------------------
// 桶名 photos;路徑格式 {tripId}/{momentId}/{photoId}.jpg,權限靠 storage policy
// 檢查「你是不是這趟的擁有者或成員」(見 supabase-schema.sql)。
const PHOTO_BUCKET = 'photos';

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// 上傳一張照片,回傳雲端路徑(存回 moment.photoPath 供各裝置取用)
export async function uploadPhoto(tripId, momentId, photoId, dataUrl) {
  const path = `${tripId}/${momentId}/${photoId}.jpg`;
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

// 下載一張雲端照片,回傳 dataURL(供顯示並快取回本機)
export async function downloadPhoto(path) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw (error || new Error('照片下載失敗'));
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(data);
  });
}

// 刪除雲端照片。回傳是否成功(supabase-js 失敗時不丟例外,而是回傳 error,要自己檢查)。
export async function deletePhotos(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return true;
  try {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(list);
    return !error;
  } catch (_) { return false; }
}
export const deletePhoto = (path) => deletePhotos([path]);

// ---- 雲端 <-> 本地 資料形狀轉換 ----------------------------------------------
// 雲端每張表欄位:id(uuid) / user_id / data(jsonb=整筆本地物件) / updated_at / deleted
// 拉回時用雲端權威的 user_id 蓋上 ownerId,確保資料正確歸屬到擁有者
const fromCloud = (c) => ({ ...(c.data || {}), id: c.id, updatedAt: Number(c.updated_at) || 0, deleted: !!c.deleted, ownerId: c.user_id });
const toCloud = (l) => ({ id: l.id, data: l, updated_at: l.updatedAt || 0, deleted: !!l.deleted });

// 欄位級合併:逐欄位取「修改時間(fts)較新」的一方(沒有 fts 就退回整筆 updatedAt)。
// 這樣兩人改同一筆的不同欄位都能保留,只有同一欄同時改才需取捨。
function fieldMerge(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('fts'); keys.delete('updatedAt');
  const out = {}, fts = {};
  for (const k of keys) {
    if (k === 'id' || k === 'createdAt') { out[k] = a[k] ?? b[k]; continue; }
    if (k === 'ownerId') { out[k] = b.ownerId ?? a.ownerId; continue; } // 擁有者以雲端為權威
    const at = (a.fts && a.fts[k] != null) ? a.fts[k] : (a.updatedAt || 0);
    const bt = (b.fts && b.fts[k] != null) ? b.fts[k] : (b.updatedAt || 0);
    out[k] = bt > at ? b[k] : a[k];
    fts[k] = Math.max(at, bt);
  }
  out.fts = fts;
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
// 比較兩筆「值」是否相同(忽略 fts / updatedAt,避免無意義的來回推送)
function sameData(x, y) {
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  keys.delete('fts'); keys.delete('updatedAt');
  for (const k of keys) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return false;
  return true;
}
// 註:upsert 時不帶 user_id,交給資料表預設值 auth.uid() 自動填入(RLS 保護)。

async function syncTable(table) {
  const { data: cloudRows, error } = await supabase.from(table).select('id,data,updated_at,deleted,user_id');
  if (error) throw error;

  const localRows = await db._sync.allRaw(table);
  const cloudMap = new Map(cloudRows.map((r) => [r.id, r]));
  const localMap = new Map(localRows.map((r) => [r.id, r]));
  const ids = new Set([...cloudMap.keys(), ...localMap.keys()]);

  const toPush = [];
  let localChanged = 0; // 這輪從雲端寫進本機的筆數(>0 畫面才需要重繪)
  for (const id of ids) {
    const c = cloudMap.get(id);
    const l = localMap.get(id);
    if (c && l) {
      const r = fromCloud(c);              // 雲端記錄(已含權威 ownerId)
      const merged = fieldMerge(l, r);     // 逐欄位合併
      if (!sameData(merged, l)) { await db._sync.putRaw(table, merged); localChanged++; } // 本地有變 → 寫回
      if (!sameData(merged, r)) toPush.push(toCloud(merged));         // 雲端有差 → 推上去
    } else if (c && !l) {
      await db._sync.putRaw(table, fromCloud(c)); localChanged++; // 只有雲端有 → 拉下來
    } else if (l && !c) {
      toPush.push(toCloud(l));                                   // 只有本地有 → 推上去
    }
  }

  if (toPush.length) {
    const { error: upErr } = await supabase.from(table).upsert(toPush);
    if (upErr) throw upErr;
  }
  return { pulled: cloudRows.length, pushed: toPush.length, localChanged };
}

// ---- 整體同步 --------------------------------------------------------------
let syncing = false;
let syncAgain = false; // 同步進行中又有人要求同步 → 這輪結束後再跑一輪,避免漏推剛發生的變動
export async function fullSync() {
  const { data } = await supabase.auth.getSession(); // 讀本機登入狀態,不必每次同步都多打一次網路
  if (!data?.session?.user) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true; setStatus('syncing');
  let changed = false;
  try {
    do {
      syncAgain = false;
      for (const table of db._sync.stores) {
        const r = await syncTable(table);
        if (r.localChanged) changed = true;
      }
    } while (syncAgain);
    setStatus('synced', changed); // changed=這次有從雲端拉到新東西(畫面才需要重繪)
  } catch (e) {
    console.error('雲端同步失敗:', e);
    setStatus('error:' + (e?.message || e));
    throw e;
  } finally {
    syncing = false; syncAgain = false;
  }
}

// 本地資料一有變動,稍等一下再推(避免連續輸入時狂打 API),推完廣播通知協作者
let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => { await fullSync().catch(() => {}); broadcastChanged(); }, 1200);
}

// ---- Realtime:協作即時同步 + 在線狀態 + 編輯中提示(用廣播/presence,免資料庫設定)----
let tripChannel = null;
export function joinTripChannel(tripId, me, handlers) {
  leaveTripChannel();
  const ch = supabase.channel('trip:' + tripId, { config: { presence: { key: me.id } } });
  ch.on('broadcast', { event: 'changed' }, () => { if (handlers.onChanged) handlers.onChanged(); })
    .on('broadcast', { event: 'editing' }, ({ payload }) => { if (handlers.onEditing) handlers.onEditing(payload); })
    .on('presence', { event: 'sync' }, () => { if (handlers.onPresence) handlers.onPresence(ch.presenceState()); })
    .subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ id: me.id, nickname: me.nickname }); });
  tripChannel = ch;
}
export function leaveTripChannel() {
  if (tripChannel) { try { supabase.removeChannel(tripChannel); } catch (_) {} tripChannel = null; }
}
export function broadcastChanged() {
  if (tripChannel) tripChannel.send({ type: 'broadcast', event: 'changed', payload: {} });
}
export function broadcastEditing(id, placeId, nickname) {
  if (tripChannel) tripChannel.send({ type: 'broadcast', event: 'editing', payload: { id, placeId, nickname } });
}

// ---- 初始化(app.js 啟動時呼叫)---------------------------------------------
export async function initAuth(onAuthChange) {
  onDbChange(schedulePush);                        // 本地變動 → 排程推送
  supabase.auth.onAuthStateChange((event, session) => {
    onAuthChange(session?.user || null, event); // event 例如 PASSWORD_RECOVERY
    if (session?.user) fullSync().catch(() => {}); // 登入後立刻同步
  });
  window.addEventListener('online', () => { fullSync().catch(() => {}); }); // 恢復連線 → 同步
  return currentUser();
}
