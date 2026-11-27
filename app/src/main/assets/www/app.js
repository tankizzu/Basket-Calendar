(function () {
  var DATA = window.BASKET_DATA;
  var TM = Logic.teamMap(DATA);
  var A = window.Android || null; // ponte nativo (assente nell'anteprima da browser)
  var MIE = DATA.squadre.filter(function (t) { return t.mia; }).map(function (t) { return t.id; });

  var settings = Logic.mergeSettings(DATA, loadSaved());
  var ui = { scope: "mie", teams: {}, showPast: false, incPast: false };

  function loadSaved() {
    try {
      var raw = A ? A.getSettings() : localStorage.getItem("settings");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save() {
    var raw = JSON.stringify(settings);
    try { if (A) A.saveSettings(raw); else localStorage.setItem("settings", raw); } catch (e) {}
    reschedule();
  }

  function reschedule() {
    if (!A) return;
    var rem = Logic.buildReminders(DATA, settings, new Date());
    try { A.scheduleReminders(JSON.stringify(rem)); } catch (e) {}
    renderNotifStatus(rem.length);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- Navigazione ----------
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll(".view").forEach(function (v) {
        v.classList.toggle("active", v.id === "view-" + b.dataset.view);
      });
      window.scrollTo(0, 0);
    });
  });

  // ---------- Partite ----------
  function scopeTeams() {
    if (ui.scope === "mie") return MIE.slice();
    return DATA.squadre.filter(function (t) {
      return ui.scope === "tutte" || t.club === ui.scope;
    }).map(function (t) { return t.id; });
  }

  function renderChips() {
    var ids = scopeTeams();
    ui.teams = {};
    ids.forEach(function (id) { ui.teams[id] = true; });
    document.getElementById("team-chips").innerHTML = ids.map(function (id) {
      var t = TM[id];
      return '<button class="chip on ' + t.club + '" data-team="' + id + '">' + esc(Logic.teamLabel(t)) + "</button>";
    }).join("");
    document.querySelectorAll("#team-chips .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var id = c.dataset.team;
        ui.teams[id] = !ui.teams[id];
        c.classList.toggle("on", ui.teams[id]);
        renderList();
      });
    });
  }

  function badges(g) {
    var b = [];
    b.push(g.casa ? '<span class="badge casa">Casa</span>' : '<span class="badge">Trasferta</span>');
    if (g.stato === "annullata") b.push('<span class="badge annullata">Annullata</span>');
    if (g.stato === "recupero") b.push('<span class="badge recupero">Recupero</span>');
    if (g.verifica === "utente") b.push('<span class="badge utente">Da confermare</span>');
    return '<div class="badges">' + b.join("") + "</div>";
  }

  function gameCard(g, now) {
    var t = TM[g.team];
    var past = Logic.isPast(g, now);
    var det = [];
    if (g.giornata) det.push("Giornata/gara: " + esc(g.giornata));
    det.push("Fonte: " + esc(g.fonte));
    if (g.note) det.push(esc(g.note));
    var st = g.storico && g.storico.length
      ? "<div>Storico:<ul>" + g.storico.map(function (s) { return "<li>" + esc(s.testo) + "</li>"; }).join("") + "</ul></div>"
      : "";
    return '<div class="card game ' + t.club + " " + (g.stato === "annullata" ? "annullata " : "") + (past ? "past" : "") + '">' +
      '<div class="time">' + esc(g.ora) + "</div>" +
      "<div>" +
      '<div class="team">' + esc(Logic.teamLabel(t)) + "</div>" +
      '<div class="match">' + esc(Logic.matchTitle(g)) + "</div>" +
      (g.sede ? '<div class="meta">' + esc(g.sede) + "</div>" : "") +
      badges(g) +
      '<div class="details">' + det.map(function (d) { return "<div>" + d + "</div>"; }).join("") + st + "</div>" +
      "</div></div>";
  }

  function renderList() {
    var now = new Date();
    var games = DATA.partite.filter(function (g) {
      return ui.teams[g.team] && (ui.showPast || !Logic.isPast(g, now));
    });
    var byDay = [];
    var idx = {};
    games.forEach(function (g) {
      if (!(g.data in idx)) { idx[g.data] = byDay.length; byDay.push({ data: g.data, partite: [] }); }
      byDay[idx[g.data]].partite.push(g);
    });
    var el = document.getElementById("list");
    if (!byDay.length) { el.innerHTML = '<p class="empty">Nessuna partita per i filtri scelti.</p>'; return; }
    el.innerHTML = byDay.map(function (d) {
      var active = d.partite.filter(Logic.isActive);
      var clubs = {};
      active.forEach(function (g) { clubs[TM[g.team].club] = (clubs[TM[g.team].club] || 0) + 1; });
      var flag;
      if (ui.scope === "mie") flag = active.length > 1;
      else flag = Object.keys(clubs).some(function (c) { return clubs[c] > 1; });
      return '<div class="day"><div class="day-h">' + esc(Logic.dayLabel(d.data)) +
        (flag ? ' <span class="flag">' + active.length + " gare</span>" : "") + "</div>" +
        d.partite.sort(function (a, b) { return a.ora < b.ora ? -1 : 1; }).map(function (g) { return gameCard(g, now); }).join("") +
        "</div>";
    }).join("");
    el.querySelectorAll(".game").forEach(function (c) {
      c.addEventListener("click", function () { c.classList.toggle("open"); });
    });
  }

  document.querySelectorAll("#scope button").forEach(function (b) {
    b.addEventListener("click", function () {
      ui.scope = b.dataset.scope;
      document.querySelectorAll("#scope button").forEach(function (x) { x.classList.toggle("on", x === b); });
      renderChips(); renderList();
    });
  });
  document.getElementById("show-past").addEventListener("change", function (e) {
    ui.showPast = e.target.checked; renderList();
  });

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
    document.getElementById("inc-mie").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return MIE.indexOf(g.team) >= 0; }, o));
    document.getElementById("inc-bulldogs").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return TM[g.team].club === "Bulldogs"; }, o));
    document.getElementById("inc-lions").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return TM[g.team].club === "LIONS"; }, o));
    var v = Logic.checkU15Weekend(DATA);
    document.getElementById("vincolo").innerHTML = v.length ? v.map(function (r) {
      var g = r.partita;
      return '<div class="card inc"><div class="d">' + esc(Logic.dayLabel(g.data)) + " · " + esc(g.ora) + "</div>" +
        '<div class="l">' + esc(Logic.matchTitle(g)) + "</div>" +
        '<div class="l ' + (r.ok ? "ok" : "ko") + '">' +
        (r.ok ? "Rispettato: Aquilotti alle " + esc(r.aquilotti.ora) : "Non rispettato: nessuna gara Aquilotti") + "</div></div>";
    }).join("") : '<p class="empty">Nessuna gara U15 in casa nel weekend.</p>';
  }
  document.getElementById("inc-past").addEventListener("change", function (e) {
    ui.incPast = e.target.checked; renderIncroci();
  });

  // ---------- Impostazioni ----------
  function renderTeamSettings() {
    document.getElementById("team-settings").innerHTML = DATA.squadre.map(function (t) {
      var s = settings.squadre[t.id];
      var n = DATA.partite.filter(function (g) { return g.team === t.id; }).length;
      var role = t.ruolo ? t.ruolo : "quadro generale";
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
        save();
        if (i.dataset.k === "calendar") setSync("Squadre cambiate: premi Sincronizza ora per aggiornare Google Calendar.");
      });
    });
  }

  function fillSelect(id, values, current, fmt) {
    var s = document.getElementById(id);
    s.innerHTML = values.map(function (v) {
      return '<option value="' + v + '"' + (v === current ? " selected" : "") + ">" + fmt(v) + "</option>";
    }).join("");
  }

  function renderPromemoria() {
    fillSelect("org-days", [0, 10, 11, 12, 13, 14, 15], settings.orgGiorni, function (v) { return v ? v + " giorni prima" : "Disattivato"; });
    fillSelect("pre-hours", [0, 1, 2, 3, 4, 6, 24], settings.preOre, function (v) { return v ? (v === 24 ? "Il giorno prima (24 ore)" : v + (v === 1 ? " ora" : " ore") + " prima") : "Disattivato"; });
    document.getElementById("org-time").value = settings.orgOra;
  }
  document.getElementById("org-days").addEventListener("change", function (e) { settings.orgGiorni = +e.target.value; save(); });
  document.getElementById("pre-hours").addEventListener("change", function (e) { settings.preOre = +e.target.value; save(); });
  document.getElementById("org-time").addEventListener("change", function (e) { if (e.target.value) { settings.orgOra = e.target.value; save(); } });

  function renderNotifStatus(count) {
    var el = document.getElementById("notif-status");
    if (!A) { el.textContent = "Anteprima da browser: notifiche non disponibili."; return; }
    var perm = A.hasNotificationPermission();
    if (count === undefined) count = Logic.buildReminders(DATA, settings, new Date()).length;
    el.innerHTML = perm
      ? '<span class="ok">Notifiche attive</span> · ' + count + " promemoria programmati"
      : '<span class="ko">Notifiche non consentite</span>';
    document.getElementById("btn-notif-perm").style.display = perm ? "none" : "";
  }
  document.getElementById("btn-notif-perm").addEventListener("click", function () { if (A) A.requestNotificationPermission(); });
  document.getElementById("btn-notif-test").addEventListener("click", function () { if (A) A.testNotification(); });

  // ---------- Google Calendar ----------
  function setSync(msg) { document.getElementById("sync-status").textContent = msg; }

  function renderCalendar() {
    var st = document.getElementById("cal-status");
    var sel = document.getElementById("cal-select");
    if (!A) { st.textContent = "Anteprima da browser: calendario non disponibile."; return; }
    var perm = A.hasCalendarPermission();
    document.getElementById("btn-cal-perm").style.display = perm ? "none" : "";
    document.getElementById("btn-cal-sync").disabled = !perm || !settings.calendarId;
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
  document.getElementById("btn-cal-perm").addEventListener("click", function () { if (A) A.requestCalendarPermission(); });
  document.getElementById("cal-select").addEventListener("change", function (e) {
    settings.calendarId = e.target.value;
    save();
    renderCalendar();
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
  document.getElementById("btn-cal-sync").addEventListener("click", function () { sync(false); });

  // Richiamata dal codice Android dopo una richiesta di permesso.
  window.onNativePermission = function () {
    renderNotifStatus();
    renderCalendar();
    reschedule();
  };
  window.onNativeResume = function () {
    renderNotifStatus();
    renderCalendar();
  };

  // ---------- Avvio ----------
  document.getElementById("data-version").textContent = "Dati aggiornati al " + DATA.versione.split("-").reverse().join("/") +
    " · " + DATA.partite.length + " partite";
  renderChips(); renderList(); renderIncroci(); renderTeamSettings(); renderPromemoria();
  renderNotifStatus(); renderCalendar();
  reschedule();
  sync(true); // dopo un aggiornamento dell'app porta i nuovi dati nel calendario
})();
