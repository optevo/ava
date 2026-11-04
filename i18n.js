/* AVA i18n: translation of the interface into other languages (docs/AVA-localisation.md). No DOM needed except for loading packs; works offline.
 *
 * The English text is the key: t('Time to production') returns the chosen language's version, or the English when there is none, so an unfinished
 * pack never leaves a gap. A key may hold {placeholders} ('Assumes {n} applications'); a translation must keep them, in whatever order the language needs.
 *
 * A language is a small file, app/lang/<code>.js, that calls AVAI18n.register(code, {english: translation, ...}). app/lang/languages.js lists the languages
 * in the dropdown and app/lang/en.js is the catalogue of every English string (made by tools/i18n_extract.py). Edits made on the Localisation screen are kept in
 * the browser and can be downloaded as a pack file to put in app/lang/. Languages can also be added from that screen.
 */
(function (root) {
  'use strict';

  var languages = [{ code: 'en', name: 'English', locale: 'en' }];   // the built-in list is added by lang/languages.js
  var packs = {};            // code -> {english: translation} from the pack files
  var edits = {};            // code -> {english: translation} typed on the Localisation screen (kept in the browser)
  var catalogue = [];        // [{k: english, a: area}]
  var cur = 'en', listeners = [];

  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { /* storage may be unavailable */ } return null; }

  function fill(s, v) {
    if (!v) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; });
  }
  /* The text in the chosen language. A translation that is blank counts as missing. */
  function t(s, v) {
    if (cur !== 'en') {
      var e = edits[cur], p = packs[cur], r = e && e[s] ? e[s] : (p && p[s] ? p[s] : null);
      if (r) return fill(r, v);
    }
    return fill(s, v);
  }
  /* The translation of a whole piece of text, or null when there is none (used to translate text already on the page). */
  function lookup(s) {
    if (cur === 'en') return null;
    var e = edits[cur], p = packs[cur];
    return (e && e[s]) || (p && p[s]) || null;
  }
  function placeholders(s) { return (String(s).match(/\{\w+\}/g) || []).sort().join(' '); }

  function find(code) { return languages.filter(function (l) { return l.code === code; })[0] || null; }
  function loadEdits(code) {
    if (edits[code]) return;
    var raw = store('ava-i18n:' + code); edits[code] = {};
    try { if (raw) edits[code] = JSON.parse(raw) || {}; } catch (e) { edits[code] = {}; }
  }
  function loadCustomLanguages() {
    var raw = store('ava-i18n-langs');
    try { (JSON.parse(raw || '[]') || []).forEach(function (l) { if (!find(l.code)) languages.push({ code: l.code, name: l.name, locale: l.locale || l.code, custom: true }); }); } catch (e) { /* ignore */ }
  }
  function addBuiltIn(list) {
    list.forEach(function (l) { if (!find(l.code)) languages.push(l); });
    loadCustomLanguages();
  }

  /* A pack file registers its strings. */
  function register(code, strings) { packs[code] = strings || {}; }

  /* Make sure a language's pack is loaded (it is a script file), then call back. English and custom languages need no file. */
  var fetched = {}, pending = {};   // languages whose pack file has been fetched (it may not exist), and callers waiting for one that is on its way
  function ready(code) { var l = find(code); return code === 'en' || !!packs[code] || !!fetched[code] || !l || !!l.custom || typeof document === 'undefined'; }
  function load(code, cb) {
    loadEdits(code);
    if (ready(code)) { cb && cb(); return; }
    if (pending[code]) { pending[code].push(cb); return; }
    pending[code] = [cb];
    var s = document.createElement('script');
    var fin = function () { fetched[code] = true; var cbs = pending[code] || []; delete pending[code]; cbs.forEach(function (f) { if (f) f(); }); };
    s.src = 'lang/' + code + '.js'; s.onload = fin; s.onerror = fin;   // a missing file leaves the language with English text until it is added
    document.head.appendChild(s);
  }
  function setLang(code, cb) {
    if (!find(code)) code = 'en';
    load(code, function () {
      cur = code; store('ava-lang', code);
      if (typeof document !== 'undefined') { var l = find(code); document.documentElement.setAttribute('lang', (l && l.locale) || code); }
      listeners.forEach(function (f) { f(code); });
      cb && cb(code);
    });
  }
  function onChange(f) { listeners.push(f); }
  function lang() { return cur; }
  function locale() { var l = find(cur); return (l && l.locale) || 'en'; }
  /* The language to start in: the one chosen before, else the browser's if there is a pack for it, else English. */
  function initialLang() {
    var saved = store('ava-lang'); if (saved && find(saved)) return saved;
    var nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    for (var i = 0; i < nav.length; i++) { var full = String(nav[i] || '').toLowerCase(), c = full.split('-')[0]; if (find(full)) return full; if (find(c)) return c; }   // zh-tw before zh
    return 'en';
  }

  /* ---- the Localisation screen's data ---- */
  function setCatalogue(items) { catalogue = items || []; }
  function getCatalogue() { return catalogue; }
  function translationOf(code, key) { loadEdits(code); var e = edits[code]; return (e && e[key]) || (packs[code] && packs[code][key]) || ''; }
  function setTranslation(code, key, value) {
    loadEdits(code);
    if (value === '' || value === null || value === undefined) delete edits[code][key]; else edits[code][key] = value;
    store('ava-i18n:' + code, JSON.stringify(edits[code]));
  }
  function editCount(code) { loadEdits(code); return Object.keys(edits[code]).length; }
  function addLanguage(code, name, locale) {
    code = String(code || '').trim().toLowerCase();
    if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/.test(code) || find(code)) return false;
    languages.push({ code: code, name: name || code, locale: locale || code, custom: true });
    var custom = languages.filter(function (l) { return l.custom; }).map(function (l) { return { code: l.code, name: l.name, locale: l.locale }; });
    store('ava-i18n-langs', JSON.stringify(custom));
    return true;
  }
  /* How much of the catalogue a language covers. */
  function coverage(code) {
    var n = 0, done = 0;
    catalogue.forEach(function (c) { n++; if (translationOf(code, c.k)) done++; });
    return { total: n, done: done };
  }
  /* A translation that loses or invents a {placeholder} would print "{n}" on screen: report those. */
  function problems(code) {
    var out = [];
    catalogue.forEach(function (c) { var tr = translationOf(code, c.k); if (tr && placeholders(tr) !== placeholders(c.k)) out.push(c.k); });
    return out;
  }
  /* The pack as file text, in catalogue order, with the edits merged in. */
  function exportPack(code) {
    var lines = [];
    catalogue.forEach(function (c) { var tr = translationOf(code, c.k); if (tr) lines.push('  ' + JSON.stringify(c.k) + ': ' + JSON.stringify(tr)); });
    return 'AVAI18n.register(' + JSON.stringify(code) + ', {\n' + lines.join(',\n') + '\n});\n';
  }
  /* Read a pack file (or a JSON object) back into the edits. */
  function importPack(code, text) {
    var m = /register\(\s*["'][^"']*["']\s*,\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/.exec(String(text).trim()), obj;
    try { obj = JSON.parse(m ? m[1] : text); } catch (e) { throw new Error('This is not a language pack (expected the text of a lang/*.js file or a JSON object).'); }
    var n = 0; Object.keys(obj).forEach(function (k) { if (typeof obj[k] === 'string' && obj[k]) { setTranslation(code, k, obj[k]); n++; } });
    return n;
  }

  var api = { t: t, ready: ready, lookup: lookup, fill: fill, register: register, setLang: setLang, onChange: onChange, lang: lang, locale: locale, initialLang: initialLang,
    languages: function () { return languages; }, find: find, addBuiltIn: addBuiltIn, setCatalogue: setCatalogue, catalogue: getCatalogue,
    translationOf: translationOf, setTranslation: setTranslation, editCount: editCount, addLanguage: addLanguage, coverage: coverage,
    problems: problems, placeholders: placeholders, exportPack: exportPack, importPack: importPack, load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVAI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
