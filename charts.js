/* AVA charts (prototype v0.2): plain SVG strings, no libraries, works offline.
 * Colours come from CSS variables in index.html (--os, --alt, --pos, --neg, --text, --muted, --grid, --on).
 * Hover explainers: elements carry data-tip="Title::Body", shown by the tooltip layer in ui.js.
 */
(function (root) {
  'use strict';

  var FS = 1.2;   // text scale: charts are shown at about 75% of their drawing width, so text is drawn larger
  /* Money is written as a symbol plus a number, never with the three-letter code. In the country's own currency the short symbol is enough ($ for A$); any other
   * currency, or when full symbols are switched on, uses a symbol that says which dollar (or yen) it is, such as A$ or US$. */
  var DISAMBIG = { USD: 'US$', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$', TWD: 'NT$', MXN: 'MX$', BRL: 'R$', JPY: 'JP\u00a5' };
  function symbolOf(code, opts) {
    var short = !opts || opts.native !== false, full = !!(opts && opts.full), s = null;
    if (!short || full) s = DISAMBIG[code] || null;   // say which dollar or yen it is
    if (!s) {
      try {   // the narrow symbol is the local one (RM, Rp, R); the plain 'symbol' style would turn some of these into the three-letter code
        var parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(1);
        s = parts.filter(function (p) { return p.type === 'currency'; })[0].value;
      } catch (e) { s = code; }
    }
    return /[A-Za-z]$/.test(s) && s.length > 1 && !/\$$/.test(s) ? s + '\u00a0' : s;   // a code or letters such as CHF or RM need a space before the number
  }
  var cur = 'USD', sym = '$', nShort, nFull;
  function setCurrency(code, opts) {
    cur = code; sym = symbolOf(code, opts);
    var loc = root.AVAI18n && root.AVAI18n.locale() !== 'en' ? root.AVAI18n.locale() : undefined;   // numbers follow the language (English keeps the browser's own habit)
    nShort = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
    nFull = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  }
  setCurrency('USD');
  function fmtWith(f, v) { var n = Number(v), t = f.format(Math.abs(n)); return (n < 0 && /[1-9]/.test(t) ? '-' : '') + sym + t; }
  function money(v) { return fmtWith(nFull, v); }
  function moneyShort(v) { return fmtWith(nShort, v); }
  function symbol() { return sym; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f1(x) { return (Math.round(x * 10) / 10).toString(); }
  function tx(s) { return root.AVAI18n ? root.AVAI18n.t(s) : s; }
  function txf(s, v) { return root.AVAI18n ? root.AVAI18n.t(s, v) : String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] !== undefined ? v[k] : m; }); }   // the same with {placeholders} filled   // a title or note in the chosen language, if there is a translation
  /* Tooltip text is often a few lines joined, or a name then a figure ("Delivery team: $1.2M"): translate each line, and each piece between ": " and " . " separators, that has a translation. */
  function txMulti(s) {
    if (!root.AVAI18n || root.AVAI18n.lang() === 'en') return s;
    var I = root.AVAI18n, whole = I.lookup(String(s));
    if (whole) return whole;
    return String(s).split('\n').map(function (line) {
      var w = I.lookup(line); if (w) return w;
      return line.split(/( \u00b7 |: )/).map(function (p, i) { return i % 2 ? p : (I.lookup(p) || p); }).join('');
    }).join('\n');
  }
  function tip(title, body) { return ' data-tip="' + esc(txMulti(title) + '::' + txMulti(body)) + '"'; }
  /* A chart item can say where its base cost is edited (data-go, "tab/sub-tab#field"); the tooltip then ends with a hint. go may be a string or a function of the arguments. */
  function goOf(g, a, b) { var v = typeof g === 'function' ? g(a, b) : g; return v || null; }
  function goA(spec) { return spec ? ' data-go="' + esc(spec) + '"' : ''; }
  function tipGo(title, body, spec) { return tip(title, tx(body) + (spec ? '\n\n' + tx('Click to go to where this is edited.') : '')); }

  function niceNum(range, round) {
    var exp = Math.floor(Math.log10(range)), f = range / Math.pow(10, exp), nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }
  function niceTicks(min, max, count) {
    if (max === min) { max = min + 1; }
    var step = niceNum(niceNum(max - min, false) / count, true);
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
    for (var v = lo; v <= hi + step / 2; v += step) t.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return t;
  }
  function svg(w, h, body, label) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block" role="img" aria-label="' + esc(label || '') +
      '" font-family="Arial, Helvetica, sans-serif">' + body + '</svg>';
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + ((o.size || 11) * FS) + '" text-anchor="' + (o.anchor || 'start') +
      '" style="fill:var(' + (o.color || '--muted') + ')"' + (o.weight ? ' font-weight="' + o.weight + '"' : '') + '>' + esc(tx(s)) + '</text>';
  }

  /* A left-hand label that never runs off the chart: wrapped to fit maxPx (words, or single characters for scripts written without spaces),
   * at most maxLines lines with an ellipsis if it still does not fit, centred on yMid and right-aligned at x. Width is estimated, wider for CJK. */
  function labelBlock(x, yMid, s, maxPx, o) {
    o = o || {}; s = String(tx(s)); var size = o.size || 11, maxLines = o.maxLines || 2, em = size * FS, lh = em * 1.25, k = o.weight ? 0.62 : 0.56;
    var cw = function (ch) { return (ch.charCodeAt(0) >= 0x2E80 ? 1 : k) * em; }, wd = function (t) { var n = 0; for (var i = 0; i < t.length; i++) n += cw(t.charAt(i)); return n; };
    var lines = [], cur = '';
    var push = function (piece) {
      if (!cur) { cur = piece; return; }
      if (wd(cur + ' ' + piece) <= maxPx) cur += ' ' + piece; else { lines.push(cur); cur = piece; }
    };
    s.split(' ').forEach(function (word) {
      if (wd(word) <= maxPx) { push(word); return; }
      var part = '', i;   // a word wider than the space: break it between characters
      for (i = 0; i < word.length; i++) { if (wd(part + word.charAt(i)) > maxPx) { push(part); lines.push(cur); cur = ''; part = ''; } part += word.charAt(i); }
      if (part) push(part);
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); var last = lines[maxLines - 1]; while (last.length > 1 && wd(last + '…') > maxPx) last = last.slice(0, -1); lines[maxLines - 1] = last + '…'; }
    var y0 = yMid + em * 0.36 - (lines.length - 1) * lh / 2, out = '';
    lines.forEach(function (ln, j) { out += text(x, y0 + j * lh, ln, { anchor: 'end', size: size, color: o.color || '--text', weight: o.weight }); });
    return out;
  }

  /* The text colour for a label drawn on a palette fill (b1x, t2x ...), the legible ink for that fill in the current theme; other fills use the usual dark ink. */
  function inkOf(col) { var m = /^var\((--(?:[btpomg][1-3]|os|alt))\)$/.exec(col || ''); return m ? m[1] + 'x' : '--on'; }
  /* Cumulative net line chart with payback markers and hover columns (every 4 weeks). */
  function lineChart(o) {
    var w = 640, h = 300, m = { l: 62, r: 16, t: 30, b: 32 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
    var mn = 0, mx = 0, i;
    o.series.forEach(function (s) { s.data.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; }); });
    if (o.points && o.points.length) mn -= (mx - mn) * 0.22;   // room under the lowest points for their labels
    var ticks = niceTicks(mn, mx, 5), lo = ticks[0], hi = ticks[ticks.length - 1];
    var X = function (wk) { return m.l + wk / o.weeks * pw; };
    var Y = function (v) { return m.t + (hi - v) / (hi - lo) * ph; };
    var b = '';
    ticks.forEach(function (t) {
      b += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" style="stroke:var(' + (t === 0 ? '--muted' : '--grid') + ')" stroke-width="' + (t === 0 ? 1.2 : 1) + '"/>';
      b += text(m.l - 6, Y(t) + 4, moneyShort(t), { anchor: 'end', size: 10 });
    });
    for (i = 0; i <= o.weeks / 52; i++) {
      var dl = o.dateAt && o.dateAt(i * 52) ? o.showMonth(o.dateAt(i * 52)) : '';
      b += text(X(i * 52), h - 10, dl || (i === 0 ? 'Start' : 'Yr ' + i), { anchor: 'middle', size: 10 });
      if (i > 0 && i * 52 < o.weeks) b += '<line x1="' + X(i * 52) + '" x2="' + X(i * 52) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" style="stroke:var(--grid)" stroke-dasharray="2 4"/>';
    }
    o.series.forEach(function (s) {
      var d = '';
      for (i = 0; i < s.data.length; i++) d += (i ? 'L' : 'M') + X(i + 1).toFixed(1) + ' ' + Y(s.data[i]).toFixed(1);
      b += '<path d="' + d + '" fill="none" style="stroke:' + s.color + '" stroke-width="' + (s.width || 2.5) + '"' + (s.dash ? ' stroke-dasharray="6 4"' : '') + '/>';
    });
    (o.markers || []).forEach(function (mk) {
      if (mk.week === null || mk.week === undefined) return;
      b += '<line x1="' + X(mk.week) + '" x2="' + X(mk.week) + '" y1="' + m.t + '" y2="' + (Y(0) - 5.5) + '" style="stroke:' + mk.color + '" stroke-dasharray="4 3"/>';   // stops at the top of the circle on the zero line
      b += '<circle cx="' + X(mk.week) + '" cy="' + Y(0) + '" r="5" style="fill:' + mk.color + '"' + tip(mk.label, mk.tip || tx('The point after which cumulative value minus cost stays at or above zero.')) + '/>';
      b += text(Math.min(w - m.r - 4, X(mk.week) + 5), m.t + 10 + (mk.row || 0) * 20, mk.label, { size: 10, color: '--text' });
    });
    /* Labelled points on a line (the lowest point of cumulative cash). Each label sits below the curves in the space left for it, joined to its circle by a dotted
     * line at 45 degrees that stops at the circle's edge. Labels that would touch go to different rows, the point on the left dropping lower. */
    var pts = (o.points || []).slice().sort(function (p, q) { return q.week - p.week; }), taken = [];   // right to left, so no line crosses a label
    var lowest = pts.reduce(function (lo2, p2) { return Math.min(lo2, p2.value); }, 0), D = Math.SQRT1_2;
    pts.forEach(function (pt) {
      var px = X(pt.week), py = Y(pt.value), tw = pt.label.length * 6.4 * FS / 1.2 + 6, row = 0, dir = 1, ly, g, x0, again = true;
      while (again && row < 6) {
        ly = Y(lowest) + 24 + row * 15; g = ly - 4 - py;   // the label is as far across as it is down, which makes the line 45 degrees
        dir = px + g + 3 + tw <= w - m.r ? 1 : -1;       // down and to the right unless there is no room
        x0 = dir > 0 ? px + g + 3 : px - g - 3 - tw;
        again = taken.some(function (t0) { return t0[2] === row && x0 < t0[1] + 4 && x0 + tw + 4 > t0[0]; });
        if (again) row++;
      }
      taken.push([x0, x0 + tw, row]);
      b += '<line x1="' + (px + dir * 6.5 * D) + '" x2="' + (px + dir * g) + '" y1="' + (py + 6.5 * D) + '" y2="' + (ly - 4) + '" style="stroke:' + pt.color + '" stroke-dasharray="3 3"/>';
      b += '<circle cx="' + px + '" cy="' + py + '" r="5" style="fill:var(--panel);stroke:' + pt.color + '" stroke-width="2.5"' + tip(pt.label, pt.tip || '') + '/>';
      b += text(dir > 0 ? px + g + 3 : px - g - 3, ly, pt.label, { anchor: dir > 0 ? 'start' : 'end', size: 10, color: '--text' });
    });
    var step = 4, W = o.weeks;
    for (var k = 0; k < W; k += step) {
      var j = Math.min(W - 1, k + step - 1), lines = [];
      o.series.forEach(function (s) { lines.push(s.name + ': ' + money(s.data[j])); });
      if (o.series.length > 1) lines.push(txf('Difference ({a} minus {b}): {amt}', { a: o.series[0].name, b: o.series[1].name, amt: money(o.series[0].data[j] - o.series[1].data[j]) }));
      b += '<rect class="hov" x="' + X(k).toFixed(1) + '" y="' + m.t + '" width="' + (X(Math.min(k + step, W)) - X(k)).toFixed(1) + '" height="' + ph +
        '" fill="rgba(0,0,0,0)"' + tip(txf('Year {y}, week {w}', { y: Math.floor(k / 52) + 1, w: k % 52 + 1 }), lines.join('\n') + '\n' + tx('(cumulative value minus cost to this point)')) + '/>';
    }
    var lx = m.l;
    o.series.forEach(function (s) {
      b += '<rect x="' + lx + '" y="6" width="14" height="4" style="fill:' + s.color + '"/>' + text(lx + 19, 12, s.name, { size: 11, color: '--text' });
      lx += 34 + s.name.length * 7.4;
    });
    return svg(w, h, b, o.label || 'Cumulative net benefit');
  }

  /* Waterfall from the alternative's NPV to OutSystems NPV. Soft benefits are drawn lighter.
   * o.start / o.end: {label, value, tip}; o.items: [{label, delta, hard, tip}] */
  /* Value bridge as horizontal bars (labels read left to right on the left; amounts are in the tooltips). */
  function waterfall(o) {
    var rowH = 34, w = 700, m = { l: 200, r: 16, t: 44, b: 10 };
    var bars = [], run = o.start.value, lo = Math.min(0, run), hi = Math.max(0, run);
    bars.push({ label: o.start.label, from: 0, to: run, kind: 'start', tip: o.start.tip });
    o.items.forEach(function (it) {
      bars.push({ label: it.label, from: run, to: run + it.delta, kind: it.delta >= 0 ? 'pos' : 'neg', soft: !it.hard, delta: it.delta, tip: it.tip, go: it.go });
      run += it.delta; lo = Math.min(lo, run); hi = Math.max(hi, run);
    });
    bars.push({ label: o.end.label, from: 0, to: o.end.value, kind: 'end', tip: o.end.tip });
    lo = Math.min(lo, o.end.value, o.start.value); hi = Math.max(hi, o.end.value, o.start.value);
    if (o.range) { lo = Math.min(lo, o.range[0]); hi = Math.max(hi, o.range[1]); }   // a shared scale, so the bars do not move when the case changes
    var ticks = niceTicks(lo, hi, 5); lo = ticks[0]; hi = ticks[ticks.length - 1];
    var h = m.t + bars.length * rowH + m.b, pw = w - m.l - m.r;
    var X = function (v) { return m.l + (v - lo) / (hi - lo) * pw; }, b = '';
    b += text(m.l - 190 + 4, 14, 'Costs and earlier value, discounted (lighter bars = soft benefits)', { size: 10 });
    ticks.forEach(function (t) {
      b += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + (m.t - 4) + '" y2="' + (h - m.b) + '" style="stroke:var(' + (t === 0 ? '--muted' : '--grid') + ')"/>';
      b += text(X(t), m.t - 10, moneyShort(t), { anchor: 'middle', size: 10 });
    });
    bars.forEach(function (bar, i) {
      var y = m.t + i * rowH + rowH * 0.18, hh = rowH * 0.64, x0 = X(bar.from), x1 = X(bar.to);
      var left = Math.min(x0, x1), wd = Math.max(1.5, Math.abs(x1 - x0));
      var fill = bar.kind === 'start' ? 'var(--alt)' : bar.kind === 'end' ? 'var(--os)' : bar.kind === 'pos' ? 'var(--pos)' : 'var(--neg)';
      var amount = (bar.kind === 'pos' || bar.kind === 'neg') ? bar.delta : bar.to, name = bar.label.replace(' (earlier)', '');
      b += labelBlock(m.l - 10, y + hh / 2, name, m.l - 18, { size: 11, weight: (bar.kind === 'start' || bar.kind === 'end') ? 700 : 0 });
      b += '<rect x="' + left + '" y="' + y + '" width="' + wd + '" height="' + hh + '" rx="2" style="fill:' + fill + '" opacity="' + (bar.soft ? 0.55 : 1) + '"' +
        tip(name + ': ' + (amount >= 0 && (bar.kind === 'pos') ? '+' : '') + money(amount), bar.tip || '') + '/>';
      if (i < bars.length - 1) {
        var lx = X(bar.to), ny = m.t + (i + 1) * rowH + rowH * 0.18;
        b += '<line y1="' + (y + hh) + '" y2="' + ny + '" x1="' + lx + '" x2="' + lx + '" style="stroke:var(--muted)" stroke-dasharray="2 2"/>';
      }
      b += '<rect x="0" y="' + (m.t + i * rowH) + '" width="' + w + '" height="' + rowH + '" fill="transparent"' + goA(bar.go) + tipGo(name + ': ' + (amount >= 0 && (bar.kind === 'pos') ? '+' : '') + money(amount), bar.tip || '', bar.go) + '/>';
    });
    return svg(w, h, b, o.label || 'Value bridge');
  }

  /* Stacked columns (cost breakdown). groups: [{label, values:{key:v}}], cats: [{key,label,color,help}] */
  function stacked(o) {
    var fs = o.fmtShort || moneyShort, ff = o.fmt || money;
    var w = 640, h0 = o.height || 300, m = { l: 62, r: 16, t: 30, b: 34 }, h = h0;
    /* The legend sits below the chart in a neat grid of columns. */
    var n = o.cats.length, cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 3, rows = Math.ceil(n / cols), cw = (w - m.l - m.r) / cols, lg = [];
    o.cats.forEach(function (c, i) { lg.push([c, m.l + (i % cols) * cw, h0 + 8 + Math.floor(i / cols) * 18]); });
    h = h0 + 8 + rows * 18 + 4;
    var pw = w - m.l - m.r, ph = h0 - m.t - m.b, mx = 0;
    o.groups.forEach(function (g) { var t = 0; o.cats.forEach(function (c) { t += g.values[c.key] || 0; }); g.total = t; mx = Math.max(mx, t); });
    if (o.scaleMax > mx) mx = o.scaleMax;   // a caller can fix the scale so that it does not jump when its inputs change
    var ticks = niceTicks(0, mx, 5), hi = ticks[ticks.length - 1];
    var Y = function (v) { return m.t + (hi - v) / hi * ph; }, b = '';
    ticks.forEach(function (t) {
      b += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" style="stroke:var(--grid)"/>';
      b += text(m.l - 6, Y(t) + 4, fs(t), { anchor: 'end', size: 10 });
    });
    var bw = pw / o.groups.length, side = !!o.sideLabels;
    o.groups.forEach(function (g, i) {
      var x = m.l + i * bw + bw * (side ? 0.1 : 0.2), ww = bw * (side ? 0.4 : 0.6), acc = 0, labels = [];
      o.cats.forEach(function (c) {
        var v = g.values[c.key] || 0; if (v <= 0) return;
        var y0 = Y(acc), y1 = Y(acc + v), share = g.total ? Math.round(v / g.total * 100) : 0;
        var gs = goOf(c.go, i);
        b += '<rect x="' + x + '" y="' + y1 + '" width="' + ww + '" height="' + (y0 - y1) + '" style="fill:' + c.color + '" stroke="var(--panel)"' + goA(gs) +
          tipGo(c.label + ': ' + ff(v), txf('{pct}% of this approach\'s {what}.', { pct: share, what: tx(o.shareOf || 'total cost over the horizon') }) + '\n' + (c.help || ''), gs) + '/>';
        if (side) labels.push({ y: (y0 + y1) / 2, c: c, v: v });
        else if (y0 - y1 > 14) b += text(x + ww / 2, (y0 + y1) / 2 + 4, fs(v), { anchor: 'middle', size: 10, color: inkOf(c.color) });
        acc += v;
      });
      if (side) {   // every value is shown beside its bar, spread out so they do not overlap
        labels.sort(function (p, q) { return p.y - q.y; });
        var gap = 13.5, k;
        for (k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < gap) labels[k].y = labels[k - 1].y + gap;
        for (k = labels.length - 2; k >= 0; k--) if (labels[k + 1].y - labels[k].y < gap) labels[k].y = labels[k + 1].y - gap;
        labels.forEach(function (L) {
          var cy = Y(0) - 0, mid = L.y;
          b += '<line x1="' + (x + ww) + '" x2="' + (x + ww + 8) + '" y1="' + mid + '" y2="' + mid + '" style="stroke:var(--faint)"/>' +
            '<rect x="' + (x + ww + 11) + '" y="' + (mid - 5) + '" width="9" height="9" rx="2" style="fill:' + L.c.color + '"/>' + text(x + ww + 24, mid + 4, fs(L.v), { size: 10, color: '--text' });
        });
      }
      b += text(x + ww / 2, Y(acc) - 5, fs(g.total), { anchor: 'middle', size: 11, color: '--text', weight: 700 });
      if (g.label2) {   // two-line label: what the column is, then whose
        b += text(x + ww / 2, h0 - 22, g.label, { anchor: 'middle', size: 11, color: '--text', weight: 700 }) + text(x + ww / 2, h0 - 8, g.label2, { anchor: 'middle', size: 10, color: '--muted' });
      } else b += text(x + ww / 2, h0 - 12, g.label, { anchor: 'middle', size: 11, color: '--text' });
    });
    lg.forEach(function (e) {
      var lgo = goOf(e[0].go);
      b += (lgo ? '<g' + goA(lgo) + tipGo(e[0].label, e[0].help || '', lgo) + '>' : '') + '<rect x="' + e[1] + '" y="' + e[2] + '" width="10" height="10" rx="2" style="fill:' + e[0].color + '"/>' + text(e[1] + 14, e[2] + 9, e[0].label, { size: 10, color: '--text' }) + (lgo ? '</g>' : '');
    });
    return svg(w, h, b, o.label || tx('Cost breakdown'));
  }

  /* Paired horizontal bars per row (alternative above, OutSystems below), each stacked by phase. o = {rows:[{label, alt:{phaseKey:v}, os:{...}}], phases:[{key,label,color}], altLabel} */
  function domainBars(o) {
    var fs = o.fmtShort || moneyShort, ff = o.fmt || money;
    var w = 1000, rh = 34, m = { l: 200, r: 70, t: 30, b: 6 }, h = m.t + o.rows.length * rh + m.b, pw = w - m.l - m.r, mx = 0;   // drawn wide so that it is not stretched (and its text enlarged) in the wide card
    var tot = function (g) { var t = 0; o.phases.forEach(function (p) { t += g[p.key] || 0; }); return t; };
    o.rows.forEach(function (r) { mx = Math.max(mx, tot(r.alt), tot(r.os)); });
    var ticks = niceTicks(0, mx, 4), hi = ticks[ticks.length - 1] || 1, X = function (v) { return m.l + v / hi * pw; }, b = '';
    ticks.forEach(function (t) { b += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" style="stroke:var(--grid)"/>' + text(X(t), m.t - 6, fs(t), { anchor: 'middle', size: 10 }); });
    var lx = m.l;
    o.phases.forEach(function (p) { b += '<rect x="' + lx + '" y="4" width="10" height="10" rx="2" style="fill:' + p.color + '"/>' + text(lx + 14, 13, p.label, { size: 10, color: '--text' }); lx += 24 + p.label.length * 7; });
    /* Which bar is which: a short key at the right of the phase key. Each bar also starts with a stripe in its approach colour, and the alternative is drawn dashed and lighter. */
    var osW = 10 + tx('OutSystems').length * 6.2, altW = 10 + String(o.altLabel).length * 6.2, kx = w - 8;
    b += '<rect x="' + (kx - osW - 4) + '" y="4" width="3" height="10" style="fill:var(--os)"/>' + text(kx, 13, 'OutSystems', { anchor: 'end', size: 10, color: '--text' });
    b += '<rect x="' + (kx - osW - 22 - altW) + '" y="4" width="3" height="10" style="fill:var(--alt)"/><rect x="' + (kx - osW - 22 - altW) + '" y="4" width="3" height="10" fill="none" stroke="var(--text)" stroke-opacity="0.5" stroke-dasharray="2 1.5"/>' + text(kx - osW - 22, 13, o.altLabel, { anchor: 'end', size: 10, color: '--text' });
    o.rows.forEach(function (r, i) {
      var y = m.t + i * rh;
      var rgo = o.goRow ? o.goRow(r.key) : null;
      b += (rgo ? '<g' + goA(rgo) + tipGo(r.label, r.how || 'The effort weights and the reduction with OutSystems for this domain.', rgo) + '>' : '') + labelBlock(m.l - 8, y + rh / 2, r.label, m.l - 16, { size: 10.5 }) + (rgo ? '</g>' : '');
      [['alt', o.altLabel, 4], ['os', 'OutSystems', 18]].forEach(function (g) {
        var acc = 0, vals = r[g[0]], t = tot(vals);
        o.phases.forEach(function (p) {
          var v = vals[p.key] || 0; if (v <= 0) return;
          var pgo = o.go ? o.go(r.key, p.key) : null;
          b += '<rect x="' + X(acc) + '" y="' + (y + g[2]) + '" width="' + Math.max(0.5, X(acc + v) - X(acc)) + '" height="11" style="fill:' + p.color + (g[0] === 'os' ? '' : ';opacity:.55') + '"' + goA(pgo) +
            tipGo(r.label + ' · ' + g[1] + ' · ' + p.label + ': ' + ff(v), txf('{pct}% of this domain\'s cost for {who}.', { pct: t ? Math.round(v / t * 100) : 0, who: g[1] }), pgo) + '/>';
          acc += v;
        });
        b += '<rect x="' + (X(0) - 5) + '" y="' + (y + g[2]) + '" width="3" height="11" style="fill:var(' + (g[0] === 'os' ? '--os' : '--alt') + ')"/>';   // the approach's colour at the start of its bar
        if (g[0] === 'alt' && acc > 0) b += '<rect x="' + X(0) + '" y="' + (y + g[2]) + '" width="' + Math.max(0.5, X(acc) - X(0)) + '" height="11" fill="none" stroke="var(--text)" stroke-opacity="0.45" stroke-dasharray="3 2" pointer-events="none"/>';
        b += text(X(acc) + 4, y + g[2] + 9.5, fs(t), { size: 10, color: g[0] === 'os' ? '--text' : '--muted', weight: g[0] === 'os' ? 700 : 400 });
      });
    });
    return svg(w, h, b, o.label || tx('Cost by domain'));
  }

  /* Gantt of projects: each row has the alternative and OutSystems bar from start to go-live. */
  function gantt(o) {
    var rows = o.alt.length, rh = 28, w = 900, m = { l: 130, r: 14, t: 46, b: 28 }, h = m.t + rows * rh + m.b, pw = w - m.l - m.r;
    var lastLive = 0, i;
    o.alt.concat(o.os).forEach(function (p) { if (p.goLive > lastLive) lastLive = p.goLive; });
    var span = Math.min(o.weeks, Math.max(52, Math.ceil((lastLive + 13) / 52) * 52));
    var X = function (wk) { return m.l + Math.min(wk, span) / span * pw; }, b = '';
    for (i = 0; i <= span / 52; i++) {
      b += '<line x1="' + X(i * 52) + '" x2="' + X(i * 52) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" style="stroke:var(--grid)"/>';
      var dl = o.dateAt && o.dateAt(i * 52) ? o.showMonth(o.dateAt(i * 52)) : '';
      b += text(X(i * 52), h - 8, dl || (i === 0 ? 'Start' : 'Yr ' + i), { anchor: 'middle', size: 10 });
    }
    function bar(p, y, color, who, n, hollow) {   // hollow = the alternative: dashed outline and an open diamond, so it differs from OutSystems by more than colour
      if (p.start >= span) return '';
      var x0 = X(p.start), x1 = X(p.goLive), xa = X(p.activeEnd);
      var ggo = o.go ? o.go(n - 1) : null;
      var t = tipGo((p.name || txf('Application {n}', { n: n })) + ' · ' + who,
        txf('Starts week {s}. Active team work ends week {a}. Goes live week {g} ({w} weeks from start).', { s: f1(p.start), a: f1(p.activeEnd), g: f1(p.goLive), w: f1(p.goLive - p.start) }) + (o.dateAt && o.dateAt(p.start) ? '\n' + txf('Starts {s}, goes live {g}.', { s: o.showDate(o.dateAt(p.start)), g: o.showDate(o.dateAt(p.goLive)) }) : '') + '\n' + tx('The light part is time in review, rework and queues, when the team is free to start other work.'), ggo) + goA(ggo);
      return '<rect x="' + x0 + '" y="' + y + '" width="' + Math.max(1, x1 - x0) + '" height="8" rx="2" style="fill:' + color + '" opacity="0.4"' + t + '/>' +
        '<rect x="' + x0 + '" y="' + y + '" width="' + Math.max(1, xa - x0) + '" height="8" rx="2" style="fill:' + color + '"' + (hollow ? ' stroke="var(--text)" stroke-opacity="0.55" stroke-dasharray="3 2"' : '') + t + '/>' +
        (p.goLive < span ? '<path d="M' + x1 + ' ' + (y - 2) + ' l4 6 l-4 6 l-4 -6 z" style="fill:' + (hollow ? 'var(--panel)' : color) + '"' + (hollow ? ' stroke="' + 'var(--text)' + '" stroke-opacity="0.7" stroke-width="1.5"' : '') + t + '/>' : '');
    }
    for (i = 0; i < rows; i++) {
      var y = m.t + i * rh;
      var nm = o.alt[i].name || txf('Application {n}', { n: i + 1 }); b += labelBlock(m.l - 8, y + 14, nm, m.l - 14, { size: 10, color: '--muted' });
      b += bar(o.alt[i], y + 3, 'var(--alt)', o.altLabel, i + 1, true);
      b += bar(o.os[i], y + 15, 'var(--os)', 'OutSystems', i + 1);
    }
    b += '<rect x="' + m.l + '" y="6" width="14" height="6" style="fill:var(--alt)"/>' + text(m.l + 19, 14, o.altLabel, { size: 11, color: '--text' });
    b += '<rect x="' + (m.l + 44 + o.altLabel.length * 7.4) + '" y="6" width="14" height="6" style="fill:var(--os)"/>' + text(m.l + 63 + o.altLabel.length * 7.4, 14, 'OutSystems', { size: 11, color: '--text' });
    b += text(m.l, 34, 'Solid = team working · light = review, rework and queues · diamond = live', { size: 10 });
    return svg(w, h, b, o.label || 'Application timeline');
  }

  /* Stage colours by family (see palette.js): create = blues, verify = teals, rework = orange, release = purple. */
  var PART_COLORS = { design: 'var(--b2)', build: 'var(--b3)', integration: 'var(--b1)', arch: 'var(--t1)', test: 'var(--t2)', sec: 'var(--t3)', rework: 'var(--o2)', deploy: 'var(--p2)' };
  /* Expected time to production, stacked by stage. o.helpAlt / o.helpOs: {partKey: explanation} */
  function stageBars(o) {
    var w = 700, rowH = 66, m = { l: 118, r: 90, t: 12, b: 50 }, h = m.t + 2 * rowH + m.b, pw = w - m.l - m.r;
    var mx = Math.max(o.alt.total, o.os.total) * 1.02, b = '';
    function row(label, T, y, color, help, who) {
      var x = m.l;
      b += labelBlock(m.l - 8, y + 25, label, m.l - 14, { size: 12, weight: 700, maxLines: 3 });
      T.parts.forEach(function (p) {
        if (p.weeks <= 0) return;
        var ww = p.weeks / mx * pw, col = PART_COLORS[p.key] || '#999';
        var sgo = o.go ? o.go(p.key, who) : null;
        b += '<rect x="' + x + '" y="' + y + '" width="' + ww + '" height="50" style="fill:' + col + '" stroke="var(--panel)"' + goA(sgo) +
          tipGo(label + ' · ' + p.label + ': ' + f1(p.weeks) + ' weeks', (help && help[p.key]) || '', sgo) + '/>';
        if (ww > 26) b += text(x + ww / 2, y + 29, f1(p.weeks), { anchor: 'middle', size: 12, color: inkOf(col) });
        x += ww;
      });
      b += text(x + 6, y + 30, f1(T.total) + ' wks', { size: 12, color: color, weight: 700 });
    }
    row(o.altLabel, o.alt, m.t, '--text', o.helpAlt, 'alt');
    row('OutSystems', o.os, m.t + rowH, '--text', o.helpOs, 'os');
    var lx = m.l, ly = m.t + 2 * rowH + 16;
    o.alt.parts.forEach(function (p) {
      var wd = 22 + p.label.length * 6.8;
      if (lx + wd > w - 4) { lx = m.l; ly += 16; }
      b += '<rect x="' + lx + '" y="' + (ly - 9) + '" width="10" height="10" rx="2" style="fill:' + (PART_COLORS[p.key] || '#999') + '"/>' + text(lx + 14, ly, p.label, { size: 10, color: '--text' });
      lx += wd + 8;
    });
    return svg(w, h + (ly > m.t + 2 * rowH + 16 ? 12 : 0), b, o.label || tx('Time to production'));
  }


  /* Tornado: how far the result moves when each assumption is lower or higher, largest swing first. o = {rows:[{label, low, high}], pct, base}. Bars start at the base result (the centre line). */
  function tornado(o) {
    var w = 700, rowH = 40, m = { l: 210, r: 20, t: 54, b: 12 }, rows = o.rows, h = m.t + rows.length * rowH + m.b, pw = w - m.l - m.r, mx = 0;
    rows.forEach(function (r) { mx = Math.max(mx, Math.abs(r.low), Math.abs(r.high)); });
    mx = mx || 1;
    var cx = m.l + pw / 2, half = pw / 2 - 58, X = function (d) { return cx + d / mx * half; }, b = '';   // the longest bar leaves room for its value at the end
    var lowTxt = tx('{n}% lower').replace('{n}', o.pct), highTxt = tx('{n}% higher').replace('{n}', o.pct);
    b += text(m.l, 14, tx('Change in the net advantage if one assumption is different, one at a time'), { size: 10 });
    b += '<rect x="' + m.l + '" y="22" width="12" height="9" rx="2" style="fill:var(--alt)"/>' + text(m.l + 17, 30, lowTxt, { size: 10, color: '--text' });
    b += '<rect x="' + (m.l + 130) + '" y="22" width="12" height="9" rx="2" style="fill:var(--os)"/>' + text(m.l + 147, 30, highTxt, { size: 10, color: '--text' });
    rows.forEach(function (r, i) { if (i % 2 === 0) b += '<rect x="4" y="' + (m.t + i * rowH) + '" width="' + (w - 8) + '" height="' + rowH + '" rx="4" style="fill:var(--panel2)"/>'; });   // alternate shaded rows tie each label to its bars
    b += '<line x1="' + cx + '" x2="' + cx + '" y1="' + (m.t - 8) + '" y2="' + (h - m.b) + '" style="stroke:var(--muted)"/>';
    rows.forEach(function (r, i) {
      var y = m.t + i * rowH, sameSide = (r.low >= 0) === (r.high >= 0);   // each bar carries its own signed figure at its end
      b += (r.tip ? '<g' + tip(r.label, r.tip) + '>' : '') + labelBlock(m.l - 10, y + rowH / 2, r.label, m.l - 18, { size: 11 }) + (r.tip ? '</g>' : '');
      /* both outcomes sit on the same line, the worse for the net advantage to the left of the centre and the better to the right; the colour says which way the assumption moved */
      [[r.low, 'var(--alt)', lowTxt], [r.high, 'var(--os)', highTxt]].forEach(function (s, k) {
        var d = s[0], x0 = Math.min(X(0), X(d)), ww = Math.max(1.5, Math.abs(X(d) - X(0))), yy = y + 17 + (sameSide && k === 1 ? 13 : 0);
        b += '<rect x="' + x0 + '" y="' + yy + '" width="' + ww + '" height="11" rx="2" style="fill:' + s[1] + '"' +
          tip(r.label + ' · ' + s[2] + ': ' + (d >= 0 ? '+' : '') + money(d), tx('The net advantage would change by this much, all else equal.')) + '/>';
        b += text(d >= 0 ? x0 + ww + 4 : x0 - 4, yy + 9, (d >= 0 ? '+' : '') + moneyShort(d), { anchor: d >= 0 ? 'start' : 'end', size: 10, color: '--text' });
      });
    });
    return svg(w, h, b, o.label || tx('Sensitivity'));
  }

  var api = {
    setCurrency: setCurrency, symbol: symbol, symbolOf: symbolOf, money: money, moneyShort: moneyShort, esc: esc, f1: f1, tip: tip,
    lineChart: lineChart, tornado: tornado, waterfall: waterfall, stacked: stacked, domainBars: domainBars, gantt: gantt, stageBars: stageBars,
    PART_COLORS: PART_COLORS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVACharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
