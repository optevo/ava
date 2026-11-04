/* AVA chart palette: one place for every colour a chart uses, with separate values for the dark and light themes so each passes the WCAG contrast thresholds
 * against its own background (tested in tests/engine.test.js). Related ideas share a hue family:
 *   b blue (create: design, build, integration; delivery cost), t teal (verify and run: test, architecture, security; platform), p purple (release, operations),
 *   o orange (rework, waiting, one-off), m magenta (assurance), g grey (neutral and the alternative).
 * Within a family 1 is the lightest, 3 the darkest, in both themes, so the same slot means the same weight. Each colour also has an "x" companion (b1x ...) for text drawn on it
 * (white or near-black, whichever is more legible). os / alt are the two approaches: the alternative is the lighter neutral so the pair differs in lightness, not only in hue.
 * Exposed as CSS variables (--b1, --b1x, --os ...) by css(); the deck export reads the light values. */
(function (root) {
  'use strict';
  var DARK = { b1: '#abcbf7', b2: '#669ff0', b3: '#176ee7', t1: '#36e1b6', t2: '#1bb28c', t3: '#138266', p1: '#dbbef0', p2: '#bd88e3', p3: '#9c4cd5',
    o1: '#f8bc94', o2: '#f27e31', o3: '#bd530c', m1: '#f0b9d9', m2: '#e27cb8', m3: '#cf2d8b', g1: '#c5c9d0', g2: '#989eaa', g3: '#6b7383', os: '#4c8dff', alt: '#c8ccd2' };
  var LIGHT = { b1: '#5393ee', b2: '#176ce4', b3: '#104a9d', t1: '#19a682', t2: '#138065', t3: '#0d5845', p1: '#b57ae0', p2: '#9a49d4', p3: '#7026a4',
    o1: '#f06b12', o2: '#ba520c', o3: '#803808', m1: '#de6aae', m2: '#cc2d8a', m3: '#8d1f5f', g1: '#8c93a1', g2: '#6a7181', g3: '#484e58', os: '#135dc4', alt: '#8e95a3' };
  var PANEL = { dark: '#16181d', light: '#ffffff' };   // the chart background in each theme (the panel colour)
  var INK = { dark: '#0d0e11', light: '#ffffff' };   // text on a fill: the dark ink on the dark theme's pale fills, white on the light theme's deep ones (checked below)

  function lum(h) {
    var c = [1, 3, 5].map(function (i) { var v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); if (x < y) { var t = x; x = y; y = t; } return (x + 0.05) / (y + 0.05); }
  /* The more legible of near-black and white on a fill. */
  function inkOn(fill) { return contrast(fill, '#0d0e11') >= contrast(fill, '#ffffff') ? '#0d0e11' : '#ffffff'; }
  function theme(name) {
    var src = name === 'light' ? LIGHT : DARK, out = {};
    Object.keys(src).forEach(function (k) { out[k] = src[k]; if (k !== 'os' && k !== 'alt') out[k + 'x'] = inkOn(src[k]); });
    out.osx = inkOn(src.os); out.altx = inkOn(src.alt);
    return out;
  }
  function block(sel, name) { var t = theme(name); return sel + ' {' + Object.keys(t).map(function (k) { return '--' + k + ': ' + t[k] + ';'; }).join(' ') + '}'; }
  /* The CSS that defines the palette variables for both themes. */
  function css() { return block(':root, html[data-theme="dark"]', 'dark') + '\n' + block('html[data-theme="light"]', 'light'); }
  var api = { dark: theme('dark'), light: theme('light'), panel: PANEL, css: css, contrast: contrast, inkOn: inkOn };
  if (typeof document !== 'undefined' && document.head && document.createElement) { var st = document.createElement('style'); st.id = 'palette'; st.textContent = css(); document.head.appendChild(st); }
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVAPalette = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
