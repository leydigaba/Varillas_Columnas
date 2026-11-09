const CACHE = 'varillas-v11';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'widgets/varillas-template.json', 'widgets/varillas-data.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('varillas-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => refreshWidgets())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

/* ===================== WIDGET ===================== */
const WCACHE = 'widget-state-varillas';
const WKEY = 'widget-state.json';
const WTAG = 'varillas';
const DEF = {b: 30, h: 30, alt: 4, cols: 1, bar: '#4', n: 8, est: '#3', sep: 20, rec: 3, gancho: 10, lcom: 12, desp: 10};

const BARS = {
  '#3': {a: 0.71, n: '3/8"'},
  '#4': {a: 1.27, n: '1/2"'},
  '#5': {a: 1.98, n: '5/8"'},
  '#6': {a: 2.85, n: '3/4"'},
  '#8': {a: 5.07, n: '1"'}
};
const ESTS = {'#2': {n: '1/4"'}, '#3': {n: '3/8"'}};
const BAR_KEYS = Object.keys(BARS);

async function getState() {
  try {
    const c = await caches.open(WCACHE);
    const r = await c.match(WKEY);
    if (r) return Object.assign({}, DEF, await r.json());
  } catch (e) {}
  return Object.assign({}, DEF);
}
async function setState(s) {
  const c = await caches.open(WCACHE);
  await c.put(WKEY, new Response(JSON.stringify(s), {headers: {'Content-Type': 'application/json'}}));
}

const f = (x, d = 2) => x.toLocaleString('es-MX', {minimumFractionDigits: d, maximumFractionDigits: d});

function buildData(s) {
  const bar = BARS[s.bar] || BARS['#4'], est = ESTS[s.est] || ESTS['#3'];
  const b = +s.b, h = +s.h, alt = +s.alt, n = Math.round(s.n);
  const sep = +s.sep || 20, rec = +s.rec || 0, gancho = +s.gancho || 0;
  const lcom = +s.lcom || 12, desp = (+s.desp || 0) / 100, cols = Math.max(1, Math.round(s.cols));

  if (!(b > 0 && h > 0 && alt > 0 && n > 0)) {
    return {cuantia: '—', estado: '✕ Revisa los datos en la app', color: 'Attention', filas: []};
  }

  const Ag = b * h, AsMin = Ag * 0.01, AsMax = Ag * 0.08, As = n * bar.a;
  const rho = As / Ag * 100;
  let ok = true, msg = 'Cumple 1 %–8 %';
  if (As < AsMin) { ok = false; msg = 'Bajo el 1 %'; }
  else if (As > AsMax) { ok = false; msg = 'Sobre el 8 %'; }
  else if (n < 4) { ok = false; msg = 'Mínimo 4 varillas'; }

  const ml = alt * n * cols;
  const pl = Math.ceil(ml * (1 + desp) / lcom);
  const perim = 2 * (Math.max(0, b - 2 * rec) + Math.max(0, h - 2 * rec)) + 2 * gancho;
  const nEst = Math.ceil(alt * 100 / sep) + 1;
  const mEst = perim / 100 * nEst * cols;
  const pe = Math.ceil(mEst * (1 + desp) / lcom);

  return {
    cuantia: f(rho) + ' %',
    estado: (ok ? '✓ ' : '✕ ') + msg,
    color: ok ? 'Good' : 'Attention',
    filas: [
      {nombre: 'Columna', valor: b + ' × ' + h + ' cm · ' + alt + ' m'},
      {nombre: 'Varillas', valor: n + ' × ' + s.bar + ' por columna'},
      {nombre: 'Columnas', valor: String(cols)},
      {nombre: 'Comprar varilla ' + s.bar, valor: pl + ' pzas'},
      {nombre: 'Comprar estribos ' + s.est, valor: pe + ' pzas'}
    ]
  };
}

async function renderWidget(widget) {
  if (!widget || !self.widgets) return;
  const def = widget.definition;
  const template = await (await fetch(def.msAcTemplate)).text();
  const data = JSON.stringify(buildData(await getState()));
  await self.widgets.updateByTag(def.tag, {template, data});
}

async function refreshWidgets() {
  if (!self.widgets) return;
  try { await renderWidget(await self.widgets.getByTag(WTAG)); } catch (e) {}
}

// Al instalar el widget en el panel
self.addEventListener('widgetinstall', e => e.waitUntil(renderWidget(e.widget)));
// Al volver a mostrarse el panel
self.addEventListener('widgetresume', e => e.waitUntil(renderWidget(e.widget)));

// Botones del widget
self.addEventListener('widgetclick', e => {
  e.waitUntil((async () => {
    const s = await getState();
    switch (e.action) {
      case 'n-':  s.n = Math.max(1, Math.round(s.n) - 1); break;
      case 'n+':  s.n = Math.round(s.n) + 1; break;
      case 'c-':  s.cols = Math.max(1, Math.round(s.cols) - 1); break;
      case 'c+':  s.cols = Math.round(s.cols) + 1; break;
      case 'bar': s.bar = BAR_KEYS[(BAR_KEYS.indexOf(s.bar) + 1) % BAR_KEYS.length]; break;
    }
    await setState(s);
    await renderWidget(e.widget || await self.widgets.getByTag(WTAG));
  })());
});

// La app avisa cuando cambia su estado
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'widget-refresh') e.waitUntil(refreshWidgets());
});
