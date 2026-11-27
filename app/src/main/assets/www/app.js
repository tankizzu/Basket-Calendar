(function () {
  var A = window.Android || null; // ponte nativo (assente nell'anteprima da browser)
  var REPO = "tankizzu/Basket-Calendar";
  var DATA_URL = "https://raw.githubusercontent.com/" + REPO + "/main/app/src/main/assets/www/data.js";
  var RELEASE_URL = "https://api.github.com/repos/" + REPO + "/releases/latest";
  var BASE, TM, MIE;
  var CFG = window.APP_CONFIG || { club: null, nome: "Calendari Basket", apk: "CalendariBasket" };
  // Versione di un solo club: tiene solo le sue squadre e toglie i dati personali (ruoli, tabellini).
  function perClub(b) {
    if (!CFG.club) return b;
    var keep = {};
    var squadre = b.squadre.filter(function (t) { return t.club === CFG.club; }).map(function (t) {
      keep[t.id] = true;
      var c = JSON.parse(JSON.stringify(t));
      c.mia = false; delete c.ruolo; delete c.nota; delete c.spentiDiDefault;
      return c;
    });
    var out = {};
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    out.squadre = squadre;
    out.partite = b.partite.filter(function (g) { return keep[g.team]; }).map(function (g) {
      var c = JSON.parse(JSON.stringify(g)); delete c.tabellino; return c;
    });
    out.allenamenti = (b.allenamenti || []).filter(function (r) { return keep[r.team]; });
    return out;
  }
  function setBase(b) {
    BASE = perClub(b);
    TM = Logic.teamMap(BASE);
    MIE = CFG.club ? BASE.squadre.map(function (t) { return t.id; }) :
      BASE.squadre.filter(function (t) { return t.mia; }).map(function (t) { return t.id; });
  }
  // Dati: quelli scaricati più di recente, se più nuovi di quelli inclusi nell'app.
  (function () {
    var bundled = window.BASKET_DATA, cached = null;
    try { cached = JSON.parse((A ? A.getStore("remoteData") : localStorage.getItem("remoteData")) || "null"); } catch (e) {}
    setBase(cached && (cached.rev || 0) > (bundled.rev || 0) ? cached : bundled);
  })();
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  var settings = Logic.mergeSettings(BASE, loadJSON("settings"));
  var edits = loadJSON("edits") || {};
  ["mod", "ris", "foto", "tab"].forEach(function (k) { edits[k] = edits[k] || {}; });
  ["add", "del"].forEach(function (k) { edits[k] = edits[k] || []; });
  var DATA;
  var now0 = new Date();
  var ui = {
    view: "partite", scope: "mie", teams: {}, showPast: false, showTrain: true, incPast: false,
    month: { y: now0.getFullYear(), m: now0.getMonth() }, selDay: null, editId: null
  };

  // ---------- Archiviazione ----------
  function loadJSON(key) {
    try {
      var raw = A ? (key === "settings" ? A.getSettings() : A.getStore(key)) : localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function storeJSON(key, obj) {
    var raw = JSON.stringify(obj);
    try {
      if (!A) localStorage.setItem(key, raw);
      else if (key === "settings") A.saveSettings(raw);
      else A.setStore(key, raw);
    } catch (e) {}
  }

  function rebuild() {
    DATA = Logic.applyEdits(BASE, edits, settings.sedeCasa, { pause: settings.pause, ritrovo: settings.ritrovo });
    pushWidget();
  }

  // Dati per il widget nella schermata Home: prossimi impegni delle tue squadre.
  function pushWidget() {
    if (!A || !A.setWidget) return;
    var now = Date.now();
    var items = DATA.partite.filter(function (g) {
      return MIE.indexOf(g.team) >= 0 && Logic.isActive(g) && Logic.toDate(g.data, g.ora).getTime() > now - 3600000;
    }).slice(0, 12).map(function (g) {
      var t = TM[g.team];
      return {
        at: Logic.toDate(g.data, g.ora).getTime(), giorno: Logic.dayLabel(g.data).replace(/ \d{4}$/, ""), ora: g.ora,
        titolo: Logic.isTraining(g) ? Logic.matchTitle(g) : Logic.teamLabel(t) + " · " + Logic.matchTitle(g),
        club: t.club, sotto: (g.ritrovo ? "Ritrovo " + g.ritrovo + " · " : "") + (g.sede || "")
      };
    });
    try { A.setWidget(JSON.stringify(items)); } catch (e) {}
  }

  function saveSettings() { storeJSON("settings", settings); rebuild(); reschedule(); }

  function saveEdits() {
    storeJSON("edits", edits);
    rebuild();
    renderAll();
    reschedule();
    sync(true);
  }

  function reschedule() {
    if (!A) return;
    var rem = Logic.buildReminders(DATA, settings, new Date());
    try { A.scheduleReminders(JSON.stringify(rem)); } catch (e) {}
    renderNotifStatus(rem.length);
  }

  function logo(club) {
    return '<img class="tlogo" alt="" src="img/' + (club === "LIONS" ? "lions" : "bulldogs") + '.png">';
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  function openUrl(url) {
    if (A && A.openUrl) A.openUrl(url); else window.open(url, "_blank");
  }

  // ---------- Navigazione ----------
  var VIEWS = ["partite", "calendario", "incroci", "stats", "luoghi", "impostazioni"];
  function goView(view) {
    if (view === ui.view) return;
    var dir = VIEWS.indexOf(view) > VIEWS.indexOf(ui.view) ? "from-right" : "from-left";
    ui.view = view;
    document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.view === view); });
    document.querySelectorAll(".view").forEach(function (v) {
      var on = v.id === "view-" + view;
      v.classList.remove("from-right", "from-left");
      v.classList.toggle("active", on);
      if (on) v.classList.add(dir);
    });
    $("filters").classList.toggle("hidden", ["partite", "calendario", "luoghi"].indexOf(view) < 0);
    if (view === "stats") renderStats();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () { goView(b.dataset.view); });
  });
  // Scorri a destra/sinistra per cambiare scheda (nel calendario cambia mese).
  FX.swipe(document.querySelector("main"), function () {
    var i = VIEWS.indexOf(ui.view); if (i < VIEWS.length - 1) goView(VIEWS[i + 1]);
  }, function () {
    var i = VIEWS.indexOf(ui.view); if (i > 0) goView(VIEWS[i - 1]);
  }, "#cal-grid,#filters,.icon-pick");

  // ---------- Filtri ----------
  function scopeTeams() {
    if (ui.scope === "mie") return MIE.slice();
    return BASE.squadre.filter(function (t) {
      return ui.scope === "tutte" || t.club === ui.scope;
    }).map(function (t) { return t.id; });
  }

  // Filtri ricordati tra un'apertura e l'altra: squadre nascoste per ogni vista, vista scelta, spunte.
  var filtri = loadJSON("filtri") || {};
  filtri.nascoste = filtri.nascoste || {};
  function saveFiltri() {
    filtri.scope = ui.scope; filtri.showPast = ui.showPast; filtri.showTrain = ui.showTrain;
    storeJSON("filtri", filtri);
  }

  function renderChips() {
    var ids = scopeTeams();
    var off = filtri.nascoste[ui.scope] || [];
    ui.teams = {};
    ids.forEach(function (id) { ui.teams[id] = off.indexOf(id) < 0; });
    $("team-chips").innerHTML = ids.map(function (id) {
      var t = TM[id];
      return '<button class="chip ' + (ui.teams[id] ? "on " : "") + t.club + '" data-team="' + id + '">' + logo(t.club) + esc(Logic.teamLabel(t)) + "</button>";
    }).join("");
    document.querySelectorAll("#team-chips .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var id = c.dataset.team;
        ui.teams[id] = !ui.teams[id];
        c.classList.toggle("on", ui.teams[id]);
        filtri.nascoste[ui.scope] = scopeTeams().filter(function (x) { return !ui.teams[x]; });
        saveFiltri();
        renderFiltered();
      });
    });
  }

  document.querySelectorAll("#scope button").forEach(function (b) {
    b.addEventListener("click", function () {
      ui.scope = b.dataset.scope;
      document.querySelectorAll("#scope button").forEach(function (x) { x.classList.toggle("on", x === b); });
      applyClubTheme();
      saveFiltri();
      renderChips(); renderFiltered();
    });
  });

  function applyClubTheme() {
    var club = ui.scope === "Bulldogs" || ui.scope === "LIONS" ? ui.scope : "";
    if (club) {
      document.body.dataset.club = club;
      $("club-logo").src = "img/" + (club === "LIONS" ? "lions" : "bulldogs") + ".png";
    } else delete document.body.dataset.club;
  }

  function filtered() {
    return DATA.partite.filter(function (g) { return ui.teams[g.team]; });
  }

  // ---------- Scheda partita ----------
  function badges(g) {
    var b = [];
    if (Logic.isTraining(g)) b.push('<span class="badge">Allenamento</span>');
    else b.push(g.casa ? '<span class="badge casa">Casa</span>' : '<span class="badge">Trasferta</span>');
    if (g.stato === "annullata") b.push('<span class="badge annullata">Annullata</span>');
    if (g.stato === "recupero") b.push('<span class="badge recupero">Recupero</span>');
    var es = Logic.esito(g, TM[g.team]);
    if (es) b.push('<span class="badge esito ' + es + '">' + { vinta: "Vinta", persa: "Persa", pari: "Pari" }[es] + "</span>");
    if (g.foto && g.foto.length) b.push('<span class="badge">Referto 📷</span>');
    if (g.aggiunta) b.push('<span class="badge mod">Aggiunta da te</span>');
    else if (g.modificata !== undefined) b.push('<span class="badge mod">Modificata da te</span>');
    if (g.verifica === "utente" && !g.aggiunta) b.push('<span class="badge utente">Da confermare</span>');
    return '<div class="badges">' + b.join("") + "</div>";
  }

  function gameCard(g, now, showDate) {
    var t = TM[g.team];
    var past = Logic.isPast(g, now);
    var det = [];
    if (g.giornata) det.push("Giornata/gara: " + esc(g.giornata));
    det.push("Fonte: " + esc(g.fonte));
    if (g.note) det.push(esc(g.note));
    if (g.noteUtente) det.push("Nota tua: " + esc(g.noteUtente));
    if (g.sedeDaImpostazioni) det.push("Sede presa dalla palestra di casa impostata.");
    if (g.autoAnnullata) det.push(esc(g.autoAnnullata) + ". Puoi ripristinarlo con «Ripristina gara».");
    if (g.risultato && Logic.esito(g, t)) {
      if (g.risultato.parziali && g.risultato.parziali.length) det.push("Parziali: " + esc(Logic.parzialiText(g.risultato)));
      det.push("Risultato: " + esc(g.risultato.fonte || "inserito da te"));
    }
    var photos = (g.foto || []).map(function (n) {
      return '<img class="thumb" loading="lazy" data-photo="' + esc(n) + '" src="' + esc(photoSrc(n)) + '" alt="Referto">';
    }).join("");
    var st = g.storico && g.storico.length
      ? "<div>Storico:<ul>" + g.storico.map(function (s) { return "<li>" + esc(s.testo) + "</li>"; }).join("") + "</ul></div>"
      : "";
    var act = '<div class="actions">' +
      (g.sede ? '<button class="btn ghost" data-act="map" data-id="' + g.id + '">Mappa</button>' : "") +
      '<button class="btn ghost" data-act="share" data-id="' + g.id + '">Condividi</button>' +
      (Logic.isTraining(g) ? "" : '<button class="btn ghost" data-act="result" data-id="' + g.id + '">Risultato e referto</button>') +
      (Logic.isTraining(g) || g.stato === "annullata" ? "" : '<button class="btn ghost" data-act="img" data-id="' + g.id + '">Grafica</button>') +
      '<button class="btn ghost" data-act="edit" data-id="' + g.id + '">Modifica</button>' +
      '<button class="btn ghost" data-act="toggle" data-id="' + g.id + '">' + (g.stato === "annullata" ? "Ripristina gara" : "Segna annullata") + "</button>" +
      "</div>";
    return '<div class="card game ' + t.club + (Logic.isTraining(g) ? " training" : "") + " " + (g.stato === "annullata" ? "annullata " : "") + (past ? "past" : "") + '" data-id="' + g.id + '">' +
      '<div class="time">' + esc(g.ora) + (showDate ? '<div class="meta">' + esc(Logic.shortDate(g.data)) + "</div>" : "") + "</div>" +
      "<div>" +
      '<div class="team">' + logo(t.club) + esc(Logic.teamLabel(t)) + "</div>" +
      '<div class="match">' + esc(Logic.matchTitle(g)) + "</div>" +
      (Logic.esito(g, t) ? '<div class="score">' + g.risultato.casa + " – " + g.risultato.ospite + "</div>" : "") +
      '<div class="meta">' + (g.sede ? esc(g.sede) : "Sede non indicata") + "</div>" +
      (g.ritrovo && g.stato !== "annullata" ? '<div class="rit">🕐 Ritrovo ' + esc(g.ritrovo) + (g.luogoRitrovo ? " · " + esc(g.luogoRitrovo) : "") + "</div>" : "") +
      badges(g) +
      '<div class="details"><div class="in"><div>' + det.map(function (d) { return "<div>" + d + "</div>"; }).join("") + "</div>" + st +
      (photos ? '<div class="thumbs">' + photos + "</div>" : "") + act + "</div></div>" +
      "</div></div>";
  }

  function bindCards(root) {
    root.querySelectorAll(".game").forEach(function (c) {
      c.addEventListener("click", function () { c.classList.toggle("open"); });
    });
    root.querySelectorAll("img[data-photo]").forEach(function (im) {
      im.addEventListener("click", function (e) { e.stopPropagation(); showPhoto(im.dataset.photo); });
    });
    root.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var g = findGame(b.dataset.id);
        if (!g) return;
        if (b.dataset.act === "map") openUrl(g.mappa || Logic.mapsUrl(g.sede));
        if (b.dataset.act === "edit") openEditor(g.id);
        if (b.dataset.act === "result") openResult(g.id);
        if (b.dataset.act === "img") openImage(g.id);
        if (b.dataset.act === "share") shareOut(Logic.shareText(g, TM[g.team]));
        if (b.dataset.act === "toggle") {
          setMod(g.id, { stato: g.stato === "annullata" ? baseStato(g.id) : "annullata" });
          FX.vibrate(g.stato === "annullata" ? 12 : 30);
          saveEdits();
        }
      });
    });
  }

  function findGame(id) {
    for (var i = 0; i < DATA.partite.length; i++) if (DATA.partite[i].id === id) return DATA.partite[i];
    return null;
  }
  function baseGame(id) {
    var all = BASE.partite.concat(edits.add);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function baseStato(id) {
    var b = baseGame(id);
    return b && b.stato !== "annullata" ? b.stato : "programmata";
  }

  // ---------- Partite ----------
  function dayGroups(games) {
    var out = [], idx = {};
    games.forEach(function (g) {
      if (!(g.data in idx)) { idx[g.data] = out.length; out.push({ data: g.data, partite: [] }); }
      out[idx[g.data]].partite.push(g);
    });
    return out;
  }

  function dayFlag(partite) {
    var active = partite.filter(function (g) { return Logic.isActive(g) && !Logic.isTraining(g); });
    if (ui.scope === "mie") return active.length > 1 ? active.length : 0;
    var clubs = {};
    active.forEach(function (g) { clubs[TM[g.team].club] = (clubs[TM[g.team].club] || 0) + 1; });
    return Object.keys(clubs).some(function (c) { return clubs[c] > 1; }) ? active.length : 0;
  }

  function countdown(g, now) {
    var d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((Logic.toDate(g.data) - d0) / 86400000);
    if (days === 0) return "Oggi alle " + g.ora;
    if (days === 1) return "Domani alle " + g.ora;
    return "Tra " + days + " giorni";
  }

  function renderHero() {
    var now = new Date();
    var next = filtered().filter(function (g) {
      return Logic.isActive(g) && !Logic.isTraining(g) && Logic.toDate(g.data, g.ora) > now;
    })[0];
    if (!next) { $("hero").innerHTML = ""; return; }
    var t = TM[next.team];
    $("hero").innerHTML = '<div class="hero ' + t.club + '"><img class="logo" alt="" src="img/' + (t.club === "LIONS" ? "lions" : "bulldogs") + '.png"><div class="k">Prossima partita · ' + esc(Logic.teamLabel(t)) + "</div>" +
      '<div class="when">' + liveCountdown(next, now) + "</div>" +
      '<div class="what">' + esc(Logic.matchTitle(next)) + "</div>" +
      '<div class="where">' + esc(Logic.dayLabel(next.data)) + " · " + esc(next.ora) + (next.sede ? " · " + esc(next.sede) : "") + "</div>" +
      '<span class="pill">' + (next.casa ? "In casa" : "In trasferta") + (next.ritrovo ? " · ritrovo " + esc(next.ritrovo) : "") + "</span>" +
      progress(next, now) + "</div>";
  }

  // Sotto le 24 ore: conto alla rovescia in ore e minuti.
  function liveCountdown(g, now) {
    var ms = Logic.toDate(g.data, g.ora) - now;
    if (ms > 24 * 3600000) return esc(countdown(g, now));
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return '<span class="live-wrap"><span class="live"></span>Mancano ' + (h ? h + " h " : "") + m + " min</span>";
  }

  // Barra che si riempie nelle 24 ore prima del ritrovo (o della gara).
  function progress(g, now) {
    var target = Logic.toDate(g.data, g.ritrovo || g.ora).getTime();
    var left = target - now.getTime();
    if (left > 24 * 3600000) return "";
    var pct = left <= 0 ? 100 : 100 - left / (24 * 3600000) * 100;
    var lbl = left <= 0 ? (g.ritrovo ? "È ora del ritrovo" : "Si gioca!") :
      (g.ritrovo ? "Al ritrovo delle " + g.ritrovo : "All'inizio");
    return '<div class="prog"><i style="width:' + pct.toFixed(1) + '%"></i></div><div class="prog-l">' + esc(lbl) + "</div>";
  }
  setInterval(function () { if (ui.view === "partite" && !document.hidden) renderHero(); }, 30000);

  function renderList() {
    renderHero();
    var now = new Date();
    var games = filtered().filter(function (g) {
      return (ui.showPast || !Logic.isPast(g, now)) && (ui.showTrain || !Logic.isTraining(g));
    });
    var el = $("list");
    var groups = dayGroups(games);
    if (!groups.length) { el.innerHTML = '<p class="empty">Nessuna partita per i filtri scelti.</p>'; return; }
    el.innerHTML = groups.map(function (d, i) {
      var f = dayFlag(d.partite);
      return '<div class="day stag" style="--i:' + Math.min(i, 12) + '"><div class="day-h">' + esc(Logic.dayLabel(d.data)) +
        (f ? ' <span class="flag">' + f + " gare</span>" : "") + "</div>" +
        d.partite.map(function (g) { return gameCard(g, now); }).join("") + "</div>";
    }).join("");
    bindCards(el);
  }
  $("show-past").addEventListener("change", function (e) { ui.showPast = e.target.checked; saveFiltri(); renderList(); });
  $("show-train").addEventListener("change", function (e) { ui.showTrain = e.target.checked; saveFiltri(); renderList(); });

  // ---------- Calendario mensile ----------
  function renderCalendar() {
    var y = ui.month.y, m = ui.month.m;
    $("m-title").textContent = MESI[m] + " " + y;
    var byDay = {};
    filtered().forEach(function (g) { (byDay[g.data] = byDay[g.data] || []).push(g); });
    var t = new Date();
    var today = t.getFullYear() + "-" + Logic.pad(t.getMonth() + 1) + "-" + Logic.pad(t.getDate());
    var html = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map(function (w) { return '<div class="wd">' + w + "</div>"; }).join("");
    Logic.monthGrid(y, m).forEach(function (week) {
      week.forEach(function (d) {
        var gs = byDay[d.iso] || [];
        var f = gs.length ? dayFlag(gs) : 0;
        var dots = gs.filter(Logic.isActive).slice(0, 4).map(function (g) {
          return '<span class="dot ' + (Logic.isTraining(g) ? "all" : TM[g.team].club) + '"></span>';
        }).join("");
        var cls = "c" + (d.fuori ? " out" : "") + (d.iso === today ? " today" : "") +
          (d.iso === ui.selDay ? " sel" : "") + (f ? " multi" : "");
        html += '<button class="' + cls + '" data-day="' + d.iso + '">' + d.giorno + '<span class="dots">' + dots + "</span></button>";
      });
    });
    $("cal-grid").innerHTML = html;
    var cg = $("cal-grid");
    cg.classList.remove("anim", "from-right", "from-left"); void cg.offsetWidth;
    cg.classList.add(ui.calDir || "anim"); ui.calDir = null;
    document.querySelectorAll("#cal-grid .c").forEach(function (b) {
      b.addEventListener("click", function () {
        ui.selDay = b.dataset.day;
        var p = ui.selDay.split("-").map(Number);
        if (p[1] - 1 !== ui.month.m) { ui.month = { y: p[0], m: p[1] - 1 }; }
        renderCalendar();
      });
    });
    renderCalDay(byDay);
  }

  function renderCalDay(byDay) {
    var el = $("cal-day");
    if (!ui.selDay) { el.innerHTML = '<p class="empty">Tocca un giorno per vedere le gare.</p>'; return; }
    var gs = (byDay[ui.selDay] || []).slice().sort(function (a, b) { return a.ora < b.ora ? -1 : 1; });
    el.innerHTML = '<div class="day"><div class="day-h">' + esc(Logic.dayLabel(ui.selDay)) + "</div>" +
      (gs.length ? gs.map(function (g) { return gameCard(g, new Date()); }).join("") : '<p class="empty">Nessuna gara.</p>') + "</div>";
    bindCards(el);
  }

  function shiftMonth(k) {
    var d = new Date(ui.month.y, ui.month.m + k, 1); ui.month = { y: d.getFullYear(), m: d.getMonth() };
    ui.calDir = k > 0 ? "from-right" : "from-left";
    renderCalendar();
  }
  $("m-prev").addEventListener("click", function () { shiftMonth(-1); });
  $("m-next").addEventListener("click", function () { shiftMonth(1); });
  FX.swipe($("cal-grid"), function () { shiftMonth(1); }, function () { shiftMonth(-1); });

  // ---------- Incroci ----------
  function incBlock(list) {
    if (!list.length) return '<p class="empty">Nessuna data.</p>';
    return list.map(function (d) {
      return '<div class="card inc"><div class="d">' + esc(Logic.dayLabel(d.data)) + "</div>" +
        d.partite.map(function (g) {
          var t = TM[g.team];
          return '<div class="l"><b>' + esc(g.ora) + "</b> " + esc(Logic.teamLabel(t)) + ": " +
            esc(Logic.matchTitle(g)) + " · " + (g.casa ? "casa" : "trasferta") +
            (g.verifica === "utente" ? " · da confermare" : "") + "</div>";
        }).join("") + "</div>";
    }).join("");
  }

  function renderIncroci() {
    var o = { includePast: ui.incPast };
    $("inc-mie").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return MIE.indexOf(g.team) >= 0; }, o));
    $("inc-bulldogs").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return TM[g.team].club === "Bulldogs"; }, o));
    $("inc-lions").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return TM[g.team].club === "LIONS"; }, o));
    var tc = Logic.trainingConflicts(DATA, function (g, t) { return MIE.indexOf(g.team) >= 0 || TM[g.team].club === TM[t.team].club; }, o);
    $("inc-all").innerHTML = tc.length ? tc.map(function (c) {
      var t = c.allenamento;
      return '<div class="card inc"><div class="d">' + esc(Logic.dayLabel(c.data)) + "</div>" +
        '<div class="l"><b>' + esc(t.ora) + "</b> " + esc(Logic.matchTitle(t)) + (t.sede ? " · " + esc(t.sede) : "") + "</div>" +
        c.partite.map(function (g) {
          return '<div class="l"><b>' + esc(g.ora) + "</b> " + esc(Logic.teamLabel(TM[g.team])) + ": " + esc(Logic.matchTitle(g)) +
            " · " + (g.casa ? "casa" : "trasferta") + (g.sede ? " · " + esc(g.sede) : "") + "</div>";
        }).join("") + "</div>";
    }).join("") : '<p class="empty">Nessun conflitto.</p>';
    var v = Logic.checkU15Weekend(DATA);
    $("vincolo").innerHTML = v.length ? v.map(function (r) {
      var g = r.partita;
      return '<div class="card inc"><div class="d">' + esc(Logic.dayLabel(g.data)) + " · " + esc(g.ora) + "</div>" +
        '<div class="l">' + esc(Logic.matchTitle(g)) + "</div>" +
        '<div class="l ' + (r.ok ? "ok" : "ko") + '">' +
        (r.ok ? "Rispettato: Aquilotti alle " + esc(r.aquilotti.ora) : "Non rispettato: nessuna gara Aquilotti") + "</div></div>";
    }).join("") : '<p class="empty">Nessuna gara U15 in casa nel weekend.</p>';
  }
  $("inc-past").addEventListener("change", function (e) { ui.incPast = e.target.checked; renderIncroci(); });

  // ---------- Luoghi ----------
  function renderLuoghi() {
    var now = new Date();
    var places = {}, order = [], missing = [];
    filtered().filter(Logic.isActive).forEach(function (g) {
      if (!g.sede) { if (!Logic.isPast(g, now)) missing.push(g); return; }
      if (!places[g.sede]) { places[g.sede] = { sede: g.sede, gare: [], link: "" }; order.push(g.sede); }
      if (g.mappa) places[g.sede].link = g.mappa;
      places[g.sede].gare.push(g);
    });
    order.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    $("luoghi").innerHTML = order.length ? order.map(function (s) {
      var p = places[s];
      var teams = {};
      p.gare.forEach(function (g) { teams[Logic.teamLabel(TM[g.team])] = 1; });
      var next = p.gare.filter(function (g) { return !Logic.isPast(g, now); })[0];
      return '<div class="card place"><div class="n">' + esc(s) + "</div>" +
        '<div class="m">' + esc(Object.keys(teams).join(", ")) + " · " + p.gare.length + (p.gare.length === 1 ? " impegno" : " impegni") + "</div>" +
        '<div class="m">' + (next ? "Prossima: " + esc(Logic.dayLabel(next.data)) + " ore " + esc(next.ora) + " · " + esc(Logic.matchTitle(next)) : "Nessuna gara futura") + "</div>" +
        '<div class="actions"><button class="btn ghost" data-map="' + esc(p.link || Logic.mapsUrl(s)) + '">Mappa</button></div></div>';
    }).join("") : '<p class="empty">Nessuna sede per i filtri scelti.</p>';
    document.querySelectorAll("#luoghi [data-map]").forEach(function (b) {
      b.addEventListener("click", function () { openUrl(b.dataset.map); });
    });
    var el = $("senza-sede");
    el.innerHTML = missing.length ? missing.map(function (g) { return gameCard(g, now, true); }).join("") : '<p class="empty">Nessuna.</p>';
    bindCards(el);
  }

  // ---------- Editor gara ----------
  function setMod(id, fields) {
    var b = baseGame(id);
    if (b && b.aggiunta) {
      // gara aggiunta da te: aggiorno direttamente l'originale
      var club = TM[b.team].club;
      var avv = fields.avversario !== undefined ? fields.avversario : (b.casa ? b.squadraOspite : b.squadraCasa);
      if (fields.data) b.data = fields.data;
      if (fields.ora) b.ora = fields.ora;
      if (fields.casa !== undefined) b.casa = fields.casa;
      if (fields.sede !== undefined) b.sede = fields.sede;
      if (fields.stato) b.stato = fields.stato;
      if (fields.note !== undefined) b.noteUtente = fields.note;
      b.squadraCasa = b.casa ? club : avv;
      b.squadraOspite = b.casa ? avv : club;
      return;
    }
    var m = edits.mod[id] || {};
    Object.keys(fields).forEach(function (k) { m[k] = fields[k]; });
    m.quando = new Date().toISOString();
    edits.mod[id] = m;
  }

  var delArmed = false;
  function openEditor(id) {
    ui.editId = id;
    delArmed = false;
    $("ed-delete").textContent = "Elimina gara";
    $("ed-err").textContent = "";
    var isNew = !id;
    $("ed-title").textContent = isNew ? "Nuova gara" : "Modifica gara";
    $("ed-team-wrap").style.display = isNew ? "" : "none";
    $("ed-reset").style.display = !isNew && edits.mod[id] ? "" : "none";
    $("ed-delete").style.display = isNew ? "none" : "";
    $("ed-team").innerHTML = BASE.squadre.map(function (t) {
      return '<option value="' + t.id + '">' + esc(Logic.teamLabel(t)) + "</option>";
    }).join("");
    if (isNew) {
      var first = scopeTeams().filter(function (x) { return ui.teams[x]; })[0] || MIE[0];
      $("ed-team").value = first;
      $("ed-data").value = ui.selDay || "";
      $("ed-ora").value = "";
      $("ed-fine").value = "";
      setTrainingMode(false);
      $("ed-casa").value = "1";
      $("ed-avv").value = "";
      $("ed-sede").value = "";
      $("ed-stato").value = "programmata";
      $("ed-note").value = "";
      $("ed-rit").value = "";
      $("ed-lrit").value = "";
    } else {
      var g = findGame(id);
      $("ed-data").value = g.data;
      $("ed-ora").value = g.ora;
      $("ed-fine").value = g.oraFine || "";
      setTrainingMode(Logic.isTraining(g));
      $("ed-casa").value = g.casa ? "1" : "0";
      $("ed-avv").value = g.casa ? g.squadraOspite : g.squadraCasa;
      $("ed-sede").value = g.sedeDaImpostazioni ? "" : (g.sede || "");
      $("ed-stato").value = g.stato;
      $("ed-note").value = g.noteUtente || "";
      $("ed-rit").value = g.ritrovoUtente || "";
      $("ed-lrit").value = g.luogoRitrovoUtente || "";
      $("ed-rit").placeholder = g.ritrovo || "";
    }
    $("sheet").classList.add("open");
    $("sheet-bg").classList.add("open");
  }

  function setTrainingMode(on) {
    $("ed-rit-wrap").style.display = on ? "none" : "";
    $("ed-fine-wrap").style.display = on ? "" : "none";
    $("ed-casa-wrap").style.display = on ? "none" : "";
    $("ed-avv-wrap").style.display = on ? "none" : "";
    if (on) $("ed-title").textContent = "Modifica allenamento";
  }

  function closeEditor() {
    $("sheet").classList.remove("open");
    $("sheet-bg").classList.remove("open");
    ui.editId = null;
  }

  $("btn-add").addEventListener("click", function () { openEditor(null); });
  $("ed-cancel").addEventListener("click", closeEditor);
  $("sheet-bg").addEventListener("click", function () { closeEditor(); closeShare(); closeResult(); closeImage(); });

  $("ed-save").addEventListener("click", function () {
    var cur = ui.editId ? findGame(ui.editId) : null;
    var tr = cur && Logic.isTraining(cur);
    var f = {
      data: $("ed-data").value, ora: $("ed-ora").value, oraFine: $("ed-fine").value, casa: $("ed-casa").value === "1",
      avversario: $("ed-avv").value.trim(), sede: $("ed-sede").value.trim(),
      stato: $("ed-stato").value, note: $("ed-note").value.trim()
    };
    if (tr) {
      if (!f.data || !f.ora || !f.oraFine) { $("ed-err").textContent = "Servono data, ora di inizio e di fine."; return; }
    } else if (!f.data || !f.ora || !f.avversario) { $("ed-err").textContent = "Servono data, ora e avversario."; return; }
    if (!ui.editId) {
      var team = $("ed-team").value;
      edits.add.push(Logic.newGame(team, TM[team].club, f));
    } else {
      var g = findGame(ui.editId);
      var ch = {};
      if (f.data !== g.data || f.ora !== g.ora) { ch.data = f.data; ch.ora = f.ora; }
      if (tr) {
        if (f.oraFine !== g.oraFine) ch.oraFine = f.oraFine;
      } else {
        if (f.casa !== g.casa) ch.casa = f.casa;
        var avvOld = g.casa ? g.squadraOspite : g.squadraCasa;
        if (f.avversario !== avvOld || ch.casa !== undefined) ch.avversario = f.avversario;
      }
      var sedeOld = g.sedeDaImpostazioni ? "" : (g.sede || "");
      if (f.sede !== sedeOld) ch.sede = f.sede;
      if (f.stato !== g.stato) ch.stato = f.stato;
      if (f.note !== (g.noteUtente || "")) ch.note = f.note;
      var rit = $("ed-rit").value, lrit = $("ed-lrit").value.trim();
      if (!tr && rit !== (g.ritrovoUtente || "")) ch.ritrovo = rit;
      if (!tr && lrit !== (g.luogoRitrovoUtente || "")) ch.luogoRitrovo = lrit;
      if (Object.keys(ch).length) setMod(ui.editId, ch);
    }
    closeEditor();
    saveEdits();
  });

  $("ed-reset").addEventListener("click", function () {
    delete edits.mod[ui.editId];
    closeEditor();
    saveEdits();
  });

  $("ed-delete").addEventListener("click", function () {
    if (!delArmed) { delArmed = true; $("ed-delete").textContent = "Tocca ancora per eliminare"; return; }
    var id = ui.editId;
    var added = edits.add.some(function (g) { return g.id === id; });
    if (added) edits.add = edits.add.filter(function (g) { return g.id !== id; });
    else if (edits.del.indexOf(id) < 0) edits.del.push(id);
    delete edits.mod[id];
    closeEditor();
    saveEdits();
  });

  // ---------- Risultato e referto ----------
  function photoSrc(name) { return A && A.photoUrl ? A.photoUrl(name) : ""; }

  function showPhoto(name) {
    $("viewer-img").src = photoSrc(name);
    $("viewer").classList.add("open");
  }
  $("viewer").addEventListener("click", function () { $("viewer").classList.remove("open"); });

  var resId = null;
  var tabDraft = [];

  function renderTab() {
    $("rs-tab").innerHTML = tabDraft.length ? '<div class="tr th"><span>N° maglia</span><span>Punti</span><span>Falli</span><span></span></div>' +
      tabDraft.map(function (r, i) {
        return '<div class="tr"><input type="number" inputmode="numeric" data-ti="' + i + '" data-k="n" value="' + esc(r.n) + '">' +
          '<input type="number" inputmode="numeric" data-ti="' + i + '" data-k="p" value="' + esc(r.p) + '">' +
          '<input type="number" inputmode="numeric" min="0" max="5" data-ti="' + i + '" data-k="f" value="' + esc(r.f) + '">' +
          '<button class="btn ghost small" data-trm="' + i + '" aria-label="Togli">×</button></div>';
      }).join("") : '<p class="empty">Nessun giocatore. Tocca «+ Giocatore».</p>';
    $("rs-tab").querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        tabDraft[+inp.dataset.ti][inp.dataset.k] = inp.value === "" ? "" : +inp.value;
        tabSum();
      });
    });
    $("rs-tab").querySelectorAll("[data-trm]").forEach(function (b) {
      b.addEventListener("click", function () { tabDraft.splice(+b.dataset.trm, 1); renderTab(); });
    });
    tabSum();
  }

  // Controllo: somma dei punti del tabellino contro il punteggio della tua squadra.
  function tabSum() {
    var tot = 0, falli = 0;
    tabDraft.forEach(function (r) { tot += +r.p || 0; falli += +r.f || 0; });
    var g = resId ? findGame(resId) : null, msg = "";
    if (tabDraft.length) {
      msg = "Totale tabellino: " + tot + " punti, " + falli + " falli." + (tabDraft.some(function (r) { return r.p === ""; }) ? " (Punti vuoti = non indicati.)" : "");
      var c = $("rs-casa").value, o = $("rs-osp").value;
      if (g && c !== "" && o !== "") {
        var mine = g.squadraCasa === TM[g.team].club ? +c : +o;
        if (mine !== tot && !tabDraft.some(function (r) { return r.p === ""; })) msg += " Attenzione: la squadra ne ha fatti " + mine + ".";
      }
    }
    $("rs-tab-sum").textContent = msg;
  }

  $("rs-tab-add").addEventListener("click", function () {
    tabDraft.push({ n: "", p: "", f: "" });
    renderTab();
    var ins = $("rs-tab").querySelectorAll('input[data-k="n"]');
    if (ins.length) ins[ins.length - 1].focus();
  });
  function openResult(id) {
    resId = id;
    var g = findGame(id);
    $("rs-title").textContent = Logic.matchTitle(g);
    $("rs-casa-l").textContent = g.squadraCasa;
    $("rs-osp-l").textContent = g.squadraOspite;
    var r = g.risultato || {};
    $("rs-casa").value = r.casa != null ? r.casa : "";
    $("rs-osp").value = r.ospite != null ? r.ospite : "";
    $("rs-parz").value = r.parziali ? Logic.parzialiText(r) : "";
    $("rs-err").textContent = "";
    tabDraft = JSON.parse(JSON.stringify(edits.tab[id] || findGame(id).tabellino || [])).map(function (r) {
      return { n: r.n, p: r.p === null || r.p === undefined ? "" : r.p, f: r.f };
    });
    renderTab();
    renderResultPhotos();
    $("result-sheet").classList.add("open");
    $("sheet-bg").classList.add("open");
  }
  function closeResult() {
    $("result-sheet").classList.remove("open");
    $("sheet-bg").classList.remove("open");
    resId = null;
  }
  function renderResultPhotos() {
    var list = edits.foto[resId] || [];
    $("rs-photos").innerHTML = list.length ? list.map(function (n) {
      return '<div class="ph"><img data-photo="' + esc(n) + '" src="' + esc(photoSrc(n)) + '" alt="Referto">' +
        '<button class="btn ghost" data-del="' + esc(n) + '">Togli</button></div>';
    }).join("") : '<p class="empty">Nessuna foto.</p>';
    $("rs-photos").querySelectorAll("img").forEach(function (im) {
      im.addEventListener("click", function () { showPhoto(im.dataset.photo); });
    });
    $("rs-photos").querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = b.dataset.del;
        edits.foto[resId] = (edits.foto[resId] || []).filter(function (x) { return x !== n; });
        if (A && A.deletePhoto) A.deletePhoto(n);
        storeJSON("edits", edits);
        rebuild(); renderAll(); renderResultPhotos();
      });
    });
  }
  $("rs-add-photo").addEventListener("click", function () {
    if (!A || !A.pickPhoto) { $("rs-err").textContent = "Le foto del referto si aggiungono solo dall'app Android."; return; }
    A.pickPhoto(resId);
  });
  // Richiamata da Android dopo aver salvato la foto scelta.
  window.onPhotoPicked = function (gameId, name) {
    if (!name) return;
    edits.foto[gameId] = (edits.foto[gameId] || []).concat([name]);
    storeJSON("edits", edits);
    rebuild(); renderAll();
    if (resId === gameId) renderResultPhotos();
  };
  $("rs-save").addEventListener("click", function () {
    var c = $("rs-casa").value.trim(), o = $("rs-osp").value.trim();
    if ((c === "") !== (o === "")) { $("rs-err").textContent = "Inserisci entrambi i punteggi."; return; }
    var bad = tabDraft.some(function (r) { return r.n === "" && (r.p !== "" || r.f !== ""); });
    if (bad) { $("rs-err").textContent = "Ogni riga del tabellino deve avere il numero di maglia."; return; }
    var nums = tabDraft.filter(function (r) { return r.n !== ""; }).map(function (r) { return String(r.n); });
    if (nums.length !== new Set(nums).size) { $("rs-err").textContent = "Un numero di maglia è ripetuto nel tabellino."; return; }
    var tab = tabDraft.filter(function (r) { return r.n !== ""; }).map(function (r) { return { n: +r.n, p: r.p === "" ? null : +r.p, f: +r.f || 0 }; });
    if (tab.length) edits.tab[resId] = tab; else delete edits.tab[resId];
    if (c === "") delete edits.ris[resId];
    else {
      var parz = Logic.parseParziali($("rs-parz").value);
      edits.ris[resId] = { casa: +c, ospite: +o, parziali: parz, fonte: "Inserito da te" };
    }
    var gid = resId;
    closeResult();
    saveEdits();
    FX.vibrate(18);
    var gg = findGame(gid);
    if (gg && Logic.esito(gg, TM[gg.team]) === "vinta") FX.confetti(TM[gg.team].club);
  });
  $("rs-clear").addEventListener("click", function () { delete edits.ris[resId]; closeResult(); saveEdits(); });
  $("rs-close").addEventListener("click", closeResult);

  // ---------- Grafica per WhatsApp ----------
  var imgData = "", imgName = "";
  function openImage(id) {
    var g = findGame(id), t = TM[g.team];
    var post = !!Logic.esito(g, t);
    var top = (g.tabellino || []).filter(function (r) { return r.p !== null && r.p !== undefined && r.p > 0; })
      .sort(function (a, b) { return b.p - a.p; }).slice(0, 3);
    var gd = Logic.dayLabel(g.data);
    $("img-title").textContent = post ? "Grafica del risultato" : "Grafica della partita";
    $("img-prev").removeAttribute("src");
    $("img-sheet").classList.add("open");
    $("sheet-bg").classList.add("open");
    FX.cardImage({
      tipo: post ? "post" : "pre", club: t.club, squadra: Logic.teamLabel(t), campionato: t.campionato,
      giorno: gd.charAt(0).toUpperCase() + gd.slice(1), ora: g.ora, casa: g.casa, casaNome: g.squadraCasa, ospiteNome: g.squadraOspite,
      ritrovo: g.ritrovo, luogoRitrovo: g.luogoRitrovo, sede: g.sede, ris: g.risultato, marcatori: top
    }, function (url) {
      imgData = url;
      imgName = (post ? "risultato-" : "partita-") + g.id + ".png";
      $("img-prev").src = url;
    });
  }
  function closeImage() { $("img-sheet").classList.remove("open"); $("sheet-bg").classList.remove("open"); }
  $("img-close").addEventListener("click", closeImage);
  $("img-share").addEventListener("click", function () { if (imgData) { FX.vibrate(12); FX.shareImage(imgData, imgName); } });

  // ---------- Condivisione ----------
  function shareOut(text) {
    if (A && A.share) A.share(text);
    else if (navigator.share) navigator.share({ text: text });
  }
  function copyOut(text) {
    if (A && A.copy) A.copy(text);
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
    $("sh-msg").textContent = "Copiato negli appunti.";
  }

  function shareListText() {
    var days = +$("sh-period").value;
    var withTrain = $("sh-train").checked;
    var now = new Date();
    var from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var to = days ? new Date(from.getFullYear(), from.getMonth(), from.getDate() + days) : null;
    var games = filtered().filter(function (g) {
      var d = Logic.toDate(g.data);
      return d >= from && (!to || d < to) && (withTrain || !Logic.isTraining(g));
    });
    if (!games.length) return "";
    var head = "🏀 *Impegni " + (days ? "dei prossimi " + days + " giorni" : "in programma") + "*";
    return head + "\n\n" + games.map(function (g) { return Logic.shareText(g, TM[g.team]); }).join("\n\n—\n\n");
  }

  function openShare() {
    $("sh-msg").textContent = "";
    refreshShare();
    $("share-sheet").classList.add("open");
    $("sheet-bg").classList.add("open");
  }
  function refreshShare() {
    var t = shareListText();
    $("sh-text").value = t;
    $("sh-count").textContent = t ? "" : "Nessun impegno nel periodo con i filtri scelti.";
  }
  function closeShare() {
    $("share-sheet").classList.remove("open");
    $("sheet-bg").classList.remove("open");
  }
  $("btn-share").addEventListener("click", openShare);
  $("sh-period").addEventListener("change", refreshShare);
  $("sh-train").addEventListener("change", refreshShare);
  $("sh-copy").addEventListener("click", function () { if ($("sh-text").value) copyOut($("sh-text").value); });
  $("sh-send").addEventListener("click", function () { if ($("sh-text").value) shareOut($("sh-text").value); });
  $("sh-close").addEventListener("click", closeShare);

  // ---------- Statistiche ----------
  var statsTeam = "bd-u15";
  function renderStats() {
    var teams = BASE.squadre.filter(function (t) { return !/-all$/.test(t.id); });
    var withRes = teams.filter(function (t) { var x = Logic.stats(DATA, t.id); return x.giocate > 0 || x.giocatori.length > 0; });
    var list = withRes.length ? withRes : teams.filter(function (t) { return t.id === statsTeam; });
    if (!list.some(function (t) { return t.id === statsTeam; }) && list.length) statsTeam = list[0].id;
    $("stats-team").innerHTML = list.map(function (t) {
      return '<button data-st="' + t.id + '"' + (t.id === statsTeam ? ' class="on"' : "") + ">" + esc(t.nome.replace("Under ", "U")) + " " + (t.club === "LIONS" ? "LIONS" : "BD") + "</button>";
    }).join("");
    $("stats-team").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { statsTeam = b.dataset.st; renderStats(); });
    });
    var st = Logic.stats(DATA, statsTeam), t = TM[statsTeam];
    document.getElementById("view-stats").style.setProperty("--accent", t.club === "LIONS" ? "var(--lions)" : "var(--bulldogs)");
    if (!st.giocate && !st.giocatori.length) {
      $("stats").innerHTML = '<p class="empty">Nessun risultato inserito per ' + esc(Logic.teamLabel(t)) + '. Aggiungili da una partita con «Risultato e referto».</p>';
      return;
    }
    var max = 1;
    st.quarti.forEach(function (q) { max = Math.max(max, q.fatti, q.subiti); });
    var f1 = function (x) { return (Math.round(x * 10) / 10).toString().replace(".", ","); };
    $("stats").innerHTML =
      '<div class="kpis"><div class="kpi"><b>' + st.vinte + "–" + st.perse + (st.pari ? "–" + st.pari : "") + "</b><span>Vinte–perse</span></div>" +
      '<div class="kpi" style="animation-delay:60ms"><b>' + f1(st.mediaFatti) + "</b><span>Punti fatti (media)</span></div>" +
      '<div class="kpi" style="animation-delay:120ms"><b>' + f1(st.mediaSubiti) + "</b><span>Punti subiti (media)</span></div></div>" +
      (st.partite.length ? "<h2>Ultime partite</h2>" + '<div class="form-row">' + st.partite.slice(-5).map(function (r, i) {
        return '<span class="fdot ' + r.esito + '" style="animation-delay:' + (i * 60) + 'ms">' + { vinta: "V", persa: "P", pari: "=" }[r.esito] + "</span>";
      }).join("") + "</div>" : "") +
      trendChart(st) +
      scorerCards(st) +
      (st.quarti.length ? "<h2>Media per quarto</h2>" + '<div class="card bars">' + st.quarti.map(function (q, i) {
        return '<div class="q"><div>' + esc(q.periodo) + '</div><div class="track">' +
          '<div class="bar f" style="width:' + (q.fatti / max * 100) + "%;animation-delay:" + (i * 70) + 'ms"></div>' +
          '<div class="bar s" style="width:' + (q.subiti / max * 100) + "%;animation-delay:" + (i * 70 + 35) + 'ms"></div>' +
          '<div class="v">fatti ' + f1(q.fatti) + " · subiti " + f1(q.subiti) + "</div></div></div>";
      }).join("") + '<div class="legend"><span class="dot" style="background:var(--ok)"></span> Fatti <span class="dot" style="background:var(--warn)"></span> Subiti</div></div>' : "") +
      (st.giocatori.length ? "<h2>Giocatori (per numero)</h2>" + '<div class="card ptab"><table><thead><tr><th>N°</th><th>Gare</th><th>Punti</th><th>Media</th><th>Max</th><th>Falli</th><th>F/gara</th></tr></thead><tbody>' +
        st.giocatori.map(function (x) {
          var pp = x.partitePunti;
          return "<tr><td><b>" + esc(x.n) + "</b></td><td>" + x.partite + "</td><td><b>" + (pp ? x.punti : "–") + "</b></td><td>" + (pp ? f1(x.punti / pp) : "–") +
            "</td><td>" + (pp ? x.max : "–") + '</td><td class="' + (x.falli / x.partite >= 4 ? "ko" : "") + '">' + x.falli + "</td><td>" + f1(x.falli / x.partite) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : "") +
      (st.partite.length ? "<h2>Partite</h2>" : "") + st.partite.map(function (r) {
        return '<div class="card res"><div><div>' + esc(Logic.matchTitle(r.g)) + '</div><div class="hint" style="margin:0">' +
          esc(Logic.dayLabel(r.g.data)) + "</div></div>" +
          '<div class="e ' + (r.esito === "vinta" ? "ok" : r.esito === "persa" ? "ko" : "") + '">' + r.fatti + "–" + r.subiti + "</div></div>";
      }).join("");
  }

  // Andamento del punteggio quarto per quarto nell'ultima gara con parziali.
  function trendChart(st) {
    var last = st.partite.filter(function (r) { return r.g.risultato.parziali && r.g.risultato.parziali.length; }).slice(-1)[0];
    if (!last) return "";
    var g = last.g, mineCasa = g.squadraCasa === TM[g.team].club;
    var a = [0], b = [0];
    g.risultato.parziali.forEach(function (p) {
      a.push(a[a.length - 1] + (mineCasa ? p[0] : p[1]));
      b.push(b[b.length - 1] + (mineCasa ? p[1] : p[0]));
    });
    var W = 320, H = 150, P = 24, max = Math.max(a[a.length - 1], b[b.length - 1], 1), n = a.length - 1;
    var pt = function (arr) {
      return arr.map(function (v, i) { return (P + i * (W - 2 * P) / n).toFixed(1) + "," + (H - P - v / max * (H - 2 * P)).toFixed(1); }).join(" ");
    };
    var lab = a.map(function (v, i) {
      return i ? '<text class="lbl" x="' + (P + i * (W - 2 * P) / n) + '" y="' + (H - 6) + '" text-anchor="middle">' + i + "°</text>" : "";
    }).join("");
    var opp = mineCasa ? g.squadraOspite : g.squadraCasa;
    return "<h2>Andamento · " + esc(Logic.matchTitle(g)) + "</h2>" +
      '<div class="card trend"><svg viewBox="0 0 ' + W + " " + H + '">' +
      '<polyline class="ln" style="stroke:var(--accent)" points="' + pt(a) + '"/>' +
      '<polyline class="ln" style="stroke:var(--muted);animation-delay:.15s" points="' + pt(b) + '"/>' + lab +
      '<text class="lbl" x="' + (W - P) + '" y="' + (H - P - a[n] / max * (H - 2 * P) - 6) + '" text-anchor="end">' + a[n] + "</text>" +
      '<text class="lbl" x="' + (W - P) + '" y="' + (H - P - b[n] / max * (H - 2 * P) - 6) + '" text-anchor="end">' + b[n] + "</text></svg>" +
      '<div class="legend"><span class="dot" style="background:var(--accent)"></span> ' + esc(TM[g.team].club) +
      ' <span class="dot"></span> ' + esc(opp) + "</div></div>";
  }

  function scorerCards(st) {
    var top = st.giocatori.filter(function (x) { return x.partitePunti && x.punti > 0; }).slice(0, 3);
    if (!top.length) return "";
    var f1 = function (x) { return (Math.round(x * 10) / 10).toString().replace(".", ","); };
    return "<h2>Migliori marcatori</h2>" + '<div class="scorers">' + top.map(function (x, i) {
      return '<div class="scorer' + (i ? "" : " first") + '" style="animation-delay:' + (i * 80) + 'ms"><div class="num">#' + esc(x.n) + "</div>" +
        '<div class="pts"><b>' + x.punti + "</b> punti · " + f1(x.punti / x.partitePunti) + " a gara</div></div>";
    }).join("") + "</div>";
  }

  // ---------- Ritrovo e pause ----------
  function renderRitrovo() {
    $("ritrovo-set").innerHTML = (CFG.club ? [CFG.club] : ["Bulldogs", "LIONS"]).map(function (c) {
      var r = settings.ritrovo[c];
      var opt = function (k) {
        return [0, 15, 20, 30, 45, 60, 75, 90, 120].map(function (m) {
          return '<option value="' + m + '"' + (+r[k] === m ? " selected" : "") + ">" + (m ? m + " min prima" : "Nessuno") + "</option>";
        }).join("");
      };
      return "<p><b>" + c + "</b></p>" +
        '<div class="row2"><label>In casa<select data-rc="' + c + '" data-k="casa">' + opt("casa") + "</select></label>" +
        '<label>In trasferta<select data-rc="' + c + '" data-k="trasferta">' + opt("trasferta") + "</select></label></div>" +
        '<div class="row2"><label>Luogo ritrovo (casa)<input type="text" data-rc="' + c + '" data-k="luogoCasa" value="' + esc(r.luogoCasa) + '" placeholder="es. in palestra"></label>' +
        '<label>Luogo ritrovo (trasferta)<input type="text" data-rc="' + c + '" data-k="luogoTrasferta" value="' + esc(r.luogoTrasferta) + '" placeholder="es. parcheggio"></label></div>';
    }).join("");
    $("ritrovo-set").querySelectorAll("[data-rc]").forEach(function (i) {
      i.addEventListener("change", function () {
        var v = i.tagName === "SELECT" ? +i.value : i.value.trim();
        settings.ritrovo[i.dataset.rc][i.dataset.k] = v;
        saveSettings(); renderAll(); sync(true);
      });
    });
  }

  function renderPause() {
    var nomeClub = { tutti: "Bulldogs e LIONS", Bulldogs: "Bulldogs", LIONS: "LIONS" };
    $("pause-list").innerHTML = settings.pause.length ? settings.pause.map(function (p, i) {
      return '<div class="pz"><div><b>' + esc(p.nome || "Pausa") + "</b><br><small>" + Logic.fmtDM(p.dal) + " – " + Logic.fmtDM(p.al) +
        " · " + nomeClub[p.club] + '</small></div><button class="btn ghost small" data-pz="' + i + '">Togli</button></div>';
    }).join("") : '<p class="empty">Nessuna pausa impostata.</p>';
    $("pause-list").querySelectorAll("[data-pz]").forEach(function (b) {
      b.addEventListener("click", function () {
        settings.pause.splice(+b.dataset.pz, 1);
        saveSettings(); renderAll(); renderPause(); sync(true);
      });
    });
  }
  $("pz-add").addEventListener("click", function () {
    var dal = $("pz-dal").value, al = $("pz-al").value;
    if (!dal || !al || al < dal) { $("pz-err").textContent = "Scegli le date: la fine non può essere prima dell'inizio."; return; }
    $("pz-err").textContent = "";
    settings.pause.push({ dal: dal, al: al, club: $("pz-club").value, nome: $("pz-nome").value.trim() });
    settings.pause.sort(function (a, b) { return a.dal < b.dal ? -1 : 1; });
    $("pz-dal").value = ""; $("pz-al").value = ""; $("pz-nome").value = "";
    saveSettings(); renderAll(); renderPause(); sync(true);
  });

  // ---------- Tema chiaro/scuro ----------
  function currentTheme() {
    var t = (A && A.getStore ? A.getStore("tema") : "") || (function () { try { return localStorage.getItem("tema"); } catch (e) { return ""; } })() || "auto";
    return ["auto", "light", "dark"].indexOf(t) >= 0 ? t : "auto";
  }
  function applyTheme(t) {
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { localStorage.setItem("tema", t); } catch (e) {}
    var dark = t === "dark" || (t === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    if (A && A.setBars) { try { A.setBars(dark); } catch (e) {} }
    document.querySelectorAll("#theme-pick button").forEach(function (b) { b.classList.toggle("on", b.dataset.theme === t); });
  }
  document.querySelectorAll("#theme-pick button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (A && A.setStore) A.setStore("tema", b.dataset.theme);
      applyTheme(b.dataset.theme);
      FX.vibrate(10);
    });
  });
  applyTheme(currentTheme());
  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var onMq = function () { if (currentTheme() === "auto") applyTheme("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  // ---------- Icona dell'app ----------
  function renderIcon() {
    var cur = A && A.getIcon ? A.getIcon() : "ball";
    document.querySelectorAll("#icon-pick button").forEach(function (b) { b.classList.toggle("on", b.dataset.icon === cur); });
  }
  document.querySelectorAll("#icon-pick button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!A || !A.setIcon) return;
      A.setIcon(b.dataset.icon);
      FX.vibrate(15);
      renderIcon();
    });
  });

  // ---------- Impostazioni ----------
  function renderTeamSettings() {
    $("team-settings").innerHTML = BASE.squadre.map(function (t) {
      var s = settings.squadre[t.id];
      var n = DATA.partite.filter(function (g) { return g.team === t.id; }).length;
      var role = t.ruolo ? t.ruolo : (CFG.club ? t.campionato : "quadro generale");
      return '<div class="card trow">' +
        '<div><div class="n">' + esc(Logic.teamLabel(t)) + '</div><div class="r">' + esc(role) + " · " +
        (n ? n + " gare" : esc(t.nota || "nessuna gara")) + "</div></div>" +
        '<label class="toggle"><input type="checkbox" data-t="' + t.id + '" data-k="notifiche"' + (s.notifiche ? " checked" : "") + ">Notifiche</label>" +
        '<label class="toggle"><input type="checkbox" data-t="' + t.id + '" data-k="calendar"' + (s.calendar ? " checked" : "") + ">Calendar</label>" +
        "</div>";
    }).join("");
    document.querySelectorAll("#team-settings input").forEach(function (i) {
      i.addEventListener("change", function () {
        settings.squadre[i.dataset.t][i.dataset.k] = i.checked;
        saveSettings();
        if (i.dataset.k === "calendar") setSync("Squadre cambiate: premi Sincronizza ora per aggiornare Google Calendar.");
      });
    });
  }

  function renderSedeCasa() {
    $("sede-casa").innerHTML = BASE.squadre.filter(function (t) {
      return BASE.partite.some(function (g) { return g.team === t.id && g.casa && !g.sede; }) || settings.sedeCasa[t.id];
    }).map(function (t) {
      return "<label>" + esc(Logic.teamLabel(t)) +
        '<input type="text" data-sc="' + t.id + '" placeholder="Palestra e indirizzo" value="' + esc(settings.sedeCasa[t.id] || "") + '"></label>';
    }).join("") || '<p class="empty">Tutte le gare in casa hanno già la sede.</p>';
    document.querySelectorAll("#sede-casa [data-sc]").forEach(function (i) {
      i.addEventListener("change", function () {
        var v = i.value.trim();
        if (v) settings.sedeCasa[i.dataset.sc] = v; else delete settings.sedeCasa[i.dataset.sc];
        saveSettings();
        renderAll();
        sync(true);
      });
    });
  }

  function fillSelect(id, values, current, fmt) {
    $(id).innerHTML = values.map(function (v) {
      return '<option value="' + v + '"' + (v === current ? " selected" : "") + ">" + fmt(v) + "</option>";
    }).join("");
  }

  function renderPromemoria() {
    fillSelect("org-days", [0, 10, 11, 12, 13, 14, 15], settings.orgGiorni, function (v) { return v ? v + " giorni prima" : "Disattivato"; });
    fillSelect("pre-hours", [0, 1, 2, 3, 4, 6, 24], settings.preOre, function (v) { return v ? (v === 24 ? "Il giorno prima (24 ore)" : v + (v === 1 ? " ora" : " ore") + " prima") : "Disattivato"; });
    $("org-time").value = settings.orgOra;
  }
  $("org-days").addEventListener("change", function (e) { settings.orgGiorni = +e.target.value; saveSettings(); });
  $("pre-hours").addEventListener("change", function (e) { settings.preOre = +e.target.value; saveSettings(); });
  $("org-time").addEventListener("change", function (e) { if (e.target.value) { settings.orgOra = e.target.value; saveSettings(); } });

  function renderNotifStatus(count) {
    var el = $("notif-status");
    if (!A) { el.textContent = "Anteprima da browser: notifiche non disponibili."; return; }
    var perm = A.hasNotificationPermission();
    if (count === undefined) count = Logic.buildReminders(DATA, settings, new Date()).length;
    el.innerHTML = perm
      ? '<span class="ok">Notifiche attive</span> · ' + count + " promemoria programmati"
      : '<span class="ko">Notifiche non consentite</span>';
    $("btn-notif-perm").style.display = perm ? "none" : "";
  }
  $("btn-notif-perm").addEventListener("click", function () { if (A) A.requestNotificationPermission(); });
  $("btn-notif-test").addEventListener("click", function () { if (A) A.testNotification(); });

  function renderEditsStatus() {
    var nm = Object.keys(edits.mod).length, na = edits.add.length, nd = edits.del.length;
    $("edits-status").textContent = nm + " gare modificate · " + na + " aggiunte · " + nd + " eliminate";
    $("btn-restore-del").style.display = nd ? "" : "none";
  }
  $("btn-restore-del").addEventListener("click", function () { edits.del = []; saveEdits(); });

  // ---------- Google Calendar ----------
  function setSync(msg) { $("sync-status").textContent = msg; }

  function renderCalSettings() {
    var st = $("cal-status");
    var sel = $("cal-select");
    if (!A) { st.textContent = "Anteprima da browser: calendario non disponibile."; return; }
    var perm = A.hasCalendarPermission();
    $("btn-cal-perm").style.display = perm ? "none" : "";
    $("btn-cal-sync").disabled = !perm || !settings.calendarId;
    if (!perm) { st.innerHTML = '<span class="ko">Accesso al calendario non consentito</span>'; return; }
    var cals = [];
    try { cals = JSON.parse(A.listCalendars()); } catch (e) {}
    sel.innerHTML = '<option value="">— nessuno —</option>' + cals.map(function (c) {
      return '<option value="' + c.id + '"' + (String(c.id) === String(settings.calendarId) ? " selected" : "") + ">" +
        esc(c.nome) + " (" + esc(c.account) + ")</option>";
    }).join("");
    var found = cals.some(function (c) { return String(c.id) === String(settings.calendarId); });
    st.innerHTML = found ? '<span class="ok">Calendario collegato</span>' :
      (cals.length ? "Scegli il calendario di destinazione." : "Nessun calendario scrivibile trovato sul telefono.");
    var last = A.getLastSync();
    if (last) setSync(last);
  }
  $("btn-cal-perm").addEventListener("click", function () { if (A) A.requestCalendarPermission(); });
  $("cal-select").addEventListener("change", function (e) {
    settings.calendarId = e.target.value;
    saveSettings();
    renderCalSettings();
    if (settings.calendarId) setSync("Calendario scelto: premi Sincronizza ora.");
  });

  function sync(auto) {
    if (!A || !settings.calendarId || !A.hasCalendarPermission()) return;
    var ev = Logic.buildCalendarEvents(DATA, settings);
    var res;
    try { res = JSON.parse(A.syncCalendar(String(settings.calendarId), JSON.stringify(ev))); }
    catch (e) { setSync("Errore di sincronizzazione."); return; }
    if (res.errore) { setSync("Errore: " + res.errore); return; }
    if (auto && !res.aggiunti && !res.aggiornati && !res.rimossi) return;
    setSync(res.messaggio);
  }
  $("btn-cal-sync").addEventListener("click", function () { sync(false); });

  // Richiamate dal codice Android.
  window.onNativePermission = function () { renderNotifStatus(); renderCalSettings(); reschedule(); };
  var lastCheck = Date.now();
  window.onNativeResume = function () {
    renderNotifStatus(); renderCalSettings();
    if (Date.now() - lastCheck > 3600000) { lastCheck = Date.now(); checkData(); checkApp(); }
  };

  // ---------- Avvio ----------
  function renderFiltered() { renderList(); renderCalendar(); renderLuoghi(); }
  function renderAll() {
    renderFiltered(); renderIncroci(); renderTeamSettings(); renderSedeCasa(); renderEditsStatus();
    if (ui.view === "stats") renderStats();
  }

  // ---------- Aggiornamenti automatici ----------
  var fetchCbs = {};
  window.__fetchCb = function (id, ok, text) { var f = fetchCbs[id]; delete fetchCbs[id]; if (f) f(ok, text); };
  function fetchText(url, cb) {
    if (!A || !A.fetchAsync) return;
    var id = "f" + Date.now() + Math.random().toString(36).slice(2);
    fetchCbs[id] = cb;
    A.fetchAsync(url, id);
  }

  function showBanner(html, btnText, onClick) {
    var b = $("update-banner");
    b.innerHTML = "<span>" + html + "</span>" + (btnText ? '<button class="btn" id="banner-btn">' + esc(btnText) + "</button>" : "");
    b.classList.add("show");
    if (btnText) $("banner-btn").addEventListener("click", onClick);
    else setTimeout(function () { b.classList.remove("show"); }, 5000);
  }

  function checkData() {
    fetchText(DATA_URL + "?t=" + Date.now(), function (ok, text) {
      if (!ok) return;
      var json;
      try { json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch (e) { return; }
      if (!json.partite || !json.squadre || (json.rev || 0) <= (BASE.rev || 0)) return;
      storeJSON("remoteData", json);
      setBase(json);
      settings = Logic.mergeSettings(BASE, settings);
      storeJSON("settings", settings);
      rebuild();
      renderChips(); renderAll(); renderVersion();
      reschedule();
      sync(true);
      showBanner("Partite aggiornate (" + BASE.partite.length + " gare).");
    });
  }

  function checkApp() {
    fetchText(RELEASE_URL, function (ok, text) {
      if (!ok) return;
      try {
        var r = JSON.parse(text);
        var n = parseInt(String(r.tag_name).replace(/\D/g, ""), 10);
        var re = new RegExp("^" + CFG.apk + "-v\\d+\\.apk$");
        var asset = (r.assets || []).filter(function (x) { return re.test(x.name); })[0];
        if (n > A.getVersionCode() && asset) {
          showBanner("Nuova versione v" + n + " dell'app", "Scarica", function () { openUrl(asset.browser_download_url); });
        }
      } catch (e) {}
    });
  }

  function renderVersion() {
    $("data-version").textContent = "Dati aggiornati al " + BASE.versione.split("-").reverse().join("/") +
      " (rev. " + (BASE.rev || 0) + ") · " + BASE.partite.length + " partite" +
      (A ? " · app v" + A.getVersionCode() : "");
  }

  rebuild();
  renderVersion();
  if (["mie", "Bulldogs", "LIONS", "tutte"].indexOf(filtri.scope) >= 0) ui.scope = filtri.scope;
  if (CFG.web) {
    document.body.classList.add("web-app");
    var sl = CFG.slug || "bulldogs";
    var feeds = [[sl + ".ics", "Tutto " + CFG.club + " (gare e allenamenti)"]];
    BASE.squadre.forEach(function (t) { feeds.push([sl + "-" + t.id.replace(/^(bd|li)-/, "") + ".ics", Logic.teamLabel(t)]); });
    $("ics-list").innerHTML = feeds.map(function (f) {
      return '<a class="ics-row" href="' + esc(CFG.ics.replace(/^https:/, "webcal:") + f[0]) + '">' + esc(f[1]) + "<span>Abbonati</span></a>";
    }).join("");
  }
  if (CFG.club) {
    ui.scope = CFG.club;
    document.body.classList.add("club-app");
    $("app-title").textContent = CFG.nome;
    $("sp-name").textContent = CFG.nome;
    document.title = CFG.nome;
  }
  if (typeof filtri.showPast === "boolean") ui.showPast = filtri.showPast;
  if (typeof filtri.showTrain === "boolean") ui.showTrain = filtri.showTrain;
  document.querySelectorAll("#scope button").forEach(function (x) { x.classList.toggle("on", x.dataset.scope === ui.scope); });
  $("show-past").checked = ui.showPast;
  $("show-train").checked = ui.showTrain;
  renderChips(); renderAll(); renderPromemoria(); renderRitrovo(); renderPause(); renderIcon(); applyClubTheme();
  FX.splash();
  renderNotifStatus(); renderCalSettings();
  reschedule();
  sync(true); // dopo un aggiornamento dell'app porta i nuovi dati nel calendario
  checkData();
  checkApp();
})();
