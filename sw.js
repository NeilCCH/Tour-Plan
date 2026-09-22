// sw.js — Service Worker
// 讓 App 可以「加入主畫面」並在離線時開啟。
// 策略:
//  - 程式外殼(HTML/JS/CSS):網路優先 → 有網路時「永遠」拿到最新版,離線才退回快取。
//  - 圖片/圖示:快取優先(很少變動,載入更快)。
//  - 新版一偵測到就立即接管(skipWaiting + clients.claim),不用等使用者按按鈕。
// 你的旅程資料不在這裡,是存在瀏覽器的 IndexedDB(見 db.js)。
//
// 改版須知:更新外殼檔案後,把下面的 CACHE 版本號 +1,離線快取就會刷新。

const CACHE = 'tour-v83';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './sync.js',
  './drive.js',
  './geo.js',
  './supabase-config.js',
  './manifest.webmanifest',
  './logo-n.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  // 立即接管:新版一裝好就啟用,不停在「等待中」(iOS PWA 常卡在這一步)。
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// 保留:App 端若送 skip-waiting 也能提早接管(相容舊版)。
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 網路優先:先打網路(順手更新快取),逾時或離線才用快取。
function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(req).then((hit) => resolve(hit || caches.match('./index.html')));
    // 網路太慢(4秒)先用快取墊著,避免開啟卡住;網路回來時仍會更新快取供下次使用。
    const timer = setTimeout(() => {
      if (!settled) caches.match(req).then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, 4000);
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
    }).catch(() => {
      if (!settled) { settled = true; clearTimeout(timer); fromCache(); }
    });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const path = new URL(req.url).pathname;
  const isImage = /\.(png|jpe?g|webp|svg|ico|gif)$/i.test(path);

  if (isImage) {
    // 圖片:快取優先,沒有再打網路並順手存起來
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }

  // HTML / JS / CSS / 其他:網路優先 → 上線時永遠最新
  e.respondWith(networkFirst(req));
});
