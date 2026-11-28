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
      if (!isActive(g) || isTraining(g) || !filterFn(g)) return;
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

  function matchTitle(g) {
    if (isTraining(g)) return "Allenamento " + (g.gruppo ? g.gruppo + " " : "") + g.ora + "–" + g.oraFine;
    return g.squadraCasa + " – " + g.squadraOspite;
  }

  // Esito dal punto di vista del club (Bulldogs o LIONS).
  function esito(g, t) {
    var r = g.risultato;
    if (!r || r.casa === "" || r.ospite === "" || r.casa == null || r.ospite == null) return null;
    var mine = g.squadraCasa === t.club ? r.casa : r.ospite;
    var other = g.squadraCasa === t.club ? r.ospite : r.casa;
    return mine > other ? "vinta" : (mine < other ? "persa" : "pari");
  }

  function scoreLine(g) {
    var r = g.risultato;
    return g.squadraCasa + " " + r.casa + " – " + r.ospite + " " + g.squadraOspite;
  }

  function parzialiText(r) {
    return (r.parziali || []).map(function (p) { return p[0] + "-" + p[1]; }).join(", ");
  }

  // "25-10, 24-5" -> [[25,10],[24,5]]
  function parseParziali(txt) {
    var out = [];
    String(txt || "").split(/[,;\s]+/).forEach(function (x) {
      var m = x.match(/^(\d+)[-–:](\d+)$/);
      if (m) out.push([+m[1], +m[2]]);
    });
    return out;
  }

  // ---------- Tabellino dal vivo ----------
  // live = { q: 1, ev: [{t:"p", n, v, q} | {t:"f", n, q} | {t:"o", v, q}] }  (p = punti nostri, f = fallo nostro, o = punti avversari)
  function liveState(live) {
    var st = { noi: 0, loro: 0, q: live.q || 1, quarti: [], giocatori: {}, falliSquadra: {} };
    (live.ev || []).forEach(function (e) {
      var i = e.q - 1;
      st.quarti[i] = st.quarti[i] || [0, 0];
      if (e.t === "p") {
        st.noi += e.v; st.quarti[i][0] += e.v;
        var x = st.giocatori[e.n] = st.giocatori[e.n] || { n: e.n, p: 0, f: 0 };
        x.p += e.v;
      } else if (e.t === "o") {
        st.loro += e.v; st.quarti[i][1] += e.v;
      } else if (e.t === "f") {
        var y = st.giocatori[e.n] = st.giocatori[e.n] || { n: e.n, p: 0, f: 0 };
        y.f++;
        st.falliSquadra[e.q] = (st.falliSquadra[e.q] || 0) + 1;
      }
    });
    for (var k = 0; k < st.q; k++) st.quarti[k] = st.quarti[k] || [0, 0];
    return st;
  }

  // Converte la partita dal vivo in risultato (casa/ospite) e tabellino.
  function liveResult(live, g, t) {
    var st = liveState(live);
    var mineCasa = g.squadraCasa === t.club;
    return {
      ris: {
        casa: mineCasa ? st.noi : st.loro, ospite: mineCasa ? st.loro : st.noi,
        parziali: st.quarti.map(function (p) { return mineCasa ? [p[0], p[1]] : [p[1], p[0]]; }),
        fonte: "Tabellino dal vivo"
      },
      tab: Object.keys(st.giocatori).map(function (k) { return st.giocatori[k]; })
        .sort(function (a, b) { return a.n - b.n; }).map(function (x) { return { n: +x.n, p: x.p, f: x.f }; })
    };
  }

  // Testo di riepilogo post-partita (senza nomi).
  function recap(g, t) {
    var e = esito(g, t);
    if (!e) return "";
    var r = g.risultato, mineCasa = g.squadraCasa === t.club;
    var noi = mineCasa ? r.casa : r.ospite, loro = mineCasa ? r.ospite : r.casa;
    var opp = mineCasa ? g.squadraOspite : g.squadraCasa;
    var lines = ["🏀 *" + teamLabel(t) + "* · " + cap(dayLabel(g.data))];
    lines.push((e === "vinta" ? "✅ Vittoria" : e === "persa" ? "❌ Sconfitta" : "🤝 Pareggio") + " " +
      (g.casa ? "in casa" : "in trasferta") + " contro " + opp + ": *" + noi + "–" + loro + "*");
    if (r.parziali && r.parziali.length) {
      var q = r.parziali.map(function (p) { return mineCasa ? p : [p[1], p[0]]; });
      lines.push("📊 Parziali: " + q.map(function (p) { return p[0] + "-" + p[1]; }).join(", "));
      var best = 0;
      q.forEach(function (p, i) { if (p[0] - p[1] > q[best][0] - q[best][1]) best = i; });
      var d = q[best][0] - q[best][1];
      if (q.length > 1) lines.push("🔥 Miglior quarto: il " + (best + 1) + "° (" + q[best][0] + "-" + q[best][1] + (d > 0 ? ", +" + d : d < 0 ? ", " + d : "") + ")");
    }
    var tab = (g.tabellino || []).filter(function (x) { return x.p !== null && x.p !== undefined; });
    if (tab.length) {
      var top = tab.slice().sort(function (a, b) { return b.p - a.p; });
      if (top[0].p > 0) lines.push("⭐ Miglior marcatore: #" + top[0].n + " con " + top[0].p + " punti");
      var segn = tab.filter(function (x) { return x.p > 0; }).length;
      lines.push("👥 A segno " + segn + " giocator" + (segn === 1 ? "e" : "i"));
      lines.push("📋 Tabellino: " + top.map(function (x) {
        return "#" + x.n + " " + x.p + (x.f ? " (" + x.f + "f)" : "");
      }).join(" · "));
    }
    return lines.join("\n");
  }

  // Presenze agli allenamenti per numero di maglia.
  function attendance(data, teamId) {
    var tr = data.partite.filter(function (g) { return g.team === teamId && isTraining(g) && g.presenti; });
    var per = {};
    tr.forEach(function (g) {
      g.presenti.forEach(function (n) { per[n] = (per[n] || 0) + 1; });
    });
    return {
      sedute: tr.length,
      giocatori: Object.keys(per).map(function (n) { return { n: +n, presenze: per[n], perc: tr.length ? per[n] / tr.length : 0 }; })
        .sort(function (a, b) { return b.presenze - a.presenze || a.n - b.n; })
    };
  }

  function minutes(hhmm) { var p = hhmm.split(":").map(Number); return p[0] * 60 + p[1]; }

  // Allenamenti che si sovrappongono a una gara nello stesso giorno (gara considerata di 2 ore).
  function trainingConflicts(data, filterFn, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var games = data.partite.filter(function (g) { return isActive(g) && !isTraining(g); });
    var out = [];
    data.partite.forEach(function (t) {
      if (!isTraining(t) || !isActive(t)) return;
      if (!opts.includePast && isPast(t, now)) return;
      var a = minutes(t.ora), b = minutes(t.oraFine);
      var hit = games.filter(function (g) {
        if (g.data !== t.data || !filterFn(g, t)) return false;
        var s = minutes(g.ora);
        return s < b && s + 120 > a;
      });
      if (hit.length) out.push({ data: t.data, allenamento: t, partite: hit });
    });
    return out;
  }

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
      var where = isTraining(g) ? "allenamento" : (g.casa ? "in casa" : "trasferta");
      var conf = g.verifica === "utente" ? " · da confermare" : "";
      var when = dayLabel(g.data) + " ore " + g.ora;

      var orgDays = settings.orgGiorni;
      if (orgDays > 0 && !isTraining(g)) {
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
            titolo: (isTraining(g) ? "Allenamento " + (g.gruppo || teamLabel(t)) : teamLabel(t)) + " alle " + g.ora,
            testo: (isTraining(g) ? g.ora + "–" + g.oraFine : matchTitle(g) + " · " + where +
              (g.ritrovo ? " · ritrovo " + g.ritrovo + (g.luogoRitrovo ? " " + g.luogoRitrovo : "") : "")) + (g.sede ? " · " + g.sede : "") + conf
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
      if (isTraining(g)) {
        return {
          id: g.id, titolo: "[Allenamento " + (g.gruppo || t.club) + "] " + g.ora + "–" + g.oraFine, luogo: g.sede || "",
          descrizione: [g.noteUtente || "", g.fonte].filter(Boolean).join("\n"),
          inizio: start, fine: toDate(g.data, g.oraFine).getTime()
        };
      }
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
    var s = {
      orgGiorni: 12, orgOra: "09:00", preOre: 3, calendarId: "", squadre: {}, sedeCasa: {}, pause: [],
      ritrovo: { Bulldogs: { casa: 30, trasferta: 60, luogoCasa: "", luogoTrasferta: "" }, LIONS: { casa: 30, trasferta: 60, luogoCasa: "", luogoTrasferta: "" } }
    };
    data.squadre.forEach(function (t) {
      var on = !!t.mia && !t.spentiDiDefault;
      s.squadre[t.id] = { notifiche: on, calendar: on };
    });
    return s;
  }

  function mergeSettings(data, saved) {
    var s = defaultSettings(data);
    if (!saved) return s;
    if (saved.sedeCasa) s.sedeCasa = saved.sedeCasa;
    if (saved.pause) s.pause = saved.pause;
    if (typeof saved.autoUpd === "boolean") s.autoUpd = saved.autoUpd;
    if (saved.ritrovo) ["Bulldogs", "LIONS"].forEach(function (c) {
      if (saved.ritrovo[c]) Object.keys(s.ritrovo[c]).forEach(function (k) {
        if (saved.ritrovo[c][k] !== undefined) s.ritrovo[c][k] = saved.ritrovo[c][k];
      });
    });
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

  function isTraining(g) { return g.tipo === "allenamento"; }

  // Allenamenti: regole settimanali espanse in singole sedute (fino a 120 giorni avanti se non c'è una data di fine).
  function expandTrainings(base, now) {
    now = now || new Date();
    var out = [];
    var horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 120);
    (base.allenamenti || []).forEach(function (r) {
      var d = toDate(r.dal);
      var end = r.al ? toDate(r.al) : horizon;
      if (end > horizon) end = horizon;
      while (d.getDay() !== r.giorno) d.setDate(d.getDate() + 1);
      for (; d <= end; d.setDate(d.getDate() + 7)) {
        var iso = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
        out.push({
          id: r.id + "-" + iso, team: r.team, tipo: "allenamento", gruppo: r.titolo || "", giornata: "", data: iso, ora: r.inizio, oraFine: r.fine,
          casa: true, squadraCasa: "", squadraOspite: "", sede: r.sede, mappa: r.mappa || "", stato: "programmata", verifica: "ufficiale",
          fonte: "Orario allenamenti indicato da te", note: "", storico: [], collegata: null
        });
      }
    });
    return out;
  }

  function fmtDM(dateStr) { var p = dateStr.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

  /*
   * Modifiche fatte dall'utente sul telefono, applicate sopra i dati del pacchetto.
   * edits = { mod: {id: {data, ora, casa, avversario, sede, stato, note, quando}}, add: [partita], del: [id] }
   * Le gare modificate restano con lo storico dei valori originali e diventano "da confermare".
   */
  function applyEdits(base, edits, sedeCasa, opts) {
    edits = edits || {};
    opts = opts || {};
    var mod = edits.mod || {}, del = edits.del || [], add = edits.add || [];
    sedeCasa = sedeCasa || {};
    var tm = teamMap(base);
    var out = [];
    base.partite.concat(expandTrainings(base, new Date())).concat(add).forEach(function (g0) {
      if (del.indexOf(g0.id) >= 0) return;
      var g = JSON.parse(JSON.stringify(g0));
      var m = mod[g.id];
      if (m) {
        var changed = [];
        if (m.data && (m.data !== g.data || m.ora !== g.ora)) changed.push("data/ora " + fmtDM(g.data) + " " + g.ora);
        if (m.oraFine && m.oraFine !== g.oraFine) changed.push("fine " + g.oraFine);
        if (m.sede !== undefined && m.sede !== g.sede) changed.push("sede " + (g.sede || "non indicata"));
        if (m.stato && m.stato !== g.stato) changed.push("stato " + g.stato);
        if (m.casa !== undefined && m.casa !== g.casa) changed.push(g.casa ? "in casa" : "in trasferta");
        var avvOld = g.casa ? g.squadraOspite : g.squadraCasa;
        if (m.avversario && m.avversario !== avvOld) changed.push("avversario " + avvOld);
        if (changed.length && !g0.aggiunta) {
          g.storico = (g.storico || []).concat([{ testo: "Valori originali (" + g.fonte + "): " + changed.join(", ") }]);
        }
        ["data", "ora", "oraFine", "sede", "stato"].forEach(function (k) { if (m[k] !== undefined) g[k] = m[k]; });
        if (m.casa !== undefined) g.casa = m.casa;
        if (!isTraining(g)) {
          var avv = m.avversario || avvOld;
          var me = tm[g.team].club;
          g.squadraCasa = g.casa ? me : avv;
          g.squadraOspite = g.casa ? avv : me;
        }
        if (m.note !== undefined) g.noteUtente = m.note;
        if (m.ritrovo !== undefined) g.ritrovoUtente = m.ritrovo;
        if (m.luogoRitrovo !== undefined) g.luogoRitrovoUtente = m.luogoRitrovo;
        if (m.passaggi !== undefined) g.passaggi = m.passaggi;
        if (!g0.aggiunta) {
          g.verifica = "utente";
          g.modificata = m.quando || "";
        }
      }
      if (edits.ris && edits.ris[g.id]) {
        var rr = fixResult(edits.ris[g.id]);
        if (rr) g.risultato = rr; // un risultato vuoto (0–0 senza parziali) non copre quello del referto
      }
      g.foto = (edits.foto && edits.foto[g.id]) || [];
      if (edits.pres && edits.pres[g.id]) g.presenti = edits.pres[g.id];
      if (edits.live && edits.live[g.id] && !edits.live[g.id].chiusa) g.inCorso = true;
      if (edits.tab && edits.tab[g.id] && edits.tab[g.id].length) g.tabellino = edits.tab[g.id];
      if (!g.sede && g.casa && sedeCasa[g.team]) { g.sede = sedeCasa[g.team]; g.sedeDaImpostazioni = true; }
      out.push(g);
    });
    autoCancel(out, mod, opts.pause || [], tm);
    applyRitrovo(out, opts.ritrovo || {}, tm);
    out.sort(function (a, b) { return (a.data + a.ora) < (b.data + b.ora) ? -1 : 1; });
    var res = {};
    Object.keys(base).forEach(function (k) { res[k] = base[k]; });
    res.partite = out;
    return res;
  }

  // Allenamenti annullati in automatico: Bulldogs nei giorni di partita Bulldogs; tutti nelle pause impostate.
  // Una modifica manuale dello stato ha sempre la precedenza.
  function autoCancel(list, mod, pause, tm) {
    var bdGames = {};
    list.forEach(function (g) {
      if (!isTraining(g) && g.stato !== "annullata" && tm[g.team] && tm[g.team].club === "Bulldogs") {
        (bdGames[g.data] = bdGames[g.data] || []).push(g);
      }
    });
    list.forEach(function (g) {
      if (!isTraining(g)) return;
      if (mod[g.id] && mod[g.id].stato) return;
      var club = tm[g.team] ? tm[g.team].club : "";
      if (club === "Bulldogs" && bdGames[g.data]) {
        var p = bdGames[g.data][0];
        g.stato = "annullata";
        g.autoAnnullata = "Annullato in automatico: c'è la partita " + teamLabel(tm[p.team]) + " (" + matchTitle(p) + ", ore " + p.ora + ")";
        return;
      }
      for (var i = 0; i < pause.length; i++) {
        var pz = pause[i];
        if ((pz.club === "tutti" || pz.club === club) && g.data >= pz.dal && g.data <= pz.al) {
          g.stato = "annullata";
          g.autoAnnullata = "Pausa" + (pz.nome ? " " + pz.nome : "") + " (" + fmtDM(pz.dal) + " – " + fmtDM(pz.al) + ")";
          return;
        }
      }
    });
  }

  // Ritrovo: minuti prima della gara (casa/trasferta) per club; la gara può avere un orario e un luogo propri.
  function applyRitrovo(list, rit, tm) {
    list.forEach(function (g) {
      if (isTraining(g)) return;
      var club = tm[g.team] ? tm[g.team].club : "";
      var r = rit[club] || {};
      var min = g.casa ? r.casa : r.trasferta;
      if (g.ritrovoUtente) g.ritrovo = g.ritrovoUtente;
      else if (min > 0) {
        var d = toDate(g.data, g.ora);
        d = new Date(d.getTime() - min * 60000);
        g.ritrovo = pad(d.getHours()) + ":" + pad(d.getMinutes());
      }
      if (g.luogoRitrovoUtente) g.luogoRitrovo = g.luogoRitrovoUtente;
      else if (g.ritrovo) g.luogoRitrovo = g.casa ? (r.luogoCasa || "") : (r.luogoTrasferta || "");
    });
  }

  // Statistiche dalle gare con risultato.
  function stats(data, teamId) {
    var tm = teamMap(data);
    var t = tm[teamId];
    var games = data.partite.filter(function (g) { return g.team === teamId && !isTraining(g) && g.stato !== "annullata" && esito(g, t); });
    var s = { giocate: games.length, vinte: 0, perse: 0, pari: 0, fatti: 0, subiti: 0, quarti: [], partite: [] };
    var q = [];
    games.forEach(function (g) {
      var r = g.risultato, mineCasa = g.squadraCasa === t.club;
      var f = mineCasa ? r.casa : r.ospite, su = mineCasa ? r.ospite : r.casa;
      s.fatti += f; s.subiti += su;
      var e = esito(g, t);
      if (e === "vinta") s.vinte++; else if (e === "persa") s.perse++; else s.pari++;
      (r.parziali || []).forEach(function (p, i) {
        q[i] = q[i] || { fatti: 0, subiti: 0, n: 0 };
        q[i].fatti += mineCasa ? p[0] : p[1];
        q[i].subiti += mineCasa ? p[1] : p[0];
        q[i].n++;
      });
      s.partite.push({ g: g, fatti: f, subiti: su, esito: e });
    });
    // Giocatori per numero di maglia (dalle gare con tabellino, anche senza risultato)
    var pl = {};
    data.partite.forEach(function (g) {
      if (g.team !== teamId || isTraining(g) || g.stato === "annullata" || !g.tabellino) return;
      g.tabellino.forEach(function (r) {
        var k = String(r.n);
        var x = pl[k] = pl[k] || { n: r.n, partite: 0, partitePunti: 0, punti: 0, falli: 0, max: 0 };
        x.partite++; x.falli += +r.f || 0;
        // punti non indicati nel referto: la gara conta per i falli ma non per la media punti
        if (r.p !== null && r.p !== undefined && r.p !== "") {
          x.partitePunti++; x.punti += +r.p; x.max = Math.max(x.max, +r.p);
        }
      });
    });
    s.giocatori = Object.keys(pl).map(function (k) { return pl[k]; }).sort(function (a, b) { return b.punti - a.punti || b.falli - a.falli || a.n - b.n; });
    s.quarti = q.map(function (x, i) {
      return { periodo: i < 4 ? (i + 1) + "° quarto" : "Suppl. " + (i - 3), fatti: x.fatti / x.n, subiti: x.subiti / x.n, n: x.n };
    });
    s.mediaFatti = games.length ? s.fatti / games.length : 0;
    s.mediaSubiti = games.length ? s.subiti / games.length : 0;
    return s;
  }


  // Risultato inserito a mano: se il finale è 0–0 (o vuoto) ma ci sono i parziali, il finale è la loro somma.
  function fixResult(r) {
    if (!r) return null;
    var sc = 0, so = 0;
    (r.parziali || []).forEach(function (p) { sc += +p[0] || 0; so += +p[1] || 0; });
    var c = r.casa === "" || r.casa == null ? 0 : +r.casa, o = r.ospite === "" || r.ospite == null ? 0 : +r.ospite;
    if (c === 0 && o === 0) {
      if (sc === 0 && so === 0) return null;
      return { casa: sc, ospite: so, parziali: r.parziali, fonte: r.fonte };
    }
    return r;
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

  // Testo da incollare nelle chat (formattazione WhatsApp).
  function shareText(g, t) {
    var lines = [];
    var head = isTraining(g) ? "🏀 *Allenamento " + (g.gruppo || teamLabel(t)) + "*" : "🏀 *" + teamLabel(t) + "* · " + t.campionato;
    lines.push(head);
    if (g.stato === "annullata") lines.push("❌ *ANNULLATA*");
    lines.push("📅 " + cap(dayLabel(g.data)) + " · ⏰ " + g.ora + (g.oraFine ? "–" + g.oraFine : ""));
    if (!isTraining(g)) {
      lines.push("🆚 " + matchTitle(g) + (g.giornata ? " (gara " + g.giornata + ")" : ""));
      lines.push(g.casa ? "🏠 In casa" : "🚌 In trasferta");
    }
    if (g.ritrovo && !isTraining(g) && g.stato !== "annullata") {
      lines.push("🕐 Ritrovo ore " + g.ritrovo + (g.luogoRitrovo ? " · " + g.luogoRitrovo : ""));
    }
    lines.push("📍 " + (g.sede || "Sede da definire"));
    if (g.passaggi && !isTraining(g) && g.stato !== "annullata") lines.push("🚗 Passaggi: " + g.passaggi);
    if (g.stato === "recupero") lines.push("🔁 Recupero");
    if (g.risultato && esito(g, t)) {
      lines.push("🏁 " + scoreLine(g));
      if (g.risultato.parziali && g.risultato.parziali.length) lines.push("📊 Parziali: " + parzialiText(g.risultato));
    }
    if (g.verifica === "utente" && !isTraining(g)) lines.push("⚠️ Da confermare");
    if (g.noteUtente) lines.push("📝 " + g.noteUtente);
    return lines.join("\n");
  }
  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }

  function mapsUrl(sede) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(sede);
  }

  return {
    applyEdits: applyEdits, fixResult: fixResult, liveState: liveState, liveResult: liveResult, recap: recap, attendance: attendance, stats: stats, esito: esito, scoreLine: scoreLine, parzialiText: parzialiText, parseParziali: parseParziali, shareText: shareText, isTraining: isTraining, expandTrainings: expandTrainings, trainingConflicts: trainingConflicts, newGame: newGame, monthGrid: monthGrid, mapsUrl: mapsUrl, fmtDM: fmtDM,
    teamMap: teamMap, toDate: toDate, dayLabel: dayLabel, shortDate: shortDate, teamLabel: teamLabel,
    isActive: isActive, isPast: isPast, overlaps: overlaps, checkU15Weekend: checkU15Weekend,
    matchTitle: matchTitle, buildReminders: buildReminders, buildCalendarEvents: buildCalendarEvents,
    defaultSettings: defaultSettings, mergeSettings: mergeSettings, pad: pad
  };
})();
if (typeof module !== "undefined") module.exports = Logic;
