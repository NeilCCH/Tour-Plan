// drive.js — 把照片備份/匯出到「使用者自己的」Google Drive
// ---------------------------------------------------------------------------
// 用途:雲端共享版(Supabase)只保留 3–6 個月釋放空間;這裡讓每個人(發起人或協作者)
//       把自己看得到的照片,永久備份到「自己的」Google Drive,原圖不佔共享空間。
//
// 權限只用 drive.file:App 只能存取「自己建立的檔案」,看不到你 Drive 其他東西,較安全,
// 也不必經過 Google 敏感權限審核。用戶端 ID 是網頁型、可公開,靠授權來源網域限制。
//
// 這個檔案是動態載入的(見 app.js),沒設定或離線時不影響其他功能。
// ---------------------------------------------------------------------------

import { GOOGLE_CLIENT_ID } from './supabase-config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

let _gsiPromise = null;
function loadGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_gsiPromise) return _gsiPromise;
  _gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('無法載入 Google 登入元件(需要網路)'));
    document.head.appendChild(s);
  });
  return _gsiPromise;
}

export function driveConfigured() { return !!GOOGLE_CLIENT_ID; }

let _token = null; // { access_token, expiry }
// 取得存取權杖;必須在使用者「點擊」的當下呼叫(才能彈出 Google 授權視窗)。
export async function driveConnect() {
  if (!GOOGLE_CLIENT_ID) throw new Error('尚未設定 Google 用戶端 ID');
  if (_token && _token.expiry > Date.now() + 60000) return _token.access_token;
  await loadGsi();
  return await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        _token = { access_token: resp.access_token, expiry: Date.now() + (resp.expires_in || 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type || '授權失敗')),
    });
    client.requestAccessToken({ prompt: '' }); // 授權過就不重複詢問
  });
}

async function driveJson(url, opts, token) {
  const res = await fetch(url, { ...opts, headers: { ...(opts?.headers || {}), Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('Drive API ' + res.status);
  return res.json();
}

// 找或建立資料夾,回傳 id
async function ensureFolder(name, parentId, token) {
  const safe = String(name).replace(/'/g, "\\'");
  let q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const found = await driveJson(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {}, token);
  if (found.files && found.files.length) return found.files[0].id;
  const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const created = await driveJson('https://www.googleapis.com/drive/v3/files?fields=id',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) }, token);
  return created.id;
}

// 列出資料夾內既有檔名(避免重複上傳)
async function existingNames(folderId, token) {
  const names = new Set();
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(name)&pageSize=1000`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const r = await driveJson(url, {}, token);
    (r.files || []).forEach((f) => names.add(f.name));
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return names;
}

async function uploadFile(name, blob, folderId, token) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', blob);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  if (!res.ok) throw new Error('上傳失敗 ' + res.status);
  return res.json();
}

// 主流程:把照片備份到 Drive 的「旅遊App備份 / {趟名}」資料夾。
// items:[{ name, blob }];需先 driveConnect() 取得 token(在使用者點擊當下)。
// onProgress(done, total)。回傳 { total, uploaded, skipped }。
export async function backupPhotos(tripName, items, onProgress) {
  const token = await driveConnect();
  const root = await ensureFolder('旅遊App備份', null, token);
  const folder = await ensureFolder(tripName || '未命名旅程', root, token);
  const have = await existingNames(folder, token);
  let done = 0, uploaded = 0, skipped = 0;
  for (const it of items) {
    done++;
    if (onProgress) onProgress(done, items.length);
    if (have.has(it.name)) { skipped++; continue; } // 已備份過 → 跳過
    try { await uploadFile(it.name, it.blob, folder, token); uploaded++; } catch (_) { /* 單張失敗略過 */ }
  }
  return { total: items.length, uploaded, skipped };
}
