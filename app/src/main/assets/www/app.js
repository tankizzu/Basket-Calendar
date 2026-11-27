(function () {
  var BASE = window.BASKET_DATA;
  var TM = Logic.teamMap(BASE);
  var A = window.Android || null; // ponte nativo (assente nell'anteprima da browser)
  var MIE = BASE.squadre.filter(function (t) { return t.mia; }).map(function (t) { return t.id; });
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  var settings = Logic.mergeSettings(BASE, loadJSON("settings"));
  var edits = loadJSON("edits") || { mod: {}, add: [], del: [] };
  var DATA;
  var now0 = new Date();
  var ui = {
    view: "partite", scope: "mie", teams: {}, showPast: false, incPast: false,
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

  function rebuild() { DATA = Logic.applyEdits(BASE, edits, settings.sedeCasa); }

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
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      ui.view = b.dataset.view;
      document.querySelectorAll(".tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll(".view").forEach(function (v) {
        v.classList.toggle("active", v.id === "view-" + ui.view);
      });
      $("filters").classList.toggle("hidden", ["partite", "calendario", "luoghi"].indexOf(ui.view) < 0);
      window.scrollTo(0, 0);
    });
  });

  // ---------- Filtri ----------
  function scopeTeams() {
    if (ui.scope === "mie") return MIE.slice();
    return BASE.squadre.filter(function (t) {
      return ui.scope === "tutte" || t.club === ui.scope;
    }).map(function (t) { return t.id; });
  }

  function renderChips() {
    var ids = scopeTeams();
    ui.teams = {};
    ids.forEach(function (id) { ui.teams[id] = true; });
    $("team-chips").innerHTML = ids.map(function (id) {
      var t = TM[id];
      return '<button class="chip on ' + t.club + '" data-team="' + id + '">' + esc(Logic.teamLabel(t)) + "</button>";
    }).join("");
    document.querySelectorAll("#team-chips .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var id = c.dataset.team;
        ui.teams[id] = !ui.teams[id];
        c.classList.toggle("on", ui.teams[id]);
        renderFiltered();
      });
    });
  }

  document.querySelectorAll("#scope button").forEach(function (b) {
    b.addEventListener("click", function () {
      ui.scope = b.dataset.scope;
      document.querySelectorAll("#scope button").forEach(function (x) { x.classList.toggle("on", x === b); });
      renderChips(); renderFiltered();
    });
  });

  function filtered() {
    return DATA.partite.filter(function (g) { return ui.teams[g.team]; });
  }

  // ---------- Scheda partita ----------
  function badges(g) {
    var b = [];
    b.push(g.casa ? '<span class="badge casa">Casa</span>' : '<span class="badge">Trasferta</span>');
    if (g.stato === "annullata") b.push('<span class="badge annullata">Annullata</span>');
    if (g.stato === "recupero") b.push('<span class="badge recupero">Recupero</span>');
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
    var st = g.storico && g.storico.length
      ? "<div>Storico:<ul>" + g.storico.map(function (s) { return "<li>" + esc(s.testo) + "</li>"; }).join("") + "</ul></div>"
      : "";
    var act = '<div class="actions">' +
      (g.sede ? '<button class="btn ghost" data-act="map" data-id="' + g.id + '">Mappa</button>' : "") +
      '<button class="btn ghost" data-act="edit" data-id="' + g.id + '">Modifica</button>' +
      '<button class="btn ghost" data-act="toggle" data-id="' + g.id + '">' + (g.stato === "annullata" ? "Ripristina gara" : "Segna annullata") + "</button>" +
      "</div>";
    return '<div class="card game ' + t.club + " " + (g.stato === "annullata" ? "annullata " : "") + (past ? "past" : "") + '" data-id="' + g.id + '">' +
      '<div class="time">' + esc(g.ora) + (showDate ? '<div class="meta">' + esc(Logic.shortDate(g.data)) + "</div>" : "") + "</div>" +
      "<div>" +
      '<div class="team">' + esc(Logic.teamLabel(t)) + "</div>" +
      '<div class="match">' + esc(Logic.matchTitle(g)) + "</div>" +
      '<div class="meta">' + (g.sede ? esc(g.sede) : "Sede non indicata") + "</div>" +
      badges(g) +
      '<div class="details">' + det.map(function (d) { return "<div>" + d + "</div>"; }).join("") + st + act + "</div>" +
      "</div></div>";
  }

  function bindCards(root) {
    root.querySelectorAll(".game").forEach(function (c) {
      c.addEventListener("click", function () { c.classList.toggle("open"); });
    });
    root.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var g = findGame(b.dataset.id);
        if (!g) return;
        if (b.dataset.act === "map") openUrl(Logic.mapsUrl(g.sede));
        if (b.dataset.act === "edit") openEditor(g.id);
        if (b.dataset.act === "toggle") {
          setMod(g.id, { stato: g.stato === "annullata" ? baseStato(g.id) : "annullata" });
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
    var active = partite.filter(Logic.isActive);
    if (ui.scope === "mie") return active.length > 1 ? active.length : 0;
    var clubs = {};
    active.forEach(function (g) { clubs[TM[g.team].club] = (clubs[TM[g.team].club] || 0) + 1; });
    return Object.keys(clubs).some(function (c) { return clubs[c] > 1; }) ? active.length : 0;
  }

  function renderList() {
    var now = new Date();
    var games = filtered().filter(function (g) { return ui.showPast || !Logic.isPast(g, now); });
    var el = $("list");
    var groups = dayGroups(games);
    if (!groups.length) { el.innerHTML = '<p class="empty">Nessuna partita per i filtri scelti.</p>'; return; }
    el.innerHTML = groups.map(function (d) {
      var f = dayFlag(d.partite);
      return '<div class="day"><div class="day-h">' + esc(Logic.dayLabel(d.data)) +
        (f ? ' <span class="flag">' + f + " gare</span>" : "") + "</div>" +
        d.partite.map(function (g) { return gameCard(g, now); }).join("") + "</div>";
    }).join("");
    bindCards(el);
  }
  $("show-past").addEventListener("change", function (e) { ui.showPast = e.target.checked; renderList(); });

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
          return '<span class="dot ' + TM[g.team].club + '"></span>';
        }).join("");
        var cls = "c" + (d.fuori ? " out" : "") + (d.iso === today ? " today" : "") +
          (d.iso === ui.selDay ? " sel" : "") + (f ? " multi" : "");
        html += '<button class="' + cls + '" data-day="' + d.iso + '">' + d.giorno + '<span class="dots">' + dots + "</span></button>";
      });
    });
    $("cal-grid").innerHTML = html;
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

  $("m-prev").addEventListener("click", function () {
    var d = new Date(ui.month.y, ui.month.m - 1, 1); ui.month = { y: d.getFullYear(), m: d.getMonth() }; renderCalendar();
  });
  $("m-next").addEventListener("click", function () {
    var d = new Date(ui.month.y, ui.month.m + 1, 1); ui.month = { y: d.getFullYear(), m: d.getMonth() }; renderCalendar();
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
    $("inc-mie").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return MIE.indexOf(g.team) >= 0; }, o));
    $("inc-bulldogs").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return TM[g.team].club === "Bulldogs"; }, o));
    $("inc-lions").innerHTML = incBlock(Logic.overlaps(DATA, function (g) { return TM[g.team].club === "LIONS"; }, o));
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
      if (!places[g.sede]) { places[g.sede] = { sede: g.sede, gare: [] }; order.push(g.sede); }
      places[g.sede].gare.push(g);
    });
    order.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    $("luoghi").innerHTML = order.length ? order.map(function (s) {
      var p = places[s];
      var teams = {};
      p.gare.forEach(function (g) { teams[Logic.teamLabel(TM[g.team])] = 1; });
      var next = p.gare.filter(function (g) { return !Logic.isPast(g, now); })[0];
      return '<div class="card place"><div class="n">' + esc(s) + "</div>" +
        '<div class="m">' + esc(Object.keys(teams).join(", ")) + " · " + p.gare.length + (p.gare.length === 1 ? " gara" : " gare") + "</div>" +
        '<div class="m">' + (next ? "Prossima: " + esc(Logic.dayLabel(next.data)) + " ore " + esc(next.ora) + " · " + esc(Logic.matchTitle(next)) : "Nessuna gara futura") + "</div>" +
        '<div class="actions"><button class="btn ghost" data-map="' + esc(s) + '">Mappa</button></div></div>';
    }).join("") : '<p class="empty">Nessuna sede per i filtri scelti.</p>';
    document.querySelectorAll("#luoghi [data-map]").forEach(function (b) {
      b.addEventListener("click", function () { openUrl(Logic.mapsUrl(b.dataset.map)); });
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
      $("ed-casa").value = "1";
      $("ed-avv").value = "";
      $("ed-sede").value = "";
      $("ed-stato").value = "programmata";
      $("ed-note").value = "";
    } else {
      var g = findGame(id);
      $("ed-data").value = g.data;
      $("ed-ora").value = g.ora;
      $("ed-casa").value = g.casa ? "1" : "0";
      $("ed-avv").value = g.casa ? g.squadraOspite : g.squadraCasa;
      $("ed-sede").value = g.sedeDaImpostazioni ? "" : (g.sede || "");
      $("ed-stato").value = g.stato;
      $("ed-note").value = g.noteUtente || "";
    }
    $("sheet").classList.add("open");
    $("sheet-bg").classList.add("open");
  }

  function closeEditor() {
    $("sheet").classList.remove("open");
    $("sheet-bg").classList.remove("open");
    ui.editId = null;
  }

  $("btn-add").addEventListener("click", function () { openEditor(null); });
  $("ed-cancel").addEventListener("click", closeEditor);
  $("sheet-bg").addEventListener("click", closeEditor);

  $("ed-save").addEventListener("click", function () {
    var f = {
      data: $("ed-data").value, ora: $("ed-ora").value, casa: $("ed-casa").value === "1",
      avversario: $("ed-avv").value.trim(), sede: $("ed-sede").value.trim(),
      stato: $("ed-stato").value, note: $("ed-note").value.trim()
    };
    if (!f.data || !f.ora || !f.avversario) { $("ed-err").textContent = "Servono data, ora e avversario."; return; }
    if (!ui.editId) {
      var team = $("ed-team").value;
      edits.add.push(Logic.newGame(team, TM[team].club, f));
    } else {
      var g = findGame(ui.editId);
      var ch = {};
      if (f.data !== g.data || f.ora !== g.ora) { ch.data = f.data; ch.ora = f.ora; }
      if (f.casa !== g.casa) ch.casa = f.casa;
      var avvOld = g.casa ? g.squadraOspite : g.squadraCasa;
      if (f.avversario !== avvOld || ch.casa !== undefined) ch.avversario = f.avversario;
      var sedeOld = g.sedeDaImpostazioni ? "" : (g.sede || "");
      if (f.sede !== sedeOld) ch.sede = f.sede;
      if (f.stato !== g.stato) ch.stato = f.stato;
      if (f.note !== (g.noteUtente || "")) ch.note = f.note;
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

  // ---------- Impostazioni ----------
  function renderTeamSettings() {
    $("team-settings").innerHTML = BASE.squadre.map(function (t) {
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
  window.onNativeResume = function () { renderNotifStatus(); renderCalSettings(); };

  // ---------- Avvio ----------
  function renderFiltered() { renderList(); renderCalendar(); renderLuoghi(); }
  function renderAll() {
    renderFiltered(); renderIncroci(); renderTeamSettings(); renderSedeCasa(); renderEditsStatus();
  }

  rebuild();
  $("data-version").textContent = "Dati del pacchetto aggiornati al " + BASE.versione.split("-").reverse().join("/") +
    " · " + BASE.partite.length + " partite";
  renderChips(); renderAll(); renderPromemoria();
  renderNotifStatus(); renderCalSettings();
  reschedule();
  sync(true); // dopo un aggiornamento dell'app porta i nuovi dati nel calendario
})();
