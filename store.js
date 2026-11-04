/* AVA store: saving and loading an assessment. No DOM, no libraries, works offline.
 *  - flatten / inflate: the assessment state as a flat list of {key, type, value} rows and back (arrays and nested objects included).
 *  - A minimal zip writer and reader (stored or deflated entries; deflate needs the browser's DecompressionStream) and an .xlsx writer and parser,
 *    so an assessment can be exported to Excel and imported again. The workbook is meant to be read and edited offline:
 *      - "Applications": one sheet with every application (or group), its months and values, then its benefit details (people's time, legacy switched off,
 *        revenue, risk, other) as plain tables with a justification on each line;
 *      - "Settings": everything else (Section, Field, Value, Key, Type; only Key, Type and Value are read back);
 *      - "Results": for readers, ignored on import.
 *    A workbook from an earlier version (one "AVA" sheet with everything) still imports.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- state <-> rows */
  function flatten(obj) {
    var rows = [];
    (function walk(v, path) {
      if (v === null || v === undefined) { rows.push({ key: path, type: 'null', value: '' }); return; }
      if (Array.isArray(v)) { if (!v.length) rows.push({ key: path, type: 'array', value: '' }); v.forEach(function (x, i) { walk(x, path + '.' + i); }); return; }
      if (typeof v === 'object') {
        var ks = Object.keys(v); if (!ks.length) { rows.push({ key: path, type: 'object', value: '' }); return; }
        ks.forEach(function (k) { walk(v[k], path ? path + '.' + k : k); }); return;
      }
      rows.push({ key: path, type: typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's', value: v });
    })(obj, '');
    return rows;
  }
  function coerce(r) {
    var t = r.type, v = r.value;
    if (t === 'null') return null;
    if (t === 'array') return [];
    if (t === 'object') return {};
    if (t === 'n') { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    if (t === 'b') return v === true || v === 1 || /^(true|1|yes)$/i.test(String(v));
    return v === undefined || v === null ? '' : String(v);
  }
  function inflate(rows) {
    var out = {};
    rows.forEach(function (r) {
      if (!r.key) return;
      var ks = r.key.split('.'), o = out, i;
      for (i = 0; i < ks.length - 1; i++) {
        var k = ks[i], nextIsIdx = /^\d+$/.test(ks[i + 1]);
        if (o[k] === undefined || o[k] === null || typeof o[k] !== 'object') o[k] = nextIsIdx ? [] : {};
        o = o[k];
      }
      o[ks[ks.length - 1]] = coerce(r);
    });
    return out;
  }
  /* What differs between a default state and the current one, as a nested object holding only the changed parts (arrays and values are kept whole when they differ);
   * undefined when nothing differs. Laid back over a fresh default state with merge it gives the current state, and anything left at its default follows the defaults. */
  function sameValue(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-12;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]); });
  }
  function diff(base, cur) {
    if (sameValue(base, cur)) return undefined;
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || base === null || typeof base !== 'object' || Array.isArray(base)) return cur;
    var out = {}, any = false;
    Object.keys(cur).forEach(function (k) { var d = diff(base[k], cur[k]); if (d !== undefined || (cur[k] === undefined && base[k] !== undefined)) { out[k] = d === undefined ? null : d; any = true; } });
    return any ? out : undefined;
  }
  /* Recursively lay the saved values over a fresh default state, so a file saved by an older version still loads. */
  function merge(base, saved) {
    if (Array.isArray(saved) || saved === null || typeof saved !== 'object' || typeof base !== 'object' || base === null || Array.isArray(base)) return saved === undefined ? base : saved;
    Object.keys(saved).forEach(function (k) { base[k] = merge(base[k], saved[k]); });
    return base;
  }

  /* ---------------------------------------------------------------- bytes and utf-8 */
  function utf8(s) {
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00); }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return new Uint8Array(out);
  }
  function fromUtf8(b) {
    var s = '', i = 0, c, c2, c3, c4;
    while (i < b.length) {
      c = b[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if (c < 0xE0) { c2 = b[i++]; s += String.fromCharCode((c & 31) << 6 | c2 & 63); }
      else if (c < 0xF0) { c2 = b[i++]; c3 = b[i++]; s += String.fromCharCode((c & 15) << 12 | (c2 & 63) << 6 | c3 & 63); }
      else { c2 = b[i++]; c3 = b[i++]; c4 = b[i++]; c = ((c & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 0x10000; s += String.fromCharCode(0xD800 + (c >> 10), 0xDC00 + (c & 1023)); }
    }
    return s;
  }
  var CRC_T = null;
  function crc32(b) {
    if (!CRC_T) { CRC_T = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) crc = CRC_T[(crc ^ b[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(n) { return [n & 255, n >> 8 & 255]; }
  function u32(n) { return [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255]; }
  function concat(parts) {
    var n = 0, i; parts.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  /* ---------------------------------------------------------------- zip */
  /* files: [{name, data: Uint8Array}], stored (not compressed): simple and universally readable. */
  function zipStore(files) {
    var parts = [], central = [], offset = 0, time = 0x6000, date = 0x5A21;   // a fixed timestamp keeps the output repeatable
    files.forEach(function (f) {
      var name = utf8(f.name), crc = crc32(f.data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, f.data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += head.length + name.length + f.data.length;
    });
    var cd = concat(central);
    parts.push(cd, new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0))));
    return concat(parts);
  }
  function rd16(b, o) { return b[o] | b[o + 1] << 8; }
  function rd32(b, o) { return (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0; }
  /* The entries of a zip: [{name, method, data (compressed bytes)}]. */
  function zipEntries(b) {
    var eocd = -1, i;
    for (i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (rd32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a zip or Excel file.');
    var n = rd16(b, eocd + 10), p = rd32(b, eocd + 16), out = [];
    for (i = 0; i < n; i++) {
      if (rd32(b, p) !== 0x02014b50) throw new Error('The file is damaged.');
      var method = rd16(b, p + 10), csize = rd32(b, p + 20), nl = rd16(b, p + 28), el = rd16(b, p + 30), cl = rd16(b, p + 32), lo = rd32(b, p + 42);
      var name = fromUtf8(b.subarray(p + 46, p + 46 + nl));
      var lnl = rd16(b, lo + 26), lel = rd16(b, lo + 28), start = lo + 30 + lnl + lel;
      out.push({ name: name, method: method, data: b.subarray(start, start + csize) });
      p += 46 + nl + el + cl;
    }
    return out;
  }
  /* Synchronous read: stored entries only (what this app writes). */
  function zipReadSync(b) {
    var m = {};
    zipEntries(b).forEach(function (e) { if (e.method !== 0) throw new Error('compressed'); m[e.name] = e.data; });
    return m;
  }
  /* Read any zip, inflating compressed entries with the browser's DecompressionStream. Returns a Promise of {name: bytes}. */
  function zipRead(b) {
    var entries = zipEntries(b), m = {};
    return Promise.all(entries.map(function (e) {
      if (e.method === 0) { m[e.name] = e.data; return null; }
      if (e.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed Excel files. Save the file again from Excel, or use the .xlsx that AVA exported.');
      var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
      w.write(e.data); w.close();
      return new Response(ds.readable).arrayBuffer().then(function (ab) { m[e.name] = new Uint8Array(ab); });
    })).then(function () { return m; });
  }

  /* ---------------------------------------------------------------- xlsx */
  function xml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colName(i) { return i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26); }
  function sheetXml(rows, widths, opts) {
    opts = opts || {};
    var hid = {}; (opts.hidden || []).forEach(function (i) { hid[i] = 1; });
    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (opts.freeze) out += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + opts.freeze + '" topLeftCell="A' + (opts.freeze + 1) + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>';
    out += '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '"' + (hid[i] ? ' hidden="1"' : '') + ' customWidth="1"/>'; }).join('') + '</cols><sheetData>';
    rows.forEach(function (row, r) {
      out += '<row r="' + (r + 1) + '">';
      var rowSt = row.header ? STY.head : row.title ? STY.title : row.group ? STY.group : row.note ? STY.note : row.wrapRow ? STY.wrap : undefined;
      row.forEach(function (cell, c) {
        if (cell === null || cell === undefined || cell === '') return;
        var ref = colName(c) + (r + 1), sidx = rowSt, v = cell;
        if (cell && typeof cell === 'object' && cell.s !== undefined && cell.f === undefined) { sidx = cell.s; v = cell.v; if (v === null || v === undefined || v === '') { out += '<c r="' + ref + '" s="' + sidx + '"/>'; return; } }
        var st = sidx !== undefined ? ' s="' + sidx + '"' : '';
        if (v && typeof v === 'object' && v.f !== undefined) out += '<c r="' + ref + '"' + (v.s !== undefined ? ' s="' + v.s + '"' : st) + (typeof v.v === 'number' ? '' : ' t="str"') + '><f>' + xml(v.f) + '</f><v>' + xml(v.v === undefined ? '' : v.v) + '</v></c>';   // a formula with its last value
        else if (typeof v === 'boolean') out += '<c r="' + ref + '"' + st + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
        else if (typeof v === 'number' && isFinite(v)) out += '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
        else out += '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
      });
      out += '</row>';
    });
    out += '</sheetData>';
    var vals = opts.validations || [];
    if (vals.length) out += '<dataValidations count="' + vals.length + '">' + vals.map(function (d) { return '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="' + d.ref + '"><formula1>' + xml('"' + d.list + '"') + '</formula1></dataValidation>'; }).join('') + '</dataValidations>';
    return out + '</worksheet>';
  }
  function pretty(key) {
    var ks = key.split('.');
    return { section: ks[0].replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); }), field: ks.slice(1).join(' › ') };
  }

  /* ---------------------------------------------------------------- the Applications sheet (human-editable) */
  /* i18n:begin */
  var HOW_NAMES = { cash: 'Cash saving', capacity: 'Freed capacity', soft: 'Soft benefit' };
  var BASIS_NAMES = { customers: 'Customers', transactions: 'Transactions', other: 'Other units' };
  var YN = function (b) { return b ? 'Yes' : 'No'; };
  /* col: [header, field, kind]. kinds: t text, n number, p percent (0-100), g role group, h counts-as, b basis, y yes/no (follows the country baseline), v computed (ignored on import). */
  var LINE_BLOCKS = [
    { type: 'simple', title: 'Value: simple', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['Value driver', 'driver', 'd'], ['Amount per year', 'amount', 'n'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'labour', title: 'People: time saved', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['Role group', 'group', 'g'], ['Users', 'users', 'n'], ['Salary per year', 'salary', 'n'], ['Loaded multiplier', 'mult', 'n'],
      ['Uses country baseline', 'auto', 'y'], ['Time saved %', 'saved', 'p'], ['Adoption %', 'adopt', 'p'], ['Counts as', 'how', 'h'], ['Realised % (freed capacity)', 'realise', 'p'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'handling', title: 'Handling time saved', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is handled', 'what', 't'], ['Role group', 'group', 'g'], ['Transactions per year', 'volume', 'n'], ['Minutes saved each', 'mins', 'n'], ['Salary per year', 'salary', 'n'], ['Loaded multiplier', 'mult', 'n'],
      ['Uses country baseline', 'auto', 'y'], ['Counts as', 'how', 'h'], ['Realised % (freed capacity)', 'realise', 'p'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'deflect', title: 'Requests deflected', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is deflected', 'what', 't'], ['Requests per year', 'volume', 'n'], ['Handled by self-service %', 'share', 'p'], ['Cost to handle one', 'per', 'n'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'completion', title: 'Completion uplift', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is started', 'what', 't'], ['Starts per year', 'units', 'n'], ['Completion rate before %', 'from', 'p'], ['Completion rate after %', 'to', 'p'], ['Value of each completion', 'per', 'n'], ['Margin %', 'margin', 'p'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly profit (calculated)', '_val', 'v']] },
    { type: 'errors', title: 'Errors and rework avoided', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is handled', 'what', 't'], ['Transactions per year', 'volume', 'n'], ['Error rate before %', 'from', 'p'], ['Error rate after %', 'to', 'p'], ['Cost of each error', 'per', 'n'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'cycle', title: 'Faster cycle time', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is completed', 'what', 't'], ['Cases per year', 'volume', 'n'], ['Days saved each', 'days', 'n'], ['Value of a day', 'per', 'n'], ['Realised %', 'realise', 'p'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'events', title: 'Failures or visits avoided', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is avoided', 'what', 't'], ['Events per year', 'volume', 'n'], ['Reduction %', 'reduction', 'p'], ['Cost of each event', 'per', 'n'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'decom', title: 'Switch off (legacy)', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What is turned off', 'what', 't'], ['Licences per year', 'lic', 'n'], ['Infrastructure per year', 'infra', 'n'], ['Support per year', 'support', 'n'],
      ['FTE', 'fte', 'n'], ['Cost per FTE', 'fteCost', 'n'], ['Uses country baseline', 'auto', 'y'], ['Retired %', 'retired', 'p'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'revenue', title: 'Revenue', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['Basis', 'basis', 'b'], ['Units', 'units', 'n'], ['Revenue per unit', 'per', 'n'], ['Uplift %', 'uplift', 'p'], ['Margin %', 'margin', 'p'],
      ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly profit (calculated)', '_val', 'v']] },
    { type: 'risk', title: 'Risk', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What', 'what', 't'], ['Exposure per year', 'exposure', 'n'], ['Reduction %', 'reduction', 'p'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] },
    { type: 'other', title: 'Other', cols: [['Application ID', '_app', 't'], ['Application (calculated)', '_appname', 'v'], ['What', 'what', 't'], ['Amount per year', 'amount', 'n'], ['Counts as', 'how', 'h'], ['Changes over the years', 'over', 'o'], ['Justification', 'note', 't'], ['Yearly value (calculated)', '_val', 'v']] }
  ];
  /* i18n:end */
  /* A yearly pattern as text: "+4%" a year, or the values for each year separated by semicolons. */
  function patternText(pt) {
    if (!pt) return '';
    if (pt.y && pt.y.length) return pt.y.join('; ');
    return pt.g ? (pt.g > 0 ? '+' : '') + pt.g + '% a year' : '';
  }
  function patternFrom(text) {
    var t = String(text || '').trim(); if (!t) return null;
    var m = /^([+-]?\d+(?:\.\d+)?)\s*%/.exec(t);
    if (m) return { g: parseFloat(m[1]) };
    var ys = t.split(/[;,]/).map(function (x) { return parseFloat(String(x).replace(/[\s$€£¥]/g, '')); }).filter(function (x) { return isFinite(x); });
    return ys.length ? { y: ys } : null;
  }
  /* i18n:begin */
  var APP_COLS = ['ID', 'Include', 'Application or group of applications', 'Months to deliver', 'Developers', 'Delivery group', 'Type'];
  function typeLabel(key) { var out = ''; engine().USE_CASES.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === key) out = x[1]; }); }); return out; }
  function typeKey(text) { var t = String(text || '').trim().toLowerCase(), out = ''; if (!t) return ''; engine().USE_CASES.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === t || x[1].toLowerCase() === t) out = x[0]; }); }); return out; }
  var DRIVER_NAMES = { cost: 'Cost savings', rev: 'Revenue uplift', risk: 'Risk reduction' };
  /* i18n:end */
  var TITLE_MARK = '## ';
  function engine() { return root.AVAEngine || (typeof require !== 'undefined' ? require('./engine.js') : null); }
  function regions() { return root.AVARegions || (typeof require !== 'undefined' ? require('./regions.js') : null); }
  function groupLabel(key) { var g = (regions().ROLE_GROUPS || []).filter(function (x) { return x.key === key; })[0]; return g ? g.label : key; }
  function groupKey(label) {
    var l = String(label || '').trim().toLowerCase(), g = (regions().ROLE_GROUPS || []).filter(function (x) { return x.label.toLowerCase() === l || x.key === l; })[0];
    return g ? g.key : 'ops';
  }
  function reverse(map, text, fallback) { var t = String(text || '').trim().toLowerCase(), k; for (k in map) if (map[k].toLowerCase() === t || k === t) return k; return fallback; }
  /* The yearly value of a calculator line as a spreadsheet formula over the cells of its own row, so the number can be checked and follows edits. It is the same arithmetic as the web app. */
  function lineFormula(b, rowNo, cashLabel, hrs) {
    var idx = {}; b.cols.forEach(function (c, i) { idx[c[1]] = colName(i) + rowNo; });
    var r = function (f) { return idx[f]; }, cash = 'OR(' + r('how') + '="' + cashLabel + '",' + r('how') + '="cash")';
    var f = {
      simple: 'MAX(0,' + r('amount') + ')',
      labour: r('users') + '*' + r('salary') + '*' + r('mult') + '*' + r('saved') + '/100*' + r('adopt') + '/100*IF(' + cash + ',1,' + r('realise') + '/100)',
      decom: '(' + r('lic') + '+' + r('infra') + '+' + r('support') + '+' + r('fte') + '*' + r('fteCost') + ')*' + r('retired') + '/100',
      revenue: r('units') + '*' + r('per') + '*' + r('uplift') + '/100*' + r('margin') + '/100',
      risk: r('exposure') + '*' + r('reduction') + '/100',
      other: r('amount'),
      handling: r('volume') + '*' + r('mins') + '/60*' + r('salary') + '*' + r('mult') + '/' + hrs + '*IF(' + cash + ',1,' + r('realise') + '/100)',
      deflect: r('volume') + '*' + r('share') + '/100*' + r('per'),
      completion: r('units') + '*MAX(0,' + r('to') + '-' + r('from') + ')/100*' + r('per') + '*' + r('margin') + '/100',
      errors: r('volume') + '*MAX(0,' + r('from') + '-' + r('to') + ')/100*' + r('per'),
      cycle: r('volume') + '*' + r('days') + '*' + r('per') + '*' + r('realise') + '/100',
      events: r('volume') + '*' + r('reduction') + '/100*' + r('per')
    }[b.type];
    return f ? 'ROUND(' + f + ',2)' : null;
  }
  function appSheetRows(state, lists) {
    var E = engine(), list = E.ensureList(state), rows = [], ids = list.map(function (p, i) { return 'A' + (i + 1); });
    var inp = function (v) { return { v: v, s: STY.input }; }, calc = function (v) { return { v: v, s: STY.calc }; };
    var title = function (t, code) { var r = [TITLE_MARK + t, { v: '#' + code, s: STY.small }]; r.title = true; return r; };
    var head = function (cols) { var r = cols.map(function (c) { return tt(c); }); r.header = true; return r; };
    var note = function (t) { var r = [tt(t)]; r.note = true; return r; };
    rows.push(note('Edit this sheet offline, then import the workbook back into AVA. Each block below has its own columns.'));
    rows.push(note('Benefit lines belong to an application by its ID (A1, A2, ...), so an application can be renamed in the table below without touching them. Give a new application a new ID, and use that ID on its lines.'));
    rows.push(note('The value of an application is the sum of its calculators in the blocks below. The "(calculated)" columns are for reading and are ignored on import.'));
    rows.push([]);
    rows.push(title(tt('Applications'), 'apps'));
    rows.push(head(APP_COLS));
    var first = rows.length + 1, last = first + Math.max(list.length, 1);   // the sheet rows of the applications table, plus the blank row after it for adding one
    list.forEach(function (p, i) {
      rows.push([inp(ids[i]), inp(listLabel(lists, 'yn', p.include !== false ? 'yes' : 'no')), inp(p.name), inp(p.months), inp(p.devs), inp(p.group), inp(p.useCase ? listLabel(lists, 'type', p.useCase) : '')]);
    });
    var blockRanges = [], appFirstRow = first - 0;   // the sheet rows of each block's IDs and values, for the per-application totals
    var cashLabel = listLabel(lists, 'how', 'cash').replace(/"/g, '""'), HRS = E.LINE_HOURS || 1800, appTotals = list.map(function () { return 0; });
    var lookup = function (rowNo) { return '=IFERROR(INDEX($C$' + first + ':$C$' + last + ',MATCH($A' + rowNo + ',$A$' + first + ':$A$' + last + ',0)),"")'; };
    LINE_BLOCKS.forEach(function (b) {
      rows.push([]); rows.push(title(tt(b.title), b.type)); rows.push(head(b.cols.map(function (c) { return c[0]; })));
      var any = false, startRow = rows.length + 1;
      list.forEach(function (p, i) {
        (p.build || []).forEach(function (l, j) {
          if (l.type !== b.type) return;
          any = true;
          var lv = E.lineValue(l), tot = lv.cost + lv.rev + lv.risk, rowNo = rows.length + 1;
          appTotals[i] += Math.round(tot * 100) / 100;
          rows.push(b.cols.map(function (c) {
            var f = c[1], v;
            if (f === '_app') return inp(ids[i]);
            if (f === '_appname') return { f: lookup(rowNo).slice(1), v: p.name, s: STY.calc };
            if (f === '_val') { var fm = lineFormula(b, rowNo, cashLabel, HRS); return fm ? { f: fm, v: Math.round(tot * 100) / 100, s: STY.calc } : calc(Math.round(tot * 100) / 100); }
            if (f === 'group') v = listLabel(lists, 'group', l.group);
            else if (f === 'driver') v = listLabel(lists, 'driver', l.driver);
            else if (f === 'over') v = patternText(l.over && l.over.value);
            else if (f === 'how') v = listLabel(lists, 'how', l.how);
            else if (f === 'basis') v = listLabel(lists, 'basis', l.basis);
            else if (f === 'auto') v = listLabel(lists, 'yn', l.auto ? 'yes' : 'no');
            else v = l[f];
            return inp(v);
          }));
        });
      });
      if (!any) rows.push([tt('(none)')]);
      else blockRanges.push({ from: startRow, to: rows.length, val: colName(b.cols.map(function (c) { return c[1]; }).indexOf('_val')) });
    });
    // each application's value a year: the sum of its lines across the blocks, as a formula that follows edits
    rows[first - 2].push({ v: tt('Value per year (calculated)'), s: STY.head });
    list.forEach(function (p, i) {
      var parts = blockRanges.map(function (r) { return 'SUMIF($A$' + r.from + ':$A$' + r.to + ',$A' + (first + i) + ',$' + r.val + '$' + r.from + ':$' + r.val + '$' + r.to + ')'; });
      rows[first - 1 + i][7] = parts.length ? { f: parts.join('+'), v: Math.round(appTotals[i] * 100) / 100, s: STY.calc } : calc(0);
    });
    return rows;
  }
  /* Read the Applications sheet back: {list, warnings} or null if the workbook has no such sheet. Rows are matched to applications by name. */
  function readApplications(files, sheetName, fileLists, legacy) {
    var rows = sheetRows(files, sheetName);
    if (!rows) return null;
    var E = engine(), list = [], warnings = [], block = null, expectHead = false, byId = {}, byName = {}, dupNames = {}, orphans = {}, nOrphan = 0, legacyApps = false;
    var num = function (v, d) { if (v === undefined || v === '') return d; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s$€£¥]/g, '')); return isFinite(n) ? n : d; };
    var txt = function (v) { return v === undefined || v === null ? '' : String(v).trim(); };
    rows.forEach(function (r) {
      var first = txt(r[0]);
      if (first.indexOf(TITLE_MARK.trim()) === 0 && first.charAt(2) === ' ') {
        var t = first.slice(3).trim().toLowerCase(), code = /^#\w+$/.test(txt(r[1])) ? txt(r[1]).slice(1) : null;   // a version 2 file names its blocks by code, in any language; older files by their English title
        block = code ? (code === 'apps' || LINE_BLOCKS.some(function (b) { return b.type === code; }) ? code : null) : (t === 'applications' ? 'apps' : (LINE_BLOCKS.filter(function (b) { return b.title.toLowerCase() === t; })[0] || { type: null }).type);
        expectHead = true; return;
      }
      if (expectHead) { if (block === 'apps' && legacy) legacyApps = /^cost/i.test(txt(r[4])); expectHead = false; return; }
      var blank = r.every(function (c) { return c === undefined || c === ''; });
      if (blank) { block = null; return; }
      if (!block) return;
      if (block === 'apps') {
        var name = txt(r[2]); if (!name) return;
        var id = txt(r[0]) || 'A' + (list.length + 1), app = { name: name, include: listKey(fileLists, 'yn', r[1], 'yes') !== 'no' && !/^(no|n|false|0)$/i.test(txt(r[1])), months: num(r[3], 1) };
        if (legacyApps) app.value = { cost: num(r[4], 0), rev: num(r[5], 0), risk: num(r[6], 0) };   // a workbook from before the calculators: typed values, which become simple calculators
        else { if (num(r[4], 0) > 0) app.devs = num(r[4], 0); if (txt(r[5])) app.group = txt(r[5]); if (txt(r[6])) app.useCase = listKey(fileLists, 'type', r[6], '') || typeKey(r[6]); }
        if (byId[id.toLowerCase()]) warnings.push('The ID ' + id + ' is used by more than one application, so only the last keeps its benefit lines.');
        list.push(app); byId[id.toLowerCase()] = app;
        if (byName[name.toLowerCase()]) dupNames[name.toLowerCase()] = true;
        byName[name.toLowerCase()] = app; return;
      }
      var blk = LINE_BLOCKS.filter(function (b) { return b.type === block; })[0];
      if (!blk) return;
      var key = first.toLowerCase(), app2 = byId[key] || (!dupNames[key] ? byName[key] : null);   // an ID; a name still works when it is unique
      if (!app2) { if (first && first.charAt(0) !== '(') { orphans[first] = true; nOrphan++; } return; }
      var l = E.newLine(blk.type, {});
      blk.cols.forEach(function (c, ci) {
        var f = c[1], kind = c[2], v = r[ci];
        if (f === '_app' || kind === 'v') return;
        if (kind === 'g') l.group = listKey(fileLists, 'group', v, 'ops') || groupKey(v);
        else if (kind === 'd') l.driver = listKey(fileLists, 'driver', v, 'cost') || reverse(DRIVER_NAMES, v, 'cost');
        else if (kind === 'o') { var pt = patternFrom(v); if (pt) l.over = { value: pt }; }
        else if (kind === 'h') l.how = listKey(fileLists, 'how', v, l.how) || reverse(HOW_NAMES, v, l.how);
        else if (kind === 'b') l.basis = listKey(fileLists, 'basis', v, l.basis) || reverse(BASIS_NAMES, v, l.basis);
        else if (kind === 'y') l.auto = listKey(fileLists, 'yn', v, 'yes') !== 'no' && !/^(no|n|false|0)$/i.test(txt(v));
        else if (kind === 't') l[f] = txt(v);
        else l[f] = num(v, l[f]);
      });
      app2.build = app2.build || []; app2.build.push(l);
    });
    if (nOrphan) warnings.push(nOrphan + ' benefit line' + (nOrphan === 1 ? '' : 's') + ' could not be matched to an application and would be left out (' + Object.keys(orphans).slice(0, 5).join(', ') + '). Use the application ID (A1, A2, ...) from the applications table.');
    Object.keys(dupNames).forEach(function (n) { warnings.push('More than one application is called "' + byName[n].name + '": use IDs on the benefit lines to tell them apart.'); });
    return { list: list, warnings: warnings };
  }
  /* ---------------------------------------------------------------- the workbook (version 2): readable, localised, editable
   * Sheets: Read me, Assessment, Applications, Delivery, People and rates, Platform and infrastructure, Setup and upkeep, Time to production, Skill areas, Starting figures,
   * Other settings, Results, and a hidden sheet (_ava) that carries the version, the language, and the labels used in drop-downs so a file opens in any language.
   * Settings tables have the columns Setting, Value, Notes and a hidden Key and Type (the keys are what import reads, so labels can be in any language). */
  function tt(s, p) {
    var I = root.AVAI18n || (typeof require !== 'undefined' ? (function () { try { return require('./i18n.js'); } catch (e) { return null; } })() : null);
    if (I && I.t) return I.t(s, p);
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return p && p[k] !== undefined ? p[k] : m; });
  }
/* i18n:begin */
  var STY = { normal: 0, head: 1, title: 2, group: 3, input: 4, note: 5, wrap: 6, calc: 7, small: 8 };
  var SETTING_INFO = {   // key -> [label, note]; the wording is the web app's, so the workbook is localised with the same strings
    company: ['Customer name', ''], currency: ['Currency', 'The currency code of every money figure here. Changing it in the workbook does not convert the amounts.'],
    country: ['Country', 'Sets the reference rates and the typical organisation. Use the country codes in the drop-down.'], altType: ['Alternative: type', 'The kind of alternative OutSystems is compared with (a code: code-ai, appian, pega, salesforce, servicenow, power-platform or other).'],
    altName: ['Alternative: name', ''], horizon: ['Analysis period', 'How many years the comparison covers. 3 and 5 years are typical. Every figure and chart updates as you change it.'],
    rate: ['Discount rate (%)', 'The yearly "cost of waiting". Money received later is worth less than money today, because it could be earning a return elsewhere.'],
    hardOnly: ['Hard savings only', 'Leaves out soft benefits (risk reduction and revenue uplift) and keeps cost savings, cost differences and anything else that can be verified. A more cautious view.'],
    rampWeeks: ['Ramp (weeks)', 'After go-live, value ramps up in a straight line over this many weeks.'], growth: ['Value growth (% / yr)', 'Optional growth or decline of the annual value after go-live.'],
    startDate: ['Assessment start date', 'Optional. The first day of the project. With it, delivery teams can start on fixed dates and the timeline shows calendar dates; without it everything is shown as time from the start. Write it as 2027-03-01.'],
    licenceStart: ['Licence start date', 'Optional. When the platform licences start being charged, if that is not the project start. Left blank, they start with the project. Needs the assessment start date.'],
    'org.employees': ['Employees', 'Total employees. Optional. Used only to set sensible starting figures when you add a calculator or choose an application type, for example how many people use a workflow application. It never changes a figure you have already set.'],
    'org.customers': ['Customers', 'Total customers (or citizens, patients, members or students, whoever the organisation serves). Optional. Used only to set sensible starting volumes, such as requests or sign-ups per year, when you add a calculator or choose an application type.'],
    'org.industry': ['Industry', 'Optional. A name from the Industry drop-down in the app, or _other. Leave blank if not set.'], 'org.industryOther': ['Industry (other)', 'The name of the customer\'s industry when it is not in the list.'],
    'org.auto': ['Employees and customers follow the typical organisation', 'Yes while the figures have not been typed over; set to No to keep your own figures.'],
    'realise.advantage': ['Scenario: share of the speed advantage that arrives', ''], 'realise.value': ['Scenario: share of the business value that arrives', ''],
    'custom.advantage': ['Custom scenario: share of the speed advantage that arrives', ''], 'custom.value': ['Custom scenario: share of the business value that arrives', ''],
    'team.devs': ['Developers (portfolio default)', ''], 'team.hours': ['Hours per week', 'Working hours per person per week that the team is paid for.'],
    altDevFactor: ['Developers vs OutSystems ×', '1 means the same number of developers. Above 1 means the alternative needs more.'], deliveryMode: ['Delivery cost basis', 'team = built from developers and rates; quote = a given cost.'],
    deliveryQuote: ['Delivery cost given', 'Used when the cost basis is quote.'], 'platform.os': ['Platform licence', 'Annual OutSystems platform licence. It is the same whether OutSystems hosts it (PaaS) or the organisation does (self-managed); only the infrastructure, people and setup differ.'],
    'platform.alt': ['Alternative: licences and tooling per year', ''], 'platform.sentry': ['Additional Sentry licence', 'The extra annual licence for the Sentry security and compliance add-on, on top of the platform licence.'],
    osHosting: ['OutSystems hosting', 'paas = OutSystems runs the cloud; paas-sentry = PaaS with the Sentry add-on; self = the organisation runs it.'], cloudProvider: ['Cloud provider', ''], osTooling: ['OutSystems: additional tooling per year', ''],
    'infra.os': ['Infrastructure / yr', 'Only if OutSystems is self-managed.'], 'infra.alt': ['Alternative: infrastructure per year', ''], 'opsFte.os': ['OutSystems: operating people (FTE)', ''], 'opsFte.alt': ['Alternative: operating people (FTE)', ''],
    'assurance.required': ['High assurance required', 'Yes if the organisation needs the high-assurance security and compliance set.'], 'assurance.attest': ['Attestation counts as assurance', ''],
    'setup.mode': ['Setup costs', 'absorbed = left out so the comparison focuses on ongoing costs; included = counted.'], 'setup.os.paas': ['ODC setup', 'OutSystems provisions the cloud and everything is ready.'],
    'setup.os.self': ['ODC install', 'Placeholder (10,000 or equivalent): installing ODC on the organisation\'s own cloud.'], 'setup.os.envShare': ['Cloud environment build needed (% of the cloud-native build)', ''],
    'setup.alt.hiring': ['Hiring and onboarding', ''], 'setup.alt.build': ['Build: team', ''], 'setup.alt.tools': ['Build: tools', ''],
    'setup.weeks.os': ['OutSystems setup: spread over (weeks)', ''], 'setup.weeks.alt': ['Alternative setup: spread over (weeks)', ''],
    'maint.fix.alt': ['Alternative: break/fix (% of build cost a year)', ''], 'maint.fix.os': ['OutSystems: break/fix (% of build cost a year)', ''],
    'maint.enh.alt': ['Alternative: enhancements (% of build cost a year)', ''], 'maint.enh.os': ['OutSystems: enhancements (% of build cost a year)', ''],
    'tokens.spend': ['Token spend per app', 'Current or projected AI build-token spend per application.'], 'tokens.runPct': ['After go-live (% of build token spend a year)', 'AI tokens keep being used after go-live, for AI-assisted changes and fixes.'],
    'tokens.saving': ['Token saving (%)', 'The share of token spend OutSystems saves. A placeholder to validate.'],
    'escal.labour': ['Labour cost change (% / yr)', 'How much the loaded cost of every role rises (or falls) each year.'], 'escal.licence': ['Licence price change (% / yr)', 'How much licences and tooling cost more (or less) each year.'],
    'escal.infra': ['Infrastructure cost change (% / yr)', 'How much cloud infrastructure costs more (or less) each year.']
  };
  var FIELD_LABEL = { name: 'Name', annual: 'Annual cost', os: 'Share still needed with OutSystems', kind: 'Kind', role: 'Role', fte: 'People (FTE)', id: 'Code', w: 'Queue wait (weeks)', r: 'Review (weeks)', s: 'Accepted first time (%)', f: 'Rework after a rejection (weeks)',
    advantage: 'Share of the speed advantage that arrives', value: 'Share of the business value that arrives', rate: 'Rate level (%)', mode: 'Cost basis', quote: 'Delivery cost', skill: 'Experience with OutSystems', date: 'Date', team: 'After team', months: 'Months after' };
  var SIDE = { os: 'OutSystems', alt: 'Alternative' };

  /* i18n:end */
    function humanise(s) { return String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function roleLabel(k) { var R = regions(); return (R.ROLE_LABELS && R.ROLE_LABELS[k]) || groupLabel(k) || humanise(k); }
  /* [label, note] for a setting key, in the current language: the web app's wording for the known ones, and a readable one built from the key for the rest. */
  function settingLabel(state, key, E) {
    var info = SETTING_INFO[key]; if (info) return [tt(info[0]), info[1] ? tt(info[1]) : ''];
    var m, ks = key.split('.'), alt = (state && state.altName) || tt('Alternative');
    var side = function (s) { return s === 'os' ? 'OutSystems' : alt; };
    if ((m = /^(mix)\.(os|alt)\.(\w+)$/.exec(key))) return [tt('Role mix: {role} ({side})', { role: tt(roleLabel(m[3])), side: side(m[2]) }), tt('How many of this role there are for each developer.')];
    if ((m = /^rates\.(\w+)$/.exec(key))) return [tt('Hourly rate: {role}', { role: tt(roleLabel(m[1])) }), tt('The loaded cost of one hour of this role, in the assessment currency.')];
    if ((m = /^cases\.(\w+)\.(advantage|value)$/.exec(key))) return [tt('Scenario {name}: ', { name: tt(humanise(m[1])) }) + tt(FIELD_LABEL[m[2]]), ''];
    if ((m = /^stages\.(\w+)\.(os|alt)$/.exec(key))) return [tt('{stage}: weeks ({side})', { stage: tt(humanise(m[1])), side: side(m[2]) }), tt('Active weeks for this stage of one application.')];
    if ((m = /^gates\.(\d+)\.(id|name)$/.exec(key))) return [tt('Review gate {n}: {f}', { n: +m[1] + 1, f: tt(FIELD_LABEL[m[2]]) }), ''];
    if ((m = /^gates\.(\d+)\.(os|alt)\.(w|r|s|f)$/.exec(key))) { var g = (state.gates || [])[+m[1]] || {}; return [tt('{gate}: {f} ({side})', { gate: g.name ? tt(g.name) : tt('Review gate {n}', { n: +m[1] + 1 }), f: tt(FIELD_LABEL[m[3]]), side: side(m[2]) }), ''];   }
    if ((m = /^domains\.w\.(\w+)\.(\w+)$/.exec(key))) { var d = (E.DOMAINS || []).filter(function (x) { return x.key === m[1]; })[0], ph = (E.PHASES || []).filter(function (x) { return x.key === m[2]; })[0]; return [tt('{skill}: effort in {phase}', { skill: d ? tt(d.label) : m[1], phase: ph ? tt(ph.label) : m[2] }), tt('Relative weight of this skill area in this phase.')]; }
    if ((m = /^domains\.r\.(\w+)$/.exec(key))) { var d2 = (E.DOMAINS || []).filter(function (x) { return x.key === m[1]; })[0]; return [tt('{skill}: effort saved with OutSystems (%)', { skill: d2 ? tt(d2.label) : m[1] }), '']; }
    if ((m = /^(infraItems|toolItems|opsItems|assureItems|appAssure)\.(\d+)\.(\w+)$/.exec(key))) { var it = (state[m[1]] || [])[+m[2]] || {}; return [(it.name ? tt(it.name) : humanise(m[1]) + ' ' + (+m[2] + 1)) + ': ' + tt(FIELD_LABEL[m[3]] || humanise(m[3])), m[3] === 'os' ? tt('0 = made redundant by OutSystems, 1 = still needed in full.') : '']; }
    if ((m = /^deliveryGroups\.(\d+)\.(\w+(?:\.\w+)?)$/.exec(key))) { var gr = (state.deliveryGroups || [])[+m[1]] || {}, f = m[2].replace(/^start\./, ''); return [(gr.name || tt('Delivery team')) + ': ' + (m[2].indexOf('start.') === 0 ? tt('Starts') + ' – ' : '') + tt(FIELD_LABEL[f] || humanise(f)), f === 'mode' && m[2] === 'start.mode' ? tt('after = straight after the previous team; fixed = on a date; team = months after another team.') : (m[2] === 'mode' ? tt('team = built from developers and rates; quote = a given cost.') : '')]; }
    if ((m = /^skill\.levels\.(\w+)\.(effort|pay|enable)$/.exec(key))) return [tt('Experience with OutSystems: {level}: {f}', { level: tt(({ experienced: 'Experienced', mixed: 'Mixed experience', newer: 'Less experienced' })[m[1]] || m[1]), f: tt(({ effort: 'Effort ×', pay: 'Pay level (%)', enable: 'Training per developer' })[m[2]]) }), ''];
    if (key === 'skill.learning') return [tt('Experience with OutSystems: applications to reach full speed'), tt('0 keeps the effort multiple for every application. A number such as 3 means the extra time falls away over a team\'s first few applications.')];
    if ((m = /^seeds\.roleShare\.(\w+)$/.exec(key))) return [tt('Starting figures: % of employees in {role}', { role: tt(roleLabel(m[1])) }), ''];
    if (key === 'seeds.coverage') return [tt('Starting figures: share of a role on one application (%)'), ''];
    if ((m = /^seeds\.orgTypical\.(\w+)\.([01])$/.exec(key))) { var rg = (regions().REGIONS || []).filter(function (x) { return x.id === m[1]; })[0]; return [tt('Typical organisation: {country}: {f}', { country: rg ? tt(rg.name) : m[1], f: m[2] === '0' ? tt('Employees') : tt('Customers') }), '']; }
    if ((m = /^seeds\.lines\.(\w+)\.(\w+)\.(base|f)$/.exec(key))) return [tt('Starting volume: {calc}: {f}', { calc: tt(m[1]), f: m[3] === 'base' ? tt('Scales with') : tt('Per employee or customer') }), m[3] === 'base' ? tt('customers or employees') : ''];
    if ((m = /^seeds\.uses\.(\w+)\.(\w+)\.(\w+)\.(base|f)$/.exec(key))) return [tt('Starting volume ({type}): {calc}: {f}', { type: m[1], calc: tt(m[2]), f: m[4] === 'base' ? tt('Scales with') : tt('Per employee or customer') }), ''];
    if ((m = /^seeds\.industry\.(.+)\.customers$/.exec(key))) return [tt('Industry {name}: {f}', { name: tt(m[1]), f: tt('Customers ×') }), ''];
    if ((m = /^seeds\.industry\.(.+)\.roles\.(\w+)$/.exec(key))) return [tt('Industry {name}: {role} ×', { name: tt(m[1]), role: tt(roleLabel(m[2])) }), ''];
    return [ks.map(humanise).join(' › '), ''];
  }
  /* Which sheet and group a setting key belongs to. */
/* i18n:begin */
    var SETTING_SHEETS = [
    { id: 'assessment', title: 'Assessment', intro: 'The main settings: who it is for, what it is compared with, the period, discount rate and dates, the organisation, and the scenarios.', groups: [
      ['The assessment', ['company', 'country', 'currency', 'altType', 'altName', 'horizon', 'rate', 'hardOnly', 'rampWeeks', 'growth', 'startDate', 'licenceStart']],
      ['Your organisation', ['org.']], ['Scenarios', ['realise.', 'custom.', 'cases.']]] },
    { id: 'delivery', title: 'Delivery', intro: 'The delivery teams, how they start, and the size of the team.', groups: [
      ['Delivery teams', ['deliveryGroups.']], ['Experience with OutSystems', ['skill.']], ['Team', ['team.', 'altDevFactor', 'deliveryMode', 'deliveryQuote']]] },
    { id: 'people', title: 'People and rates', intro: 'The role mix, hourly rates and how costs change over the years.', groups: [
      ['Role mix', ['mix.']], ['Hourly rates', ['rates.', 'rateCards', 'groupCards', 'loadCards']], ['Cost changes over the years', ['escal.', 'over']]] },
    { id: 'platform', title: 'Platform and infrastructure', intro: 'Platform licence, hosting, infrastructure, tooling, operating people, and security and compliance.', groups: [
      ['Platform', ['platform.', 'osHosting', 'osTooling', 'cloudProvider']], ['Infrastructure', ['infra.', 'infraItems.']], ['Tooling', ['toolItems.']],
      ['Operating people', ['opsFte.', 'opsItems.']], ['Security and compliance', ['assurance.', 'assureItems.', 'appAssure.']]] },
    { id: 'setup', title: 'Setup and upkeep', intro: 'One-off setup, looking after the applications once live, and AI token spend.', groups: [
      ['One-off setup', ['setup.']], ['Looking after the applications', ['maint.']], ['AI token spend', ['tokens.']]] },
    { id: 'time', title: 'Time to production', intro: 'The weeks each stage takes and the review gates between stages.', groups: [['Stages', ['stages.']], ['Review gates', ['gates.']]] },
    { id: 'skills', title: 'Skill areas', intro: 'How the delivery effort spreads across skill areas and phases.', groups: [['Skill areas', ['domains.']]] },
    { id: 'starting', title: 'Starting figures', intro: 'The ratios that turn employees and customers into starting volumes for calculators.', groups: [['Starting figures', ['seeds.']]] }
  ];

  /* i18n:end */
    function matchKey(key, pat) { return pat.charAt(pat.length - 1) === '.' ? key.indexOf(pat) === 0 : key === pat; }
  var CHOICES = { osHosting: ['paas', 'paas-sentry', 'self'], 'setup.mode': ['absorbed', 'included'], deliveryMode: ['team', 'quote'], cloudProvider: ['aws', 'azure', 'gcp'] };
  /* The settings rows (everything except the applications) laid out into sheets: [{title, intro, rows, validations}] plus a leftover sheet for what no group claims. */
  function settingSheets(state, E) {
    var flat = flatten(state).filter(function (r) { return !(r.key === 'projectList' || r.key.indexOf('projectList.') === 0); }), used = {}, out = [];
    var rowFor = function (r) {
      var lb = settingLabel(state, r.key, E), v = r.type === 'b' ? !!r.value : (r.type === 'n' ? r.value : (r.type === 's' ? r.value : ''));
      var note = lb[1] ? tt(lb[1]) : '', ch = CHOICES[r.key] || (/^deliveryGroups\.\d+\.start\.mode$/.test(r.key) ? ['after', 'fixed', 'team'] : /^deliveryGroups\.\d+\.mode$/.test(r.key) ? ['team', 'quote'] : null);
      return { cells: [lb[0], { v: v, s: STY.input }, { v: note, s: STY.note }, r.key, r.type], choices: ch, key: r.key };
    };
    SETTING_SHEETS.forEach(function (sh) {
      var rows = [], vals = [];
      sh.groups.forEach(function (g) {
        var picked = [];
        g[1].forEach(function (pat) { flat.forEach(function (r) { if (!used[r.key] && matchKey(r.key, pat) && r.type !== 'array' && r.type !== 'object' && r.type !== 'null') { used[r.key] = 1; picked.push(r); } }); });
        if (!picked.length) return;
        var gh = [tt(g[0])]; gh.group = true; rows.push([]); rows.push(gh);
        picked.forEach(function (r) {
          var x = rowFor(r), rn = rows.length + 5;   // the rows above the table: title, intro, blank and the header, then 1-based
          rows.push(x.cells);
          if (r.type === 'b') vals.push({ ref: 'B' + rn, list: 'TRUE,FALSE' });
          else if (x.choices) vals.push({ ref: 'B' + rn, list: x.choices.join(',') });
          else if (r.key === 'country') vals.push({ ref: 'B' + rn, list: (regions().REGIONS || []).map(function (q) { return q.id; }).join(',') });
          else if (r.key === 'currency') vals.push({ ref: 'B' + rn, list: (regions().CURRENCIES || []).join(',') });
        });
      });
      if (rows.length) out.push({ id: sh.id, title: tt(sh.title), intro: tt(sh.intro), rows: rows, validations: vals });
    });
    var rest = flat.filter(function (r) { return !used[r.key]; }), rows2 = [], hd = [tt('Anything not covered by the other sheets')]; hd.group = true; rows2.push([]); rows2.push(hd);
    rest.forEach(function (r) { var x = rowFor(r); rows2.push(x.cells); });
    if (rest.length) out.push({ id: 'other', title: tt('Other settings'), intro: tt('Settings with no friendlier home. They are kept so nothing is lost when the workbook is imported again.'), rows: rows2, validations: [] });
    return out;
  }

  /* The labels the workbook shows for coded values, in the language it was written in; the file carries them (hidden sheet) so it opens correctly in any language. */
  function appLists() {
    var R = regions(), E = engine();
    return {
      yn: [['yes', tt('Yes')], ['no', tt('No')]],
      driver: Object.keys(DRIVER_NAMES).map(function (k) { return [k, tt(DRIVER_NAMES[k])]; }),
      how: Object.keys(HOW_NAMES).map(function (k) { return [k, tt(HOW_NAMES[k])]; }),
      basis: Object.keys(BASIS_NAMES).map(function (k) { return [k, tt(BASIS_NAMES[k])]; }),
      group: (R.ROLE_GROUPS || []).map(function (g) { return [g.key, tt(g.label)]; }),
      type: (function () { var o = []; E.USE_CASES.forEach(function (g) { g[1].forEach(function (x) { o.push([x[0], tt(x[1])]); }); }); return o; })()
    };
  }
  function listLabel(lists, name, key) { var f = (lists[name] || []).filter(function (x) { return x[0] === key; })[0]; return f ? f[1] : key; }
  /* A coded value from the label written in the file (or its code, or the English label). */
  function listKey(fileLists, name, text, fallback) {
    var t = String(text === undefined || text === null ? '' : text).trim().toLowerCase(); if (!t) return fallback;
    var fl = (fileLists && fileLists[name]) || [], i;
    for (i = 0; i < fl.length; i++) if (fl[i][1].toLowerCase() === t || fl[i][0].toLowerCase() === t) return fl[i][0];
    return undefined;
  }

  /* ---- writing ---- */
  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1F3A8A"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5B6270"/><name val="Calibri"/></font><font><sz val="9"/><color rgb="FF8A8F99"/><name val="Calibri"/></font></fonts>' +
    '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A8A"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE9ECF2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8DC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F2F4"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D4DC"/></left><right style="thin"><color rgb="FFD0D4DC"/></right><top style="thin"><color rgb="FFD0D4DC"/></top><bottom style="thin"><color rgb="FFD0D4DC"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  function sheetNameOk(name, used) {
    var n = String(name).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet', base = n, k = 2;
    while (used[n.toLowerCase()]) { n = base.slice(0, 31 - String(k).length - 1) + ' ' + k; k++; }
    used[n.toLowerCase()] = 1; return n;
  }
  /* sheets: [{name, rows, widths, hidden: [col], freeze: rows, validations: [{ref, list}], state}] */
  function workbookParts(sheets) {
    var ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml', rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/', n = sheets.length, ids = [], i;
    for (i = 1; i <= n; i++) ids.push(i);
    var files = [
      { name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        ids.map(function (k) { return '<Override PartName="/xl/worksheets/sheet' + k + '.xml" ContentType="' + ct + '"/>'; }).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + rel + 'officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        sheets.map(function (s, k) { return '<sheet name="' + xml(s.name) + '" sheetId="' + (k + 1) + '"' + (s.state ? ' state="' + s.state + '"' : '') + ' r:id="rId' + (k + 1) + '"/>'; }).join('') + '</sheets><calcPr fullCalcOnLoad="1"/></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        ids.map(function (k) { return '<Relationship Id="rId' + k + '" Type="' + rel + 'worksheet" Target="worksheets/sheet' + k + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (n + 1) + '" Type="' + rel + 'styles" Target="styles.xml"/></Relationships>') },
      { name: 'xl/styles.xml', data: utf8(STYLES_XML) }
    ];
    sheets.forEach(function (s, k) { files.push({ name: 'xl/worksheets/sheet' + (k + 1) + '.xml', data: utf8(sheetXml(s.rows, s.widths || [], s)) }); });
    return files;
  }
/* i18n:begin */
    var README = [
    ['This workbook holds an AVA (AI Value Assessment) business case.', 'title'],
    ['Open it to read the assumptions behind every number, edit them, and bring them back into AVA with Import. Nothing is hidden: every setting is on one of the sheets.', ''],
    ['', ''],
    ['How it is laid out', 'group'],
    ['Assessment: the main settings, the organisation and the scenarios.', ''], ['Applications: each application and its value, one calculator per block, each line with its justification.', ''],
    ['Delivery, People and rates, Platform and infrastructure, Setup and upkeep, Time to production, Skill areas, Starting figures: the settings behind the costs and the timing.', ''],
    ['Cash flow: the weekly cash flow of both approaches. Its totals, discounting and cumulative net, and the Results sheet, are live formulas.', ''], ['Results: the headline numbers, worked out from the cash flow.', ''], ['', ''],
    ['Colours', 'group'], ['Yellow cells are inputs: change them freely.', ''], ['Grey cells are calculated by formulas, so you can check them. They are for reading and are ignored when the file is imported.', ''], ['', ''],
    ['Editing tips', 'group'],
    ['Change only the Value column of the settings and the yellow cells of the Applications sheet. The hidden Key columns tell AVA what each row is, so the labels can be in any language.', ''],
    ['Give a new application a new ID on the Applications sheet (A1, A2, ...) and use that ID on its calculator lines.', ''], ['Dates are written as 2027-03-01. Yes/No settings are TRUE or FALSE.', ''],
    ['Many figures are placeholders until the customer\'s own are entered. Say where a figure came from in its justification.', '']
  ];

  /* i18n:end */
    function readmeRows() {
    return README.map(function (x) { var r = [x[0] ? tt(x[0]) : '']; if (x[1] === 'title') r.title = true; else if (x[1] === 'group') r.group = true; else r.wrapRow = true; return r; });
  }
  /* The weekly cash flow of both approaches, as the engine worked it out at export time (values), with the totals, discounting, net, cumulative net and the Results figures as live formulas. */
  function cashflowSheet(state, E, name, rateRef) {
    var r = E.run(state), W = r.os.W, cats = E.COST_CATS, drv = E.DRIVERS, top = 7, last = top + W - 1, rows = [], q = function (x) { return Math.round(x * 1e6) / 1e6; };
    var title = [tt('Weekly cash flow')]; title.title = true;
    var note = [tt('The weekly figures are what AVA worked out when this file was written. The totals, discounting, net, cumulative net and the Results sheet are formulas: change the discount rate on the Assessment sheet to see them move.')]; note.note = true;
    var rateCell = rateRef ? { f: rateRef, v: state.rate, s: STY.calc } : { v: state.rate, s: STY.calc };
    rows.push(title, note, [], [tt('Discount rate (%)'), rateCell]);
    var per = cats.length + 1 + drv.length + 1 + 3, group = ['', '', ''], head = [tt('Week'), tt('Year'), tt('Discount factor')];
    [['os', 'OutSystems'], ['alt', state.altName || tt('Alternative')]].forEach(function (a) {
      group.push(a[1]); for (var i = 1; i < per; i++) group.push('');
      cats.forEach(function (c) { head.push(tt(c.label)); }); head.push(tt('Total cost'));
      drv.forEach(function (d) { head.push(tt(d.label)); }); head.push(tt('Total value'), tt('Net'), tt('Cumulative net'), tt('Discounted net'));
    });
    var g = group.map(function (x) { return { v: x, s: STY.group }; }); rows.push(g); var h = head.slice(); h.header = true; rows.push(h);
    var col = function (ap, k) { return 3 + (ap === 'os' ? 0 : per) + k; };   // k: 0..cats-1 costs, cats total cost, then values, total value, net, cum, disc
    var refs = {};
    ['os', 'alt'].forEach(function (ap) {
      var c0 = col(ap, 0), tc = col(ap, cats.length), v0 = col(ap, cats.length + 1), tv = col(ap, cats.length + 1 + drv.length), net = tv + 1, cum = tv + 2, dsc = tv + 3, L = colName;
      refs[ap] = { totcost: L(tc), totval: L(tv), net: L(net), cum: L(cum) };
    });
    for (var k = 0; k < W; k++) {
      var rn = top + k, row = [k, { f: 'INT(A' + rn + '/52)+1', v: Math.floor(k / 52) + 1 }, { f: '(1+$B$4/100)^(-(A' + rn + '+0.5)/52)', v: Math.pow(1 + state.rate / 100, -(k + 0.5) / 52) }];
      ['os', 'alt'].forEach(function (ap) {
        var a = r[ap], c0 = col(ap, 0), tc = col(ap, cats.length), v0 = col(ap, cats.length + 1), tv = col(ap, cats.length + 1 + drv.length), net = tv + 1, cum = tv + 2, L = colName;
        cats.forEach(function (c) { row.push(q(a.cost[c.key][k])); });
        row.push({ f: 'SUM(' + L(c0) + rn + ':' + L(tc - 1) + rn + ')', v: q(a.costTotal[k]) });
        drv.forEach(function (d) { row.push(q(a.val[d.key][k])); });
        row.push({ f: 'SUM(' + L(v0) + rn + ':' + L(tv - 1) + rn + ')', v: q(a.valueTotal[k]) });
        row.push({ f: L(tv) + rn + '-' + L(tc) + rn, v: q(a.net[k]) });
        row.push({ f: k === 0 ? L(net) + rn : L(cum) + (rn - 1) + '+' + L(net) + rn, v: q(a.cum[k]) });
        row.push({ f: L(net) + rn + '*$C' + rn, v: q(a.net[k] * Math.pow(1 + state.rate / 100, -(k + 0.5) / 52)) });
      });
      rows.push(row);
    }
    var widths = [8, 7, 12]; for (var i = 0; i < 2 * per; i++) widths.push(14);
    var range = function (c) { return "'" + name.replace(/'/g, "''") + "'!$" + c + '$' + top + ':$' + c + '$' + last; };
    return { rows: rows, widths: widths, freeze: 6, W: W, range: range, refs: refs, dfCol: 'C', weekCol: 'A' };
  }
  /* Results formulas over the cash flow sheet, keyed by the result's code. ap is 'os' or 'alt'. */
  function resultFormula(key, ap, cf) {
    var R = cf.refs[ap], rg = cf.range, W = cf.W;
    var ln = 'IFERROR(LOOKUP(2,1/(' + rg(R.cum) + '<0),' + rg(cf.weekCol) + '),-1)';
    if (key === 'npv') return 'ROUND(SUMPRODUCT(' + rg(R.net) + ',' + rg(cf.dfCol) + '),0)';
    if (key === 'roi') return 'IF(SUM(' + rg(R.totcost) + ')>0,ROUND((SUM(' + rg(R.totval) + ')-SUM(' + rg(R.totcost) + '))/SUM(' + rg(R.totcost) + ')*100,0),"")';
    if (key === 'payback') return 'IF(' + ln + '=' + (W - 1) + ',"",ROUND((' + ln + '+1)/52*12,1))';
    if (key === 'peak') return 'ROUND(-MIN(0,MIN(' + rg(R.cum) + ')),0)';
    if (key === 'value') return 'ROUND(SUM(' + rg(R.totval) + '),0)';
    if (key === 'cost') return 'ROUND(SUM(' + rg(R.totcost) + '),0)';
    return null;
  }
  /* state: the assessment; results: [[label, osValue, altValue], ...] for the Results sheet (already in the user's language); meta: {company, saved, lang} */
  function buildSheets(state, results, meta) {
    var E = engine(), lang = (meta && meta.lang) || (root.AVAI18n && root.AVAI18n.lang ? root.AVAI18n.lang() : 'en'), used = {}, sheets = [], lists = appLists();
    sheets.push({ id: 'readme', name: sheetNameOk(tt('Read me'), used), rows: readmeRows(), widths: [110], key: 'readme' });
    var sets = settingSheets(state, E), byId = {}; sets.forEach(function (x) { byId[x.id] = x; });
    var addSettings = function (x) {
      var title = [x.title]; title.title = true; var intro = [x.intro]; intro.note = true;
      var head = [tt('Setting'), tt('Value'), tt('Notes'), tt('Key'), tt('Type')]; head.header = true;
      var sh = { id: x.id, name: sheetNameOk(x.title, used), rows: [title, intro, [], head].concat(x.rows), widths: [46, 24, 70, 28, 8], hidden: [3, 4], freeze: 4, validations: x.validations, settings: true };
      sheets.push(sh); return sh;
    };
    var assess = byId.assessment ? addSettings(byId.assessment) : null;
    sheets.push({ id: 'apps', name: sheetNameOk(tt('Applications'), used), rows: appSheetRows(state, lists), widths: [22, 34, 16, 16, 16, 16, 16, 16, 18, 18, 18, 44, 16, 18], key: 'apps', apps: true });
    sets.forEach(function (x) { if (x.id !== 'assessment' && x.id !== 'other') addSettings(x); });
    var cfName = sheetNameOk(tt('Cash flow'), used), rateRef = null;
    if (assess) { var ri = -1; assess.rows.forEach(function (r, i) { if (r[3] === 'rate') ri = i; }); if (ri >= 0) rateRef = "'" + assess.name.replace(/'/g, "''") + "'!$B$" + (ri + 1); }
    var cf = cashflowSheet(state, E, cfName, rateRef);
    sheets.push({ id: 'cashflow', name: cfName, rows: cf.rows, widths: cf.widths, freeze: cf.freeze });
    var resName = sheetNameOk(tt('Results'), used);
    var rh = [tt('Measure'), 'OutSystems', tt('Alternative')]; rh.header = true;
    var rr = [rh], rowOf = {};
    (results || []).forEach(function (x) {
      var key = x[3], row = [x[0], x[1], x[2]];
      if (key) {
        rowOf[key] = rr.length + 1;
        ['os', 'alt'].forEach(function (ap, i) {
          var f = key === 'advantage' ? (ap === 'os' ? 'B' + rowOf.npv + '-C' + rowOf.npv : null) : resultFormula(key, ap, cf);
          if (f && rowOf.npv !== undefined || (f && key !== 'advantage')) row[i + 1] = { f: f, v: x[i + 1] === '' || x[i + 1] === undefined ? '' : x[i + 1], s: STY.calc };
        });
      }
      rr.push(row);
    });
    rr.push([]); rr.push([tt('This sheet is for reading only; AVA ignores it when the file is imported. Edit the other sheets.')]);
    sheets.push({ id: 'results', name: resName, rows: rr, widths: [52, 18, 18], freeze: 1 });
    if (byId.other) addSettings(byId.other);
    var info = [['AVA workbook', 2], ['language', lang]];
    Object.keys(lists).forEach(function (k) { lists[k].forEach(function (x) { info.push(['list', k, x[0], x[1]]); }); });
    sheets.push({ id: 'ava', name: '_ava', rows: info, widths: [14, 14, 22, 30], state: 'hidden' });
    return sheets;
  }
  function buildXlsx(state, results, meta) { return zipStore(workbookParts(buildSheets(state, results, meta))); }

  function unxml(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
    });
  }
  function textsOf(s) { var t = '', re = /<t[^>]*>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(s))) t += unxml(m[1]); return t; }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  /* Rows of an Excel sheet as arrays of cell values (strings or numbers), from the unzipped parts. Works with files saved by Excel (shared strings) and by AVA (inline strings). */
  function sheetRows(files, sheetName) {
    var wb = fromUtf8(files['xl/workbook.xml'] || new Uint8Array(0)), rels = fromUtf8(files['xl/_rels/workbook.xml.rels'] || new Uint8Array(0)), target = null, m;
    var re = /<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g;
    while ((m = re.exec(wb))) if (unxml(m[1]) === sheetName) { var id = m[2], rm = new RegExp('<Relationship\\b[^>]*?Id="' + id + '"[^>]*?Target="([^"]*)"').exec(rels) || new RegExp('<Relationship\\b[^>]*?Target="([^"]*)"[^>]*?Id="' + id + '"').exec(rels); if (rm) target = rm[1]; }
    if (!target) return null;
    var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target;
    if (!files[path]) return null;
    var shared = [], ss = files['xl/sharedStrings.xml'];
    if (ss) { var sre = /<si\b[^>]*>([\s\S]*?)<\/si>/g, sm, sx = fromUtf8(ss); while ((sm = sre.exec(sx))) shared.push(textsOf(sm[1])); }
    var x = fromUtf8(files[path]), rows = [], rre = /<row\b[^>]*>([\s\S]*?)<\/row>/g, rm2;
    while ((rm2 = rre.exec(x))) {
      var cells = [], cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
      while ((cm = cre.exec(rm2[1]))) {
        var attrs = cm[1], inner = cm[2] || '', ref = /\br="([A-Z]+\d+)"/.exec(attrs), t = /\bt="([^"]*)"/.exec(attrs), v = /<v>([\s\S]*?)<\/v>/.exec(inner), val = '';
        if (t && t[1] === 'inlineStr') val = textsOf(inner);
        else if (t && t[1] === 's') val = shared[parseInt(v ? v[1] : '0', 10)] || '';
        else if (t && t[1] === 'str') val = v ? unxml(v[1]) : '';
        else if (t && t[1] === 'b') val = v && v[1] === '1' ? 1 : 0;
        else if (v) { var n = parseFloat(v[1]); val = isFinite(n) ? n : unxml(v[1]); }
        cells[ref ? colIndex(ref[1]) : cells.length] = val;
      }
      rows.push(cells);
    }
    return rows;
  }
  /* The sheets of a workbook in order: [{name, hidden}]. */
  function sheetNames(files) {
    var wb = fromUtf8(files['xl/workbook.xml'] || new Uint8Array(0)), out = [], re = /<sheet\b([^>]*?)\/?>/g, m;
    while ((m = re.exec(wb))) { var nm = /\bname="([^"]*)"/.exec(m[1]); if (nm) out.push({ name: unxml(nm[1]), hidden: /\bstate="(hidden|veryHidden)"/.test(m[1]) }); }
    return out;
  }
  var KEY_TYPES = { n: 1, s: 1, b: 1, 'null': 1, array: 1, object: 1 };
  /* Excel turns 2027-03-01 typed into a cell into a date number; give such a value back as the text the app uses. */
  function excelDate(n) { var t = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000, d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function cleanValue(key, type, value) {
    if (type === 'n' && typeof value === 'string') { var t = value.replace(/[\s,$€£¥]/g, ''); return t === '' ? '' : t; }
    if (type === 's' && typeof value === 'number' && /(^|\.)(startDate|licenceStart|date)$/.test(key) && value > 20000 && value < 80000) return excelDate(value);
    return value;
  }
  /* The state rows of an AVA workbook (from unzipped parts). Throws a readable message if it is not an AVA file. */
  function readAvaRows(files) {
    var names = sheetNames(files), nameList = names.map(function (n) { return n.name; });
    var info = nameList.indexOf('_ava') >= 0 ? sheetRows(files, '_ava') : null, out = [], ok = false, apps = null, fileLists = {}, appsSheet = null;
    var v2 = !!(info && info[0] && String(info[0][0]) === 'AVA workbook' && Number(info[0][1]) >= 2);
    if (v2) {
      ok = true;
      info.forEach(function (r) { if (r[0] === 'list' && r[1]) { (fileLists[r[1]] = fileLists[r[1]] || []).push([String(r[2]), String(r[3])]); } });
      names.forEach(function (n) {
        if (n.name === '_ava') return;
        var rows = sheetRows(files, n.name) || [];
        if (rows.some(function (r) { return String(r[0] || '').indexOf('## ') === 0; })) { appsSheet = n.name; return; }
        rows.forEach(function (r) {
          var key = r[3], type = r[4];
          if (key === undefined || key === '' || !type || !KEY_TYPES[String(type)]) return;
          out.push({ key: String(key), type: String(type), value: cleanValue(String(key), String(type), r[1] === undefined ? '' : r[1]) });
        });
      });
      apps = appsSheet ? readApplications(files, appsSheet, fileLists, false) : null;
    } else {
      var rows = sheetRows(files, 'Settings') || sheetRows(files, 'AVA');   // "AVA" is the one-sheet layout of earlier versions
      if (!rows) throw new Error('This workbook has no "Settings" sheet, so it was not exported from AVA.');
      rows.forEach(function (r, i) {
        if (i === 0) return;
        var key = r[3], type = r[4], value = r[2];
        if (key === '_ava') { ok = true; return; }
        if (key === undefined || key === '' || !type) return;
        out.push({ key: String(key), type: String(type), value: value === undefined ? '' : value });
      });
      apps = readApplications(files, 'Applications', null, true);
    }
    if (!ok) throw new Error('This workbook was not exported from AVA (the marker row is missing).');
    if (apps && apps.list.length) {
      out = out.filter(function (r) { return r.key !== 'projectList' && r.key.indexOf('projectList.') !== 0; });
      flatten({ projectList: apps.list }).forEach(function (r) { out.push(r); });
    }
    out.warnings = apps ? apps.warnings : [];   // problems found in the Applications sheet, for the importer to show before it replaces anything
    return out;
  }
  function parseXlsx(bytes) { return zipRead(bytes).then(readAvaRows); }

  var api = {
    flatten: flatten, inflate: inflate, merge: merge, diff: diff, utf8: utf8, fromUtf8: fromUtf8, crc32: crc32,
    zipStore: zipStore, buildSheets: buildSheets, sheetXml: sheetXml, workbookParts: workbookParts, sheetNames: sheetNames, zipReadSync: zipReadSync, zipRead: zipRead, buildXlsx: buildXlsx, readAvaRows: readAvaRows, parseXlsx: parseXlsx
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVAStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
