/* Effetti grafici: avvio, coriandoli, vibrazione, swipe e grafiche da condividere. */
var FX = (function () {
  var A = window.Android || null;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COLORI = { Bulldogs: ["#2443c8", "#f2c500", "#ffffff"], LIONS: ["#1f7a3d", "#b5814f", "#ffffff"] };

  function vibrate(ms) {
    try { if (A && A.vibrate) A.vibrate(ms || 15); else if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) {}
  }

  // Pallone che rimbalza all'apertura.
  function splash() {
    var el = document.getElementById("splash");
    if (!el) return;
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 400);
    }, reduce ? 50 : 850);
  }

  // Coriandoli con i colori del club (vittoria).
  function confetti(club) {
    if (reduce) return;
    var cols = COLORI[club] || COLORI.Bulldogs;
    var c = document.createElement("canvas");
    c.className = "confetti";
    var dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    var x = c.getContext("2d");
    x.scale(dpr, dpr);
    var P = [];
    for (var i = 0; i < 140; i++) {
      P.push({
        x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35,
        vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 4,
        r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, col: cols[i % cols.length]
      });
    }
    var t0 = performance.now();
    (function frame(t) {
      var dt = Math.min(2, (t - (frame.last || t)) / 16.7); frame.last = t;
      x.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(function (p) {
        p.vy += .35 * dt; p.vx *= .99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.col;
        x.globalAlpha = Math.max(0, 1 - (t - t0) / 2200);
        x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
      });
      if (t - t0 < 2200) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // Scorrimento orizzontale con il dito.
  function swipe(el, onLeft, onRight, ignoreSel) {
    var sx = 0, sy = 0, st = 0, ok = false;
    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { ok = false; return; }
      var t = e.target;
      ok = !(ignoreSel && t.closest && t.closest(ignoreSel)) && !(t.closest && t.closest("input,select,textarea,.sheet,.ptab"));
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (!ok) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - st < 600) {
        if (dx < 0) onLeft(); else onRight();
      }
    }, { passive: true });
  }

  // ---------- Grafiche per WhatsApp ----------
  var logoImg = {};
  function loadLogo(club, cb) {
    var k = club === "LIONS" ? "lions" : "bulldogs";
    if (logoImg[k] && logoImg[k].complete) return cb(logoImg[k]);
    var im = new Image();
    im.onload = function () { logoImg[k] = im; cb(im); };
    im.onerror = function () { cb(null); };
    im.src = window.LOGHI[k];
  }

  function wrap(x, text, maxW) {
    var words = String(text).split(" "), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function fitText(x, text, maxW, size, weight) {
    var s = size;
    do { x.font = weight + " " + s + "px system-ui, Roboto, sans-serif"; s -= 2; } while (x.measureText(text).width > maxW && s > 20);
  }

  // opts: {tipo:"pre"|"post", club, squadra, campionato, giorno, ora, casa, casaNome, ospiteNome, ritrovo, luogoRitrovo, sede, ris:{casa,ospite,parziali}, marcatori:[{n,p}]}
  function cardImage(o, cb) {
    var W = 1080, H = 1350;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d");
    var bd = o.club !== "LIONS";
    var g = x.createLinearGradient(0, 0, W, H);
    if (bd) { g.addColorStop(0, "#0f1a5c"); g.addColorStop(.65, "#2443c8"); g.addColorStop(1, "#3655e0"); }
    else { g.addColorStop(0, "#0b2e18"); g.addColorStop(.6, "#1f7a3d"); g.addColorStop(1, "#7a5a36"); }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    var acc = bd ? "#f2c500" : "#c9955f";
    // decorazione: linee del campo
    x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 6;
    x.beginPath(); x.arc(W, 0, 520, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(W, 0, 360, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(0, H, 420, 0, Math.PI * 2); x.stroke();
    x.fillStyle = acc; x.fillRect(0, H - 22, W, 22);

    loadLogo(o.club, function (logo) {
      var cx = W / 2;
      if (logo) {
        x.save(); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 40; x.shadowOffsetY = 12;
        x.beginPath(); x.arc(cx, 230, 150, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill(); x.restore();
        x.save(); x.beginPath(); x.arc(cx, 230, 146, 0, Math.PI * 2); x.clip();
        x.drawImage(logo, cx - 146, 84, 292, 292); x.restore();
      }
      x.textAlign = "center"; x.fillStyle = "#fff";
      x.font = "700 34px system-ui, Roboto, sans-serif";
      x.globalAlpha = .75;
      x.fillText((o.tipo === "post" ? "RISULTATO FINALE" : "PROSSIMA PARTITA") + " · " + o.squadra.toUpperCase(), cx, 450);
      x.globalAlpha = 1;
      var y = 520;
      if (o.campionato) { x.font = "500 30px system-ui, Roboto, sans-serif"; x.globalAlpha = .7; x.fillText(o.campionato, cx, y); x.globalAlpha = 1; y += 70; }

      if (o.tipo === "post" && o.ris) {
        // punteggio
        fitText(x, o.casaNome, 440, 44, "700");
        x.fillText(o.casaNome, cx - 250, y + 40);
        fitText(x, o.ospiteNome, 440, 44, "700");
        x.fillText(o.ospiteNome, cx + 250, y + 40);
        x.font = "900 190px system-ui, Roboto, sans-serif";
        x.fillText(String(o.ris.casa), cx - 250, y + 230);
        x.fillText(String(o.ris.ospite), cx + 250, y + 230);
        x.fillStyle = acc; x.font = "800 120px system-ui, Roboto, sans-serif"; x.fillText("–", cx, y + 210); x.fillStyle = "#fff";
        y += 310;
        if (o.ris.parziali && o.ris.parziali.length) {
          x.font = "600 36px system-ui, Roboto, sans-serif"; x.globalAlpha = .85;
          x.fillText(o.ris.parziali.map(function (p) { return p[0] + "-" + p[1]; }).join("   ·   "), cx, y); x.globalAlpha = 1;
          y += 80;
        }
        if (o.marcatori && o.marcatori.length) {
          x.font = "700 30px system-ui, Roboto, sans-serif"; x.globalAlpha = .7; x.fillText("MIGLIORI MARCATORI", cx, y); x.globalAlpha = 1; y += 60;
          x.font = "800 46px system-ui, Roboto, sans-serif";
          x.fillText(o.marcatori.map(function (m) { return "#" + m.n + "  " + m.p; }).join("     "), cx, y);
          y += 40;
        }
        x.font = "500 32px system-ui, Roboto, sans-serif"; x.globalAlpha = .75;
        x.fillText(o.giorno, cx, H - 90); x.globalAlpha = 1;
      } else {
        fitText(x, o.giorno, 960, 76, "900");
        x.fillText(o.giorno, cx, y + 40);
        x.font = "900 150px system-ui, Roboto, sans-serif";
        x.fillText(o.ora, cx, y + 210);
        y += 300;
        x.font = "700 52px system-ui, Roboto, sans-serif";
        wrap(x, o.casaNome + "  vs  " + o.ospiteNome, 960).forEach(function (l) { x.fillText(l, cx, y); y += 64; });
        y += 20;
        // pillola casa/trasferta
        var pill = o.casa ? "IN CASA" : "IN TRASFERTA";
        x.font = "800 34px system-ui, Roboto, sans-serif";
        var pw = x.measureText(pill).width + 60;
        x.fillStyle = acc; roundRect(x, cx - pw / 2, y - 44, pw, 64, 32); x.fill();
        x.fillStyle = bd ? "#0f1a5c" : "#0b2e18"; x.fillText(pill, cx, y); x.fillStyle = "#fff";
        y += 90;
        if (o.ritrovo) {
          x.font = "700 42px system-ui, Roboto, sans-serif";
          x.fillText("Ritrovo ore " + o.ritrovo + (o.luogoRitrovo ? " · " + o.luogoRitrovo : ""), cx, y); y += 64;
        }
        if (o.sede) {
          x.font = "500 34px system-ui, Roboto, sans-serif"; x.globalAlpha = .85;
          wrap(x, o.sede, 900).slice(0, 3).forEach(function (l) { x.fillText(l, cx, y); y += 46; });
          x.globalAlpha = 1;
        }
      }
      cb(c.toDataURL("image/png"));
    });
  }

  function roundRect(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }

  function shareImage(dataUrl, name) {
    if (A && A.shareImage) { A.shareImage(dataUrl.split(",")[1], name); return; }
    // iPhone/browser: condivisione del file se disponibile, altrimenti scarica
    try {
      var bin = atob(dataUrl.split(",")[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var file = new File([arr], name, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(function () {}); return; }
    } catch (e) {}
    var a = document.createElement("a"); a.href = dataUrl; a.download = name; a.click();
  }

  return { vibrate: vibrate, splash: splash, confetti: confetti, swipe: swipe, cardImage: cardImage, shareImage: shareImage, reduce: reduce };
})();
