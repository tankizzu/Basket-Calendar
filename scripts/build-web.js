// Prepara la versione web (iPhone) di Calendari Bulldogs e i calendari .ics in abbonamento.
// Uso: node scripts/build-web.js  → cartella _site pronta per GitHub Pages.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const WWW = path.join(ROOT, "app/src/main/assets/www");
const OUT = path.join(ROOT, "_site");
const BASE_URL = "https://tankizzu.github.io/Basket-Calendar/";
const CLUBS = [
  { club: "Bulldogs", slug: "bulldogs", nome: "Calendari Bulldogs", corto: "Bulldogs", apk: "CalendariBulldogs", colore: "#2443c8", prefisso: "bd-" },
  { club: "LIONS", slug: "lions", nome: "Calendari LIONS", corto: "LIONS", apk: "CalendariLions", colore: "#1f7a3d", prefisso: "li-" }
];

function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a)) {
    const s = path.join(a, f), d = path.join(b, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, "data.js"), "utf8"), ctx);
const L = require(path.join(WWW, "logic.js"));
const raw = ctx.window.BASKET_DATA;
let totale = [];

for (const K of CLUBS) {
const CLUB = K.club, SLUG = K.slug;
const app = path.join(OUT, SLUG);
copyDir(WWW, app);
copyDir(path.join(ROOT, "web/icons"), path.join(app, "icons"));

fs.writeFileSync(path.join(app, "config.js"),
  `window.APP_CONFIG = { club: "${CLUB}", nome: "${K.nome}", apk: "${K.apk}", web: true, slug: "${SLUG}", ics: "${BASE_URL}${SLUG}/ics/" };\n`);

fs.writeFileSync(path.join(app, "manifest.webmanifest"), JSON.stringify({
  name: K.nome, short_name: K.corto, start_url: "./", scope: "./", display: "standalone",
  background_color: "#f3f4f6", theme_color: K.colore, lang: "it",
  icons: [{ src: "icons/" + SLUG + "-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/" + SLUG + "-512.png", sizes: "512x512", type: "image/png" }]
}, null, 1));

// Cache per l'uso senza rete; data.js sempre dalla rete se possibile.
fs.writeFileSync(path.join(app, "sw.js"), `
const C = "cb-${Date.now()}";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(["./", "index.html", "style.css", "app.js", "logic.js", "fx.js", "logos.js", "config.js", "data.js", "img/bulldogs.png", "img/lions.png"]))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
`);

let html = fs.readFileSync(path.join(app, "index.html"), "utf8");
html = html.replace("<title>Calendari Basket</title>", `<title>${K.nome}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/${SLUG}-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${K.corto}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="${K.colore}">`);
html = html.replace("</body>", `<script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});</script>\n</body>`);
fs.writeFileSync(path.join(app, "index.html"), html);

// ---------- Calendari .ics ----------
const keep = {};
const base = Object.assign({}, raw, {
  squadre: raw.squadre.filter(t => t.club === CLUB && (keep[t.id] = true)),
});
base.partite = raw.partite.filter(g => keep[g.team]).map(g => { const c = JSON.parse(JSON.stringify(g)); delete c.tabellino; return c; });
base.allenamenti = (raw.allenamenti || []).filter(r => keep[r.team]);
const S = L.defaultSettings(base);
const D = L.applyEdits(base, {}, {}, { pause: [], ritrovo: S.ritrovo });
const TM = L.teamMap(D);

const pad = n => String(n).padStart(2, "0");
const dt = (d, t) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
function fold(line) {
  const out = []; let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur); return out.join("\r\n");
}
const now = new Date();
const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + "00Z";
const VTZ = ["BEGIN:VTIMEZONE", "TZID:Europe/Rome",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

function ics(nome, games) {
  const L2 = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendari Basket//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(nome), "X-WR-TIMEZONE:Europe/Rome", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"].concat(VTZ);
  games.forEach(g => {
    const t = TM[g.team], tr = L.isTraining(g);
    let fine = g.oraFine;
    if (!fine) { const e = new Date(L.toDate(g.data, g.ora).getTime() + 2 * 3600000); fine = pad(e.getHours()) + ":" + pad(e.getMinutes()); }
    const titolo = tr ? L.matchTitle(g).replace(/ \d\d:\d\d–\d\d:\d\d$/, "") : "[" + t.nome + "] " + L.matchTitle(g) + (g.verifica === "utente" ? " (da confermare)" : "");
    const desc = [tr ? "" : t.campionato, tr ? "" : (g.casa ? "In casa" : "In trasferta"),
      g.ritrovo ? "Ritrovo ore " + g.ritrovo + (g.luogoRitrovo ? " · " + g.luogoRitrovo : "") : "",
      g.stato === "recupero" ? "Recupero" : "", g.note || ""].filter(Boolean).join("\n");
    L2.push("BEGIN:VEVENT", "UID:" + g.id + "@calendari-basket", "DTSTAMP:" + stamp,
      "DTSTART;TZID=Europe/Rome:" + dt(g.data, g.ora), "DTEND;TZID=Europe/Rome:" + dt(g.data, fine),
      "SUMMARY:" + esc(titolo), "LOCATION:" + esc(g.sede || ""), "DESCRIPTION:" + esc(desc),
      "STATUS:" + (g.stato === "annullata" ? "CANCELLED" : (g.verifica === "utente" ? "TENTATIVE" : "CONFIRMED")));
    if (!tr && g.stato !== "annullata") {
      L2.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(titolo), "TRIGGER:-PT3H", "END:VALARM");
    }
    L2.push("END:VEVENT");
  });
  L2.push("END:VCALENDAR");
  return L2.map(fold).join("\r\n") + "\r\n";
}

const dir = path.join(app, "ics"); fs.mkdirSync(dir, { recursive: true });
const all = D.partite.filter(g => !(L.isTraining(g) && g.stato === "annullata"));
fs.writeFileSync(path.join(dir, SLUG + ".ics"), ics(K.corto + " – tutte", all));
const feeds = [[SLUG + ".ics", "Tutto " + K.corto + " (gare e allenamenti)"]];
D.squadre.forEach(t => {
  const f = SLUG + "-" + t.id.replace(K.prefisso, "") + ".ics";
  fs.writeFileSync(path.join(dir, f), ics(L.teamLabel(t), all.filter(g => g.team === t.id)));
  feeds.push([f, L.teamLabel(t)]);
});
fs.writeFileSync(path.join(dir, "elenco.json"), JSON.stringify(feeds));

totale.push(SLUG + ": " + all.length + " eventi, " + feeds.length + " calendari");
}

// Pagina iniziale: scelta del club.
fs.writeFileSync(path.join(OUT, "index.html"), `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Calendari Basket</title>
<style>body{margin:0;font:16px system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#111318;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}a{display:flex;align-items:center;gap:14px;width:100%;max-width:340px;padding:16px;border-radius:18px;background:#fff;text-decoration:none;color:inherit;font-weight:700;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.06);border:1px solid #e5e7eb}
img{width:56px;height:56px;border-radius:50%}</style></head><body><h1>Scegli il tuo club</h1>
${CLUBS.map(K => `<a href="${K.slug}/"><img src="${K.slug}/img/${K.slug}.png" alt="">${K.nome}</a>`).join("\n")}
</body></html>`);
console.log("ok", totale.join(" · "));
