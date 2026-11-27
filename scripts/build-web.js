// Prepara la versione web (iPhone) di Calendari Bulldogs e i calendari .ics in abbonamento.
// Uso: node scripts/build-web.js  → cartella _site pronta per GitHub Pages.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const WWW = path.join(ROOT, "app/src/main/assets/www");
const OUT = path.join(ROOT, "_site");
const BASE_URL = "https://tankizzu.github.io/Basket-Calendar/";
const CLUB = "Bulldogs", SLUG = "bulldogs";

function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a)) {
    const s = path.join(a, f), d = path.join(b, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
const app = path.join(OUT, SLUG);
copyDir(WWW, app);
copyDir(path.join(ROOT, "web/icons"), path.join(app, "icons"));

fs.writeFileSync(path.join(app, "config.js"),
  `window.APP_CONFIG = { club: "${CLUB}", nome: "Calendari Bulldogs", apk: "CalendariBulldogs", web: true, ics: "${BASE_URL}${SLUG}/ics/" };\n`);

fs.writeFileSync(path.join(app, "manifest.webmanifest"), JSON.stringify({
  name: "Calendari Bulldogs", short_name: "Bulldogs", start_url: "./", scope: "./", display: "standalone",
  background_color: "#f3f4f6", theme_color: "#2443c8", lang: "it",
  icons: [{ src: "icons/bulldogs-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/bulldogs-512.png", sizes: "512x512", type: "image/png" }]
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
html = html.replace("<title>Calendari Basket</title>", `<title>Calendari Bulldogs</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/bulldogs-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Bulldogs">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#2443c8">`);
html = html.replace("</body>", `<script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});</script>\n</body>`);
fs.writeFileSync(path.join(app, "index.html"), html);

// ---------- Calendari .ics ----------
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, "data.js"), "utf8"), ctx);
const L = require(path.join(WWW, "logic.js"));
const raw = ctx.window.BASKET_DATA;
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
    const titolo = tr ? "Allenamento Bulldogs" : "[" + t.nome + "] " + L.matchTitle(g) + (g.verifica === "utente" ? " (da confermare)" : "");
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
fs.writeFileSync(path.join(dir, "bulldogs.ics"), ics("Bulldogs – tutte", all));
const feeds = [["bulldogs.ics", "Tutto Bulldogs (gare e allenamenti)"]];
D.squadre.forEach(t => {
  const f = "bulldogs-" + t.id.replace(/^bd-/, "") + ".ics";
  fs.writeFileSync(path.join(dir, f), ics(L.teamLabel(t), all.filter(g => g.team === t.id)));
  feeds.push([f, L.teamLabel(t)]);
});
fs.writeFileSync(path.join(dir, "elenco.json"), JSON.stringify(feeds));

// Pagina iniziale del sito: porta all'app.
fs.writeFileSync(path.join(OUT, "index.html"), `<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${SLUG}/"><a href="${SLUG}/">Calendari Bulldogs</a>`);
console.log("ok", all.length, "eventi;", feeds.length, "calendari");
