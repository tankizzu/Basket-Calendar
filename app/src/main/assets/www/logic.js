/* Logica pura: nessun accesso al DOM, testabile con Node. */
var Logic = (function () {
  var GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

  function teamMap(data) {
    var m = {};
    data.squadre.forEach(function (t) { m[t.id] = t; });
    return m;
  }

  // Data e ora locali (il telefono è in Europe/Rome).
  function toDate(dateStr, timeStr) {
    var d = dateStr.split("-").map(Number);
    var t = (timeStr || "00:00").split(":").map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
  }

  function weekday(dateStr) { return toDate(dateStr).getDay(); }

  function dayLabel(dateStr) {
    var d = toDate(dateStr);
    return GIORNI[d.getDay()] + " " + d.getDate() + " " + MESI[d.getMonth()] + " " + d.getFullYear();
  }

  function shortDate(dateStr) {
    var p = dateStr.split("-");
    return p[2] + "/" + p[1];
  }

  function teamLabel(t) {
    return t.club === "Bulldogs" ? t.nome + " Bulldogs" : t.nome + " LIONS";
  }

  function isActive(g) { return g.stato !== "annullata"; }

  function isPast(g, now) {
    return toDate(g.data, g.ora).getTime() < startOfDay(now).getTime();
  }

  function startOfDay(now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Raggruppa per data le gare attive che soddisfano il filtro e tiene i giorni con 2+ gare.
  function overlaps(data, filterFn, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var byDay = {};
    data.partite.forEach(function (g) {
      if (!isActive(g) || !filterFn(g)) return;
      if (!opts.includePast && isPast(g, now)) return;
      (byDay[g.data] = byDay[g.data] || []).push(g);
    });
    return Object.keys(byDay).sort().filter(function (d) {
      return byDay[d].length > 1;
    }).map(function (d) {
      return { data: d, partite: byDay[d].sort(function (a, b) { return a.ora < b.ora ? -1 : 1; }) };
    });
  }

  // Vincolo: U15 Bulldogs in casa di sabato/domenica solo se gioca anche l'Aquilotti quel giorno.
  function checkU15Weekend(data) {
    var aquDays = {};
    data.partite.forEach(function (g) {
      if (g.team === "bd-aqu" && isActive(g)) aquDays[g.data] = g;
    });
    return data.partite.filter(function (g) {
      var wd = weekday(g.data);
      return g.team === "bd-u15" && g.casa && isActive(g) && (wd === 0 || wd === 6);
    }).map(function (g) {
      return { partita: g, aquilotti: aquDays[g.data] || null, ok: !!aquDays[g.data] };
    });
  }

  function matchTitle(g) { return g.squadraCasa + " – " + g.squadraOspite; }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Promemoria da programmare sul telefono.
  function buildReminders(data, settings, now) {
    now = now || new Date();
    var tm = teamMap(data);
    var out = [];
    data.partite.forEach(function (g) {
      var ts = settings.squadre[g.team];
      if (!ts || !ts.notifiche || !isActive(g)) return;
      var t = tm[g.team];
      var start = toDate(g.data, g.ora);
      var where = g.casa ? "in casa" : "trasferta";
      var conf = g.verifica === "utente" ? " · da confermare" : "";
      var when = dayLabel(g.data) + " ore " + g.ora;

      var orgDays = settings.orgGiorni;
      if (orgDays > 0) {
        var hm = (settings.orgOra || "09:00").split(":").map(Number);
        var org = toDate(g.data, "00:00");
        org.setDate(org.getDate() - orgDays);
        org.setHours(hm[0], hm[1], 0, 0);
        if (org.getTime() > now.getTime()) {
          out.push({
            id: g.id + ":org",
            at: org.getTime(),
            titolo: "Organizza: " + teamLabel(t) + " tra " + orgDays + " giorni",
            testo: matchTitle(g) + " · " + when + " · " + where + conf
          });
        }
      }
      var preH = settings.preOre;
      if (preH > 0) {
        var pre = new Date(start.getTime() - preH * 3600000);
        if (pre.getTime() > now.getTime()) {
          out.push({
            id: g.id + ":pre",
            at: pre.getTime(),
            titolo: teamLabel(t) + " alle " + g.ora,
            testo: matchTitle(g) + " · " + where + (g.sede ? " · " + g.sede : "") + conf
          });
        }
      }
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  // Eventi per il calendario Google scelto.
  function buildCalendarEvents(data, settings) {
    var tm = teamMap(data);
    var DUR = 2 * 3600000; // durata indicativa: i calendari non riportano la fine
    return data.partite.filter(function (g) {
      var ts = settings.squadre[g.team];
      return ts && ts.calendar && isActive(g);
    }).map(function (g) {
      var t = tm[g.team];
      var start = toDate(g.data, g.ora).getTime();
      var desc = [
        teamLabel(t) + " · " + t.campionato,
        g.casa ? "In casa" : "Trasferta",
        g.stato === "recupero" ? "Recupero" : "",
        g.aggiunta ? "Gara aggiunta da te" : (g.verifica === "utente" ? "Aggiornamento non ufficiale: da confermare" : "Fonte: " + g.fonte),
        g.note || "",
        g.noteUtente || "",
        "Durata indicativa: 2 ore"
      ].filter(Boolean).join("\n");
      return {
        id: g.id,
        titolo: "[" + t.nome + (t.club === "LIONS" ? " LIONS" : " BD") + "] " + matchTitle(g) +
          (g.verifica === "utente" ? " (da confermare)" : ""),
        luogo: g.sede || (g.casa ? "Casa" : ""),
        descrizione: desc,
        inizio: start,
        fine: start + DUR
      };
    });
  }

  function defaultSettings(data) {
    var s = { orgGiorni: 12, orgOra: "09:00", preOre: 3, calendarId: "", squadre: {}, sedeCasa: {} };
    data.squadre.forEach(function (t) {
      s.squadre[t.id] = { notifiche: !!t.mia, calendar: !!t.mia };
    });
    return s;
  }

  function mergeSettings(data, saved) {
    var s = defaultSettings(data);
    if (!saved) return s;
    if (saved.sedeCasa) s.sedeCasa = saved.sedeCasa;
    ["orgGiorni", "orgOra", "preOre", "calendarId"].forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null) s[k] = saved[k];
    });
    Object.keys(s.squadre).forEach(function (id) {
      if (saved.squadre && saved.squadre[id]) {
        s.squadre[id].notifiche = !!saved.squadre[id].notifiche;
        s.squadre[id].calendar = !!saved.squadre[id].calendar;
      }
    });
    return s;
  }

  function fmtDM(dateStr) { var p = dateStr.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

  /*
   * Modifiche fatte dall'utente sul telefono, applicate sopra i dati del pacchetto.
   * edits = { mod: {id: {data, ora, casa, avversario, sede, stato, note, quando}}, add: [partita], del: [id] }
   * Le gare modificate restano con lo storico dei valori originali e diventano "da confermare".
   */
  function applyEdits(base, edits, sedeCasa) {
    edits = edits || {};
    var mod = edits.mod || {}, del = edits.del || [], add = edits.add || [];
    sedeCasa = sedeCasa || {};
    var tm = teamMap(base);
    var out = [];
    base.partite.concat(add).forEach(function (g0) {
      if (del.indexOf(g0.id) >= 0) return;
      var g = JSON.parse(JSON.stringify(g0));
      var m = mod[g.id];
      if (m) {
        var changed = [];
        if (m.data && (m.data !== g.data || m.ora !== g.ora)) changed.push("data/ora " + fmtDM(g.data) + " " + g.ora);
        if (m.sede !== undefined && m.sede !== g.sede) changed.push("sede " + (g.sede || "non indicata"));
        if (m.stato && m.stato !== g.stato) changed.push("stato " + g.stato);
        if (m.casa !== undefined && m.casa !== g.casa) changed.push(g.casa ? "in casa" : "in trasferta");
        var avvOld = g.casa ? g.squadraOspite : g.squadraCasa;
        if (m.avversario && m.avversario !== avvOld) changed.push("avversario " + avvOld);
        if (changed.length && !g0.aggiunta) {
          g.storico = (g.storico || []).concat([{ testo: "Valori originali (" + g.fonte + "): " + changed.join(", ") }]);
        }
        ["data", "ora", "sede", "stato"].forEach(function (k) { if (m[k] !== undefined) g[k] = m[k]; });
        if (m.casa !== undefined) g.casa = m.casa;
        var avv = m.avversario || avvOld;
        var me = tm[g.team].club;
        g.squadraCasa = g.casa ? me : avv;
        g.squadraOspite = g.casa ? avv : me;
        if (m.note !== undefined) g.noteUtente = m.note;
        if (!g0.aggiunta) {
          g.verifica = "utente";
          g.modificata = m.quando || "";
        }
      }
      if (!g.sede && g.casa && sedeCasa[g.team]) { g.sede = sedeCasa[g.team]; g.sedeDaImpostazioni = true; }
      out.push(g);
    });
    out.sort(function (a, b) { return (a.data + a.ora) < (b.data + b.ora) ? -1 : 1; });
    var res = {};
    Object.keys(base).forEach(function (k) { res[k] = base[k]; });
    res.partite = out;
    return res;
  }

  function newGame(teamId, club, f) {
    var id = teamId + "-u" + Date.now().toString(36);
    return {
      id: id, team: teamId, giornata: f.giornata || "", data: f.data, ora: f.ora, casa: !!f.casa,
      squadraCasa: f.casa ? club : f.avversario, squadraOspite: f.casa ? f.avversario : club,
      sede: f.sede || "", stato: f.stato || "programmata", verifica: "utente", fonte: "Aggiunta da te",
      note: "", noteUtente: f.note || "", storico: [], collegata: null, aggiunta: true
    };
  }

  // Griglia del mese (settimane da lunedì) con le date in formato YYYY-MM-DD.
  function monthGrid(year, month) {
    var first = new Date(year, month, 1);
    var offset = (first.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - offset);
    var weeks = [];
    var days = new Date(year, month + 1, 0).getDate();
    var nWeeks = Math.ceil((offset + days) / 7);
    for (var w = 0; w < nWeeks; w++) {
      var row = [];
      for (var d = 0; d < 7; d++) {
        var x = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        row.push({ iso: x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()), giorno: x.getDate(), fuori: x.getMonth() !== month });
      }
      weeks.push(row);
    }
    return weeks;
  }

  function mapsUrl(sede) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(sede);
  }

  return {
    applyEdits: applyEdits, newGame: newGame, monthGrid: monthGrid, mapsUrl: mapsUrl, fmtDM: fmtDM,
    teamMap: teamMap, toDate: toDate, dayLabel: dayLabel, shortDate: shortDate, teamLabel: teamLabel,
    isActive: isActive, isPast: isPast, overlaps: overlaps, checkU15Weekend: checkU15Weekend,
    matchTitle: matchTitle, buildReminders: buildReminders, buildCalendarEvents: buildCalendarEvents,
    defaultSettings: defaultSettings, mergeSettings: mergeSettings, pad: pad
  };
})();
if (typeof module !== "undefined") module.exports = Logic;
