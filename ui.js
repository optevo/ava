/* AVA UI (prototype v0.4): tabs, charts, tooltips, light/dark, Pipeline animation, autosave and Excel export/import. */
(function () {
  'use strict';
  var I18N = AVAI18n, tt = I18N.t;   // tt('English text') gives the text in the chosen language, or the English when there is no translation
  var E = AVAEngine, S = AVASim, C = AVACharts, R = AVARegions, D = AVASdlc, ST = AVAStore, DK = AVADeck, SK = AVAStack;
  var state = E.defaultState();
  var res = null;
  var mode = 'full';              // there is one view now (the old Simple and Full views were merged); kept so the code that checks it still works
  var curTab = 'pipeline', prevTab = 'pipeline';
  var chartIdx = 0;

  var ALT_TYPES = [
    { id: 'code-ai', name: 'AI coding + cloud native' },
    { id: 'appian', name: 'Appian' },
    { id: 'pega', name: 'Pega' },
    { id: 'salesforce', name: 'Salesforce Platform' },
    { id: 'servicenow', name: 'ServiceNow' },
    { id: 'power-platform', name: 'Microsoft Power Platform' },
    { id: 'other', name: 'Other (enter name)' }
  ];
  var MONEY_PATHS = ['platform.alt', 'platform.os', 'platform.sentry', 'infra.alt', 'infra.os', 'tokens.spend', 'value.cost', 'value.risk', 'value.rev', 'deliveryQuote', 'osTooling', 'setup.os.paas', 'setup.os.self', 'setup.alt.hiring', 'setup.alt.build', 'setup.alt.tools', 'skill.levels.experienced.enable', 'skill.levels.mixed.enable', 'skill.levels.newer.enable'];

  var HELP = {
    tileTtp: 'Average time to production::Expected weeks from an approved idea to being live, for one application. It includes queue waits and the repeat reviews that follow a rejection. Build is fast for both approaches, so most of the difference is what happens after it.',
    tileNpv: 'Net present value (NPV) advantage::NPV is the value of future money in today\'s terms: a benefit that arrives next year is worth a little less than the same amount today, so each future year is reduced by the discount rate (usually the organisation\'s cost of capital, set on the Analysis settings tab). This is OutSystems\' NPV (everything it delivers minus everything it costs) less the alternative\'s. Positive means OutSystems leaves the organisation better off by this much over the horizon.',
    tileRoi: 'Return on investment (ROI)::Net value divided by cost over the whole analysis period, before discounting: (total value minus total cost) ÷ total cost. For example 200% means every unit spent returns two units of net value.',
    tilePay: 'Payback period::Months until cumulative value minus cost turns positive and stays positive. Costs come first (building and the platform); value only starts once an application is live, then ramps up.',
    tilePeak: 'Peak cash outlay::The most the organisation is out of pocket, cumulatively, before the programme turns positive. A lower figure means less funding risk.',
    tileCod: 'Value of the time saved::What the weeks OutSystems saves are worth: each application\'s yearly value spread over the weeks, times the weeks it goes live sooner, added up over the applications. It is already part of the net present value advantage.',
    tileRun: 'Run-rate annual value::Yearly value of the portfolio once its applications are live: cost savings, risk reduction and revenue uplift, added up over the applications live within the horizon. It is the same for both approaches. The difference is when it starts.',
    chipTtp: 'Average time to production::Expected weeks from an approved idea to being live for one application. It includes queue waits and repeat reviews after a rejection.',
    chipWeek: 'Value of each week saved::Annual value of an average application divided by 52. Each week sooner that an application goes live is worth this much.',
    chipCod: 'Cost of delay avoided::Value of each week saved, times the weeks OutSystems is faster, per application.',
    chipTok: 'AI token spend saved::The alternative\'s AI build-token spend minus OutSystems\' (after its % saving), summed over all applications.',
    chipRoi: 'ROI::(Total value minus total cost) divided by total cost over the horizon, not discounted.'
  };
  var COST_HELP = {
    team: 'The project team (developers plus architects, testers, analysts, project managers and others) while designing, building and fixing. Waiting in review queues is not charged, but it does delay go-live.',
    tokens: 'AI tool and model usage while building.',
    run: 'Changing and maintaining the applications after go-live, as a % of their build cost per year.',
    platform: 'The OutSystems platform licence (and the Sentry security add-on when chosen). The alternative has no platform licence: its tools are under Tooling and services.',
    tooling: 'Tools and services other than the platform licence: for the alternative, its AI tools and toolchain (coding assistants, code review, scanning, CI/CD, observability, testing). For OutSystems, the share of those it still needs and the services you run whatever the hosting (an identity provider, an APM tool).',
    infra: 'Cloud infrastructure for the applications (hosting, storage, networking, monitoring, environments). It grows as applications go live. OutSystems PaaS includes it.',
    ops: 'People who run and maintain the platform or cloud services (DevOps, site reliability, security operations, patching). Minimal for OutSystems PaaS.',
    assure: 'Security and compliance the approach has to provide itself: intrusion detection, runtime monitoring, malware scanning, log streaming and 24x7 monitoring, plus audit and certification costs (for example SOC 2 Type II) and the people to run them. OutSystems PaaS with Sentry provides these out of the box.',
    setup: 'One-off setup: hiring and building a cloud environment for the alternative, onboarding for OutSystems. Counted only when setup costs are included.'
  };

  function $(id) { return document.getElementById(id); }
  function getPath(p, obj) { return p.split('.').reduce(function (o, k) { return o[k]; }, obj || state); }
  function setPath(p, v, obj) {
    var ks = p.split('.'), last = ks.pop();
    ks.reduce(function (o, k) { return o[k]; }, obj || state)[last] = v;
  }

  /* Two layers of configuration:
   *  - this assessment (organisation, scope, value, platform cost): lives in `state`, has no default;
   *  - general defaults (stages, gates, run %, token saving, ramp, discount rate...): DEFAULTS is the standard set,
   *    `state` starts from it, and any value that differs is shown as changed. In the finished tool DEFAULTS comes from config files. */
  var DEFAULTS = E.defaultState();
  var GROUPS = { delivery: [], costs: ['team.hours', 'altDevFactor', 'maint.fix.alt', 'maint.fix.os', 'maint.enh.alt', 'maint.enh.os', 'tokens.runPct', 'tokens.saving'],
    assumptions: ['horizon', 'rate', 'rampWeeks', 'growth', 'escal.labour', 'escal.licence', 'escal.infra'] };
  ['design', 'build', 'integration', 'deploy'].forEach(function (k) { GROUPS.delivery.push('stages.' + k + '.alt', 'stages.' + k + '.os'); });
  DEFAULTS.gates.forEach(function (g, i) {
    ['alt', 'os'].forEach(function (ap) { ['w', 'r', 's', 'f'].forEach(function (f) { GROUPS.delivery.push('gates.' + i + '.' + ap + '.' + f); }); });
  });
  E.ALL_ROLES.slice(E.ROLES.length).forEach(function (r) { GROUPS.costs.push('rates.' + r.key); });   // rates of the operating and security roles
  E.ROLES.forEach(function (r) {
    GROUPS.costs.push('rates.' + r.key);                                   // hourly cost of each role: defaults come from the country
    if (r.key !== 'dev') GROUPS.costs.push('mix.os.' + r.key, 'mix.alt.' + r.key);   // what one developer implies
  });
  var GENERAL = {};
  Object.keys(GROUPS).forEach(function (g) { GROUPS[g].forEach(function (p) { GENERAL[p] = g; }); });
  /* Hourly cost of each role in a country, in the given currency: the built-in rate card with any changes made on the Country rates screen. */
  /* The countries of one geography in alphabetical order (as written in the chosen language), the generic region last. */
  function regionsOf(geo) {
    return R.REGIONS.filter(function (r) { return r.geo === geo; }).sort(function (a, b) {
      if (a.id === 'GEN' || b.id === 'GEN') return a.id === 'GEN' ? 1 : -1;
      return tt(a.name).localeCompare(tt(b.name), I18N.locale());
    });
  }
  function rateDefaults(id, cur) {
    var base = R.roleRates(id), card = (state.rateCards || {})[id] || {}, native = R.byId(id).cur, f = R.convertCurrency(native, cur || native), out = {};
    R.ROLE_KEYS.forEach(function (k) { out[k] = R.round3((card[k] !== undefined ? card[k] : base[k]) * f); });
    return out;
  }
  function defaultRates() { return rateDefaults(state.country, state.currency); }
  function defaultOf(p) { return p.indexOf('rates.') === 0 ? defaultRates()[p.slice(6)] : getPath(p, DEFAULTS); }
  function isOverridden(p) {
    if (!GENERAL[p]) return false;
    var a = Number(getPath(p)), b = Number(defaultOf(p));
    return Math.abs(a - b) > Math.max(1e-9, Math.abs(b) * (p.indexOf('rates.') === 0 ? 0.005 : 0));
  }
    function overriddenCount(group) { return GROUPS[group].filter(isOverridden).length; }
  function esc(s) { return C.esc(s); }
  /* The alternative as a label in charts, tables and headings: just "Alternative". The chosen name (Compared against) stays in the Context pane and in prose. */
  function altShort() { return 'Alternative'; }
  function altLabel() { return state.altName && state.altName.trim() ? state.altName.trim() : 'Alternative'; }
  function f1(x) { return C.f1(x); }
  /* Months to a milestone; with a start date, the month and year it falls in as well. */
  function months(v, week) {
    if (v === null) return tt('beyond horizon');
    var d = week === undefined ? '' : E.dateAtWeek(state, week);
    return d ? tt('{n} months ({d})', { n: f1(v), d: showMonth(d) }) : tt('{n} months', { n: f1(v) });
  }
  function showMonth(iso) {
    var t = E.parseDate(iso); if (t === null) return iso || '';
    try { return new Date(t).toLocaleDateString(AVAI18n.lang() === 'en' ? 'en-AU' : AVAI18n.lang(), { month: 'short', year: 'numeric', timeZone: 'utc' }); } catch (e) { return iso; }
  }
  function pct(x) { return x === null ? 'n/a' : Math.round(x * 100) + '%'; }
  function tipA(key) { var s = HELP[key].split('::'); return C.tip(s[0], s[1]); }

  /* ---------------------------------------------------------------- inputs */
  /* Money amounts are shown with thousands separators and accept shorthand such as 900k or 1.5m. */
  function isMoney(path) { return MONEY_PATHS.indexOf(path) >= 0 || /^deliveryGroups\.\d+\.quote$/.test(path) || /^projectList\.\d+\.build\.\d+\.(salary|lic|infra|support|fteCost|per|exposure|amount)$/.test(path) || /^setup\.os\.(paas|self)$/.test(path) || /\.annual$/.test(path) || /^projectList\.\d+\.value\./.test(path); }
  /* Money amounts are shown in whole units (never 1,234.5 next to 1,235), so the figures in a column line up. */
  function fmtMoney(v) { var n = Number(v); return isFinite(n) ? Math.round(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ''; }
  /* Rates are shown with a fixed number of decimals so the points line up: 2, or none for currencies quoted in whole units. */
  var WHOLE_CUR = { JPY: 1, KRW: 1, VND: 1, IDR: 1 };
  function fmtFixed(v, d) { var n = Number(v); return isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : ''; }
  function rateDec(cur) { return WHOLE_CUR[cur] ? 0 : 2; }
  function parseMoney(str) {
    var t = String(str).replace(/[,\s$€£¥]/g, '').toLowerCase(), m = /^(-?[0-9]*\.?[0-9]+)([kmb]?)/.exec(t);
    if (!m) return 0;
    return parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
  }
  /* Amounts that can change from year to year carry a small icon at the right of the field; it opens the yearly-pattern editor. Where the pattern is kept: yrHolder. */
  function yrPathOf(path) {
    if (/^(platform\.(alt|os|sentry)|infra\.(alt|os))$/.test(path) || path === 'osTooling' || /^(toolItems|infraItems|assureItems|appAssure)\.\d+\.annual$/.test(path)) return path;
    return /^projectList\.\d+\.build\.\d+\.amount$/.test(path) ? path.replace(/\.amount$/, '.value') : null;
  }
  function yrHolder(path, create) {
    if (/^(platform|infra)\.\w+$/.test(path) || path === 'osTooling') { if (create) state.over = state.over || {}; return state.over ? { o: state.over, k: path.replace(/\./g, '/') } : null; }
    var m = /^(.*)\.(annual|value)$/.exec(path), h = m && getPath(m[1]);
    if (!h) return null;
    if (create) h.over = h.over || {};
    return h.over ? { o: h.over, k: m[2] } : null;
  }
  function getPat(path) { var h = yrHolder(path, false); return h && h.o[h.k] ? h.o[h.k] : null; }
  function setPat(path, pt) { var h = yrHolder(path, true); if (!h) return; if (pt && E.hasPattern(pt)) h.o[h.k] = pt; else delete h.o[h.k]; }
  function yrAttr(yp) { return yp ? ' data-yr="' + yp + '"' + (E.hasPattern(getPat(yp)) ? ' data-yron="1" readonly' : '') : ''; }   // while a pattern is set the amount is edited in the pattern editor
  function inp(path, step, min, max, scope) {
    scope = scope || 'state';
    var val = getPath(path, scope === 'defaults' ? DEFAULTS : state);
    var ovr = scope === 'state' && isOverridden(path), yp = scope === 'state' ? yrPathOf(path) : null;
    if (yp && E.hasPattern(getPat(yp))) val = yrMeanOf(yp);   // a varying amount shows its average
    if (isMoney(path)) {
      return '<input type="text" inputmode="decimal" data-fmt="1"' + yrAttr(yp) + (ovr ? ' class="ovr"' : '') + ' data-path="' + path + '" data-scope="' + scope + '" value="' + fmtMoney(val) + '"' +
        (yp && E.hasPattern(getPat(yp)) ? C.tip(tt('Over the years'), tt('This amount changes from year to year; the figure shown is the average per year over the analysis period. Click to change the pattern, or choose "The same every year" there to type a single amount again.')) : ovr ? C.tip('Changed from the default', tt('The general default is {v}. Use “Reset to defaults” on this tab to go back.', { v: fmtMoney(defaultOf(path)) })) : C.tip(tt('Amount'), yp ? tt('Type a number, or use shorthand such as 900k or 1.5m. The pill at the right sets how it changes from year to year.') : tt('Type a number, or use shorthand such as 900k or 1.5m.'))) + '>';
    }
    return '<input type="number"' + (ovr ? ' class="ovr"' : '') + ' data-path="' + path + '" data-scope="' + scope + '" step="' + (step || 1) + '" min="' + (min === undefined ? 0 : min) + '"' +
      (max !== undefined ? ' max="' + max + '"' : '') + ' value="' + val + '"' +
      (ovr ? C.tip('Changed from the default', tt('The general default is {v}. Use “Reset to defaults” on this tab to go back.', { v: defaultOf(path) })) : '') + '>';
  }
  /* Translate the text pieces of a label that carries markup ("Platform licence <i>$</i> a year"): each piece between tags is looked up on its own. */
  function ttMarkup(s) {
    if (s.indexOf('<') < 0) return tt(s);
    return s.split(/(<[^>]*>)/).map(function (p) {
      if (!p || p.charAt(0) === '<') return p;
      var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(p); return m[2] ? m[1] + tt(m[2]) + m[3] : p;
    }).join('');
  }
  var FIELD_TIP = {};   // data-path -> the explanation given to its row, so the Evidence page can show the same words
  function row(label, html, tipText) {
    var fp = tipText && /data-path="([^"]+)"/.exec(html); if (fp && !FIELD_TIP[fp[1]]) FIELD_TIP[fp[1]] = tipText;
    label = ttMarkup(label); if (tipText) tipText = tt(tipText);
    return '<div class="row"><label' + (tipText ? C.tip(label.replace(/<[^>]*>/g, ''), tipText) + ' style="cursor:help"' : '') + '>' + label + '</label>' + html + '</div>';
  }
  function pairHead() { return '<div class="pair head"><span></span><b>' + tt('Alternative') + '</b><b class="os">OutSystems</b></div>'; }
  function pairRow(label, pf, step, min, max, scope) {
    return '<div class="pair"><span>' + tt(label) + '</span>' + inp(pf('alt'), step, min, max, scope) + inp(pf('os'), step, min, max, scope) + '</div>';
  }
  /* A consistent "Details" link at the foot of a panel: opens the tab with the full detail . */

  /* ---- Click a chart item to go to where its base cost is edited ----
   * A target is "tab/sub-tab#field". The field is an input's data-path; a * matches one path segment, and a comma lists several.
   * The tab "panel" is the Assessment inputs pane on the left. The inputs found flash for a few seconds, then the highlight fades. */
  function costGo(cat, g) {   // g: 0 the alternative, 1 OutSystems, undefined for either
    switch (cat) {
      case 'team': return 'costs#rates.*';
      case 'tokens': return g === 1 ? 'costs#tokens.saving' : 'costs#tokens.spend,tokens.runPct';
      case 'run': return g === 1 ? 'costs#maint.*.os' : g === 0 ? 'costs#maint.*.alt' : 'costs#maint.*.*';
      case 'platform': return 'infrastructure/licence#platform.os,platform.sentry';
      case 'tooling': return g === 0 ? 'infrastructure/cloud#toolItems.*.annual' : 'infrastructure/cloud#toolItems.*.os,infraItems.*.ext';
      case 'infra': return 'infrastructure/cloud#infraItems.*.annual';
      case 'ops': return 'infrastructure/people#opsItems.*.fte';
      case 'assure': return 'infrastructure/security#assureItems.*.annual,assureItems.*.fte,appAssure.*.annual';
      case 'setup': return g === 1 ? 'infrastructure/setup#setup.os.self,setup.os.envShare,setup.os.paas' : 'infrastructure/setup#setup.alt.hiring,setup.alt.build,setup.alt.tools';
    }
    return null;
  }
  function valueGo(k) { return E.isSimple(state) && E.simpleIndex(state, k) >= 0 ? 'panel#projectList.0.build.' + E.simpleIndex(state, k) + '.amount' : 'applications'; }
  function appGo(i) {
    var inc = []; E.ensureList(state).forEach(function (p, j) { if (p.include !== false) inc.push(j); });
    return inc[i] === undefined ? null : 'applications#projectList.' + inc[i] + '.months,projectList.' + inc[i] + '.name';
  }
  function globRe(p) { return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+') + '$'); }
  var goBack = null, goTimer = null, backTimer = null;
  function pathOf(el) { return el.dataset.path || el.dataset.tpath || (el.dataset.rc ? 'rc:' + el.dataset.rc : ''); }
  function clearGo() { document.querySelectorAll('.hl').forEach(function (e) { e.classList.remove('hl'); }); }
  function goTo(spec) {
    var m = /^([a-z]+)(?:\/([a-z]+))?(?:#(.*))?$/.exec(spec || ''); if (!m) return;
    var tab = m[1], sub = m[2], keys = (m[3] || '').split(',').filter(Boolean);
    goBack = { level: level, tab: curTab, chart: chartIdx, infra: infraSub, team: teamSub };
    if (presenting) setPresent(false);
    if (tab === 'panel') {
      if (document.body.classList.contains('nopane') && $('panetoggle')) $('panetoggle').click();
    } else {
      ensureLevel(tabMin(tab));
      if (tab === 'infrastructure' && sub) { infraSub = sub; buildInfra(); }
      if (tab === 'team' && sub) teamSub = sub;
      recalc(); showTab(tab);
    }
    setTimeout(function () { highlightKeys(tab, keys); }, 80);
    showBackChip();
  }
  function highlightKeys(tab, keys) {
    var root = tab === 'panel' ? $('keypanel') : $('tab-' + tab), found = [];
    if (!root) return;
    var res0 = keys.map(globRe);
    root.querySelectorAll('[data-path],[data-tpath],[data-rc]').forEach(function (el) { var p = pathOf(el); if (p && res0.some(function (r) { return r.test(p); })) found.push(el); });
    var marks = found;
    if (found.length === 1) marks = [found[0].closest('.row, .bd, .prow, tr, .pair, .rt > *') || found[0], found[0]];
    if (!found.length) { var card0 = root.querySelector('.card'); marks = card0 ? [card0] : []; }   // nothing exact: show the card instead
    found.concat(marks).forEach(function (el) { for (var d = el.closest('details'); d; d = d.parentElement ? d.parentElement.closest('details') : null) d.open = true; });
    clearGo(); clearTimeout(goTimer);
    marks.forEach(function (el) { void el.offsetWidth; el.classList.add('hl'); });
    var first = found[0] || marks[0];
    if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    goTimer = setTimeout(clearGo, 3800);
  }
  function showBackChip() {
    var c = $('backchip');
    if (!c) { c = document.createElement('button'); c.id = 'backchip'; c.type = 'button'; document.body.appendChild(c); c.addEventListener('click', goBackNow); }
    var where = goBack && goBack.label ? tt('the answer') : goBack && goBack.tab === 'summary' ? tt('the chart') : tt('where you were');
    c.textContent = '‹ ' + tt('Back to {where}', { where: where }); c.hidden = false;
    clearTimeout(backTimer); backTimer = setTimeout(function () { c.hidden = true; }, 15000);
  }
  function goBackNow() {
    var c = $('backchip'); if (c) c.hidden = true;
    if (!goBack) return;
    clearGo(); infraSub = goBack.infra; teamSub = goBack.team; chartIdx = goBack.chart;
    if (goBack.level && goBack.level !== level) setLevel(goBack.level);   // a drill-down may have raised the view to reach its target: put it back
    if (goBack.tab === 'infrastructure') buildInfra();
    recalc(); showTab(goBack.tab);
  }
  /* Two independent choices: where OutSystems runs (PaaS or self-managed) and whether high assurance is needed (Sentry on PaaS; on self-managed the organisation provides it itself).
   * A configuration key joins them: paas, paas-sentry, self, self-diy. */
  /* The symbol for the assessment currency: short in the country's own currency, and one that says which (US$, A$) otherwise or when full symbols are on. */
  function curOpts(code) { return { native: (code || state.currency) === R.byId(state.country).cur, full: !!state.fullCurrency }; }
  function curSym(code) { return C.symbolOf(code || state.currency, curOpts(code)); }
  function nativeSym(full) { return C.symbolOf(R.byId(state.country).cur, { native: true, full: full }); }
  function fullSymDiffers() { return nativeSym(true) !== nativeSym(false); }   // no toggle where the short symbol already says it all, such as the euro or the pound
  function cfgKey() { var h = E.hostingOf(state); return h === 'self' ? (E.assuranceOn(state) ? 'self-diy' : 'self') : h; }
  function setHosting(v) {
    state.assurance = state.assurance || {};
    state.osHosting = v === 'self-diy' ? 'self' : v === 'paas-sentry' ? 'paas' : v;
    state.assurance.required = (v === 'paas-sentry' || v === 'self-diy');
    buildKey(); buildInfra(); recalc();
  }
  function setBase(base) { var ha = E.assuranceOn(state); setHosting(base === 'self' ? (ha ? 'self-diy' : 'self') : (ha ? 'paas-sentry' : 'paas')); }
  function setHA(on) { setHosting(E.hostingOf(state) === 'self' ? (on ? 'self-diy' : 'self') : (on ? 'paas-sentry' : 'paas')); }
  function hostingSelect() {
    var h = E.hostingOf(state) === 'self' ? 'self' : 'paas';
    return '<select data-special="osHosting"><option value="paas"' + (h === 'paas' ? ' selected' : '') + '>PaaS</option><option value="self"' + (h === 'self' ? ' selected' : '') + '>Self-managed</option></select>';
  }
  /* The high-assurance switch: Sentry (an extra OutSystems licence) on PaaS; when self-managed, the organisation's own tooling, people and audits. */
  function assureCheck() {
    var self = E.hostingOf(state) === 'self';
    var nm = self ? tt('High assurance') : tt('High assurance (Sentry)');
    return '<label class="chk"' + C.tip(nm, tt('Tick if the organisation needs compliance-grade security: SOC 2 Type II, HIPAA or PCI attestation, intrusion detection, runtime integrity monitoring, malware scanning, IP filtering and 24x7 monitoring.') + ' ' +
      (self ? tt('Self-managed ODC has no Sentry, so the organisation does this itself: the tools, people and audits.') : tt('OutSystems PaaS provides these out of the box with the Sentry add-on, for an extra licence.')) +
      ' ' + tt('The cloud-native alternative has to buy and staff the equivalent, so it is charged the same requirement.')) +
      '><input type="checkbox" data-ha="1"' + (E.assuranceOn(state) ? ' checked' : '') + '> ' + nm + '</label>';
  }
  /* The tick that counts the one-off cost of standing up a cloud-native estate from scratch (and OutSystems' own install, when self-managed). */
  function setupIncLabel(on) {
    return '<label class="chk"' + C.tip(tt('Include the cost of setting up cloud native from scratch'), tt('Counts the one-off cost the alternative has to spend before it can run: hiring and onboarding a cloud team and building the cloud environment, tools and pipelines from scratch. OutSystems has none of this on PaaS, and only the ODC install when self-managed. It is left out by default so the comparison focuses on ongoing costs; ticking it lowers the alternative\'s result.')) + '><input type="checkbox" data-setupinc="1"' + (on ? ' checked' : '') + '> ' + tt('Include the cost of setting up cloud native from scratch') + '</label>';
  }
  function more(tab, what) {
    return '<div class="morewrap"><a class="more" data-gotab="' + tab + '"' + C.tip('Details', what) + '>' + tt('Details') + ' ›</a></div>';
  }
  /* A left-panel card that can be folded; its key figure stays visible in the heading. */
  var foldOpen = {};
  function fold(key, title, sumId, body, defOpen) {
    var open = foldOpen[key] !== undefined ? foldOpen[key] : (defOpen !== undefined ? defOpen : false);
    return '<details class="card fold" data-fold="' + key + '"' + (open ? ' open' : '') + '><summary><h4>' + tt(title) + '</h4><span class="fsum" id="' + sumId + '"></span></summary>' + body + '</details>';
  }
  document.addEventListener('toggle', function (ev) { var t = ev.target; if (t.dataset && t.dataset.fold) foldOpen[t.dataset.fold] = t.open; }, true);
  function card(title, body) { return '<div class="card"><h4>' + tt(title) + '</h4>' + body + '</div>'; }

  function buildKey() {
    var cur = state.currency, opts = '', groups = {};
    R.GEOS.forEach(function (g) {
      opts += '<optgroup label="' + g + '">' + regionsOf(g).map(function (r) {
        return '<option value="' + r.id + '"' + (r.id === state.country ? ' selected' : '') + '>' + esc(tt(r.name)) + '</option>';
      }).join('') + '</optgroup>';
    });
    var altOpts = ALT_TYPES.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === state.altType ? ' selected' : '') + '>' + a.name + '</option>';
    }).join('');

    var h = '<div class="ph">Assessment inputs</div>';
    var choices = R.currencyChoices(state.country);
    if (choices.indexOf(cur) < 0) choices.push(cur);
    var curOpts = choices.map(function (c, i) { return '<option value="' + c + '"' + (c === cur ? ' selected' : '') + '>' + c + ' (' + esc(curSym(c)) + ')</option>'; }).join('');   // just the currency code; the country's own currency is listed first and is the default
    h += fold('ctx', 'Context', 'fs-ctx',
      row('Country', '<select data-special="country">' + opts + '</select>', 'Sets the country\'s own currency and a default hourly cost for each delivery role.') +
      row('Currency', '<select data-special="currency">' + curOpts + '</select>', 'The country\'s own currency (the default), US dollars or euros. Switching converts every amount using a static, indicative conversion table.') +
      (state.currency !== R.byId(state.country).cur ? '<div class="note" style="margin:0 0 6px">' + tt('Amounts are in {sym}, not the country\'s own currency, so the full symbol is always shown.', { sym: esc(curSym()) }) + '</div>' : fullSymDiffers() ? '<label class="chk"' + C.tip('Full currency symbols', 'Show which dollar (or yen) it is, for example A$ instead of $. Amounts in a currency other than the country\'s own always show the full symbol, such as US$.') + '><input type="checkbox" data-fullcur="1"' + (state.fullCurrency ? ' checked' : '') + '> ' + tt('Full symbols ({a} not {b})', { a: esc(nativeSym(true)), b: esc(nativeSym(false)) }) + '</label>' : '') +
      row('Compared against', '<select data-special="altType">' + altOpts + '</select>', 'What would otherwise be used to build these applications.') +
      '<div class="row' + (state.altType === 'other' ? '' : ' hidden') + '" id="altNameRow"><label>Name</label>' +
      '<input type="text" data-text="altName" value="' + esc(state.altName) + '"></div>' +
      more('rates', 'The hourly cost of each role in the country\'s own currency, viewable and changeable (Rates tab).'));
    var list = E.ensureList(state), one = list.length === 1, simple = E.isSimple(state);
    var groups = E.ensureGroups(state), g0 = groups[0], multiG = groups.length > 1, quote = !multiG && g0.mode === 'quote';
    var rollTip = function (what) { return C.tip('Added up from the applications', what + ' ' + tt('Click to edit the applications.')); };
    var hDel = fold('delivery', 'Portfolio delivery', 'fs-del',
      (one
        ? row('Months to deliver portfolio', inp('projectList.0.months', 0.5, 0.1, 60),
          'How long OutSystems takes to deliver the portfolio: the delivery team\'s active work on design, build and fixes. The alternative\'s time is projected from this using the time-to-production comparison. With more than one application, each has its own months and this is added up from them.', 'projectList.0.months')
        : row('Months to deliver portfolio', '<div class="ro locked" id="dm-ro" data-go="applications#projectList.*.months"' + rollTip('Each application has its own months, and one team delivers them one after another, so the portfolio\'s months are added up from them.') + '></div>',
          'The portfolio\'s months are worked out from the months of each application. Click to edit them on the Applications tab.')) +
      '<div class="note" style="margin-top:6px">' + tt('{a} of {b} applications included.', { a: list.filter(function (p) { return p.include !== false; }).length, b: list.length }) + '</div>' +
      more('applications', 'List the individual applications, or groups of applications: their names, months to deliver, developers and value calculators, and switch them on or off (Applications tab).') +
      '<div class="sub" style="margin-top:8px">' + tt('OutSystems delivery cost') + '</div>' +
      (multiG ? '' : '<div class="radios"><label><input type="radio" name="deliveryMode" value="team"' + (!quote ? ' checked' : '') + '> ' + tt('Developer based') + '</label>' +
      '<label><input type="radio" name="deliveryMode" value="quote"' + (quote ? ' checked' : '') + '> ' + tt('Given cost') + '</label></div>') +
      (one
        ? row('Developers', inp('projectList.0.devs', 1, 1, 200), 'OutSystems developers. The architects, testers, analysts, project managers and others they imply come from the role mix, at the country\'s rate for each role. The alternative\'s team is worked out from this.', 'projectList.0.devs')
        : row('Developers', '<div class="ro locked" id="dv-ro" data-go="applications#projectList.*.devs"' + rollTip('Each application has its own team size; this is their average, weighted by months.') + '>' + f1(E.avgDevs(state)) + '</div>',
          'OutSystems developers on an application. Each application has its own number on the Applications tab.')) +
      (quote ? '' : (function () {   // one experience level for the portfolio, linked to the delivery teams until they differ
        var ex = E.teamExperience(state), opts = SKILL_LEVELS.map(function (x) { return '<option value="' + x[0] + '"' + (ex === x[0] ? ' selected' : '') + '>' + esc(tt(x[1])) + '</option>'; }).join('');
        if (ex === 'custom') opts += '<option value="custom" selected disabled>' + esc(tt('Custom')) + '</option>';
        if (ex === null) opts += '<option value="" selected disabled>' + esc(tt('Different for each team')) + '</option>';
        return row('Developers\' experience', '<select data-gexpall="1"' + (ex === null || ex === 'custom' ? ' disabled' : '') + '>' + opts + '</select>',
          'How experienced the developers are. Less experienced developers are paid less but take longer, and need training with OutSystems. This applies to every delivery team while they share one level; once the teams differ it shows that and is set for each team on the Applications tab.');
      })()) +
      (multiG
        ? '<div class="note" data-go="applications"><a class="more">' + tt('Delivery cost and rate levels are set for each delivery team (Applications tab).') + '</a></div>'
        : (quote
          ? row('Delivery cost <i>' + esc(curSym()) + '</i>', inp('deliveryGroups.0.quote', 10000, 0), 'What OutSystems delivery of the whole portfolio will cost (people and time). With the developers above, this sets the rate level of the delivery team, so the alternative\'s cost follows from its longer time to production, its team size and its team mix.', 'deliveryGroups.0.quote') + '<div class="note" id="rate-implied"></div>'
          : row('Rate level (%)', inp('deliveryGroups.0.rate', 5, 10, 500), 'How the delivery people\'s cost compares with the reference rates for the country: 100% uses them as they are; a partner might be 140% and an internal team 85%.', 'deliveryGroups.0.rate'))) +
      more('team', 'Person-days and cost by role and by skill domain and phase, for each approach, with the reasons they differ (Team tab).'));
    var pl = E.projectList(state), sum = { cost: 0, risk: 0, rev: 0 };
    pl.forEach(function (p) { ['cost', 'risk', 'rev'].forEach(function (k) { sum[k] += p.value[k]; }); });
    function vrow(label, key, tipText) {
      var ix = E.simpleIndex(state, key);
      if (simple && ix >= 0) return row(label, inp('projectList.0.build.' + ix + '.amount', 10000, 0), tipText, 'projectList.0.build.' + ix + '.amount');
      if (simple) return row(label, '<button type="button" class="b" data-act="sv-add" data-k="' + key + '">' + tt('Add') + '</button>', tipText);
      return row(label, '<div class="ro locked" id="vr-' + key + '" data-go="applications"' + rollTip('') + '>' + C.money(sum[key]) + '</div>', tipText + ' ' + tt('This is the sum of the applications; click it to edit them on the Applications tab.'));
    }
    var money = ' ' + tt('Amounts are per annum, in {cur}, the currency chosen above.', { cur: cur });
    var hOrg = fold('org', 'Your organisation', 'fs-org',
      row('Employees', '<input type="number" data-path="org.employees" data-scope="state" step="1000" min="0" value="' + (num0(state.org && state.org.employees) || '') + '" placeholder="' + esc(tt('Optional')) + '">', 'Total employees. Optional. Used only to set sensible starting figures when you add a calculator or choose an application type, for example how many people use a workflow application. It never changes a figure you have already set.') +
      row('Customers', '<input type="number" data-path="org.customers" data-scope="state" step="1000" min="0" value="' + (num0(state.org && state.org.customers) || '') + '" placeholder="' + esc(tt('Optional')) + '">', 'Total customers (or citizens, patients, members or students, whoever the organisation serves). Optional. Used only to set sensible starting volumes, such as requests or sign-ups per year, when you add a calculator or choose an application type.') +
      row('Industry', '<select data-orgind="1"' + C.tip(tt('Industry'), tt(INDUSTRY_TIP)) + '><option value="">' + esc(tt('Not set')) + '</option>' + E.INDUSTRIES.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (state.org && state.org.industry === x[0] ? ' selected' : '') + '>' + esc(tt(x[0])) + '</option>'; }).join('') +
        '<option value="_other"' + (state.org && state.org.industry === '_other' ? ' selected' : '') + '>' + esc(tt('Other (not listed)')) + '</option></select>' +
        (state.org && state.org.industry === '_other' ? ' <input type="text" data-tpath="org.industryOther" value="' + esc((state.org && state.org.industryOther) || '') + '" placeholder="' + esc(tt('Name the industry')) + '">' : ''), INDUSTRY_TIP) +
      (state.org && state.org.industry ? '<div class="note">' + (state.org.industry === '_other' ? tt('Not in the list, so the general starting figures are used. The name is saved with the assessment.')
        : tt('Adjusts the starting customers and role mix, and brings the matching application types forward. Edit the multipliers on the Defaults tab.')) + '</div>' : '') +
      '<div class="note">' + (state.org && state.org.auto === false
        ? tt('Your own figures.') + ' <a class="more" data-act="org-auto">' + tt('Use the typical organisation for {country}', { country: esc(tt(R.byId(state.country).name)) }) + '</a>'
        : tt('Starts from a typical large organisation in {country}: placeholders to replace with the customer\'s own figures.', { country: esc(tt(R.byId(state.country).name)) })) + '</div>', false);
    var hVal = fold('value', 'Portfolio business value', 'fs-val',
      vrow('Cost savings', 'cost', tt('Hard saving for the whole portfolio, each year once it is live: effort or licences no longer needed. Same for both approaches; OutSystems gets it sooner.') + money) +
      vrow('Revenue uplift', 'rev', tt('Soft benefit for the whole portfolio, each year once it is live: extra revenue or process efficiency.') + money) +
      vrow('Risk reduction', 'risk', tt('Soft benefit for the whole portfolio, each year once it is live: expected loss avoided (probability x impact x reduction).') + money) +
      '<div class="note" style="margin-top:6px">' + tt('All amounts are per annum, in {cur}.', { cur: esc(cur) }) + ' ' + (simple ? tt('These are the portfolio\'s simple value calculators (Applications tab).') : tt('Added up from the applications.')) + '</div>' +
      more('applications', 'Set the value of each application separately, or build it from detailed calculators (Applications tab).'), true);
    var altN = esc(altShort());
    function pr(label, id, os, alt, tip) { return '<div class="pair"><span' + (tip ? C.tip(tt(label), tt(tip)) : '') + '>' + label + '</span><div class="ro" id="kp-' + id + '-alt">' + alt + '</div><div class="ro" id="kp-' + id + '-os">' + os + '</div></div>'; }
    var hPlat = fold('platform', 'Platform costs', 'fs-plat',
      row('Platform licence <i>' + esc(curSym()) + '</i>', inp('platform.os', 5000, 0), 'Annual OutSystems platform licence. It is the same whether OutSystems hosts it (PaaS) or the organisation does (self-managed); only the infrastructure, people and setup differ.', 'platform.os') +
      row('Additional Sentry licence <i>' + esc(curSym()) + '</i>', inp('platform.sentry', 5000, 0), 'The extra annual licence for the Sentry security and compliance add-on, on top of the platform licence. It is charged only when Sentry is included (ticked below, or chosen on Infrastructure > Compare). Sentry is available on PaaS only. Placeholder: to be replaced with the real price.') +
      row('OutSystems hosting', hostingSelect(),
        'PaaS: OutSystems provisions and runs the cloud, so there is no extra infrastructure or operating people, and no setup. ODC + Sentry (PaaS) adds the Sentry security and compliance package (an extra licence). Self-managed: the organisation runs it on its own cloud, so it pays for infrastructure and some operating people, but setup is prescriptive and cheap and maintenance is simpler than a cloud-native build.') +
      assureCheck() + '<div class="note" id="assure-note" style="margin:2px 0 6px"></div>' +
      '<div class="pair head"><span></span><b>' + altN + '</b><b class="os">OutSystems</b></div>' +
      pr('Licences', 'lic', '', '', tt('The yearly platform licence: OutSystems only. The alternative has none; its tools are under Tooling and services.')) + pr('Tooling and services', 'tool', '', '', tt('The yearly tools and services each approach needs besides the platform licence: for the alternative, the tools it uses on top of the cloud; for OutSystems, the share it still needs and the services you run whatever the hosting.')) + pr('Infrastructure', 'inf', '', '', tt('The yearly cloud infrastructure each approach needs to run the applications. Hover the OutSystems figure to see why it can be zero.')) + pr('Operating people (FTE)', 'ops', '', '', tt('Full-time equivalents of operations people needed to run each approach once the applications are live.')) +
      '<div class="sub" style="margin-top:8px"' + C.tip('Setup costs', 'One-off costs to get started: for the alternative, hiring and onboarding a cloud team and building the infrastructure environment; for OutSystems, onboarding and training. Absorbed (the default) leaves them out so the comparison focuses on ongoing costs. Include counts them.') + '>Setup costs (one-off)</div>' +
      setupIncLabel(state.setup.mode === 'included') +
      more('infrastructure', 'Line-by-line comparison of tooling, infrastructure and operating people for each approach, the OutSystems hosting options, and setup costs (Platform and infrastructure tab).'));
    var hNote = '<div class="note">Illustrative placeholder values. Every setting behind these figures is on the tabs above.</div>';
    var per = ''; for (var yy = 1; yy <= 10; yy++) per += '<option value="' + yy + '"' + (yy === state.horizon ? ' selected' : '') + '>' + (yy === 1 ? tt('1 year') : tt('{n} years', { n: yy })) + '</option>';
    var scOpts = Object.keys(E.CASES).concat(['custom']).map(function (k) { return '<option value="' + k + '"' + (k === (E.caseOf(state) || 'custom') ? ' selected' : '') + '>' + tt(k === 'custom' ? 'Custom' : E.CASES[k].label) + '</option>'; }).join('');
    var hAna = fold('analysis', 'Analysis', 'fs-ana',
      row('Scenario', '<select data-special="scenario" data-path="scenario" id="sc-sel">' + scOpts + '</select>', 'How much of the claimed benefit is assumed to arrive.') +
      row('Analysis period', '<select data-path="horizon" data-scope="state">' + per + '</select>', 'How many years the comparison covers. 3 and 5 years are typical. Every figure and chart updates as you change it.') +
      row('Assessment start date', '<input type="date" data-text="startDate" value="' + esc(state.startDate || '') + '">', 'Optional. The first day of the project. With it, delivery teams can start on fixed dates and the timeline shows calendar dates; without it everything is shown as time from the start.') +
      row('Licence start date', '<input type="date" data-text="licenceStart" value="' + esc(state.licenceStart || '') + '"' + (state.startDate ? '' : ' disabled') + '>', 'Optional. When the platform licences start being charged, if that is not the project start. Left blank, they start with the project. Needs the assessment start date.') +
      '<div class="row"><label' + C.tip('Hard savings only', tt('Leaves out soft benefits (risk reduction and revenue uplift) and keeps cost savings, cost differences and anything else that can be verified. A more cautious view.')) + ' style="cursor:help">' + tt('Hard savings only') + '</label><input type="checkbox" id="hardOnly2"' + (state.hardOnly ? ' checked' : '') + '></div>' +
      more('assumptions', 'Set the percentages behind each scenario (Analysis settings tab).'), true);
    /* Value comes first, with the settings that frame it (scenario, period); then what it costs: delivery, then platform. */
    h += hOrg + hVal + hAna + hDel + hPlat + hNote;
    $('keypanel').innerHTML = h;
  }

  function page(title, desc, cards, extra) {
    return '<h2 class="pt">' + tt(title) + '</h2><p class="pd">' + tt(desc) + '</p>' + (extra || '') + '<div class="cfgwrap">' + cards + '</div>';
  }
  function sec(title, cards) { return '<h3 class="sec">' + tt(title) + '</h3><div class="cfgwrap">' + cards + '</div>'; }
  function resetBar(group) {
    return '<div class="resetbar"><span id="ovr-' + group + '"></span><button class="b" data-reset="' + group + '">Reset to defaults</button></div>';
  }
  function sp(prefix) { return function (a) { return prefix + '.' + a; }; }
  function gp(i, field) { return function (a) { return 'gates.' + i + '.' + a + '.' + field; }; }

  function deliveryCards(scope) {
    var cards = card('Stages (weeks)', pairHead() +
      pairRow('Design', sp('stages.design'), 0.5, 0, undefined, scope) +
      pairRow('Build', sp('stages.build'), 0.5, 0, undefined, scope) +
      pairRow('Integration testing', sp('stages.integration'), 0.5, 0, undefined, scope) +
      pairRow('Deploy', sp('stages.deploy'), 0.5, 0, undefined, scope) +
      '<div class="note">Build is fast for everyone now. The difference is in what happens after it.</div>');
    DEFAULTS.gates.forEach(function (gate, i) {
      cards += card(esc(gate.name) + ' gate', pairHead() +
        pairRow('Queue wait (weeks)', gp(i, 'w'), 0.5, 0, undefined, scope) +
        pairRow('Review time (weeks)', gp(i, 'r'), 0.5, 0, undefined, scope) +
        pairRow('Pass first time (%)', gp(i, 's'), 1, 1, 100, scope) +
        pairRow('Fix time if rejected (weeks)', gp(i, 'f'), 0.5, 0, undefined, scope));
    });
    cards += card('How gates work', '<div class="note" style="margin-top:0">' + tt('A rejected application goes back to build for the fix time, then waits and is reviewed again.') + ' ' +
      tt('The simulator on the How it works tab animates exactly these values, and the Value tab uses the same arithmetic.') + '</div>');
    return cards;
  }
  /* What 1 developer is equal to: the people of each role that one developer implies, for each approach, and their cost. */
  function roleTable(scope) {
    var d = scope === 'defaults', cur = state.currency;
    var rows = '<div class="rt' + (d ? ' nod' : '') + '"><span></span>' + (d ? '' : '<span class="th">Rate / hour <i>' + esc(curSym()) + '</i></span>') +
      '<span class="th os">OutSystems</span><span class="th">Alternative</span>';
    E.ROLES.forEach(function (r) {
      rows += '<span class="tl">' + esc(r.label) + '</span>' + (d ? '' : inp('rates.' + r.key, 1, 0, undefined, scope));
      rows += r.key === 'dev' ? '<span class="ro">1</span><span class="ro">1</span>' : inp('mix.os.' + r.key, 0.05, 0, undefined, scope) + inp('mix.alt.' + r.key, 0.05, 0, undefined, scope);
    });
    if (!d) {
      rows += '<span class="tl tot">People per developer</span><span></span><span class="ro" id="mp-os"></span><span class="ro" id="mp-alt"></span>' +
        '<span class="tl tot">Team cost per developer-hour</span><span></span><span class="ro" id="mc-os"></span><span class="ro" id="mc-alt"></span>' +
        '<span class="tl tot">Team cost per developer-week</span><span></span><span class="ro" id="mw-os"></span><span class="ro" id="mw-alt"></span>';
    }
    return rows + '</div>';
  }
  function costCards(scope) {
    var cur = state.currency, d = scope === 'defaults';
    var cards = card('What 1 developer is equal to',
      '<div class="note" style="margin:0 0 8px">The people of each role that one developer implies, for each approach, and what they cost. The team is costed while an application is being designed, built and fixed.</div>' +
      roleTable(scope) + '<div class="note">' + (d ? tt('Rates come from the country table under Reference tables below.') : tt('Rates start from the country\'s rate card (Rates tab) in {cur}.', { cur: esc(cur) })) + ' ' + tt('They are illustrative placeholders to be replaced with a validated rate card.') + '</div>');
    cards += card('Delivery team assumptions',
      row('Hours per week', inp('team.hours', 1, 1, 80, scope), 'Working hours per person per week that the team is costed for.') +
      row('Developers vs OutSystems <i>×</i>', inp('altDevFactor', 0.1, 0.1, 10, scope), '1 means the same number of developers. Above 1 means the alternative needs more developers to deliver the same applications.') +
      (d ? '' : '<div class="readout" id="teamReadout"></div>'));
    cards += card('Maintenance and enhancement', pairHead() + pairRow('Break/fix (% of build cost per year)', sp('maint.fix'), 1, 0, 200, scope) +
      pairRow('Enhancements (% of build cost per year)', sp('maint.enh'), 1, 0, 200, scope) +
      '<div class="note">' + tt('Looking after an application once it is live: fixing faults (break/fix) and making the changes the business asks for (enhancements), each as a share of its build cost every year. OutSystems is cheaper on both.') + '</div>');
    cards += card('AI tokens',
      (d ? '' : row('Token spend per app <i>' + esc(curSym()) + '</i>', inp('tokens.spend', 500, 0, undefined, scope), 'Current or projected AI build-token spend per application for the alternative.')) +
      row('After go-live (% of build token spend a year)', inp('tokens.runPct', 5, 0, 300, scope), 'AI tokens keep being used after go-live, for AI-assisted fixes and changes and for any model use inside the applications. This is the yearly spend as a share of the build spend. Placeholder to replace with measured figures.') +
      row('Token saving (%)', inp('tokens.saving', 1, 0, 100, scope), 'Placeholder (25%) to be validated, for example in a proof of concept.') +
      '<div class="note">Model-driven development is more constrained, so it should need fewer tokens. Treat the saving as an assumption until measured.</div>');
    if (!d) cards += card('OutSystems infrastructure', row('Infrastructure / yr <i>' + esc(curSym()) + '</i>', inp('infra.os', 5000, 0), 'Only if OutSystems is self-managed. OutSystems PaaS includes the infrastructure, so this is normally zero.') +
      '<div class="note">Normally zero: OutSystems PaaS includes the hosting.</div>');
    return cards;
  }

  /* A percentage input for the share of a line still needed with OutSystems (stored as a fraction). */
  function pctInp(path) {
    return '<input type="number" data-path="' + path + '" data-scope="state" data-pct="1" step="5" min="0" max="100" value="' + (Math.round(Number(getPath(path)) * 1000) / 10) + '"' +
      C.tip('Still needed with OutSystems', '0% means OutSystems makes this redundant (built in or included in the platform). 100% means it is still needed separately. In between, it is partly covered.') + '>';
  }
  /* The share input of a tooling or operating-people line: blue edge when the capability map sets it, orange when the user has set their own (clear the box to go back). */
  function shareInp(listKey, i) {
    var it = state[listKey][i], ms = E.mapShare(it, listKey === 'opsItems' ? 'ops' : 'tool'), viaMap = it.auto !== false && ms !== null, own = ms !== null && !viaMap;
    var tip = viaMap ? C.tip(tt('From the capability map'), tt('This share comes from the capability map: the part of the phase that OutSystems leaves to other tools and people, compared with the alternative. Type a number to use your own figure instead; clear the box to go back to the map.'))
      : own ? C.tip(tt('Your own figure'), tt('You have set this share yourself, so the capability map is not used for this line. Clear the box to go back to the map.'))
      : C.tip('Still needed with OutSystems', '0% means OutSystems makes this redundant (built in or included in the platform). 100% means it is still needed separately. In between, it is partly covered.');
    var path = listKey + '.' + i + '.os';
    return '<input type="number"' + (viaMap ? ' class="viamap"' : own ? ' class="ownshare"' : '') + ' data-path="' + path + '" data-scope="state" data-pct="1" data-share="1" step="5" min="0" max="100" value="' + (Math.round(Number(it.os) * 1000) / 10) + '"' + tip + '>';
  }
  function pctField(path) {
    return '<input type="number" data-path="' + path + '" data-scope="state" data-pct="1" step="5" min="0" max="200" value="' + (Math.round(Number(getPath(path)) * 1000) / 10) + '">';
  }
  function bdButtons(key, listKey) {
    return '<p><button class="b" data-act="item-add" data-list="' + listKey + '">Add line</button> <button class="b" data-act="bd-collapse" data-key="' + key + '">Back to a single total</button></p>';
  }
  /* Tooling or infrastructure: one amount per line for the alternative, and the share still needed with OutSystems. */
  function phaseSel(path, cur) {
    return '<select data-phasepath="' + path + '"' + C.tip(tt('Phase'), tt('The phase of the software lifecycle this line belongs to. It places the cost in that phase on Phase by phase, and sets the share still needed with OutSystems from the capability map.')) + '>' +
      D.PHASES.map(function (ph) { return '<option value="' + esc(ph.key) + '"' + (ph.key === cur ? ' selected' : '') + '>' + esc(tt(ph.key)) + '</option>'; }).join('') + '</select>';
  }
  function bdSimple(key, listKey, title, intro, items, nameHead) {
    var cur = state.currency;
    if (!items || !items.length) {
      return card(title, '<div class="note" style="margin:0 0 8px">' + intro + '</div><p>' + tt('Alternative: {a} a year · OutSystems: {o} a year', { a: '<b id="bd-' + key + '-t0"></b>', o: '<b id="bd-' + key + '-ot0"></b>' }) + '</p>' +
        '<p><button class="b pri" data-act="bd-expand" data-key="' + key + '">Break down</button></p>');
    }
    var infra = key === 'infra', tools = listKey === 'toolItems', tc = infra ? 't6' : tools ? 't5p' : 't5';
    var rows = '<div class="bd ' + tc + '"><span class="th">' + nameHead + '</span>' + (tools ? '<span class="th"' + C.tip(tt('Phase'), tt('The phase of the software lifecycle this line belongs to. It places the cost in that phase on Phase by phase, and sets the share still needed with OutSystems from the capability map.')) + '>' + tt('Phase') + '</span>' : '') + '<span class="th r">' + tt('Alternative, {c} a year', { c: esc(curSym()) }) + '</span><span class="th r">' + tt('Still needed with OutSystems %') + '</span>' + (infra ? '<span class="th r"' + C.tip('Also with ODC', 'Tick the services the organisation still needs from outside OutSystems whatever the hosting, such as an enterprise identity provider or an APM tool it runs anyway. They then cost the same on both sides, even with ODC managed by OutSystems.') + '>Also with ODC</span>' : '') + '<span class="th r">' + tt('OutSystems, {c} a year', { c: esc(curSym()) }) + '</span><span></span></div>';
    items.forEach(function (it, i) {
      rows += '<div class="bd ' + tc + '"><input type="text" data-tpath="' + listKey + '.' + i + '.name" value="' + esc(it.name) + '">' + (tools ? phaseSel(listKey + '.' + i + '.phase', E.linePhase(it, 'tool')) : '') + inp(listKey + '.' + i + '.annual', 1000, 0) + (listKey === 'toolItems' ? shareInp(listKey, i) : pctInp(listKey + '.' + i + '.os')) +
        (infra ? '<span style="text-align:center"><input type="checkbox" data-ext="' + i + '"' + (it.ext ? ' checked' : '') + '></span>' : '') +
        '<span class="ro" id="bd-' + key + '-oc' + i + '"></span><button class="b" data-act="item-del" data-list="' + listKey + '" data-i="' + i + '" title="Remove this line">×</button></div>';
    });
    rows += '<div class="bd ' + tc + '"><span class="tot" style="text-align:left">Total</span>' + (tools ? '<span></span>' : '') + '<span class="tot" id="bd-' + key + '-t"></span><span></span>' + (infra ? '<span></span>' : '') + '<span class="tot" id="bd-' + key + '-ot"></span><span></span></div>';
    return card(title, '<div class="note" style="margin:0 0 8px">' + intro + '</div><div class="appwrap">' + rows + '</div>' + bdButtons(key, listKey));
  }
  /* Operating people: FTE for the alternative by role, and the share still needed with OutSystems. */
  function bdOps(items) {
    var cur = state.currency, intro = tt('People who run and maintain the alternative\'s cloud services, as ongoing FTE. Each line is costed at its role\'s hourly rate.');
    if (!items || !items.length) {
      return card('Operating resources', '<div class="note" style="margin:0 0 8px">' + intro + '</div><p>' + tt('Alternative: {a} FTE · OutSystems: {o} FTE', { a: '<b id="bd-ops-t0"></b>', o: '<b id="bd-ops-ot0"></b>' }) + '</p>' +
        '<p><button class="b pri" data-act="bd-expand" data-key="ops">Break down</button></p>');
    }
    var roleOpts = function (sel) { return E.ALL_ROLES.map(function (r) { return '<option value="' + r.key + '"' + (r.key === sel ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join(''); };
    var rows = '<div class="bd t8"><span class="th">Resource</span><span class="th">Role (sets the rate)</span><span class="th r">Alt. FTE</span><span class="th r">Still needed with OutSystems %</span><span class="th r">' + tt('OutSystems FTE') + '</span><span class="th r">' + tt('Alt. {c} a year', { c: esc(curSym()) }) + '</span><span class="th r">' + tt('OutSystems {c} a year', { c: esc(curSym()) }) + '</span><span></span></div>';
    items.forEach(function (it, i) {
      rows += '<div class="bd t8"><input type="text" data-tpath="opsItems.' + i + '.name" value="' + esc(it.name) + '"><select data-rolepath="opsItems.' + i + '.role">' + roleOpts(it.role) + '</select>' +
        inp('opsItems.' + i + '.fte', 0.05, 0) + shareInp('opsItems', i) + '<span class="ro" id="bd-ops-of' + i + '"></span><span class="ro" id="bd-ops-ac' + i + '"></span><span class="ro" id="bd-ops-oc' + i + '"></span>' +
        '<button class="b" data-act="item-del" data-list="opsItems" data-i="' + i + '" title="Remove this line">×</button></div>';
    });
    rows += '<div class="bd t8"><span class="tot" style="text-align:left">Total</span><span></span><span class="tot" id="bd-ops-t"></span><span></span><span class="tot" id="bd-ops-ot"></span><span class="tot" id="bd-ops-tc"></span><span class="tot" id="bd-ops-otc"></span><span></span></div>';
    return card('Operating resources', '<div class="note" style="margin:0 0 8px">' + intro + '</div><div class="appwrap">' + rows + '</div>' + bdButtons('ops', 'opsItems'));
  }

  var ROLE_COLORS = { dev: 'var(--b3)', arch: 'var(--b2)', ux: 'var(--b1)', ba: 'var(--p1)', pm: 'var(--p2)', biz: 'var(--p3)', qa: 'var(--t2)', sec: 'var(--t3)', ops: 'var(--g2)' };
  var ROLE_WHY = {
    dev: 'Both approaches build with AI assistance, so a developer does similar work in a week. The difference is mostly time: the alternative needs the team for longer because of review queues, rejected work and rework.',
    arch: 'The alternative designs and owns its architecture across more tools and cloud services, so it needs more architect time for each developer.',
    ba: 'Analysis work is similar, with a little more where requirements are handed across more teams.',
    ux: 'Design work is similar for both approaches.',
    qa: 'More testing across a longer toolchain, plus re-testing after rejected work.',
    pm: 'More handoffs between more teams to coordinate, over a longer programme.',
    sec: 'Security review and testing covers more components and tools. With OutSystems much of it is built in.',
    ops: 'DevOps and release work for the pipeline and environments, which OutSystems provides built in.',
    biz: 'Stakeholder time over a longer programme with more review rounds.'
  };
var PHASE_COLORS = { ideate: 'var(--b1)', design: 'var(--b2)', build: 'var(--b3)', validate: 'var(--t2)', deploy: 'var(--p2)' };
  var teamMetric = 'cost';   // Team tab charts: 'cost' or 'days'
  function metricToggle() {
    return '<div class="seg mseg"><button type="button" data-teammetric="cost"' + (teamMetric === 'cost' ? ' class="on"' : '') + '>Cost</button><button type="button" id="tmdays" data-teammetric="days"' + (teamMetric === 'days' ? ' class="on"' : '') + '>Person-days</button></div>';
  }
  function metricFmt() {
    var days = teamMetric === 'days', n = function (v) { return Math.round(v).toLocaleString() + ' days'; };
    return days ? { fmt: n, fmtShort: function (v) { return Math.round(v).toLocaleString(); }, shareOf: 'total person-days', key: 'days', what: 'person-days' } : { fmt: C.money, fmtShort: C.moneyShort, shareOf: 'total delivery team cost', key: 'cost', what: tt('cost') };
  }
  /* How OutSystems saves effort in each skill area (the platform capabilities that take work away). The percentages in the model are placeholders; this says where the saving comes from. */
  var DOMAIN_HOW = {
    d1: 'Mentor can turn a written requirement or a description in plain language into a working first version (data model, screens, logic and roles), so analysts review something real early instead of writing and re-reading long specifications. The analysis itself still takes people. The saving is mostly in the feedback loop.',
    d2: 'Ready-made interface patterns and themes, and screens that are built and edited visually, mean the design and the working screen are the same thing. There is less hand-off from design to build and less rework.',
    d3: 'The architecture canvas and the platform\'s built-in layering, data model and dependency checks guide teams to reusable services, and the platform analyses the impact of a change. There is less to design and document from scratch, but real architecture decisions remain.',
    d4: 'Screens are built visually from a ready-made component library with responsive layouts that produce the web and mobile front end, so little front-end code, styling or build tooling is written or maintained by hand.',
    d5: 'Data models, actions and business logic are modelled visually and the platform generates and runs the code, including the database changes. Most of the effort moves from writing plumbing to describing the rule.',
    d6: 'Built-in connectors and wizards consume and expose REST, SOAP and database services with generated clients, so common integrations need little hand-written code. Unusual or custom systems still need real integration work.',
    d7: 'Agents and AI features can be added with built-in capabilities, and Mentor generates much of the application around them. The model, prompts and evaluation still need specialist work, so the saving is smaller here than elsewhere.',
    d8: 'Automated testing is supported with a behaviour-driven framework and components, and the platform checks dependencies and impact when something changes. Test design and exploratory testing remain. The saving is mainly less regression and environment effort.',
    d9: 'Security is built in (encrypted traffic, a web application firewall, and analysis of code for security, performance and architecture issues), and third-party scanners such as Veracode or Fortify can run before deployment. Policy decisions, reviews and sign-off still need people.',
    d10: 'One-click publish compiles the application, checks dependencies, updates database schemas and deploys to the chosen environment, replacing most hand-built pipelines and release scripts.',
    d11: 'On the OutSystems-hosted option the platform runs, scales, patches and monitors the cloud, so there is no cluster or environment to build and operate. If the organisation hosts it itself, much more of this work stays with it.',
    d12: 'Fewer hand-offs between front end, back end, data and operations, and a shorter plan, mean less to coordinate. Planning, stakeholders and risk management are still needed, so the saving follows the shorter schedule.'
  };
  var domCfg = null;
  /* Domain model configuration lives in one persistent element (an accordion, closed by default) so typing is not interrupted when the views re-render. */
  function domainConfig() {
    if (domCfg) return domCfg;
    var t = '<tr><th>Domain</th>' + E.PHASES.map(function (p) { return '<th>' + p.label + '</th>'; }).join('') + '<th>% less effort with OutSystems</th></tr>';
    E.DOMAINS.forEach(function (d) {
      t += '<tr><td' + C.tip(tt(d.label), tt(DOMAIN_HOW[d.key])) + '>' + esc(d.label) + '</td>' + E.PHASES.map(function (p) { return '<td>' + inp('domains.w.' + d.key + '.' + p.key, 0.5, 0) + '</td>'; }).join('') +
        '<td>' + inp('domains.r.' + d.key, 5, 0, 99) + '</td></tr>';
    });
    domCfg = document.createElement('details'); domCfg.className = 'acc';
    domCfg.innerHTML = '<summary>' + tt('Adjust the effort model') + '</summary><div class="note">' + tt('Weights: how the alternative\'s delivery effort is typically spread across domains and phases (relative numbers, they are scaled to 100%).') + ' ' +
      tt('Reduction: how much less effort OutSystems needs in that domain. The overall totals still come from the delivery model (time, developers, role mix); these settings decide where the difference falls. All values are placeholders to validate.') + '</div>' +
      '<div class="refwrap"><table class="cmp domcfg">' + t + '</table></div><button type="button" id="domReset" class="mini">Reset to the standard model</button>';
    domCfg.querySelector('#domReset').addEventListener('click', function () { state.domains = E.domainDefaults(); recalc(); });
    return domCfg;
  }
  function domainView(an, part) {
    var mf = metricFmt(), d = E.domainBreakdown(state, res, teamGroup), M = C.money, n0 = function (x) { return Math.round(x).toLocaleString(); }, pct = function (x) { return Math.round(x * 100) + '%'; };
    var phases = E.PHASES.map(function (p) { return { key: p.key, label: p.label, color: PHASE_COLORS[p.key] }; });
    var rows = d.rows.map(function (r) {
      var o = { key: r.key, label: r.label, alt: {}, os: {}, how: DOMAIN_HOW[r.key] ? tt(DOMAIN_HOW[r.key]) : '' };
      E.PHASES.forEach(function (p) { o.alt[p.key] = r.phases[p.key].alt[mf.key]; o.os[p.key] = r.phases[p.key].os[mf.key]; });
      return o;
    });
    var chart = C.domainBars({ go: function (dk, pk) { return 'team/model#domains.w.' + dk + '.' + pk; }, goRow: function (dk) { return 'team/model#domains.w.' + dk + '.*,domains.r.' + dk; }, rows: rows, phases: phases, altLabel: altShort(), label: tt('Delivery {what} by domain and phase', { what: mf.what }), fmt: mf.fmt, fmtShort: mf.fmtShort });
    var pchart = C.stacked({ cats: phases.map(function (p) { return { key: p.key, label: p.label, color: p.color, help: '', go: 'team/model#domains.w.*.' + p.key }; }),
      groups: [{ label: altShort(), values: E.PHASES.reduce(function (o, p) { o[p.key] = d.phases[p.key].alt[mf.key]; return o; }, {}) },
        { label: 'OutSystems', values: E.PHASES.reduce(function (o, p) { o[p.key] = d.phases[p.key].os[mf.key]; return o; }, {}) }], label: tt('Delivery {what} by phase', { what: mf.what }), fmt: mf.fmt, fmtShort: mf.fmtShort, shareOf: mf.shareOf });
    var t = '<tr><th>' + tt('Domain') + '</th><th>' + tt('{who} days', { who: an }) + '</th><th class="os">' + tt('OutSystems days') + '</th><th>' + tt('Less effort') + '</th><th>' + tt('{who} cost', { who: an }) + '</th><th class="os">' + tt('OutSystems cost') + '</th><th>' + tt('Difference') + '</th><th>' + tt('Edit') + '</th></tr>';
    d.rows.forEach(function (r) {
      t += '<tr><td>' + esc(tt(r.label)) + '</td><td>' + n0(r.alt.days) + '</td><td>' + n0(r.os.days) + '</td><td>' + pct(r.reduction) + '</td><td>' + M(r.alt.cost) + '</td><td>' + M(r.os.cost) + '</td><td>' + M(r.saving) + '</td><td class="edl">' +
        editLink('Weights', 'Go to how this skill area\'s effort is spread across the phases.', 'team/model#domains.w.' + r.key + '.*') + ' · ' + editLink('Reduction', 'Go to how much less effort OutSystems needs in this skill area.', 'team/model#domains.r.' + r.key) + '</td></tr>';
    });
    t += '<tr class="tot"><td>' + tt('All domains') + '</td><td>' + n0(d.total.alt.days) + '</td><td>' + n0(d.total.os.days) + '</td><td>' + pct(1 - d.total.os.days / Math.max(1e-9, d.total.alt.days)) + '</td><td>' + M(d.total.alt.cost) + '</td><td>' + M(d.total.os.cost) + '</td><td>' + M(d.total.alt.cost - d.total.os.cost) + '</td><td></td></tr>';
    /* by phase: the same totals by lifecycle phase */
    var pt = '<tr><th>' + tt('Phase') + '</th><th>' + tt('{who} days', { who: an }) + '</th><th class="os">' + tt('OutSystems days') + '</th><th>' + tt('Less effort') + '</th><th>' + tt('{who} cost', { who: an }) + '</th><th class="os">' + tt('OutSystems cost') + '</th><th>' + tt('Difference') + '</th><th>' + tt('Edit') + '</th></tr>';
    E.PHASES.forEach(function (p) {
      var x = d.phases[p.key];
      pt += '<tr><td>' + esc(tt(p.label)) + '</td><td>' + n0(x.alt.days) + '</td><td>' + n0(x.os.days) + '</td><td>' + pct(1 - x.os.days / Math.max(1e-9, x.alt.days)) + '</td><td>' + M(x.alt.cost) + '</td><td>' + M(x.os.cost) + '</td><td>' + M(x.alt.cost - x.os.cost) + '</td><td class="edl">' +
        editLink('Weights', 'Go to how much of the effort falls in this phase for each skill area.', 'team/model#domains.w.*.' + p.key) + '</td></tr>';
    });
    pt += '<tr class="tot"><td>' + tt('All phases') + '</td><td>' + n0(d.total.alt.days) + '</td><td>' + n0(d.total.os.days) + '</td><td>' + pct(1 - d.total.os.days / Math.max(1e-9, d.total.alt.days)) + '</td><td>' + M(d.total.alt.cost) + '</td><td>' + M(d.total.os.cost) + '</td><td>' + M(d.total.alt.cost - d.total.os.cost) + '</td><td></td></tr>';
    /* where the saving falls: skill area by phase */
    var mx = '<tr><th>' + tt('Skill area') + '</th>' + E.PHASES.map(function (p) { return '<th>' + esc(tt(p.label)) + '</th>'; }).join('') + '<th>' + tt('Total') + '</th><th>' + tt('Edit') + '</th></tr>';
    d.rows.forEach(function (r) {
      mx += '<tr><td>' + esc(tt(r.label)) + '</td>' + E.PHASES.map(function (p) { var c = r.phases[p.key]; return '<td>' + mf.fmtShort(c.alt[mf.key] - c.os[mf.key]) + '</td>'; }).join('') + '<td><b>' + mf.fmtShort(r.alt[mf.key] - r.os[mf.key]) + '</b></td><td class="edl">' + editLink('Weights', 'Go to how this skill area\'s effort is spread across the phases.', 'team/model#domains.w.' + r.key + '.*') + '</td></tr>';
    });
    mx += '<tr class="tot"><td>' + tt('All skill areas') + '</td>' + E.PHASES.map(function (p) { return '<td>' + mf.fmtShort(d.phases[p.key].alt[mf.key] - d.phases[p.key].os[mf.key]) + '</td>'; }).join('') + '<td>' + mf.fmtShort(d.total.alt[mf.key] - d.total.os[mf.key]) + '</td><td></td></tr>';
    var wide = function (h) { return h.replace('<div class="card">', '<div class="card" style="grid-column:1/-1">'); };
    var cardAt = function (name) {
      if (name === 'phases') return wide(card(teamMetric === 'days' ? 'Person-days by phase' : 'Cost by phase', metricToggle() + '<div class="bigchart">' + pchart + '</div>' + '<div class="note">' + tt('The same delivery effort split by phase, for each approach. OutSystems saves most in build, validate and deploy.') + '</div>')) +
        wide(card('Person-days and cost by phase', '<div class="refwrap"><table class="cmp">' + pt + '</table></div><div class="note">' + tt('The same totals as the role view, by phase of the lifecycle. How the effort is spread across the phases is an assumption: change it with Weights.') + '</div>'));
      return wide(card(tt('Delivery {what} by domain and phase', { what: mf.what }), metricToggle() + chart + '<div class="note">' + tt('Each domain shows two bars split by phase: the lighter upper bar is {alt}, the solid lower bar is OutSystems. Hover a segment for its cost. Biggest differences are usually in build, validate and deploy work that OutSystems provides or automates.', { alt: esc(altShort()) }) + '</div>')) +
        wide(card('By skill area', '<div class="refwrap"><table class="cmp">' + t + '</table></div><div class="note">' + tt('Same totals as the role view, spread across 12 skill areas. Each is costed at the rate of its closest role. The spread is an assumption to validate.') + '</div>')) +
        wide(card(tt('Where the saving falls'), '<div class="refwrap"><table class="cmp">' + mx + '</table></div><div class="note">' + tt('The saving with OutSystems ({what}) for each skill area in each phase.', { what: mf.what }) + '</div>'));
    };
    return cardAt(part);
  }
  var teamGroup = null;   // the delivery team shown on the Team tab (null = all together)
  var teamSub = 'roles';   // Team tab sub-tab: 'roles', 'phases', 'domains', 'model' or 'why'
  /* A link to where the figures behind a cell are changed. */
  function editLink(label, tipBody, go) { return '<a class="more" data-go="' + go + '"' + C.tip(tt(label), tt(tipBody)) + '>' + tt(label) + ' ›</a>'; }
  function renderTeam() {
    var host = $('cfg-team'); if (!host || !res) return;
    var tgs = E.ensureGroups(state); if (teamGroup && !tgs.some(function (g) { return g.id === teamGroup; })) teamGroup = null; if (tgs.length < 2) teamGroup = null;
    var b = E.roleBreakdown(state, res, teamGroup), M = C.money, an = esc(altShort());
    var n0 = function (x) { return Math.round(x).toLocaleString(); }, r2 = function (x) { return (Math.round(x * 100) / 100).toFixed(2); };
    var rows = '<tr><th>Role</th><th>' + an + ' person-days</th><th class="os">OutSystems person-days</th><th>Ratio</th><th>' + an + ' cost</th><th class="os">OutSystems cost</th><th' + C.tip(tt('Edit'), tt('Where the figures in this row are changed: how many of the role each developer implies, its hourly rate, and the developers, time and rate level of the whole team.')) + '>' + tt('Edit') + '</th></tr>';
    b.rows.forEach(function (row) {
      var f = row.factors, ratioCell;
      if (row.ratio === null) ratioCell = '<td>–</td>';
      else {
        var why = tt(ROLE_WHY[row.key]) + '\n\n' + tt('Why it is {r}×: the team is needed {t}× as long ({a} vs {o} active weeks per application), the alternative uses {d}× the developers', { r: r2(row.ratio), t: r2(f.time), a: f1(b.activeWeeks.alt), o: f1(b.activeWeeks.os), d: r2(f.devs) }) +
          (row.key === 'dev' ? '.' : ', ' + (f.mix === null ? tt('and OutSystems needs none of this role') : tt('and {m}× as many per developer ({pa} vs {po})', { m: r2(f.mix), pa: r2(row.alt.perDev), po: r2(row.os.perDev) })) + '.');
        ratioCell = '<td' + C.tip(tt('{role}: {r}× the OutSystems person-days', { role: tt(row.label), r: r2(row.ratio) }), why) + '>' + r2(row.ratio) + '×</td>';
      }
      rows += '<tr' + (row.key === 'dev' ? ' class="dev"' : '') + '><td>' + (row.key === 'dev' ? tt('Developer days') : esc(tt(row.label))) + '</td><td>' + n0(row.alt.days) + '</td><td>' + n0(row.os.days) + '</td>' + ratioCell +
        '<td>' + M(row.alt.cost) + '</td><td>' + M(row.os.cost) + '</td><td class="edl">' +
        (row.key === 'dev' ? editLink('Developers', 'Go to the developers on each application. The other roles follow from them through the role mix.', 'applications#projectList.*.devs')
          : editLink('Role mix', 'Go to how many of this role each developer implies, for each approach.', 'costs#mix.os.' + row.key + ',mix.alt.' + row.key)) +
        ' · ' + editLink('Rate', 'Go to this role\'s hourly rate.', 'costs#rates.' + row.key) + '</td></tr>';
    });
    rows += '<tr class="tot"><td>' + tt('Whole team') + '</td><td>' + n0(b.total.alt.days) + '</td><td>' + n0(b.total.os.days) + '</td><td' + C.tip(tt('Whole team: {r}×', { r: r2(b.ratio) }),
      'Total person-days for the alternative divided by OutSystems. It combines the longer time, any extra developers and the larger team mix.') + '>' + (b.ratio === null ? '–' : r2(b.ratio) + '×') + '</td><td>' + M(b.total.alt.cost) + '</td><td>' + M(b.total.os.cost) + '</td><td class="edl">' +
      editLink('Developers', 'Go to the developers on each application. The other roles follow from them through the role mix.', 'applications#projectList.*.devs') + ' · ' +
      editLink('Time', 'Go to the stages and gates that set how long the team is needed on each application.', 'delivery') + ' · ' +
      editLink('Rate level (%)', 'Go to the delivery team\'s rate level, or its given cost, which sets what the same person-days cost.', 'applications') + '</td></tr>';
    var table = '<div class="refwrap"><table class="cmp">' + rows + '</table></div><div class="note">' + tt('Person-days over the whole portfolio, at 8 hours a day. Hover a ratio for why it differs.') + ' ' +
      (anyQuote() ? tt('The OutSystems delivery cost you entered is shared out by role using the role mix.') : tt('Team: {devs} OutSystems developers per delivery team, over {m} months.', { devs: f1(E.avgDevs(state)), m: state.deliveryMonths })) + '</div>';
    var mf = metricFmt();
    var chart = metricToggle() + C.stacked({
      cats: E.ROLES.map(function (r) { return { key: r.key, label: r.label, color: ROLE_COLORS[r.key], help: ROLE_WHY[r.key], go: 'costs#rates.' + r.key }; }),
      groups: [{ label: altShort(), values: b.rows.reduce(function (o, r) { o[r.key] = r.alt[mf.key]; return o; }, {}) },
        { label: 'OutSystems', values: b.rows.reduce(function (o, r) { o[r.key] = r.os[mf.key]; return o; }, {}) }],
      label: tt('Delivery team {what} by role', { what: mf.what }), fmt: mf.fmt, fmtShort: mf.fmtShort, shareOf: mf.shareOf, sideLabels: true, height: 380
    });
    var linkA = function (tab, label) { return '<a data-gotab="' + tab + '" style="color:var(--text);text-decoration:underline;cursor:pointer">' + tt(label) + '</a>'; };
    var why = card('Why the alternative needs more',
      '<div class="fp"><div><b>' + tt('Time: {r}×', { r: r2(b.time) }) + '</b>' + tt('The team is needed {a} weeks per application against {o}, because of review queues, rejected work and rework (Stages and gates tab).', { a: f1(b.activeWeeks.alt), o: f1(b.activeWeeks.os) }) + '</div>' +
      '<div><b>' + tt('Developers: {r}×', { r: r2(b.devs) }) + '</b>' + tt('The alternative needs {r} developers for each OutSystems developer (Cost drivers tab).', { r: r2(b.devs) }) + '</div>' +
      '<div><b>' + tt('People per developer: {a} vs {o}', { a: r2(E.peoplePerDev(state, 'alt')), o: r2(E.peoplePerDev(state, 'os')) }) + '</b>' + tt('One developer implies these people of other roles, for each approach (What 1 developer is equal to, Cost drivers tab).') + '</div></div>' +
      '<div class="note">' + tt('Change the stages and gates on {delivery}, and the role mix and hourly rates on {costs}.', { delivery: linkA('delivery', 'Stages and gates'), costs: linkA('costs', 'Cost drivers') }) + '</div>');
    var wideC = function (h) { return h.replace('<div class="card">', '<div class="card" style="grid-column:1/-1">'); };
    var subs = [['roles', tt('By role')], ['phases', tt('By phase')], ['domains', tt('By skill and phase')], ['model', tt('Effort model')], ['why', tt('Why')]];
    var teamPick = tgs.length < 2 ? '<div class="note" style="margin:0 0 8px">' + tt('Delivery team: {name}. Add another delivery team on the Applications tab to compare teams here.', { name: '<b>' + esc(tgs[0].name) + '</b>' }) + '</div>' : '<div class="steps" id="teamgroups"' + C.tip(tt('Delivery team'), tt('Show the people and effort of one delivery team, or of all of them together. The comparison works the same way for each.')) + '><button class="st' + (teamGroup ? '' : ' on') + '" data-teamgroup="">' + tt('All delivery teams') + '</button>' + tgs.map(function (g) { return '<button class="st' + (g.id === teamGroup ? ' on' : '') + '" data-teamgroup="' + esc(g.id) + '">' + esc(g.name) + '</button>'; }).join('') + '</div>';
    var chips = teamPick + '<div class="steps sticky" id="teamsteps">' + subs.map(function (t2) { return '<button class="st' + (t2[0] === teamSub ? ' on' : '') + '" data-teamsub="' + t2[0] + '">' + t2[1] + '</button>'; }).join('') + '</div>';
    var body = teamSub === 'phases' ? sec('Effort by phase', domainView(an, 'phases'))
      : teamSub === 'domains' ? sec('Effort by skill area and phase', domainView(an, 'domains'))
      : teamSub === 'model' ? sec('Effort model', '<div id="dom-cfg-slot" style="grid-column:1/-1"></div>')
      : teamSub === 'why' ? sec('Why', why)
      : '<div class="cfgwrap">' + wideC(card(teamMetric === 'days' ? 'Person-days by role' : 'Cost by role', '<div class="bigchart">' + chart + '</div>')) + wideC(card('Person-days and cost by role', table)) + '</div>';
    host.innerHTML = page('Delivery team by role', 'The people each approach needs to deliver the portfolio, role by role, in person-days. The alternative needs more mainly because the team is needed for longer, and because it also needs more of some roles.', '', chips) + body;
    var slot = $('dom-cfg-slot'); if (slot) { var dc = domainConfig(); dc.open = true; slot.appendChild(dc); }
  }

  /* The Platform and infrastructure tab: platform and resources (OutSystems) against infrastructure, tooling and resources (the alternative). */
  var infraSub = 'compare';
  function buildInfra() {
    var cur = state.currency, d = 'state';
    var host = E.hostingOf(state), su = state.setup, onS = host === 'paas-sentry', onSelf = host === 'self';
    /* Capability matrix: the column headers pick the OutSystems configuration; each cell says whether it is included, an extra licence, or at the organisation's expense. */
    var cfgs = CFG_ROWS, ck = cfgKey(), ha = E.assuranceOn(state);
    var mcols = cfgs.slice(0, 3), grp = null, hasHA = E.assuranceOn(state);   // self-managed + assured is not a column of its own: the high-assurance rows say what it means
    var mrows = SK.matrix().map(function (r) {
      var head = '';
      if (r.group !== grp) {
        grp = r.group; var isHA = grp.indexOf('High assurance') === 0;
        head = '<tr class="grp' + (isHA ? ' ha' : '') + '"><td colspan="4">' + esc(grp) + (isHA ? (hasHA ? ' <i>on</i>' : '') : '') + '</td></tr>';
      }
      return head + '<tr><td' + C.tip(r.label, r.note || '') + '>' + esc(r.label) + '</td>' + mcols.map(function (c) {
        var m = SK.MARKS[r.marks[c[2]]], on = c[0] === 'self' ? host === 'self' : ck === c[0];
        return '<td class="mk ' + r.marks[c[2]] + (on ? ' on' : '') + '"' + C.tip(r.label + ' \u00b7 ' + c[1], m.label) + '>' + m.sym + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var mOpen = foldOpen.infraMatrix !== undefined ? foldOpen.infraMatrix : true;   // fold the matrix away to see the chart and the setup tick together
    /* The configuration picker stays visible whatever the details below are doing: each option shows its own ongoing cost, so switching shows the price change. */
    var picker = '<div class="cfgpick" role="group" aria-label="OutSystems configuration">' + [['paas', 'ODC (PaaS)', 'paas', 'sentry', 'Sentry'], ['self', 'ODC Self-managed', 'self', 'diy', '']].map(function (b) {
      var on = (b[0] === 'self') === (host === 'self');
      return '<button type="button" class="cp' + (on ? ' on' : '') + '" data-base="' + b[0] + '"><span class="cn">' + b[1] + '</span>' +
        '<span class="cl' + (on && !ha ? ' act' : '') + '">Standard <b id="cfgcost-' + b[2] + '"></b></span><span class="cl' + (on && ha ? ' act' : '') + '">High assurance' + (b[4] ? ' (' + b[4] + ')' : '') + ' <b id="cfgcost-' + b[3] + '"></b></span></button>';
    }).join('') + '<div class="hasw">' + assureCheck() + '<div class="note" id="ha-note" style="margin:0"></div></div></div>';
    var scenarios = '<details class="fold mtxfold" data-fold="infraMatrix"' + (mOpen ? ' open' : '') + '><summary><h4 class="sec">What each configuration includes</h4><span class="fsum">Hidden. The configuration above still applies.</span></summary><div class="refwrap"><table class="cmp mtx"><tr><th></th>' +
      mcols.map(function (c) { return '<th class="pick' + ((c[0] === 'self' ? host === 'self' : ck === c[0]) ? ' on' : '') + '" data-host="' + c[0] + '" role="button" tabindex="0">' + c[1] + '</th>'; }).join('') + '</tr>' + mrows + '</table></div>' +
      '<div class="mtxkey">' + Object.keys(SK.MARKS).map(function (k) { return '<span><b class="mk ' + k + '">' + SK.MARKS[k].sym + '</b> ' + SK.MARKS[k].label + '</span>'; }).join('') +
      '<span>Click a column heading to compare that configuration. Sentry is available on PaaS only; on self-managed you provide high assurance yourself.</span></div></details>';
    var compare = card('<span id="infra-title">Ongoing cost per year</span>', '<div class="note" style="margin:0 0 6px">Ongoing cost per year at full run, for the whole portfolio. The delivery team is separate (Cost drivers tab).</div>' +
      setupIncLabel(su.mode === 'included') + '<div class="cmpgrid"><div id="infra-chart"></div><div id="infra-table"></div></div>').replace('<div class="card">', '<div class="card" style="grid-column:1/-1">');
    var osCard = card(HOSTS[cfgKey()],
      row('Platform licence <i>' + esc(curSym()) + '</i> a year', '<div class="ro locked" id="ro-pos" data-go="panel#platform.os"' + C.tip('Edited in the inputs pane', 'This amount is set in the inputs pane on the left, so it has one place to change. Click to go there.') + '>' + C.money(Number(state.platform.os)) + '</div>', 'Annual OutSystems platform licence. It is the same whether OutSystems hosts it (PaaS) or the organisation does (self-managed); only the infrastructure, people and setup differ.') +
      (onS ? row('Additional Sentry licence <i>' + esc(curSym()) + '</i> a year', '<div class="ro locked" id="ro-psen" data-go="panel#platform.sentry"' + C.tip('Edited in the inputs pane', 'This amount is set in the inputs pane on the left, so it has one place to change. Click to go there.') + '>' + C.money(Number(state.platform.sentry)) + '</div>', 'The extra annual licence for the Sentry add-on, on top of the platform licence. It is charged only when Sentry is on, and Sentry is available on PaaS only. Placeholder (15% of the platform licence): to be replaced with the real price.') +
        '<div class="note" style="margin:0 0 6px">Sentry adds <b id="sentry-amt"></b> a year to the OutSystems licence.</div>' : '') +
      (onSelf ? '<div class="note">Self-managed: the organisation provides the cloud infrastructure and operating people. The infrastructure lines and operating resources below apply in full to OutSystems (adjust the "still needed with OutSystems" shares if some of it is not needed).</div>' +
        assureCheck() : '') +
      (host === 'paas' ? '<div class="note">' + tt('ODC PaaS: OutSystems provisions and runs the cloud, so there is no infrastructure cost, operating people or setup for you. Services you run whatever the hosting (the infrastructure lines ticked "Also with ODC", such as an identity provider and an APM tool) are counted under tooling and services instead, at {amt} a year, the same as on the traditional side.', { amt: C.money(E.externalAnnual(state)) }) + '</div>' : '') +
      (onS ? '<div class="note">Sentry is included in the OutSystems licence uplift above. The cost to match it on the traditional side is below.</div>' : ''));
    var osSetup = card(HOSTS[cfgKey()],
      (onSelf ? row('ODC install <i>' + esc(curSym()) + '</i>', inp('setup.os.self', 1000, 0), 'Placeholder (10,000 or equivalent): installing ODC itself is prescriptive and largely automated, so it is cheap. The cloud environment it runs on is separate (below).') +
        row('Cloud environment build needed (% of the cloud-native build)', inp('setup.os.envShare', 5, 0, 100), 'Self-managed ODC runs on a cloud environment the organisation builds: the cluster, network, landing zone, tooling and the team to build it. That is the same kind of work, and most of the cost (mainly labour), as the cloud-native alternative. 100% means the same build; lower it if the self-managed estate is smaller. The build costs are on the right.') +
        '<div class="note" style="margin:0 0 6px">Self-managed setup: <b id="osetup-amt"></b> (the install plus this share of the cloud environment build).</div>'
        : row('ODC setup <i>' + esc(curSym()) + '</i>', inp('setup.os.paas', 1000, 0), 'OutSystems provisions the cloud and everything is set up for you, so this is 0.')) +
      row('Spread over (weeks)', inp('setup.weeks.os', 1, 1, 156), 'The one-off setup cost is spread evenly over this many weeks from the start.'));
    var altSetup = card('Setup: build the cloud environment',
      '<div class="note" style="margin:0 0 6px">One-off cost to hire, design and build the cloud environment. It applies to the cloud-native alternative and, in the share set on the left, to self-managed ODC (PaaS does not need it). Counted only when "Include one-off setup costs" is ticked on the Compare tab.</div>' +
      row('Hiring and onboarding <i>' + esc(curSym()) + '</i>', inp('setup.alt.hiring', 10000, 0), 'Headhunter, HR and manager time, onboarding and external cloud-native consultants for the team.') +
      row('Build: team <i>' + esc(curSym()) + '</i>', inp('setup.alt.build', 10000, 0), 'Team salaries while building the infrastructure environment.') +
      row('Build: tools <i>' + esc(curSym()) + '</i>', inp('setup.alt.tools', 10000, 0), 'Cloud provider, licences, open-source tools and support during the build.') +
      row('Spread over (weeks)', inp('setup.weeks.alt', 1, 1, 156), 'The one-off setup cost is spread evenly over this many weeks from the start.'));
    var licSide = '<div class="sides"><div><h3 class="sec">' + esc(HOSTS[cfgKey()]) + '</h3><div class="cfgwrap one">' + osCard + '</div></div></div>';
    var sides = '<div class="sides"><div><h3 class="sec">' + esc(HOSTS[cfgKey()]) + '</h3><div class="cfgwrap one">' + osSetup + '</div></div>' +
      '<div><h3 class="sec">Traditional cloud native: setup</h3><div class="cfgwrap one">' + altSetup + '</div></div></div>';
    var wideCard = function (h) { return h.replace('<div class="card">', '<div class="card" style="grid-column:1/-1">'); };
    var tabs = [['compare', 'Compare'], ['box', 'What\'s in the box'], ['cloud', 'Cloud services'], ['people', 'People'], ['licence', 'Licence'], ['setup', 'Setup'], ['security', 'Security'], ['sdlc', 'Phase by phase']];
    var chipsHtml = '<div class="steps sticky" id="infrasteps">' + tabs.map(function (t2) { return '<button class="st' + (t2[0] === infraSub ? ' on' : '') + '" data-infra="' + t2[0] + '">' + t2[1] + '</button>'; }).join('') + '</div>';
    var body = '';
    if (infraSub === 'compare') body = '<div class="subhead"></div><h3 class="sec">Choose where OutSystems runs, and whether you need high assurance</h3>' + picker + '<div class="cfgwrap">' + compare + '</div>' + scenarios;
    else if (infraSub === 'box') body = '<div class="cfgwrap">' + stackCard() + outsideCard() + '</div>';
    else if (infraSub === 'cloud') body = '<div class="cfgwrap">' + wideCard(card('Cloud services', '<div class="note" style="margin:0 0 6px">' + tt('The cloud provider services a cloud-native build runs on, and (below) the tooling it assembles. These are the {infra} costs, separate from the people who run them (People tab).', { infra: '<b>' + tt('infrastructure') + '</b>' }) + ' ' + (E.hostingOf(state) === 'self' ? tt('With ODC self-managed the organisation provides the same estate, so each line applies at its "still needed" share.') : tt('With ODC the cloud estate is in the box: only the lines ticked "Also with ODC" (such as an identity provider and an APM tool) remain.')) + '</div><div class="subtotal">' + tt('Cloud services, traditional: {a} a year · ODC: {o} a year', { a: '<b id="cs-alt"></b>', o: '<b id="cs-os"></b>' }) + '</div>')) + '</div>' +
      sec('Cloud infrastructure', bdSimple('infra', 'infraItems', 'Cloud services by line',
        'The infrastructure bill at full run for the whole portfolio, one line per service. It grows as applications go live. A fuller breakdown can replace these lines.', state.infraItems, 'Cloud service')) +
      sec('Tooling', bdSimple('tools', 'toolItems', 'Tooling by capability layer',
        'The layers under a typical portal: security, data, integration, observability, workflow, authentication, governance, CI/CD and hosting, plus the AI-agent layers. The alternative has to assemble and pay for these; OutSystems provides many of them built in.', state.toolItems, 'Capability layer')) +
      '';
    else if (infraSub === 'people') body = '<div class="cfgwrap">' + wideCard(card('People: key roles', '<div class="note" style="margin:0 0 6px">' + tt('The people who build and run the cloud platform, as ongoing FTE by role. Each role is costed at its hourly rate for the chosen country: change the rates on the {link} tab, which now covers every role used here.', { link: '<a data-gotab="rates" style="color:var(--text);text-decoration:underline;cursor:pointer">' + tt('Rates') + '</a>' }) + ' ' + (E.hostingOf(state) === 'self' ? tt('With ODC self-managed the organisation needs a smaller team for the same estate (the "still needed" shares).') : tt('With ODC the platform is run by OutSystems, so these people are not needed.')) + '</div><div class="subtotal">' + tt('Key roles, traditional: {a} a year · ODC: {o} a year', { a: '<b id="pp-alt"></b>', o: '<b id="pp-os"></b>' }) + '</div>')) + '</div>' + sec('Operating resources', bdOps(state.opsItems));
    else if (infraSub === 'licence') body = licSide;
    else if (infraSub === 'setup') body = sides;
    else if (infraSub === 'security') body = '<div class="cfgwrap">' + appAssureCard() + assureCard() + '</div>';
    else if (infraSub === 'sdlc') body = sec('Phase by phase', sdlcCards());
    $('cfg-infrastructure').innerHTML = page('Platform vs infrastructure',
      'Always two sides: traditional cloud native, and the OutSystems configuration you choose. Cloud services (what you pay the cloud provider) and people (the key roles that run them) are shown separately.', '', chipsHtml) + body;
    renderInfraCompare();
  }

  /* Capability coverage across the software delivery lifecycle (from an SDLC comparison of the two approaches): native / assisted / external. */
  var SDLC_NAMES = { N: 'Native', A: 'Assisted', E: 'External' }, sdlcOpen = {};
  /* The capabilities of a phase for one approach, grouped as native, assisted and external. */
  /* What each approach does and does not do in a phase, in a few plain sentences (the hover text on a coverage bar). */
  function phaseStory() {
    return {
      p0_ai: tt('AI coding tools are strong at early thinking: researching the business, judging feasibility and producing quick prototypes. They help write requirements and stories, but they do not discover how the business really works, which still depends on people and other tools.'),
      p0_os: tt('OutSystems is not a discovery tool. Understanding the business problem, writing requirements and mapping processes happen before and outside the platform. It does help turn an idea into a working prototype quickly.'),
      p1_ai: tt('AI tools help with every part of design, from user journeys to architecture, data models, integrations, workflows, agents and security, but they only assist: a person still makes and checks the decisions, and nothing enforces them afterwards.'),
      p1_os: tt('OutSystems builds design into the platform: architecture, data models, integrations, workflows, agents and access rules are defined as part of the application. Only the user experience is assisted rather than built in, because good design still needs people.'),
      p2_ai: tt('AI coding tools generate the interface, logic, data layer, integrations, workflows and agents directly as code, and they can coordinate other tools in the toolchain. The result is code that the team must then review, test and secure.'),
      p2_os: tt('OutSystems builds the interface, logic, data, integrations, workflows and agents on one platform with AI assistance, so most of the work is done in one place. Coordinating tools outside the platform is assisted, not built in.'),
      p3_ai: tt('AI tools write functional and integration tests well and help with regression, performance, code quality and AI safety checks. Security review and penetration testing remain largely with specialist tools and people.'),
      p3_os: tt('OutSystems checks code quality, AI evaluations and guardrails itself, and assists with functional, integration, regression and security testing. Performance testing and penetration testing are left to external tools.'),
      p4_ai: tt('AI tools manage dependencies and help with version control, pipelines, configuration and rollback, but environments, releases and approvals still depend on separate tools and processes that the organisation must run.'),
      p4_os: tt('OutSystems covers deployment itself: version control, pipelines, environments, releases, configuration, dependencies and rollback are built in. Approvals and promotion between environments are assisted.'),
      p5_ai: tt('AI coding tools do not run or watch applications. Hosting, scaling, monitoring, logs, tracing, model and cost monitoring, and incident management all need other platforms and teams.'),
      p5_os: tt('OutSystems runs the application and watches it: hosting, scaling, availability, monitoring, logs, tracing and AI cost monitoring are built in. Incident management is assisted, with people still responding.'),
      p6_ai: tt('AI tools make changes and refactor code well, and help assess impact, manage technical debt, upgrade dependencies and read user feedback. Managing the application\'s lifecycle over the years is left to other tools and people.'),
      p6_os: tt('OutSystems supports ongoing change: impact analysis, enhancements, refactoring, technical debt, upgrades and the application lifecycle are handled in the platform. Making sense of user feedback is assisted.'),
      p7_ai: tt('AI tools can follow architecture standards and help with enterprise context and security controls, but identity, permissions, governance, compliance, audit and observability must be provided separately.'),
      p7_os: tt('OutSystems provides enterprise trust and control itself: context, standards, security, identity and permissions, governance, compliance, audit and observability are part of the platform.')
    };
  }
  /* The delivery-clock stages each SDLC phase adds weeks to, and where those times are edited. Phases before an application starts or after it is live have none. */
  var PHASE_TIME = { Design: 'stages.design.', Build: 'stages.build.', Validate: null, Deploy: 'stages.deploy.', 'Enterprise trust & control': null };   // phases that sit on the delivery clock, and where their weeks are changed
  function phaseWeeks(phase, ap) {   // each stage and review gate belongs to one phase (see AVASdlc.phaseOfStage)
    if (!(phase.key in PHASE_TIME)) return null;
    var w = 0;
    E.typicalTime(state, ap, typicalMonths).parts.forEach(function (pt) { if (D.phaseOfStage(pt.key, pt.gate) === phase.key) w += pt.weeks; });
    return w;
  }
  function phaseWait(phase, ap) {   // the part of a phase's weeks that does not grow with the application: waiting in queues, and releasing
    var w = 0; E.typicalTime(state, ap, typicalMonths).parts.forEach(function (pt) { if (D.phaseOfStage(pt.key, pt.gate) === phase.key) w += pt.fixed; });
    return w;
  }
  function phaseGo(phase, ap) { return PHASE_TIME[phase.key] ? 'delivery#' + PHASE_TIME[phase.key] + ap : 'delivery'; }
  /* One single-colour bar per phase and approach: its length is the typical weeks the phase adds to the time to production. */
  function timeBar(phase, ap, maxW) {
    var who = ap === 'alt' ? altLabel() : 'OutSystems', w = phaseWeeks(phase, ap);
    if (w === null) return '<span class="tm none"' + C.tip(phase.key + ' · ' + tt(who), tt('This phase is not on the delivery clock: it happens before an application starts or after it is live, so it adds no weeks to the time to production.')) + '>' + tt('not timed') + '</span>';
    return '<span class="tm" data-go="' + phaseGo(phase, ap) + '"' + C.tip(phase.key + ' · ' + tt(who), tt('About {n} weeks per application in this phase, including waits for review and fixes. Click to change the times.', { n: f1(w) }) + (phaseWait(phase, ap) > 0.05 ? '\n\n' + tt('Of this, {n} weeks is waiting (review queues) or releasing, which takes about as long whatever the size of the application. The rest is work, and grows with size.', { n: f1(phaseWait(phase, ap)) }) : '')) +
      '><i style="width:' + Math.max(2, w / Math.max(1e-9, maxW) * 100).toFixed(1) + '%;background:var(--' + (ap === 'alt' ? 'alt' : 'os') + ')"></i><b>' + tt('{n} wk', { n: f1(w) }) + '</b></span>';
  }
  /* One row per capability of a phase, the two approaches side by side, each rated and explained in a tooltip. */
  function capTable(phase) {
    var cls = { N: 'n', A: 'a', E: 'e' }, chip = function (cap, idx, col) {
      var r = cap[idx];
      return '<span class="cch ' + cls[r] + '"' + C.tip(cap[0] + ' · ' + (col === 'ai' ? altLabel() : 'OutSystems') + ': ' + SDLC_NAMES[r].toLowerCase(), (D.why(cap[0], col) || '') + (cap[0] === 'Security Review & Testing' && col === 'ai' ? ' ' + R2.cite(['veracode2025']) : '')) + '>' + SDLC_NAMES[r] + '</span>';
    };
    return '<table class="capt">' +   // no heading row: the columns are already named by the table above
      phase.caps.map(function (cap) { return '<tr><td>' + esc(cap[0]) + '</td><td>' + chip(cap, 1, 'ai') + '</td><td>' + chip(cap, 2, 'os') + '</td></tr>'; }).join('') + '</table>';
  }
  /* The tooling and operating people behind each SDLC phase, per year at full run: the alternative's amounts and what is still needed with OutSystems. One map serves
   * the cost table and the resources view, so both always agree. hostAware leaves out OutSystems' operating people unless it is self-managed (PaaS needs none). */
  function sdlcRunMap(hostAware) {
    var map = {}, self = E.hostingOf(state) === 'self', osS = function (it) { var x = parseFloat(it.os); return isFinite(x) ? Math.min(1, Math.max(0, x)) : 1; };
    function get(ph) { return map[ph] = map[ph] || { a: 0, o: 0, ta: 0, to: 0, sa: 0, so: 0, pa: 0, po: 0, fa: 0, fo: 0, ti: [], ai: [], pi: [], roles: {} }; }
    (state.toolItems || []).forEach(function (it, i) {
      var x = get(E.linePhase(it, 'tool')), a = Number(it.annual), o = a * osS(it);
      x.a += a; x.o += o; x.ta += a; x.to += o; x.ti.push(i);
    });
    (state.appAssure || []).forEach(function (it, i) {   // penetration testing and accreditation: always needed, on both sides
      var x = get(it.phase || 'Enterprise trust & control'), a = Number(it.annual), o = a * osS(it);
      x.a += a; x.o += o; x.sa += a; x.so += o; x.ai.push(i);
    });
    (state.opsItems || []).forEach(function (it, i) {
      var x = get(E.linePhase(it, 'ops')), per = Number(state.team.hours) * 52 * (state.rates[it.role] !== undefined ? state.rates[it.role] : state.rates.ops);
      var a = Number(it.fte) * per, o = Number(it.fte) * osS(it) * per, keep = hostAware && !self ? 0 : 1;
      x.a += a; x.o += o * keep; x.pa += a; x.po += o * keep; x.fa += Number(it.fte); x.fo += Number(it.fte) * osS(it) * keep; x.pi.push(i);
      x.roles[state.rates[it.role] !== undefined ? it.role : 'ops'] = 1;
    });
    return map;
  }
  /* The resources a phase needs over the analysis period, for one approach: the delivery team's effort, AI tokens, and the tooling and operating people that run it. */
  var DELIVERY_PHASE = { Ideate: 'ideate', Design: 'design', Build: 'build', Validate: 'validate', Deploy: 'deploy' };
  function phaseResources(ph, ap, cp) {   // everything the model costs, shared out by phase (E.costByPhase), so the phases add up to the cost totals
    var x = cp[ap].phases[ph.key] || { total: 0, cats: {}, eff: {}, effort: 0, fte: 0 };
    return { eff: x.eff, effort: x.effort, fte: x.fte, cats: x.cats, total: x.total };
  }
  /* Phase by phase has two scopes, each with a Time and a Cost view:
   *   Typical application: Time = the weeks each phase adds to one application; Cost = the average cost of one application (the portfolio's cost in the phase divided by the applications).
   *   Over X years:        Time = the person-days of work (delivery team and operating people); Cost = every cost, in the phase it belongs to. */
  var sdlcScope = 'app', sdlcMeasure = 'time', typicalMonths = 1;   // the typical application is this many months of OutSystems build
  var RES_CATS = [['team', 'Delivery team'], ['tokens', 'AI tokens'], ['run', 'Run & maintenance'], ['platform', 'Licences'], ['tooling', 'Tooling and services'], ['infra', 'Infrastructure'], ['ops', 'Operating people'], ['assure', 'Security and compliance'], ['setup', 'Setup (one-off)']];
  function sdlcCp() { return E.costByPhase(state, res, sdlcScope === 'app' ? typicalMonths : 0); }   // the cost of every phase for the scope in view
  function monthsText(n) { return n === 1 ? tt('{n} month', { n: n }) : tt('{n} months', { n: n }); }
  function sdlcValue(ph, ap, cp) {   // the number a bar shows; null when the phase is not on the delivery clock
    if (sdlcScope === 'app' && sdlcMeasure === 'time') return phaseWeeks(ph, ap);
    var r = phaseResources(ph, ap, cp);
    return sdlcMeasure === 'effort' ? r.effort : r.total;
  }
  function sdlcText(v) { return sdlcMeasure === 'time' ? tt('{n} wk', { n: f1(v) }) : sdlcMeasure === 'effort' ? tt('{n} days', { n: Math.round(v).toLocaleString() }) : C.moneyShort(v); }
  function resBar(ph, ap, maxR, cp) {
    var r = phaseResources(ph, ap, cp), M = C.moneyShort, who = ap === 'alt' ? altLabel() : 'OutSystems', yrs = Math.max(1, Number(state.horizon) || 1), days = sdlcMeasure === 'effort', v = sdlcValue(ph, ap, cp);
    if (v < (days ? 0.5 : 1) && sdlcScope === 'app' && (ph.key === 'Operate' || ph.key === 'Evolve')) return '<span class="tm none"' + C.tip(ph.key + ' · ' + tt(who), tt('Running the platform and looking after live applications are shared between applications, so they belong to the whole portfolio: see Over X years.')) + '>' + tt('shared') + '</span>';
    if (v < (days ? 0.5 : 1)) return '<span class="tm none"' + C.tip(ph.key + ' · ' + tt(who), days ? tt('No person-days are modelled for this phase with this approach. Tooling and AI tokens are money only: switch to Cost to see them.') : tt('Nothing is costed in this phase with this approach.')) + '>' + (days ? tt('no person-days') : tt('nothing extra')) + '</span>';
    var pd = function (n) { return tt('{n} person-days', { n: Math.round(n).toLocaleString() }); }, lines = [];
    RES_CATS.forEach(function (c) {
      var amt = r.cats[c[0]] || 0, d = r.eff[c[0]] || 0;
      if (days ? !(d >= 0.5) : !(amt > 0)) return;
      var extra = c[0] === 'ops' ? tt('{n} FTE', { n: f1(r.fte) }) + ' · ' : '';
      lines.push(tt(c[1]) + ': ' + (days ? extra + pd(d) : (d >= 0.5 ? pd(d) + ' · ' : '') + M(amt)));
    });
    var one = sdlcScope === 'app', head = days ? (one ? tt('About {n} person-days of work to reach production.', { n: Math.round(v).toLocaleString() }) : tt('About {n} person-days of work over {yrs} years.', { n: Math.round(v).toLocaleString(), yrs: yrs }))
      : one ? tt('About {amt} to reach production, from the costs listed below.', { amt: M(v) }) : tt('About {amt} over {yrs} years, from every cost listed below.', { amt: M(v), yrs: yrs });
    var top = null; RES_CATS.forEach(function (c) { var amt = (days ? r.eff[c[0]] : r.cats[c[0]]) || 0; if (amt > 0 && (!top || amt > top.amt)) top = { cat: c[0], amt: amt }; });   // the biggest part of the bar: its inputs are where a click goes
    var go = days ? phaseGo(ph, ap) : (top && costGo(top.cat, ap === 'alt' ? 0 : 1)) || phaseGo(ph, ap);
    var tip = C.tip(ph.key + ' · ' + tt(who), head + '\n\n' + lines.join('\n') + (days ? '\n\n' + tt('Licences, tooling, cloud and AI tokens are money only: see Cost.') : '') + '\n\n' + tt('Click to change the figures behind it.'));
    return '<span class="tm" data-go="' + go + '"' + tip + '><i style="width:' + Math.max(2, v / Math.max(1e-9, maxR) * 100).toFixed(1) + '%;background:var(--' + (ap === 'alt' ? 'alt' : 'os') + ')"></i><b>' + sdlcText(v) + '</b></span>';
  }
  function sdlcInner() {
    if (sdlcScope === 'port' && sdlcMeasure === 'time') sdlcMeasure = 'effort';   // elapsed weeks are only meaningful for one application
    var timed = sdlcScope === 'app' && sdlcMeasure === 'time', yrs = Math.max(1, Number(state.horizon) || 1);
    var rows = '<tr><th style="text-align:left">Phase</th><th>' + esc(altLabel()) + '</th><th>OutSystems</th></tr>', maxW = 0, cp = timed ? null : sdlcCp(), tot = { alt: 0, os: 0 };
    D.PHASES.forEach(function (ph) {
      ['alt', 'os'].forEach(function (ap) {
        var w = sdlcValue(ph, ap, cp);
        if (w !== null) { tot[ap] += w; if (w > maxW) maxW = w; }   // the phases add up to the headline: the time to production of one application, or the total over the period
      });
    });
    D.PHASES.forEach(function (ph) {
      var open = !!sdlcOpen[ph.key], idx = D.PHASES.indexOf(ph);
      rows += '<tr class="phr' + (open ? ' open' : '') + '" data-sdlc="' + esc(ph.key) + '"><td><span class="car">' + (open ? '▾' : '▸') + '</span> ' + esc(ph.key) + ' <i class="cnt">' + ph.caps.length + '</i></td><td>' +
        (timed ? timeBar(ph, 'alt', maxW) : resBar(ph, 'alt', maxW, cp)) + '</td><td>' + (timed ? timeBar(ph, 'os', maxW) : resBar(ph, 'os', maxW, cp)) + '</td></tr>' +
        '<tr class="phd" data-sdlcd="' + esc(ph.key) + '"' + (open ? '' : ' hidden') + '><td colspan="3">' +
        '<div class="phs"><b>' + esc(altLabel()) + '</b> ' + phaseStory()['p' + idx + '_ai'] + '</div><div class="phs"><b>OutSystems</b> ' + phaseStory()['p' + idx + '_os'] + '</div>' + capTable(ph) + '</td></tr>';
    });
    rows += '<tr class="tot"><td>' + tt('Total') + '</td><td><b>' + sdlcText(tot.alt) + '</b></td><td><b>' + sdlcText(tot.os) + '</b></td></tr>';
    var btn = function (attr, val, on, label) { return '<button class="st' + (on ? ' on' : '') + '" data-' + attr + '="' + val + '">' + label + '</button>'; };
    var heads = { 'app/time': tt('Typical application: the weeks each phase adds to time to production'),
      'app/cost': tt('Typical application: its cost to reach production, by phase'),
      'app/effort': tt('Typical application: the person-days of work to reach production, by phase'),
      'port/effort': tt('Over {yrs} years: the person-days of work in each phase', { yrs: yrs }),
      'port/cost': tt('Whole portfolio: every cost over {yrs} years, by the phase it belongs to', { yrs: yrs }) };
    var notes = { 'app/time': tt('The typical time each phase adds to an application, for each approach. Click a bar to change the times behind it; click a phase to see the capabilities that explain the difference, and which are native, assisted or external for each approach.'),
      'app/cost': tt('What it costs to get one typical application into production, in each phase: its delivery team and AI build tokens, scaled to its size, and its share of the per-application security work (penetration testing, accreditation). Running costs are shared between applications, so they are under Over X years. Hover a bar to see what it is made of; click a phase to see the capabilities that explain the difference.'),
      'app/effort': tt('The work to get one typical application into production, in person-days: its delivery team. Running and looking after applications are shared, so they are under Over X years. Click a phase to see the capabilities that explain the difference.'),
      'port/effort': tt('The work each phase needs, in person-days: the delivery team, looking after the applications, the operating people who run them, and the people who provide security. Licences, tooling, cloud and AI tokens are money only, so they appear under Cost. Click a phase to see the capabilities that explain the difference.'),
      'port/cost': tt('Every cost of each approach over the analysis period, placed in the phase it belongs to, so the phases add up to the total cost: building (delivery team, AI tokens), running (platform, tooling, cloud, operating people, security) and looking after the applications. Hover a bar to see what it is made of; click a phase to see the capabilities that explain the difference.') };
    var mbtn = function (val, label, tip) { return '<button class="st' + (sdlcMeasure === val ? ' on' : '') + '" data-sdlcmeasure="' + val + '"' + C.tip(tt(label), tt(tip)) + '>' + tt(label) + '</button>'; };
    var key = sdlcScope + '/' + sdlcMeasure, size = '';
    if (sdlcScope === 'app') {   // how big the typical application is: its build time with OutSystems; the time to production of each approach follows
      var wk = function (ap) { return monthsText(Math.round(E.typicalTime(state, ap, typicalMonths).total * 12 / E.WPY * 10) / 10); };
      size = '<div class="typsize"><span' + C.tip(tt('Typical application'), tt('How big the typical application is: its build time with OutSystems. The alternative is given the same amount of work, so it takes longer. Work grows with size (design, build, fixes, integration testing and testing at the review gates); waiting in review queues and releasing stay the same.')) + '>' + tt('Build time with OutSystems') + '</span> ' +
        '<button type="button" class="b" data-typ="-1" aria-label="-">−</button> <b>' + monthsText(typicalMonths) + '</b> <button type="button" class="b" data-typ="1" aria-label="+">+</button>' +
        '<span class="typtp">' + tt('Time to production: {alt} {a} · OutSystems {o}', { alt: esc(altShort()), a: wk('alt'), o: wk('os') }) + '</span></div>';
    }
    if (sdlcScope === 'port') {   // the whole portfolio has one schedule: from the start to the last go-live
      var span = function (ap) { var w = 0; res[ap].projects.forEach(function (p) { if (p.goLive > w) w = p.goLive; }); return monthsText(Math.round(w * 12 / E.WPY * 10) / 10); };
      size = '<div class="typsize"><span class="typtp" style="margin-left:0">' + tt('Time to deliver the portfolio: {alt} {a} · OutSystems {o}', { alt: esc(altShort()), a: span('alt'), o: span('os') }) + '</span></div>';
    }
    return '<div class="steps sdlcview">' + btn('sdlcview', 'app', sdlcScope === 'app', tt('Typical application')) + btn('sdlcview', 'port', sdlcScope === 'port', tt('Over {yrs} years', { yrs: yrs })) + '</div>' +
      '<div class="steps sdlcview sub">' + mbtn('effort', 'Effort', 'The work, shown in days (person-days: one person working for one day): the delivery team, looking after the applications, the operating people and the people who provide security. Licences, tooling, cloud and AI tokens cost money but have no person-days.') + mbtn('cost', 'Cost', 'Everything that costs money, in the phase it belongs to.') + (sdlcScope === 'app' ? mbtn('time', 'Time', 'Calendar weeks from the start of an application to go-live, including waiting in review queues. Waiting is not charged, but it delays the value.') : '') + '</div>' +
      size + '<h5 class="sdlchead">' + heads[key] + '</h5><div class="note sdlcnote">' + notes[key] + (key === 'app/time' ? ' ' + tt('Work grows with the size of the application; waiting in review queues and releasing do not, so a phase that is mostly waiting grows less. Bars are drawn against the longest phase.') : '') + '</div>' +
      '<div class="refwrap"><table class="cmp sdlc">' + rows + '</table></div>';
  }
  var sdlcLast = '';
  function refreshSdlc(force) {
    var hosts = document.querySelectorAll('.sdlc-wrap'); if (!hosts.length) return;
    var h = sdlcInner(); if (h === sdlcLast && !force) return;
    sdlcLast = h; Array.prototype.forEach.call(hosts, function (x) { x.innerHTML = h; });
    var nh = capNotesInner(); document.querySelectorAll('.capnotes').forEach(function (x) { x.innerHTML = nh; });
  }
  /* The notes beside the capability table: a takeaway from the live ratings, the technology footprint, and how to read the table. */
  function capNotesInner() {
    var n = 0, nA = 0, nO = 0, eA = 0, eO = 0, F = D.FOOTPRINT, fp = function (f) { return '<div><b>' + tt(f.label) + '</b>' + tt('{c} technology components · {s} skill domains · {h} handoffs', { c: f.components, s: f.skills, h: f.handoffs }) + '</div>'; };
    D.PHASES.forEach(function (ph) { ph.caps.forEach(function (c) { n++; if (c[1] === 'N') nA++; if (c[2] === 'N') nO++; if (c[1] === 'E') eA++; if (c[2] === 'E') eO++; }); });
    return '<div class="box take"><h4>' + tt('Takeaway') + '</h4>' + esc(tt('OutSystems provides {o} of {n} capabilities natively against {a} for {alt}, and leaves {eo} to other tools and people against {ea}. Where the alternative leaves a capability to other tools and people, that is where its extra time, tooling and operating people come from.', { o: nO, n: n, a: nA, alt: altLabel(), eo: eO, ea: eA })) + '</div>' +
      '<div class="box"><h4>' + tt('Technology footprint') + '</h4><div class="fp">' + fp(F.typical) + fp(F.ai) + fp(F.os) + '</div></div>' +
      '<div class="box"><h4>' + tt('How to read this') + '</h4>' + esc(tt('Each bar is one phase of the lifecycle. Time shows the weeks the phase adds to an application; Resources shows the people and tooling it needs over the analysis period. Click a bar, or a figure under it, to change what is behind it, and click a phase to see which capabilities are native, assisted or left to other tools and people.')) + '</div>';
  }
  function sdlcCards(withFp) {
    sdlcLast = '';
    var F = D.FOOTPRINT, fp = function (f) { return '<div><b>' + tt(f.label) + '</b>' + tt('{c} technology components · {s} skill domains · {h} handoffs', { c: f.components, s: f.skills, h: f.handoffs }) + '</div>'; };
    var cov = card('Capability, time and resources by phase',
      '<div class="sdlc-wrap">' + sdlcInner() + '</div>' +
      (withFp === false ? '' : '<div class="fp">' + fp(F.typical) + fp(F.ai) + fp(F.os) + '</div>'));
    var cost = card('Cost by phase: whole portfolio',
      '<div class="note" style="margin:0 0 6px">' + tt('Every cost of each approach over the analysis period, by phase, for the whole portfolio, and what is still needed with OutSystems. Each tooling or people line\'s share follows the capability map, unless you have typed your own.') + '</div>' +
      '<div class="sdlc-cost"></div>');
    var one = card('Cost by phase: one typical application', '<div class="sdlc-cost-app"></div>');   // two tables, one for each scope, so it is always clear which is which
    var wide = function (h) { return h.replace('<div class="card">', '<div class="card" style="grid-column:1/-1">'); };
    return wide(cov) + wide(one).replace('class="card"', 'class="card fullonly-block"') + wide(cost).replace('class="card"', 'class="card fullonly-block"');
  }
  /* Cost by phase can show the inputs behind each row in place (the Edit column). Orange marks a figure that differs from the standard line of the same name, or a line that is not a standard one. */
  var sdlcEdit = false;
  function lineMark(html, listKey, it, field) {
    var dl = (DEFAULTS[listKey] || []).filter(function (d) { return d.name === it.name; })[0];
    var changed = !dl || Math.abs(Number(it[field]) - Number(dl[field])) > 1e-9;
    if (!changed) return html;
    var dv = dl ? (field === 'os' ? Math.round(Number(dl.os) * 100) + '%' : Number(dl[field]).toLocaleString('en-US')) : '';
    var tip = C.tip(tt('Changed from the default'), dl ? tt('The default for this line is {v}.', { v: dv }) : tt('This line is not one of the standard lines.'));
    return html.replace(/^<input /, '<input class="ovr"' + tip + ' ').replace(/ class="ovr"([^>]*) class="([^"]*)"/, ' class="ovr $2"$1');
  }
  /* The inputs behind each kind of cost in a phase row. A row's editor lists exactly the kinds of cost the row contains (from E.costByPhase), so what can be edited always matches
   * what the figure is made of: the delivery team (its applications), AI tokens, looking after the applications, the platform licence, cloud, security lines and one-off setup. */
  function sdlcCatEditor(k, cats) {
    var cur = esc(curSym()), out = '', has = function (c) { return !!(cats.alt[c] > 0 || cats.os[c] > 0); };
    var grp = function (title, body) { return '<div class="edgrp"><div class="edcat">' + esc(tt(title)) + '</div>' + body + '</div>'; };
    var one = function (label, input) { return '<div class="edline"><span class="edn" title="' + esc(label) + '">' + esc(label) + '</span>' + input + '<span></span></div>'; };
    var two = function (label, a, o) { return '<div class="edline"><span class="edn" title="' + esc(label) + '">' + esc(label) + '</span>' + a + o + '</div>'; };
    var h2 = '<div class="edline edh"><span></span><span>' + esc(altShort()) + '</span><span>OutSystems</span></div>';
    if (has('team')) out += grp('Delivery team', '<div class="edline"><a class="more" data-go="applications"' + C.tip(tt('Delivery team'), tt('The delivery team\'s cost comes from the applications (their size and team), the delivery times and the hourly rates.')) + '>' + tt('Applications') + ' ›</a></div>');
    if (k === 'Build' && has('tokens')) out += grp('AI tokens', one(tt('Token spend per application'), inp('tokens.spend', 500, 0)) + one(tt('Token saving with OutSystems (%)'), inp('tokens.saving', 1, 0, 100)));
    if (k === 'Operate' && has('tokens')) out += grp('AI tokens', one(tt('After go-live (% of build token spend a year)'), inp('tokens.runPct', 5, 0, 300)));
    if (has('run')) out += grp('Run & maintenance', h2 + two(tt('Break/fix (% of build cost a year)'), inp('maint.fix.alt', 1, 0, 200), inp('maint.fix.os', 1, 0, 200)) + two(tt('Enhancements (% of build cost a year)'), inp('maint.enh.alt', 1, 0, 200), inp('maint.enh.os', 1, 0, 200)));
    if (k === 'Operate' && has('platform')) {   // the licence only: the OutSystems platform and, when chosen, Sentry
      var pl = h2 + two(tt('Platform licence, {c} a year', { c: cur }), '<span></span>', inp('platform.os', 5000, 0));
      if (state.osHosting === 'paas-sentry' || E.hostingOf(state) === 'paas-sentry') pl += two(tt('Additional Sentry licence, {c} a year', { c: cur }), '<span></span>', inp('platform.sentry', 1000, 0));
      out += grp('Licences', pl);
    }
    if (has('tooling')) {   // tools and services besides the licence: each tooling line in the phase it is placed in, and the services run with any hosting (Operate)
      var tl = state.toolItems && state.toolItems.length, tg = '';
      if (k === 'Operate') {
        if (!tl) tg += h2 + two(tt('Tooling, {c} a year', { c: cur }), inp('platform.alt', 5000, 0), inp('osTooling', 5000, 0));
        if (E.externalAnnual(state) > 0) tg += one(tt('Services you run with any hosting'), '<a class="more" data-go="infrastructure/cloud#infraItems.*.annual"' + C.tip(tt('Services you run with any hosting'), tt('Cloud service lines ticked "Also with ODC", such as an identity provider and an APM tool, are paid whatever the hosting. They are counted here at the same cost as on the traditional side. Click to edit them under Cloud services.')) + '>' + esc(C.money(E.externalAnnual(state))) + ' ›</a>');
      }
      if (tl) state.toolItems.forEach(function (it, i) { if (E.linePhase(it, 'tool') === k) tg += '<div class="edline"><span class="edn" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' + inp('toolItems.' + i + '.annual', 1000, 0) + pctInp('toolItems.' + i + '.os') + '</div>'; });
      if (tg) out += grp('Tooling and services', tg);
    }
    if (k === 'Operate' && has('infra')) {
      if (state.infraItems && state.infraItems.length) out += grp('Infrastructure', state.infraItems.map(function (it, i) { return '<div class="edline"><span class="edn" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' + inp('infraItems.' + i + '.annual', 1000, 0) + pctInp('infraItems.' + i + '.os') + '</div>'; }).join(''));
      else out += grp('Infrastructure', h2 + two(tt('Infrastructure, {c} a year', { c: cur }), inp('infra.alt', 5000, 0), inp('infra.os', 5000, 0)));
    }
    if (k === 'Enterprise trust & control' && has('assure') && state.assureItems && state.assureItems.length)
      out += grp('Security and compliance', state.assureItems.map(function (it, i) { return '<div class="edline"><span class="edn" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' + (it.kind === 'people' ? inp('assureItems.' + i + '.fte', 0.05, 0) : inp('assureItems.' + i + '.annual', 1000, 0)) + pctInp('assureItems.' + i + '.os') + '</div>'; }).join(''));
    if (k === 'Deploy' && has('setup')) out += grp('Setup (one-off)', h2 + one(tt('Hiring and onboarding'), inp('setup.alt.hiring', 10000, 0)) + one(tt('Building the environment'), inp('setup.alt.build', 10000, 0)) + one(tt('Environment tools'), inp('setup.alt.tools', 10000, 0)) + two(tt('OutSystems setup: managed / self-managed'), inp('setup.os.paas', 1000, 0), inp('setup.os.self', 1000, 0)));
    return out;
  }
  function sdlcLineEditor(x) {
    var cur = esc(curSym()), out = '';
    var head = function (a, b) { return '<div class="edline edh"><span></span><span>' + a + '</span><span>' + b + '</span></div>'; };
    var nm = function (n) { return '<span class="edn" title="' + esc(n) + '">' + esc(n) + '</span>'; };
    var share = tt('Still needed with OutSystems %');
    if (x.ti.length) out += '<div class="edgrp">' + head(tt('Alternative, {c} a year', { c: cur }), share) + x.ti.map(function (i) {
      var it = state.toolItems[i];
      return '<div class="edline">' + nm(it.name) + lineMark(inp('toolItems.' + i + '.annual', 1000, 0), 'toolItems', it, 'annual') + shareInp('toolItems', i) + '</div>';
    }).join('') + '</div>';
    if (x.ai.length) out += '<div class="edgrp">' + head(tt('Alternative, {c} a year', { c: cur }), share) + x.ai.map(function (i) {
      var it = state.appAssure[i];
      return '<div class="edline">' + nm(it.name) + lineMark(inp('appAssure.' + i + '.annual', 1000, 0), 'appAssure', it, 'annual') + lineMark(pctInp('appAssure.' + i + '.os'), 'appAssure', it, 'os') + '</div>';
    }).join('') + '</div>';
    if (x.pi.length) out += '<div class="edgrp">' + head(tt('Alt. FTE'), share) + x.pi.map(function (i) {
      var it = state.opsItems[i];
      return '<div class="edline">' + nm(it.name) + lineMark(inp('opsItems.' + i + '.fte', 0.05, 0), 'opsItems', it, 'fte') + shareInp('opsItems', i) + '</div>';
    }).join('') + '</div>';
    return out;
  }
  /* Cost by phase for one typical application: what it takes to get it into production. Its size is set above (build time with OutSystems); nothing here is edited. */
  function renderSdlcCostApp() {
    var hosts = document.querySelectorAll('.sdlc-cost-app'); if (!hosts.length) return;
    var M = C.money, cp = E.costByPhase(state, res, typicalMonths);
    var th = function (cls, label, tipTitle, tipBody) { return '<th' + (cls ? ' class="' + cls + '"' : '') + C.tip(tipTitle, tipBody) + '>' + esc(label) + '</th>'; };
    var rows = '<tr>' + th('', tt('Phase'), tt('Phase'), tt('The phase of the software delivery lifecycle that each tooling line or operating role belongs to.')) +
      th('', altShort(), altShort(), tt('What the alternative costs in this phase.')) + th('os', 'OutSystems', 'OutSystems', tt('What OutSystems costs in this phase.')) +
      th('', tt('Difference'), tt('Difference'), tt('The alternative\'s cost less OutSystems\' cost for this phase: what OutSystems saves.')) +
      th('', tt('Still needed'), tt('Still needed'), tt('OutSystems\' cost as a share of the alternative\'s in this phase. 100% means no saving; 0% means OutSystems replaces it.')) + '</tr>', ta = 0, to = 0;
    var tipOf = function (x) { var lines = []; RES_CATS.forEach(function (c) { if (x && x.cats[c[0]] > 0) lines.push(tt(c[1]) + ': ' + M(x.cats[c[0]])); }); return lines.length ? C.tip(tt('Where it comes from'), lines.join('\n')) : ''; };
    D.PHASES.forEach(function (ph) {
      var xa = cp.alt.phases[ph.key], xo = cp.os.phases[ph.key], a = xa ? xa.total : 0, o = xo ? xo.total : 0, shared = (ph.key === 'Operate' || ph.key === 'Evolve') && !(a > 0) && !(o > 0);
      ta += a; to += o;
      rows += '<tr><td>' + esc(ph.key) + '</td>' + (shared ? '<td colspan="4"' + C.tip(ph.key, tt('Running the platform and looking after live applications are shared between applications, so they belong to the whole portfolio: see Over X years.')) + '><i>' + tt('shared: see the portfolio below') + '</i></td>'
        : '<td' + tipOf(xa) + '>' + M(a) + '</td><td' + tipOf(xo) + '>' + M(o) + '</td><td>' + M(a - o) + '</td><td>' + (a > 0 ? Math.round(o / a * 100) + '%' : '–') + '</td>') + '</tr>';
    });
    rows += '<tr class="tot"><td>' + tt('Total for one application') + '</td><td>' + M(ta) + '</td><td>' + M(to) + '</td><td>' + M(ta - to) + '</td><td>' + (ta > 0 ? Math.round(to / ta * 100) + '%' : '–') + '</td></tr>';
    var html = '<h5 class="sdlchead">' + tt('Typical application ({m}): its cost to reach production', { m: monthsText(typicalMonths) }) + '</h5><div class="note" style="margin:0 0 6px">' + tt('Change its size above, in the chart (build time with OutSystems). Nothing here is edited: its costs come from the delivery team, the AI build tokens and the per-application security work.') + '</div><div class="refwrap"><table class="cmp">' + rows + '</table></div>';
    Array.prototype.forEach.call(hosts, function (h) { h.innerHTML = html; });
  }
  function renderSdlcCost() {
    var hosts = document.querySelectorAll('.sdlc-cost'); if (!hosts.length) return;
    var yrs = Math.max(1, Number(state.horizon) || 1);
    renderSdlcCostApp();
    Array.prototype.forEach.call(document.querySelectorAll('.sdlc-cost-app'), function (h) { var c = h.closest && h.closest('.card'); if (c) c.style.display = sdlcScope === 'app' ? '' : 'none'; });   // only the table for the scope in view
    Array.prototype.forEach.call(hosts, function (h) { var c = h.closest && h.closest('.card'); if (c) c.style.display = sdlcScope === 'port' ? '' : 'none'; });
    var M = C.money, map = sdlcRunMap(false), cp = E.costByPhase(state, res, 0), one = false;
    var th = function (cls, label, tipTitle, tipBody) { return '<th' + (cls ? ' class="' + cls + '"' : '') + C.tip(tipTitle, tipBody) + '>' + esc(label) + '</th>'; };
    var rows = '<tr>' + th('', tt('Phase'), tt('Phase'), tt('The phase of the software delivery lifecycle that each tooling line or operating role belongs to.')) +
      th('', altShort(), altShort(), tt('What the alternative costs in this phase.')) +
      th('os', 'OutSystems', 'OutSystems', tt('What OutSystems costs in this phase.')) +
      th('', tt('Difference'), tt('Difference'), tt('The alternative\'s cost less OutSystems\' cost for this phase: what OutSystems saves.')) +
      th('', tt('Still needed'), tt('Still needed'), tt('OutSystems\' cost as a share of the alternative\'s in this phase. 100% means no saving; 0% means OutSystems replaces it.')) +
      (sdlcEdit ? th('', tt('Edit'), tt('Edit'), tt('Where the figures in this row are changed: the yearly cost and share of tooling, the people (FTE and share), and the hourly rates of their roles. The cost of people is their time multiplied by their rate.')) : '') + '</tr>', ta = 0, to = 0;
    var tipOf = function (x) {
      var lines = []; RES_CATS.forEach(function (c) { if (x && x.cats[c[0]] > 0) lines.push(tt(c[1]) + ': ' + M(x.cats[c[0]])); });
      return lines.length ? C.tip(tt('Where it comes from'), lines.join('\n')) : '';
    };
    D.PHASES.forEach(function (ph) {
      var k = ph.key, x = map[k] || { ti: [], ai: [], pi: [], roles: {} }, xa = cp.alt.phases[k], xo = cp.os.phases[k], a = xa ? xa.total : 0, o = xo ? xo.total : 0;
      ta += a; to += o;
      var link = function (label, tipBody, go) { return '<a class="more" data-go="' + go + '"' + C.tip(tt(label), tt(tipBody)) + '>' + tt(label) + ' ›</a>'; };
      var ratesLink = x.pi.length ? link('Rates', 'Go to the hourly rates of the roles in this phase. Their time and their rate together set what the people cost.', 'rates#' + Object.keys(x.roles).map(function (r) { return 'rc:' + r; }).join(',')) : '';
      var edits = [];
      if (sdlcEdit) edits.push(sdlcCatEditor(k, { alt: xa ? xa.cats : {}, os: xo ? xo.cats : {} }) + sdlcLineEditor(x) + (ratesLink ? '<div class="edrates">' + ratesLink + '</div>' : ''));
      rows += '<tr data-ph="' + esc(k) + '"><td>' + esc(k) + '</td><td' + tipOf(xa) + '>' + M(a) + '</td><td' + tipOf(xo) + '>' + M(o) + '</td><td>' + M(a - o) + '</td><td>' + (a > 0 ? Math.round(o / a * 100) + '%' : '–') + '</td>' + (sdlcEdit ? '<td class="edl">' + edits.join('') + '</td>' : '') + '</tr>';
    });
    rows += '<tr class="tot" data-ph="*"><td>' + tt('Total for the portfolio') + '</td><td>' + M(ta) + '</td><td>' + M(to) + '</td><td>' + M(ta - to) + '</td><td>' + (ta > 0 ? Math.round(to / ta * 100) + '%' : '–') + '</td>' + (sdlcEdit ? '<td></td>' : '') + '</tr>';
    var bar = '<div class="sdlc-edbar"><button type="button" class="b" data-act="sdlc-edit"' + C.tip(tt('Edit inputs'), tt('Show the inputs behind each phase here (yearly costs, people, and the share still needed with OutSystems), so they can be changed without leaving this page. Hide them to see the totals only.')) + '>' + (sdlcEdit ? tt('Hide inputs') : tt('Edit inputs')) + '</button></div>';
    var head = tt('Whole portfolio: its cost over {yrs} years', { yrs: yrs });
    var what = tt('Edit inputs shows the organisation\'s yearly amounts.');
    var html = bar + '<h5 class="sdlchead">' + head + '</h5><div class="note" style="margin:0 0 6px">' + what + '</div><div class="refwrap"><table class="cmp' + (sdlcEdit ? ' sdlc-editing' : '') + '">' + rows + '</table></div>';
    Array.prototype.forEach.call(hosts, function (h) {
      var ae = document.activeElement;
      if (sdlcEdit && ae && h.contains(ae) && ae.matches && ae.matches('input')) {   // typing: update the figures around the box, not the box itself, so the cursor stays
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        Array.prototype.forEach.call(tmp.querySelectorAll('tr[data-ph]'), function (nr) {
          var old = null; Array.prototype.forEach.call(h.querySelectorAll('tr[data-ph]'), function (o) { if (o.getAttribute('data-ph') === nr.getAttribute('data-ph')) old = o; });
          if (!old) return;
          for (var c = 0; c < 5; c++) { var oc = old.cells[c], nc = nr.cells[c]; if (oc && nc) oc.replaceWith(nc); }
        });
      } else h.innerHTML = html;
    });
  }
  var INFRA_COLORS = { platform: 'var(--g2)', tooling: 'var(--g1)', infra: 'var(--t2)', ops: 'var(--p2)', assure: 'var(--m2)', setup: 'var(--o2)' };

  /* ---- What's in the box: ODC against what Azure, AWS or Google Cloud need for an equivalent, tied to the infrastructure lines ---- */
  var showAllProviders = false;
  function infraLineFor(kw) {
    var items = state.infraItems || [], k = kw.toLowerCase(), f = null;
    items.forEach(function (it) { if (!f && String(it.name).toLowerCase().indexOf(k) >= 0) f = it; });
    return f;
  }
  function stackCost(blk) {
    var host = E.hostingOf(state), alt = null, os = null;
    if (blk.infra === 'assure') { if (!E.assuranceOn(state)) return { alt: null, os: null, note: 'off' }; return { alt: E.highAssureAnnual(state, 'alt'), os: E.highAssureAnnual(state, 'os'), sentry: host === 'paas-sentry' }; }
    if (blk.infra === 'tokens') return { alt: null, os: null, note: 'tokens' };
    if (!blk.infra) return null;
    var it = infraLineFor(blk.infra); if (!it) return null;
    alt = Number(it.annual);
    os = host === 'self' ? Number(it.annual) * Math.min(1, Math.max(0, parseFloat(it.os) || 0)) : (it.ext ? Number(it.annual) * Math.min(1, Math.max(0, parseFloat(it.os) || 0)) : 0);
    return { alt: alt, os: os };
  }
  var stackFilter = 'all';
  function stackCard() {
    var hosting = E.hostingOf(state), self = hosting === 'self';
    var provs = showAllProviders ? SK.PROVIDERS : SK.PROVIDERS.filter(function (p) { return p.key === state.cloudProvider; });
    var chips = SK.PROVIDERS.map(function (p) { return '<button type="button" data-prov="' + p.key + '"' + (p.key === state.cloudProvider ? ' class="on"' : '') + '>' + p.label + '</button>'; }).join('');
    var c = SK.counts(hosting), tot = SK.BLOCKS.length;
    var fl = [['all', 'All', tot], ['box', 'In the box', c.box], ['provide', 'You provide', c.provide], ['byo', 'Bring your own', c.byo], ['out', 'Not provided', c.out]].filter(function (f) { return f[0] === 'all' || f[2] > 0; });
    var fchips = fl.map(function (f) { return '<button type="button" data-stfilter="' + f[0] + '"' + (f[0] === stackFilter ? ' class="on"' : '') + '>' + f[1] + ' <i>' + f[2] + '</i></button>'; }).join('');
    var head = '<tr><th>Building block</th><th>With ' + esc(HOSTS[cfgKey()]) + '</th>' + provs.map(function (p) { return '<th>' + p.label + '</th>'; }).join('') + '<th>Cloud native, a year</th><th>ODC, a year</th></tr>';
    var rows = '', grp = null, ncol = 4 + provs.length, shown = 0, lastGrp = null;
    SK.BLOCKS.forEach(function (b, i) {
      var eff = SK.effective(b, hosting);
      if (stackFilter !== 'all' && eff !== stackFilter) return;
      shown++;
      if (b.group !== grp) { grp = b.group; rows += '<tr class="grp"><td colspan="' + ncol + '">' + esc(grp) + '</td></tr>'; }
      var st = SK.STATUS[eff];
      rows += '<tr><td>' + esc(b.name) + '</td><td><span class="stb ' + eff + '"' + C.tip(st.label, st.help) + '>' + st.label + '</span><div class="sub2">' + esc(b.odc) + '</div></td>' +
        provs.map(function (p) { return '<td>' + esc(b.svc[p.key]) + '</td>'; }).join('') + '<td class="num" id="st-a' + i + '"></td><td class="num" id="st-o' + i + '"></td></tr>';
    });
    return card('What\'s in the box',
      '<div class="note" style="margin:0 0 8px">' + tt('What ODC includes, and what a cloud-native build would need from a cloud provider for an equivalent, for {config}', { config: '<b>' + esc(HOSTS[cfgKey()]) + '</b>' }) +
      ': ' + (self ? tt('with self-managed ODC the organisation provides the cloud services itself, so those rows read "You provide" and cost the same as on the cloud-native side.') : tt('with ODC the cloud services are in the box, so they cost the organisation nothing extra; only the items it brings or buys itself remain.')) +
      ' ' + tt('The Azure column follows OutSystems\' guidance on the closest equivalents; AWS and Google Cloud are the usual equivalents (indicative). Amounts come from the cloud-service lines, so the two always agree.') + '</div>' +
      '<div class="provrow"><span class="seg" id="provseg">' + chips + '</span><label class="chk" style="display:inline-block;margin-left:12px"><input type="checkbox" data-allprov="1"' + (showAllProviders ? ' checked' : '') + '> Show all three clouds</label></div>' +
      '<div class="provrow"><span class="seg" id="stfseg">' + fchips + '</span></div>' +
      '<div class="refwrap"><table class="cmp stack">' + head + rows + (shown ? '' : '<tr><td colspan="' + ncol + '">Nothing matches this filter.</td></tr>') + '</table></div>').replace('<div class="card">', '<div class="card" style="grid-column:1/-1">');
  }
  function outsideCard() {
    var M = C.money, items = SK.OUTSIDE.map(function (o, i) {
      var cost, ln;
      if (o.cost === 'identity' || o.cost === 'apm') { ln = infraLineFor(o.cost === 'apm' ? 'apm' : 'identity'); cost = ln ? tt('Costed on both sides: {amt} a year (infrastructure line "{name}", {tail}).', { amt: M(Number(ln.annual)), name: esc(ln.name), tail: ln.ext ? tt('needed with ODC too') : tt('not ticked "Also with ODC"') }) : tt('Not costed: add a line to the infrastructure table and tick "Also with ODC".'); }
      else if (o.cost === 'tokens') cost = 'Costed as AI tokens (Cost drivers tab): the traditional build\'s token spend, with OutSystems\' placeholder saving.';
      else cost = 'Not costed here. If needed, add a line to the infrastructure table and tick "Also with ODC" so it costs the same on both sides.';
      return '<div class="outx"><b>' + esc(o.name) + '</b><span>' + esc(o.why) + '</span><i>' + cost + '</i></div>';
    }).join('');
    return card('Funded outside OutSystems, whichever option you choose', '<div class="note" style="margin:0 0 8px">These are needed with ODC and with a cloud-native build alike, so they cost the same on both sides (or are not part of the comparison). They are not an OutSystems cost.</div><div class="outs">' + items + '</div>').replace('<div class="card">', '<div class="card" style="grid-column:1/-1">');
  }
  function updateStackCosts() {
    var M = C.money;
    SK.BLOCKS.forEach(function (b, i) {
      var a = $('st-a' + i), o = $('st-o' + i); if (!a) return;
      var c = stackCost(b);
      if (!c) { a.textContent = ''; o.textContent = ''; return; }
      if (c.note === 'tokens') { a.textContent = 'AI tokens'; o.textContent = 'AI tokens'; return; }
      if (c.note === 'off') { a.textContent = '–'; o.textContent = '–'; return; }
      a.textContent = M(c.alt); o.textContent = c.sentry ? 'Sentry' : M(c.os);
    });
  }

  /* Security work every application needs whatever the platform: penetration testing and, for some customers, an accreditation of the application (IRAP, say). */
  function appAssureCard() {
    var rows = '<div class="bd t5"><span class="th">' + tt('Line') + '</span><span class="th r">' + tt('Alternative, {c} a year', { c: esc(curSym()) }) + '</span><span class="th r">' + tt('Still needed with OutSystems %') + '</span><span class="th r">' + tt('OutSystems, {c} a year', { c: esc(curSym()) }) + '</span><span></span></div>';
    (state.appAssure || []).forEach(function (it, i) {
      rows += '<div class="bd t5"><input type="text" data-tpath="appAssure.' + i + '.name" value="' + esc(it.name) + '">' + inp('appAssure.' + i + '.annual', 1000, 0) + pctInp('appAssure.' + i + '.os') + '<span class="ro" id="aa-os' + i + '"></span><span></span></div>';
    });
    rows += '<div class="bd t5"><span class="tot" style="text-align:left">' + tt('Total') + '</span><span class="tot" id="aa-tot-alt"></span><span></span><span class="tot" id="aa-tot-os"></span><span></span></div>';
    return card('Security work every application needs',
      '<div class="note" style="margin:0 0 8px">' + tt('Whatever the platform, an organisation still has to have its applications penetration tested and, in some cases (government, for example), have each one accredited, such as under IRAP. These are project costs rather than enterprise costs, and they are counted on both sides. OutSystems can reduce some of it, because the platform has been assessed, but not remove it. The amounts are placeholders to replace with quotes.') + '</div>' +
      '<div class="appwrap">' + rows + '</div>');
  }
  /* Security and compliance: what the alternative has to buy and staff to match ODC Sentry, optional certification costs, and the Sentry uplift. */
  function assureCard() {
    var cur = state.currency, on = E.assuranceOn(state), at = !state.assurance || state.assurance.attest !== false;
    var rows = '<div class="bd t5"><span class="th">Line</span><span class="th r">' + tt('Alternative, {c} a year', { c: esc(curSym()) }) + '</span><span class="th r">' + tt('Still needed if self-managed %') + '</span><span class="th r">' + tt('Self-managed, {c} a year', { c: esc(curSym()) }) + '</span><span></span></div>';
    (state.assureItems || []).forEach(function (it, i) {
      var people = it.kind === 'people', first = people ? inp('assureItems.' + i + '.fte', 0.1, 0) : inp('assureItems.' + i + '.annual', 1000, 0);
      rows += '<div class="bd t5" id="as-row' + i + '"><span>' + esc(tt(it.name)) + (people ? ' <i>' + tt('(FTE, at the {role} rate)', { role: esc(tt((E.ALL_ROLES.filter(function (r) { return r.key === it.role; })[0] || { label: it.role }).label).toLowerCase()) }) + '</i>' : it.kind === 'attest' ? ' <i>' + tt('(optional)') + '</i>' : '') + '</span>' +
        first + pctInp('assureItems.' + i + '.os') + '<span class="ro" id="as-os' + i + '"></span><span class="ro" id="as-alt' + i + '"></span></div>';
    });
    rows += '<div class="bd t5"><span class="tot" style="text-align:left">Total</span><span class="tot" id="as-tot-alt"></span><span></span><span class="tot" id="as-tot-os"></span><span></span></div>';
    return card('Security and compliance (Sentry-equivalent)',
      '<div class="note" style="margin:0 0 8px">' + tt('OutSystems ODC PaaS with the {sentry} add-on provides, out of the box: intrusion detection, runtime integrity monitoring, real-time malware scanning, inbound IP filtering, audit-trail streaming, 24x7 monitoring, and contractually valid SOC 2 Type II, HIPAA and PCI attestations. Sentry is available for PaaS only. A cloud-native build, or self-managed ODC, has to buy the software, staff the monitoring and pay for the audits to reach equivalent assurance.', { sentry: '<b>Sentry</b>' }) + ' ' +
        (on ? tt('These costs apply only when "Compliance-grade security needed" is ticked (it is).') : tt('These costs apply only when "Compliance-grade security needed" is ticked (it is not, so they are 0 now).')) + '</div>' +
      '<div class="note" id="assure-off" style="margin:0 0 8px;color:var(--warn)">High assurance is off, so none of the lines below is charged. Tick it to include them.</div>' +
      assureCheck() + '<label class="chk"><input type="checkbox" data-assure="attest"' + (at ? ' checked' : '') + '> Include attestation and certification costs (SOC 2 Type II, PCI DSS, HIPAA)</label>' +
      row('Additional Sentry licence <i>' + esc(curSym()) + '</i> a year', '<div class="ro locked" id="ro-psen" data-go="panel#platform.sentry"' + C.tip('Edited in the inputs pane', 'This amount is set in the inputs pane on the left, so it has one place to change. Click to go there.') + '>' + C.money(Number(state.platform.sentry)) + '</div>', 'The extra annual licence for the Sentry add-on, on top of the platform licence. It is charged only when Sentry is on, and Sentry is available on PaaS only. Placeholder (15% of the platform licence): to be replaced with the real price.') +
      '<div class="appwrap">' + rows + '</div>' +
      '<div class="note">The security and compliance programme above is an assumption about a compliance-grade estate for one portfolio: managed detection and response instead of an in-house 24x7 team, one annual SOC 2 Type II audit, and one PCI or HIPAA assessment. Values are placeholders to validate with a security team. Base security (encryption, network isolation, WAF, patching) is part of the platform and of any competent cloud estate, and is not costed here.</div>');
  }
  var HOSTS = { paas: 'ODC (PaaS)', 'paas-sentry': 'ODC + Sentry (PaaS)', self: 'ODC Self-managed', 'self-diy': 'ODC Self-managed + Assured' };   // one set of names, used everywhere
  var CFG_ROWS = [['paas', HOSTS.paas, 'paas'], ['paas-sentry', HOSTS['paas-sentry'], 'sentry'], ['self', HOSTS.self, 'self'], ['self-diy', HOSTS['self-diy'], 'diy']];   // key, short name, key in hostingCompare
  function renderInfraCompare() {
    var ch = $('infra-chart'), tb = $('infra-table');
    if (!ch) return;
    var M = C.money, fte = function (x) { return Math.round(x * 100) / 100; }, host = E.hostingOf(state), osName = HOSTS[cfgKey()], altName = esc(altShort());
    var a = { platform: E.licenceAnnual(state, 'alt'), tooling: E.toolingAnnual(state, 'alt'), infra: E.infraAnnual(state, 'alt'), ops: E.opsWeekCost(state, 'alt') * 52, assure: E.assureAnnual(state, 'alt') };
    var o = { platform: E.licenceAnnual(state, 'os'), tooling: E.toolingAnnual(state, 'os'), infra: E.infraAnnual(state, 'os'), ops: E.opsWeekCost(state, 'os') * 52, assure: E.assureAnnual(state, 'os') };
    var up = E.sentryUplift(state), ta = a.platform + a.tooling + a.infra + a.ops + a.assure, to = o.platform + o.tooling + o.infra + o.ops + o.assure;
    var sa = E.setupAmount(state, 'alt'), so = E.setupAmount(state, 'os'), inc = state.setup.mode === 'included';
    var cats = [{ key: 'platform', label: 'Licences', color: INFRA_COLORS.platform, help: COST_HELP.platform, go: function () { return costGo('platform', 1); } }, { key: 'tooling', label: 'Tooling and services', color: INFRA_COLORS.tooling, help: COST_HELP.tooling, go: function (g) { return costGo('tooling', g); } }, { key: 'infra', label: 'Infrastructure', color: INFRA_COLORS.infra, help: COST_HELP.infra, go: function () { return costGo('infra'); } },
      { key: 'ops', label: 'Operating people', color: INFRA_COLORS.ops, help: COST_HELP.ops, go: function () { return costGo('ops'); } }, { key: 'assure', label: 'Security and compliance', color: INFRA_COLORS.assure, help: COST_HELP.assure, go: function () { return costGo('assure'); } }];
    var ca = a, co = o;
    if (inc) {   // ticked: the one-off setup is shown as its own segment, on top of the ongoing yearly cost
      cats.push({ key: 'setup', label: 'Setup (one-off)', color: INFRA_COLORS.setup, help: 'The one-off cost to set up the environment, added to one year of ongoing cost. It is spread over the setup weeks in the timeline (Setup tab).', go: function (g) { return costGo('setup', g); } });
      ca = Object.assign({}, a, { setup: sa }); co = Object.assign({}, o, { setup: so });
    }
    /* The scale is the same with and without high assurance (and with or without Sentry): the tallest bar either way, so ticking it only changes the bars. */
    var hcs = E.hostingCompare(state), std = host === 'self' ? 'self' : 'paas', hiR = host === 'self' ? 'diy' : 'sentry';
    var altLo = hcs.alt.licences + hcs.alt.tooling + hcs.alt.infra + hcs.alt.ops, altHi = altLo + hcs[hiR].altAssure;
    var scaleMax = Math.max(altLo, altHi, hcs[std].ongoing, hcs[hiR].ongoing) + (inc ? Math.max(sa, so) : 0);
    ch.innerHTML = C.stacked({
      cats: cats, scaleMax: scaleMax,
      groups: [{ label: altShort(), values: ca }, { label: osName.replace('OutSystems ', 'OS '), values: co }], label: inc ? 'Ongoing cost per year, plus one-off setup' : 'Ongoing cost per year'
    });
    var row = function (label, x, y, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td><td>' + (typeof x === 'number' ? M(x) : x) + '</td><td>' + (typeof y === 'number' ? M(y) : y) + '</td><td>' + (typeof x === 'number' && typeof y === 'number' ? M(x - y) : '') + '</td></tr>'; };
    tb.innerHTML = '<table class="cmp"><tr><th></th><th>' + altName + '</th><th class="os">' + esc(osName) + '</th><th>Difference</th></tr>' +
      row(host === 'paas-sentry' ? tt('Licences (incl. Sentry)') : tt('Licences'), a.platform, o.platform) + (host === 'paas-sentry' ? row('  ' + tt('of which Sentry licence'), '–', up) : '') +
      row(tt('Tooling and services'), a.tooling, o.tooling) +
      row(tt('Infrastructure'), a.infra, o.infra) +
      row(tt('Operating people ({a} vs {o} FTE)', { a: fte(E.opsFteTotal(state, 'alt')), o: fte(E.opsFteTotal(state, 'os')) }), a.ops, o.ops) +
      (a.assure || o.assure ? row(host === 'paas-sentry' ? tt('Security and compliance (to match Sentry)') : tt('Security and compliance'), a.assure, o.assure) : '') +
      row(tt('Ongoing per year'), ta, to, 'tot') + row(inc ? tt('Setup, one-off') : tt('Setup, one-off (not included)'), sa, so) + '</table>';
    var hc = E.hostingCompare(state);   // every configuration's ongoing cost, so the picker shows the price of each without switching
    ['paas', 'sentry', 'self', 'diy'].forEach(function (k) { var c = $('cfgcost-' + k); if (c) c.textContent = tt('{amt} a year', { amt: M(hc[k].ongoing) }); });
    var hn = $('ha-note');
    if (hn) {
      var std = host === 'self' ? 'self' : 'paas', hi = host === 'self' ? 'diy' : 'sentry', dOs = hc[hi].ongoing - hc[std].ongoing, dAlt = hc[hi].altAssure - hc[std].altAssure;
      hn.innerHTML = tt('High assurance adds {a} a year to {os} and {b} to {alt}.', { a: '<b>' + M(dOs) + '</b>', os: esc(osName), b: '<b>' + M(dAlt) + '</b>', alt: altName });
    }
    var t = $('infra-title'); if (t) t.textContent = tt('Traditional cloud native vs {os}, at full run', { os: osName });
  }

  function updateBreakdownTotals() {
    var M = C.money, MS = C.moneyShort, set = function (id, v) { var e = $(id); if (e) e.textContent = v; }, r2 = function (x) { return Math.round(x * 100) / 100; };
    var altInfra = E.infraAnnual(state, 'alt'), osInfra = E.infraAnnual(state, 'os'), altLic = E.licenceAnnual(state, 'alt'), osLic = E.licenceAnnual(state, 'os'), altTool = E.toolingAnnual(state, 'alt'), osTool = E.toolingAnnual(state, 'os');
    set('bd-infra-t', M(altInfra)); set('bd-infra-t0', M(altInfra)); set('bd-infra-ot', M(osInfra)); set('bd-infra-ot0', M(osInfra));
    set('bd-tools-t', M(altTool)); set('bd-tools-t0', M(altTool));
    var osTools = osTool; set('bd-tools-ot', M(osTools)); set('bd-tools-ot0', M(osTools));
    set('bd-ops-t', r2(E.opsFteTotal(state, 'alt'))); set('bd-ops-t0', r2(E.opsFteTotal(state, 'alt'))); set('bd-ops-ot', r2(E.opsFteTotal(state, 'os'))); set('bd-ops-ot0', r2(E.opsFteTotal(state, 'os')));
    set('bd-ops-tc', M(E.opsWeekCost(state, 'alt') * 52)); set('bd-ops-otc', M(E.opsWeekCost(state, 'os') * 52));
    var os = function (it) { var x = parseFloat(it.os); return isFinite(x) ? Math.min(1, Math.max(0, x)) : 1; }, hm = state.osHosting === 'self' ? 1 : 0;
    if (state.infraItems) state.infraItems.forEach(function (it, i) { set('bd-infra-oc' + i, M(Number(it.annual) * os(it) * (hm ? 1 : 0))); });
    if (state.toolItems) state.toolItems.forEach(function (it, i) { set('bd-tools-oc' + i, M(Number(it.annual) * os(it))); });
    if (state.opsItems) state.opsItems.forEach(function (it, i) {
      var rate = state.rates[it.role] !== undefined ? state.rates[it.role] : state.rates.ops, perFte = Number(state.team.hours) * 52 * rate;
      set('bd-ops-of' + i, r2(Number(it.fte) * os(it) * hm)); set('bd-ops-ac' + i, M(Number(it.fte) * perFte)); set('bd-ops-oc' + i, M(Number(it.fte) * os(it) * perFte * hm));
    });
    var pl2 = E.projectList(state), tv = 0; pl2.forEach(function (p) { ['cost', 'risk', 'rev'].forEach(function (k) { tv += Number(p.value[k]); }); });
    set('dm-ro', tt('{n} months, from the applications', { n: f1(state.deliveryMonths) }));
    var scn = E.caseOf(state); set('fs-ana', tt(scn ? E.CASES[scn].label : 'Custom') + ' · ' + tt('{n} years', { n: state.horizon }));
    set('fs-ctx', R.byId(state.country).name + ' · ' + state.currency + ' · vs ' + shorten(altLabel(), 22));
    set('fs-del', tt('{m} months', { m: state.deliveryMonths }) + ' · ' + (pl2.length === 1 ? tt('1 application') : tt('{n} applications', { n: pl2.length })) + ' · ' + M(E.run(state).os.sumCost.team));
    set('fs-val', tt('{amt} a year across the portfolio', { amt: MS(tv) }));
    var og = state.org || {}; set('fs-org', num0(og.employees) > 0 || num0(og.customers) > 0 ? tt('{e} employees · {c} customers', { e: num0(og.employees) > 0 ? Math.round(og.employees).toLocaleString('en-US') : '–', c: num0(og.customers) > 0 ? Math.round(og.customers).toLocaleString('en-US') : '–' }) : tt('Not set'));
    set('fs-plat', CFG_ROWS.filter(function (c) { return c[0] === cfgKey(); })[0][1] + ' · ' + tt('licences {a} a year · infrastructure {b} · people {c} FTE', { a: MS(osLic), b: MS(osInfra), c: r2(E.opsFteTotal(state, 'os')) }));
    var ah = Number(state.team.hours) * 52;
    (state.assureItems || []).forEach(function (it, i) {
      var full = it.kind === 'people' ? Number(it.fte) * ah * (state.rates[it.role] !== undefined ? state.rates[it.role] : state.rates.sec) : Number(it.annual), sh = os(it);
      var haOn = E.assuranceOn(state), attOff = it.kind === 'attest' && state.assurance && state.assurance.attest === false, excl = !haOn || attOff, rowEl = $('as-row' + i);   // lines drop out when high assurance is off, and optional attestation lines when their tick is off
      if (rowEl) rowEl.classList.toggle('excluded', excl);
      set('as-alt' + i, ''); set('as-os' + i, !haOn ? 'not charged' : attOff ? 'not included' : M(full * sh));
    });
    var off = $('assure-off'); if (off) off.hidden = E.assuranceOn(state);
    var att = document.querySelector('input[data-assure="attest"]'); if (att) att.disabled = !E.assuranceOn(state);
    var an2 = $('assure-note');
    if (an2) an2.innerHTML = E.assuranceOn(state) ? tt('The alternative carries {amt} a year of equivalent security and compliance{note}. {link}', { amt: '<b>' + M(E.highAssureAnnual(state, 'alt')) + '</b>', note: E.hostingOf(state) === 'paas-sentry' ? ' ' + tt('(Sentry is a separate licence on the OutSystems side)') : '', link: '<a data-gotab="infrastructure" style="color:var(--text);text-decoration:underline;cursor:pointer">' + tt('Edit the lines') + '</a>' }) : '';
    set('sentry-amt', M(E.sentryUplift(state))); set('ro-pos', M(Number(state.platform.os))); set('ro-psen', M(Number(state.platform.sentry)));
    set('osetup-amt', M(E.osSetupFor(state, 'self')));
    updateStackCosts();
    set('cs-alt', M(E.infraAnnual(state, 'alt'))); set('cs-os', M(E.infraAnnual(state, 'os')));
    set('pp-alt', M(E.opsWeekCost(state, 'alt') * 52)); set('pp-os', M(E.opsWeekCost(state, 'os') * 52));
    set('as-tot-alt', M(E.highAssureAnnual(state, 'alt'))); set('as-tot-os', M(E.hostingOf(state) === 'self' ? E.highAssureAnnual(state, 'os') : 0));
    (state.appAssure || []).forEach(function (it, i) { set('aa-os' + i, M(Number(it.annual) * (Math.min(1, Math.max(0, parseFloat(it.os) || 0))))); });
    set('aa-tot-alt', M(E.appAssureAnnual(state, 'alt'))); set('aa-tot-os', M(E.appAssureAnnual(state, 'os')));
    // main page summary of both sides
    set('kp-lic-alt', MS(altLic)); set('kp-lic-os', MS(osLic)); set('kp-tool-alt', MS(altTool)); set('kp-tool-os', MS(osTool)); set('kp-inf-alt', MS(altInfra)); set('kp-inf-os', MS(osInfra));
    var infTip = $('kp-inf-os'); if (infTip) infTip.setAttribute('data-tip', tt('Infrastructure') + '::' + (E.hostingOf(state) === 'self' ? tt('The organisation runs OutSystems on its own cloud, so this is its infrastructure cost.') : tt('Included in PaaS: OutSystems runs the cloud, so there is no separate infrastructure cost.')));
    set('kp-ops-alt', r2(E.opsFteTotal(state, 'alt'))); set('kp-ops-os', r2(E.opsFteTotal(state, 'os')));
    // what 1 developer is equal to: people and cost per developer for each approach
    ['os', 'alt'].forEach(function (ap) {
      var perHour = E.mixCost(state, ap);
      set('mp-' + ap, r2(E.peoplePerDev(state, ap))); set('mc-' + ap, M(perHour)); set('mw-' + ap, M(perHour * Number(state.team.hours)));
    });
    renderInfraCompare();
    renderSdlcCost();
  }

  function assumptionCards(scope) {
    var cards = card('Time and money',
      row('Discount rate (%)', inp('rate', 0.5, 0, 50, scope), 'The yearly rate that brings future money back to today\'s terms. Usually the organisation\'s WACC, around 8 to 12%.') +
      '<div class="note">'+'The yearly "cost of waiting". Money received later is worth less than money today, because it could be earning a return elsewhere and because the future is uncertain. This rate shrinks each future year\'s value to today\'s terms (that is what makes it a net present value). Most organisations use their WACC (weighted average cost of capital): the blended rate it pays to fund itself from loans and from shareholders, usually somewhere around 8 to 12%. Finance can tell you the figure. A higher rate makes later benefits count for less, which favours the approach that pays back sooner.'+'</div>');
    state.custom = state.custom || { advantage: 1, value: 1 };   // files saved before Custom had its own percentages
    var curCase = E.caseOf(state) || 'custom';   // the scenario in force is highlighted; click a name to use it
    var ct = '<table class="cmp casecfg" data-path="scenario"><tr><th>Scenario</th><th>Advantage realised (%)</th><th>Value realised (%)</th></tr>' +
      ['conservative', 'likely', 'optimistic'].map(function (k) {
        return '<tr><td data-case="' + k + '"' + (k === curCase ? ' class="on"' : '') + ' role="button" tabindex="0"' + C.tip('Scenario', 'Click to switch the whole assessment to this scenario.') + '><span class="cdot ' + k + '"></span>' + E.CASES[k].label + '</td><td>' + pctField('cases.' + k + '.advantage') + '</td><td>' + pctField('cases.' + k + '.value') + '</td></tr>';
      }).join('') +
      '<tr><td data-case="custom"' + (curCase === 'custom' ? ' class="on"' : '') + ' role="button" tabindex="0"' + C.tip('Scenario', 'Click to switch the whole assessment to this scenario.') + '><span class="cdot custom"></span>' + tt('Custom') + '</td><td>' + pctField('custom.advantage') + '</td><td>' + pctField('custom.value') + '</td></tr></table>';
    cards += card('Scenarios: how much of the benefit arrives',
      '<div class="note" style="margin:0 0 8px">What Conservative, Likely and Optimistic mean. <b>Advantage realised</b>: the share of OutSystems\' improvement over the alternative (stage times, review waits, pass rates, team mix, token saving) that arrives; 100% is the figures as entered. <b>Value realised</b>: the share of the business value (cost savings, revenue uplift, risk reduction) that arrives, for both approaches. Click a scenario\'s name in the table to use it; the scenario buttons and the Scenarios box on the Value tab use the same percentages. Placeholder percentages to validate with the customer.</div>' +
      '<div class="refwrap">' + ct + '</div>' +
      '<div class="note" style="margin:8px 0 0">'+ tt('The Custom row is the setting in use when it is not one of the three: type your own percentages there.') + '</div>');
    cards += card('Costs from year to year',
      row('Labour cost change (% / yr)', inp('escal.labour', 0.5, -50, 100, scope), 'How much the loaded cost of every role rises (or falls) each year, from the second year on. Wage inflation is typically 3 to 5%.') +
      row('Licence price change (% / yr)', inp('escal.licence', 0.5, -50, 100, scope), 'How much licences and tooling cost more (or less) each year, from the second year on. A multi-year deal with known prices can be entered year by year instead, using the icon at the right of the licence field.') +
      row('Infrastructure cost change (% / yr)', inp('escal.infra', 0.5, -50, 100, scope), 'How much cloud infrastructure costs more (or less) each year, from the second year on.') +
      '<div class="note">' + tt('Any single amount can have its own pattern instead: use the small icon at the right of its field to set a percentage change, or a value for each year. Business value has its own growth setting below, and each value calculator its own pattern.') + '</div>');
    cards += card('How value arrives',
      row('Ramp (weeks)', inp('rampWeeks', 1, 0, 156, scope), 'After go-live, value ramps up in a straight line over this many weeks.') +
      row('Value growth (% / yr)', inp('growth', 1, -50, 100, scope), 'Optional growth or decline of the annual value after go-live.') +
      '<div class="note">The same annual value applies to both approaches. Only timing differs, so being live sooner is what creates the advantage.</div>');
    return cards;
  }

  var START = 'Starts from the general defaults. Anything changed for this assessment is marked, and “Reset to defaults” puts it back.';
  function buildDelivery() { $('cfg-delivery').innerHTML = page('Stages and gates', tt('Where time goes between an approved idea and production, for each approach.') + ' ' + START, deliveryCards('state'), resetBar('delivery')); }
  function buildCosts() { $('cfg-costs').innerHTML = page('Cost drivers', tt('How the delivery team, run costs, infrastructure, operations and AI tools are worked out. The main figures are on the left; platform, infrastructure and operating resources are on the Platform and infrastructure tab.') + ' ' + START, costCards('state'), resetBar('costs')); }
  function buildAssumptions() { $('cfg-assumptions').innerHTML = page('Analysis settings', tt('Settings that apply to the whole assessment.') + ' ' + START, assumptionCards('state'), resetBar('assumptions')); }


  /* ---- The value builder: each application's value built from lines (docs/AVA-value-builder.md) ---- */
  var BLOCKS = [['simple', 'Simple values'], ['labour', 'People: time saved'], ['handling', 'Handling time saved'], ['deflect', 'Requests deflected'], ['completion', 'Completion uplift'], ['errors', 'Errors and rework avoided'], ['cycle', 'Faster cycle time'], ['events', 'Failures or visits avoided'], ['decom', 'Switch off (legacy)'], ['revenue', 'Revenue from customers'], ['risk', 'Risk exposure'], ['other', 'Other']];
  var DRIVER_OPTS = [['cost', 'Cost savings'], ['rev', 'Revenue uplift'], ['risk', 'Risk reduction']];
  var BLOCK_ADD = { labour: '+ People time', handling: '+ Handling time', deflect: '+ Requests deflected', completion: '+ Completion uplift', errors: '+ Errors avoided', cycle: '+ Faster cycle time', events: '+ Failures avoided', decom: '+ Switch off legacy', revenue: '+ Revenue from customers', risk: '+ Risk exposure' };
  /* What each calculator is for and where it applies. The calculators are general: they take the business metric whatever the industry or the platform. */
  var CALC_INFO = {
    labour: 'The value of people\'s time, from how many people use the application and the share of their time it saves. Typical uses: internal workflow and approval apps, case-handling workbenches, field and back-office tools.',
    handling: 'Time saved on each transaction handled: transactions per year × minutes saved × the loaded cost of the people who handle them. Use it when the work is counted in transactions rather than users. Typical uses: claims and case handling, onboarding and application processing, approvals, invoice and expense processing, HR requests, permits and licensing, order and booking handling.',
    deflect: 'Requests that no longer need a person because customers or staff serve themselves: requests per year × share handled by self-service × cost to handle one. Typical uses: customer, partner and broker portals, employee self-service, status tracking, account and policy changes, IT and HR help desks.',
    completion: 'More people finish a process they start: starts per year × the rise in completion rate × value of each completion × margin. Typical uses: digital onboarding and sign-up, loan and policy applications, bookings and checkouts, quotes, enrolment and registration.',
    errors: 'Fewer mistakes, reworks and leaks: transactions per year × the fall in the error rate × cost of each error. Typical uses: claims leakage, data-entry and re-keying errors, billing and invoice corrections, repeat field visits, audit findings, order and shipment errors.',
    cycle: 'Each case is completed sooner: cases per year × days saved × the value of a day to the business (interest, cash brought forward or revenue earlier) × the share realised. Typical uses: claims settlement, order to cash, lending decisions, permits and approvals, onboarding to first revenue, supplier payment.',
    events: 'Fewer failures, incidents or repeat visits: events per year × the reduction × the cost of each event. Typical uses: asset breakdowns and predictive maintenance, field service repeat visits, safety and quality incidents, system outages, missed appointments, stock-outs.',
    decom: 'Costs that stop when an old system is switched off: licences, infrastructure, support and the people who ran it. Typical uses: legacy modernisation, application and platform consolidation, replacing spreadsheets and end-user tools, ERP extensions that retire workarounds.',
    revenue: 'Extra profit from customers: units × revenue per unit × uplift × margin. Typical uses: customer retention and upsell, new digital products and services, self-service sales channels, partner and marketplace portals.',
    risk: 'Expected losses avoided: yearly exposure × the share removed. Typical uses: compliance and regulatory reporting, audit trails, fraud and security controls, safety and quality, data-privacy handling.'
  };
  var CALC_USES = {   // where each calculator is used, for the chooser
    labour: 'internal workflow and approval apps, case-handling workbenches, field and back-office tools.',
    handling: 'claims and case handling, onboarding and application processing, approvals, invoice and expense processing, HR requests, permits and licensing, order and booking handling.',
    deflect: 'customer, partner and broker portals, employee self-service, status tracking, account and policy changes, IT and HR help desks.',
    completion: 'digital onboarding and sign-up, loan and policy applications, bookings and checkouts, quotes, enrolment and registration.',
    errors: 'claims leakage, data-entry and re-keying errors, billing and invoice corrections, repeat field visits, audit findings, order and shipment errors.',
    cycle: 'claims settlement, order to cash, lending decisions, permits and approvals, onboarding to first revenue, supplier payment.',
    events: 'asset breakdowns and predictive maintenance, field service repeat visits, safety and quality incidents, system outages, missed appointments, stock-outs.',
    decom: 'legacy modernisation, application and platform consolidation, replacing spreadsheets and end-user tools, ERP extensions that retire workarounds.',
    revenue: 'customer retention and upsell, new digital products and services, self-service sales channels, partner and marketplace portals.',
    risk: 'compliance and regulatory reporting, audit trails, fraud and security controls, safety and quality, data-privacy handling.'
  };

  /* Use cases: a starting set of the general calculators with business wording and a sensible role, all numbers placeholders to edit. A use case adds no new arithmetic. */
  /* Add a use case's calculators to an application, with the wording translated and the pay for the role group in the current country. */
  /* A sentence saying where a starting number came from (empty when the organisation figures were not used). */
  function seedNote(seeded) {
    if (!seeded || !seeded.length) return '';
    var s = seeded[0], n = Math.round(s.n).toLocaleString('en-US'), ind = state.org && state.org.industry ? ' ' + tt('Adjusted for {industry}.', { industry: tt(state.org.industry) }) : '';
    return ind + ' ' + (s.base === 'employees' ? tt('Starting figure from your organisation: {n} employees × {f}. Replace with the customer\'s own figure.', { n: n, f: s.f })
      : tt('Starting figure from your organisation: {n} customers × {f}. Replace with the customer\'s own figure.', { n: n, f: s.f }));
  }
  function addUseCase(i, key) {
    var uc = null; E.USE_CASES.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === key) uc = x; }); });
    var p = state.projectList[i]; if (!uc || !p) return 0;
    p.build = p.build || [];
    uc[2].forEach(function (ln) {
      var l = E.newLine(ln[0], lineDefaults());
      Object.keys(ln[1]).forEach(function (k) { if (k !== 'seed') l[k] = ln[1][k]; });
      if (l.what) l.what = tt(l.what);
      if (l.type === 'handling') l.salary = cardGroupSalary(state.country, l.group, state.currency);
      if (l.type === 'handling' || l.type === 'labour' || l.type === 'decom') l.auto = true;
      l.note = tt('Placeholder from the {uc} use case: replace with the customer\'s figures and say where they came from.', { uc: tt(uc[1]) }) + seedNote(E.seedLine(l, state, key));
      p.build.push(l);
    });
    return uc[2].length;
  }
  /* The application's type: a select on its row. Blank is fine; a type from the list adds the usual calculators. */
  function typeSelect(i, p) {
    return '<select data-usecase="' + i + '" title="' + esc(tt('Choose a type to add the usual calculators for it, with placeholder numbers to edit. Leave it blank to build the value yourself.')) + '"><option value="">' + esc(tt('Not set')) + '</option>' +
      E.USE_CASES.slice().sort(function (a, b) { var ia = state.org && state.org.industry === a[0] ? 0 : 1, ib = state.org && state.org.industry === b[0] ? 0 : 1; return ia - ib; }).map(function (g) { return '<optgroup label="' + esc(tt(g[0])) + '">' + g[1].map(function (x) { return '<option value="' + x[0] + '"' + (p.useCase === x[0] ? ' selected' : '') + '>' + esc(tt(x[1])) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>';
  }
  /* Adding a benefit: one searchable picker. Simple values first (cost savings, revenue uplift, risk reduction), then the calculators suited to the application's type, then the others;
   * search matches a calculator's name, what it improves, its typical uses, and application types. */
  var BENEFITS = [   // what it improves -> the calculator that measures it
    ['Staff get through work faster', 'handling'], ['Customers or staff serve themselves', 'deflect'], ['More people finish a sign-up or application', 'completion'],
    ['Fewer errors, rework or leakage', 'errors'], ['Cases are completed sooner', 'cycle'], ['Fewer failures, incidents or repeat visits', 'events'],
    ['More profit from customers', 'revenue'], ['Less risk or fewer penalties', 'risk']
  ];
  function usesOf(type) { return CALC_USES[type] || ''; }
  /* Search over application types and calculators at once: names, other names for the same thing, and typical uses, in English and the current language. */
  function typeItems() {
    var out = []; E.USE_CASES.forEach(function (g) { g[1].forEach(function (uc) {
      var al = E.USE_ALIASES[uc[0]] || '';
      out.push({ key: uc[0], text: tt(uc[1]) + ', ' + uc[1] + ', ' + tt(al) + ', ' + al, boost: state.org && state.org.industry === g[0] ? 1.5 : 0 });
    }); });
    return out;
  }
  function typeItems() {
    var out = []; E.USE_CASES.forEach(function (g) { g[1].forEach(function (uc) {
      var al = E.USE_ALIASES[uc[0]] || '';
      out.push({ key: uc[0], text: tt(uc[1]) + ', ' + uc[1] + ', ' + tt(al) + ', ' + al, boost: state.org && state.org.industry === g[0] ? 1.5 : 0 });
    }); });
    return out;
  }
  function pickItems() {
    var out = DRIVER_OPTS.map(function (o) { return { key: 'simple:' + o[0], t: 'simple', d: o[0], name: tt(o[1]), desc: '', grp: 'simple', text: tt(o[1]) + ', ' + o[1] }; });
    var phrase = {}; BENEFITS.forEach(function (bn) { phrase[bn[1]] = bn[0]; });
    phrase.labour = 'the time people save using it'; phrase.decom = 'costs that stop when an old system is retired';
    ['labour', 'decom'].concat(BENEFITS.map(function (bn) { return bn[1]; })).forEach(function (ty) {
      out.push({ key: ty, t: ty, d: '', name: tt(calcName(ty)), desc: tt(phrase[ty]), grp: 'calc', text: tt(calcName(ty)) + ', ' + calcName(ty) + ', ' + tt(phrase[ty]) + ', ' + phrase[ty] + ', ' + tt(usesOf(ty)) + ', ' + usesOf(ty) });
    });
    return out;
  }
  function pickHtml(i, q) {
    var p = state.projectList[i], query = String(q || '').trim(), html = '', items = pickItems(), byKey = {}, shown = {};
    items.forEach(function (it) { byKey[it.key] = it; });
    var opt = function (it) { return '<button type="button" class="pickopt" data-act="bl-add" data-i="' + i + '" data-t="' + it.t + '"' + (it.d ? ' data-d="' + it.d + '"' : '') + '><b>' + esc(it.name) + '</b>' + (it.desc ? ' <span class="cdesc">' + esc(it.desc) + '</span>' : '') + '</button>'; };
    var grp = function (title, list) { return list.length ? '<div class="pickgrp">' + esc(title) + '</div>' + list.map(opt).join('') : ''; };
    if (query) {
      E.matchTypes(query, items.map(function (it) { return { key: it.key, text: it.text }; }), 8).forEach(function (m) { html += opt(byKey[m.key]); });
      var tm = E.matchTypes(query, typeItems(), 4), tl = '';
      tm.forEach(function (m) {
        var uc = null; E.USE_CASES.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === m.key) uc = x; }); });
        tl += '<button type="button" class="pickopt" data-act="uc-pick" data-i="' + i + '" data-k="' + uc[0] + '"><b>' + esc(tt(uc[1])) + '</b> <span class="cdesc">' + tt('Adds {list}', { list: esc(uc[2].map(function (ln) { return tt(calcName(ln[0])); }).join(', ')) }) + '</span></button>';
      });
      if (tl) html += '<div class="pickgrp">' + tt('Application types') + '</div>' + tl;
      return html || '<div class="cdesc" style="padding:6px 8px">' + tt('No match. Try a broader word, or choose from the list below.') + '</div>';
    }
    var uc0 = null; E.USE_CASES.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === p.useCase) uc0 = x; }); });
    if (uc0) {
      var sg = []; uc0[2].forEach(function (ln) { if (byKey[ln[0]] && !shown[ln[0]]) { shown[ln[0]] = 1; sg.push(byKey[ln[0]]); } });
      html += grp(tt('Suggested for {type}', { type: tt(uc0[1]) }), sg);
    }
    html += grp(tt('Simple values'), items.filter(function (it) { return it.grp === 'simple'; }));
    html += grp(tt('Calculators'), items.filter(function (it) { return it.grp === 'calc' && !shown[it.key]; }));
    return html;
  }
  function openPick(i, q) { var el = $('pl-' + i); if (!el) return; el.innerHTML = pickHtml(i, q); el.hidden = false; }
  function closePicks() { Array.prototype.forEach.call(document.querySelectorAll('.picklist'), function (e) { e.hidden = true; }); }
  /* Guidance for an application's type: what each calculator's metrics mean for that kind of application. */
  function typeGuide(p) {
    var uc = null, out = {}; E.USE_CASES.forEach(function (g) { g[1].forEach(function (x) { if (x[0] === p.useCase) uc = x; }); });
    if (!uc || !uc[3]) return out;
    uc[2].forEach(function (ln, k) { if (uc[3][k]) out[ln[0]] = tt('In {type}:', { type: tt(uc[1]) }) + ' ' + tt(uc[3][k]); });
    return out;
  }
  function calcName(type) { var b = BLOCKS.filter(function (x) { return x[0] === type; })[0]; return b ? b[1] : type; }
  function calcTip(type) { return CALC_INFO[type] ? C.tip(tt(calcName(type)), tt(CALC_INFO[type])) : ''; }

  /* ---- Loaded cost: a salary people recognise, and a loaded cost multiplier per country (employee cost / salary) ---- */
  function cardMult(id) { var o = (state.loadCards || {})[id]; return o !== undefined && o > 0 ? o : R.loadMult(id); }
  function cardGroupSalary(id, g, cur) {   // the country's salary for a role group (its card if edited, else the built-in), in cur
    var o = ((state.groupCards || {})[id] || {})[g], base = o !== undefined ? o : R.groupSalary(id, g);
    return R.round3(base * R.convertCurrency(R.byId(id).cur, cur || R.byId(id).cur));
  }
  function lineDefaults() {
    return { group: 'ops', salary: cardGroupSalary(state.country, 'ops', state.currency), mult: cardMult(state.country), fteCost: R.round3(cardGroupSalary(state.country, 'it', state.currency) * cardMult(state.country)) };
  }
  /* A line that still follows the country baseline picks up a new role group, country or currency; one whose figures were typed in keeps them. */
  function refreshLine(l) {
    if (!l || !l.auto) return;
    if (l.type === 'labour' || l.type === 'handling') { l.salary = cardGroupSalary(state.country, l.group, state.currency); l.mult = cardMult(state.country); }
    else if (l.type === 'decom') l.fteCost = R.round3(cardGroupSalary(state.country, 'it', state.currency) * cardMult(state.country));
  }
  function refreshAutoLines() { (state.projectList || []).forEach(function (p) { (p.build || []).forEach(refreshLine); }); }
  function bpath(i, j, f) { return 'projectList.' + i + '.build.' + j + '.' + f; }
  function bsel(path, opts, val) {
    return '<select data-bsel="' + path + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
  }
  function btxt(path, val, ph) { return '<input type="text" data-tpath="' + path + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '">'; }
  var BCOLS = {
    simple: [['Value driver', 'Which headline value this amount belongs to: cost savings (a hard saving), revenue uplift or risk reduction (soft benefits).'], ['Amount / year', 'The yearly value once the application is live, typed in. Use a detailed calculator when you want to show how the figure is worked out.'],
      ['Per year', 'The yearly value of this line.'], ['', '']],
    labour: [['Role group', 'The kind of people whose time is saved. The salary starts from a typical figure for this group in the country; change it for a specific role.'], ['Users', 'How many people use the application in this role.'],
      ['Salary', 'Typical annual salary for the role, the figure people recognise. Starts from the country baseline (a placeholder); type over it to use the real one.'], ['Loaded ×', 'Employee cost divided by salary: pension or superannuation, payroll taxes, leave, equipment and space. Commonly 1.2 to 1.5.'],
      ['Time saved %', 'The share of each user\'s working time the application saves. Typically 10 to 30% for a workflow application; above about 40% deserves a second look.'], ['Adoption %', 'The share of those users who actually use the application. Typically 60 to 90%.'],
      ['Counts as', 'Cash saving: headcount, contractors, overtime or backfill that is actually avoided (a hard saving). Freed capacity: time that is released but redeployed (a soft benefit, counted only in part).'],
      ['Realised %', 'For freed capacity: the share of the time that turns into real value.'], ['Per year', 'The yearly value of this line, once the application is live.'], ['', '']],
    decom: [['What is turned off', 'The legacy system, platform or service that this application allows you to retire.'], ['Licences', 'Licence fees per year that stop.'], ['Infrastructure', 'Hosting, databases, disaster recovery and data-centre costs per year that stop.'],
      ['Support', 'Vendor support and contracted maintenance per year that stop.'], ['FTE', 'People (full-time equivalents) who run it and are released to other work or no longer needed.'], ['Cost / FTE', 'Loaded annual cost of one of those people. Starts from the IT operations baseline.'],
      ['Retired %', 'How much of it is switched off: less than 100% when only one module or region goes.'], ['Per year', 'The yearly saving, counted as a hard saving.'], ['', '']],
    revenue: [['Basis', 'What the units are: customers (retention and upsell), transactions (conversion and throughput), or something else.'], ['Units', 'How many customers or transactions the change applies to each year.'],
      ['Revenue per unit', 'Average annual revenue per customer, or per transaction.'], ['Uplift %', 'The percentage change in revenue per unit that the application brings. Typically 1 to 5%.'], ['Margin %', 'Contribution margin: only this share of extra revenue is profit, and profit is what counts as value. Often 20 to 40%.'],
      ['Profit / year', 'Units × revenue per unit × uplift × margin. Hover for the revenue before margin.'], ['', '']],
    handling: [['What is handled', 'What the transactions are, for example claims, applications or invoices.'], ['Role group', 'The kind of people who handle them. The salary starts from a typical figure for this group in the country; change it for a specific role.'], ['Transactions / year', 'How many transactions are handled in a year, once the application is live.'],
      ['Minutes saved each', 'Handling time saved on each transaction, in minutes.'], ['Salary', 'Typical annual salary for the role. Starts from the country baseline (a placeholder); type over it to use the real one.'], ['Loaded ×', 'Employee cost divided by salary: pension or superannuation, payroll taxes, leave, equipment and space. Commonly 1.2 to 1.5.'],
      ['Counts as', 'Cash saving: handling cost that is actually avoided (overtime, contractors, backfill). Freed capacity: time that is released but redeployed (a soft benefit, counted only in part).'], ['Realised %', 'For freed capacity: the share of the time that turns into real value.'], ['Per year', 'The yearly value of this line, once the application is live.'], ['', '']],
    deflect: [['What is deflected', 'The kind of request, for example status calls, policy changes or password resets.'], ['Requests / year', 'How many of these requests arrive in a year.'], ['Self-service %', 'The share of those requests that customers or staff now handle themselves, with no person involved.'],
      ['Cost per request', 'What it costs to handle one request today, including the person\'s time and the channel.'], ['Per year', 'The yearly cost avoided, counted as a hard saving.'], ['', '']],
    completion: [['What is started', 'The process people start, for example applications, sign-ups or bookings.'], ['Starts / year', 'How many people start the process in a year.'], ['Rate before %', 'The share who finish it today.'], ['Rate after %', 'The share who would finish it with the application.'],
      ['Value per completion', 'Revenue from one completed process, for example a customer\'s first-year revenue.'], ['Margin %', 'The share of that revenue that is profit.'], ['Profit / year', 'Starts × the rise in completion × value × margin.'], ['', '']],
    errors: [['What is handled', 'What the transactions are, for example invoices, claims or orders.'], ['Transactions / year', 'How many transactions are handled in a year.'], ['Error rate before %', 'The share that go wrong or need rework today.'], ['Error rate after %', 'The share that would go wrong with the application.'],
      ['Cost per error', 'What one error costs to put right, including rework time, write-offs and any leakage.'], ['Per year', 'The yearly cost avoided, counted as a hard saving.'], ['', '']],
    cycle: [['What is completed', 'The cases, for example claims, orders or applications.'], ['Cases / year', 'How many cases are completed in a year.'], ['Days saved each', 'How many days sooner each case is completed.'], ['Value of a day', 'What one day sooner is worth for one case: interest, cash brought forward or revenue earlier.'],
      ['Realised %', 'The share of that value that really arrives. It is a soft benefit, so be cautious.'], ['Per year', 'The yearly value of this line, once the application is live.'], ['', '']],
    events: [['What is avoided', 'The kind of event, for example breakdowns, repeat visits or incidents.'], ['Events / year', 'How many of these events happen in a year today.'], ['Reduction %', 'The share of those events that no longer happen.'], ['Cost per event', 'What one event costs, including repair, lost time and any penalties.'],
      ['Per year', 'The yearly cost avoided, counted as a hard saving.'], ['', '']],
    risk: [['What', 'The risk, for example "regulatory fines" or "outage losses".'], ['Exposure / year', 'The expected annual loss without the application: probability × impact.'], ['Reduction %', 'The share of that loss the application removes. Typically 10 to 30%.'],
      ['Per year', 'The expected loss avoided each year.'], ['', '']],
    other: [['What', 'A benefit that the other line types do not cover.'], ['Amount / year', 'The yearly amount.'], ['Counts as', 'Cash is a hard saving. Soft is counted with the revenue and productivity benefits.'], ['Per year', 'The yearly value of this line.'], ['', '']]
  };
  var HOW = [['cash', 'Cash saving'], ['capacity', 'Freed capacity']];
  /* Which of the three headline values a line belongs to, for grouping: cost savings, revenue and productivity, or risk reduction. */
  var LINE_CATS = [['cost', 'Cost savings'], ['rev', 'Revenue and productivity'], ['risk', 'Risk reduction']];
  function lineCat(l) {
    if (l.type === 'simple') return l.driver === 'rev' || l.driver === 'risk' ? l.driver : 'cost';
    if (l.type === 'risk') return 'risk';
    if (l.type === 'labour' || l.type === 'handling' || l.type === 'other') return l.how === 'cash' ? 'cost' : 'rev';
    if (l.type === 'revenue' || l.type === 'completion' || l.type === 'cycle') return 'rev';
    return 'cost';
  }
  /* One line of value on one row: its type, the figures of its formula (labelled), the yearly amount at the right (typed for a simple value, calculated otherwise), and a note icon that opens the
   * justification. */
  function builderLine(i, j, l, guide) {
    var P = function (f) { return bpath(i, j, f); }, num = function (f, step, max) { return inp(P(f), step || 1, 0, max); }, f = [], key = i + '-' + j;
    if (l.type === 'labour') {
      f = [bsel(P('group'), R.ROLE_GROUPS.map(function (g) { return [g.key, g.label]; }), l.group), num('users'), num('salary'), num('mult', 0.05), num('saved', 5, 100), num('adopt', 5, 100), bsel(P('how'), HOW, l.how), l.how === 'capacity' ? num('realise', 5, 100) : null];
    } else if (l.type === 'handling') {
      f = [btxt(P('what'), l.what, 'What is handled'), bsel(P('group'), R.ROLE_GROUPS.map(function (g) { return [g.key, g.label]; }), l.group), num('volume'), num('mins', 0.5), num('salary'), num('mult', 0.05), bsel(P('how'), HOW, l.how), l.how === 'capacity' ? num('realise', 5, 100) : null];
    } else if (l.type === 'deflect') {
      f = [btxt(P('what'), l.what, 'What is deflected'), num('volume'), num('share', 5, 100), num('per', 1)];
    } else if (l.type === 'completion') {
      f = [btxt(P('what'), l.what, 'What is started'), num('units'), num('from', 1, 100), num('to', 1, 100), num('per'), num('margin', 5, 100)];
    } else if (l.type === 'errors') {
      f = [btxt(P('what'), l.what, 'What is handled'), num('volume'), num('from', 0.5, 100), num('to', 0.5, 100), num('per', 1)];
    } else if (l.type === 'cycle') {
      f = [btxt(P('what'), l.what, 'What is completed'), num('volume'), num('days', 0.5), num('per', 1), num('realise', 5, 100)];
    } else if (l.type === 'events') {
      f = [btxt(P('what'), l.what, 'What is avoided'), num('volume'), num('reduction', 5, 100), num('per')];
    } else if (l.type === 'decom') {
      f = [btxt(P('what'), l.what, 'What is turned off'), num('lic'), num('infra'), num('support'), num('fte', 0.5), num('fteCost'), num('retired', 5, 100)];
    } else if (l.type === 'revenue') {
      f = [bsel(P('basis'), [['customers', 'Customers'], ['transactions', 'Transactions'], ['other', 'Other units']], l.basis), num('units'), num('per'), num('uplift', 1, 100), num('margin', 5, 100)];
    } else if (l.type === 'risk') {
      f = [btxt(P('what'), l.what, 'The risk'), num('exposure'), num('reduction', 5, 100)];
    } else if (l.type !== 'simple') {
      f = [btxt(P('what'), l.what, 'What it is'), num('amount'), bsel(P('how'), [['cash', 'Cash saving'], ['soft', 'Soft benefit']], l.how)];
    }
    var cols = BCOLS[l.type] || [], fields = f.map(function (h, k) {
      var c = cols[k]; if (h === null || !c) return '';
      return '<label class="fx' + (/type="text"/.test(h) ? ' fxw' : '') + '"' + (c[1] ? C.tip(c[0], c[1]) : '') + '><span>' + esc(c[0] === 'Salary' ? tt('Salary ({c})', { c: curSym() }) : tt(c[0])) + '</span>' + h + '</label>';
    }).join('');
    var typeCell = l.type === 'simple'
      ? bsel(P('driver'), DRIVER_OPTS.map(function (o) { return [o[0], tt(o[1])]; }), l.driver)
      : '<span class="bty-n"' + (CALC_INFO[l.type] ? C.tip(tt(calcName(l.type)), tt(CALC_INFO[l.type]) + (guide && guide[l.type] ? '\n\n' + guide[l.type] : '')) : '') + '>' + esc(tt(calcName(l.type))) + '</span>';
    var amount = l.type === 'simple' ? inp(P('amount'), 10000, 0) : '<b class="ro" id="bl-' + key + '"' + yrAttr(bpath(i, j, 'value')) + '></b>';
    var has = String(l.note || '').trim() !== '';
    return '<div class="bl2 t-' + l.type + '"><div class="bty">' + typeCell + '</div><div class="bfs">' + fields + '</div><div class="bamt">' + amount + '</div>' +
      '<button type="button" class="b bnb' + (has ? ' has' : '') + '" data-note="' + key + '"' + (has ? C.tip(tt('Why this figure'), String(l.note)) : C.tip(tt('Why this figure'), tt('Add a note: where the figure came from, or who confirmed it.'))) + ' aria-label="' + esc(tt('Why this figure')) + '">✎</button>' +
      '<button type="button" class="b" data-act="bl-del" data-i="' + i + '" data-j="' + j + '" title="' + esc(tt('Remove this line')) + '">×</button>' +
      '<div class="bnotebox" id="nb-' + key + '"' + (has ? '' : ' hidden') + '><textarea rows="2" data-tpath="' + P('note') + '" placeholder="' + esc(tt('Why: the justification for this line (source, who confirmed it)')) + '">' + esc(l.note || '') + '</textarea></div></div>';
  }
  function builderPanel(i, p) {
    var lines = p.build || [], guide = typeGuide(p), cats = {};
    lines.forEach(function (l, j) { var c = lineCat(l); (cats[c] = cats[c] || []).push(j); });
    var multi = Object.keys(cats).length > 1;
    var html = '<div class="bpanel"><div class="bhead"><b>' + tt('Value for {name}', { name: esc(p.name || tt('this application')) }) + '</b>' + (multi ? '' : '<span class="bsum" id="bsum-' + i + '"></span>') + (lines.length ? '<button type="button" class="b" data-act="bl-copy" data-i="' + i + '"' + C.tip('Copy these lines', 'Copies these benefit lines to every other included application that has none yet, so a group of similar applications starts from the same build-up.') + '>' + tt('Copy these lines to the other applications') + '</button>' : '') + '</div>';
    LINE_CATS.forEach(function (c) {
      if (!cats[c[0]]) return;
      if (multi) html += '<div class="bgh"><b>' + tt(c[1]) + '</b><span class="bsub" id="bg-' + i + '-' + c[0] + '"></span></div>';
      cats[c[0]].forEach(function (j) { html += builderLine(i, j, lines[j], guide); });
    });
    if (!lines.length) {
      var exLine = E.newLine('labour', { group: 'case', salary: cardGroupSalary(state.country, 'case', state.currency), mult: cardMult(state.country) }); exLine.users = 40; exLine.saved = 20; exLine.adopt = 80;
      html += '<div class="note">' + tt('Add a calculator to give this application a value: a simple amount for cost savings, revenue uplift or risk reduction, or a detailed one that works the figure out from people\'s time, legacy systems switched off, revenue or risk.') + '</div>' +
        '<div class="note">' + tt('For example: 40 case handlers saving 20% of their time, with 80% of them using the application, is worth about {amt} a year as freed capacity.', { amt: C.moneyShort(E.lineValue(exLine).rev) }) + '</div>' +
        '<p><button type="button" class="b pri" data-act="bl-example" data-i="' + i + '">' + tt('Start with this example') + '</button></p>';
    }
    html += '<div class="addrow"><input type="search" class="pickin" data-pick="' + i + '" autocomplete="off" placeholder="' + esc(tt('Add a benefit: search by what the application does, or choose')) + '"><div class="picklist" id="pl-' + i + '" hidden></div></div>';
    if (lines.length) html += (E.overlapping(lines) ? '<div class="note" style="color:var(--warn)">' + tt('Time saved per user or per transaction, and requests deflected, can count the same saving twice. Make sure each counts a different piece of work.') + '</div>' : '') + '<div class="note">Cash savings and switch-off savings are hard; freed capacity, revenue and risk are soft, and "Hard savings only" leaves them out. These are yearly figures once the application is live: going live sooner is already valued by the model, so do not count it again here.</div>';
    return html + '</div>';
  }
  /* Show each built application's calculated figures: the three value cells, every line's yearly value, and the totals. */
  function syncBuild() {
    var list = E.ensureList(state);
    var M = C.money, set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    list.forEach(function (p, i) {
      var t = E.buildValue(p), sub = {};
      p.build = p.build || [];
      p.build.forEach(function (l, j) {
        var v = t.lines[j], tot = v.cost + v.rev + v.risk;
        set('bl-' + i + '-' + j, M(tot)); sub[l.type] = (sub[l.type] || 0) + tot;
        var sv = document.querySelector('input[data-path="' + bpath(i, j, 'saved') + '"]'); if (sv) sv.classList.toggle('warnin', Number(l.saved) > 40);
        var us = document.querySelector('input[data-path="' + bpath(i, j, 'users') + '"]'); if (us) us.classList.toggle('warnin', num0(state.org && state.org.employees) > 0 && Number(l.users) > num0(state.org.employees));   // more users than the organisation has people
        var rb = $('bl-' + i + '-' + j); if (rb && rb.parentNode && l.type === 'revenue') rb.parentNode.setAttribute('data-tip', tt('Revenue before margin') + '::' + tt('{rev} a year; {profit} is the profit.', { rev: M(num0(l.units) * num0(l.per) * num0(l.uplift) / 100), profit: M(tot) }));
      });
      set('bg-' + i + '-cost', M(t.cost)); set('bg-' + i + '-rev', M(t.rev)); set('bg-' + i + '-risk', M(t.risk));
      set('bsum-' + i, tt('Cost savings {a} · Revenue and productivity {b} · Risk reduction {c}', { a: M(t.cost), b: M(t.rev), c: M(t.risk) }));
      set('apptot-' + i, M(t.cost + t.rev + t.risk));
    });
  }
  function num0(x) { var n = parseFloat(x); return isFinite(n) ? n : 0; }


  /* A modal question: the page behind is dimmed, Cancel and Esc close it, and the action only runs on the confirming button. */
  function askModal(title, body, okText, onOk) {
    var m = $('modal');
    if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
    m.innerHTML = '<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mtitle"><h3 id="mtitle">' + esc(title) + '</h3><p>' + esc(body) + '</p><div class="mbtns"><button type="button" class="b" data-mc="no">' + esc(tt('Cancel')) + '</button><button type="button" class="b danger" data-mc="yes">' + esc(okText) + '</button></div></div>';
    m.hidden = false; m._ok = onOk;
    var c = m.querySelector('[data-mc="no"]'); if (c) c.focus();
  }
  function closeModal(run) {
    var m = $('modal'); if (!m || m.hidden) return;
    m.hidden = true; var f = m._ok; m._ok = null;
    if (run && f) f();
  }

  function buildProjects() {
    var cur = state.currency, list = E.ensureList(state), groups = E.ensureGroups(state), gcol = groups.length > 1;
    E.migrateMonths(state); E.deriveMonths(state);
    var head = '<div class="apph head' + (gcol ? ' g' : '') + '"><span></span><span></span><span' + C.tip('Application or group', 'A row is one application, or a group of related applications that are delivered together. Name it either way. The portfolio starts as one row that stands for all of them.') + '>' + tt('Application or group of applications') + '</span><span' + C.tip('Type', 'What kind of application this is, such as a self-service portal, digital onboarding, claims handling or permits. Picking a type adds the usual calculators for it with placeholder numbers to replace. Optional: leave it blank to build the value yourself.') + '>' + tt('Type') + '</span>' + (gcol ? '<span' + C.tip('Delivery team', 'Who delivers this application, and at what cost level. Set up the delivery teams below.') + '>' + tt('Delivery team') + '</span>' : '') +
      '<span' + C.tip('Months', 'How long the OutSystems team is actively working on this application (or group): design, build and fixes, not time waiting in review queues. One team delivers the applications one after another, so the portfolio\'s months are the total.') + '>' + tt('Months') + '</span>' +
      '<span' + C.tip('Developers', 'OutSystems developers on this application. The architects, testers, analysts and others they imply come from the role mix. The alternative\'s team is worked out from this.') + '>' + tt('Developers') + '</span>' +
      '<span' + C.tip('Value per year', tt('The yearly value of this application once it is live, added up from its calculators, in {cur}.', { cur: cur })) + '>' + tt('Value per year') + '</span>' +
      '<span' + C.tip('Delivery cost', 'What the OutSystems delivery team costs for this application: its months, developers and the delivery team\'s rate level. Hover a figure for the alternative\'s cost.') + '>' + tt('Delivery cost') + '</span><span></span></div>';
    var appCard = function (p, i) {
      var on = p.include !== false, base = 'projectList.' + i, open = isAppOpen(i, list.length);
      return '<div class="appc' + (on ? '' : ' off') + (open ? '' : ' closed') + '" data-i="' + i + '"><div class="apph' + (gcol ? ' g' : '') + '"><button type="button" class="b car" data-appfold="' + i + '" title="' + esc(tt('Show or hide the value details')) + '">' + (open ? '▾' : '▸') + '</button><input type="checkbox" data-incl="' + i + '"' + (on ? ' checked' : '') + C.tip('Include in the assessment', 'Switch off to leave this application out of every number and chart.') + '>' +
        '<input type="text" data-tpath="' + base + '.name" value="' + esc(p.name) + '">' + typeSelect(i, p) +
        (gcol ? '<select data-bsel="' + base + '.group">' + groups.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === p.group ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>' : '') + inp(base + '.months', 0.5, 0.1, 60) + inp(base + '.devs', 1, 1, 200) +
        '<b class="ro" id="apptot-' + i + '"></b><b class="ro" id="appcost-' + i + '"></b>' +
        (list.length > 1 ? '<button class="b" data-act="remove" data-i="' + i + '" title="' + esc(tt('Remove this application')) + '">×</button>' : '<span></span>') + '</div>' + builderPanel(i, p) + '</div>';
    };
    var blocks = groups.map(function (g, gi) {
      var open = gClosed[g.id] ? false : true, inGroup = list.map(function (p, i) { return p.group === g.id ? appCard(p, i) : ''; }).join('');
      return '<div class="dgroup' + (open ? '' : ' closed') + '" data-g="' + esc(g.id) + '">' + groupHeader(g, gi, groups.length, open) +
        '<div class="dgbody"><div class="appwrap">' + head + inGroup + '</div><p><button class="b" data-act="add" data-g="' + esc(g.id) + '">' + tt('Add application') + '</button>' + (list.length > 1 ? ' <a class="more" data-appfoldall="open">' + tt('Expand all') + '</a> · <a class="more" data-appfoldall="close">' + tt('Collapse all') + '</a>' : '') + '</p></div></div>';
    }).join('');
    $('cfg-applications').innerHTML = page('Applications', tt('The portfolio starts as one application that stands for all of them, with its value as simple calculators for cost savings, revenue uplift and risk reduction. Add detailed calculators, or more applications, when you want more precision; nothing already entered is thrown away. Applications are delivered one after another by one team.'),
      '<div class="card" style="grid-column:1/-1"><div class="note" style="margin:0 0 8px">' +
      tt('A delivery team is whoever delivers some of the applications (an internal team, a partner or a supplier), with its own cost level. Developer based: the developers and roles are costed at the reference rates times the rate level (a partner might be 140%, an internal team 85%). Given cost: you enter what its applications will cost and the rate level follows from it. Applications are still delivered one after another.') + '</div>' +
      blocks + '<div class="note" id="projsum"></div><p><button class="b" data-act="gadd">' + tt('Add delivery team') + '</button></p></div>');
    updateProjectSummary(); syncBuild(); updateRateNote();
  }
  var gClosed = {};   // delivery groups whose applications are folded away
  /* Each application's value details (its calculators) fold away under its header row. With up to three applications they start open; a longer portfolio starts folded, so it stays easy to scan. */
  var appOpen = {};
  function isAppOpen(i, n) { return appOpen[i] !== undefined ? appOpen[i] : n <= 3; }
  function applyAppFold() {
    var n = state.projectList.length;
    Array.prototype.forEach.call(document.querySelectorAll('#cfg-applications .appc'), function (el) {
      var i = parseInt(el.dataset.i, 10), open = isAppOpen(i, n), b = el.querySelector('[data-appfold]');
      el.classList.toggle('closed', !open); if (b) b.textContent = open ? '▾' : '▸';
    });
  }

  /* The header of a delivery group: its name, how its people are costed, a summary of its applications, and the fold. */
  /* An ISO date written for the reader's language (falls back to the ISO form). */
  function showDate(iso) {
    var t = E.parseDate(iso); if (t === null) return iso || '';
    try { return new Date(t).toLocaleDateString(AVAI18n.lang() === 'en' ? 'en-AU' : AVAI18n.lang(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'utc' }); } catch (e) { return iso; }
  }
  /* How experienced the team is with OutSystems: less experienced developers cost less per day but take longer. Developer-based teams only. */
  var SKILL_LEVELS = [['experienced', 'Experienced'], ['mixed', 'Mixed experience'], ['newer', 'Less experienced']];
  /* Developer quality of a delivery team: a level (or Custom) that sets how much slower the team is (with either approach), the discount on its pay, and the training each developer needs to
   * learn OutSystems. The three figures sit beside the level and can be typed over: the team then becomes Custom. A slower team costs more unless its pay is lower, and goes live later
   * whatever its pay. */
  function skillControl(g, i, quote) {
    return '<label class="gl"' + C.tip(tt('Developer quality'), tt('How quick and experienced this team is. A less experienced team is usually paid less but takes longer, so the saving does not carry through to the cost, and the extra time delays go-live and the value. The level sets the three figures beside it, which you can change: the team then becomes Custom. The levels are on the Defaults tab.')) + '>' + tt('Developer quality') + ' <select data-gskill="' + i + '">' +
      SKILL_LEVELS.concat([['custom', 'Custom']]).map(function (x) { return '<option value="' + x[0] + '"' + ((g.skill || 'experienced') === x[0] ? ' selected' : '') + '>' + esc(tt(x[1])) + '</option>'; }).join('') + '</select></label>';
  }
  function qualityRow(g, i, quote) {
    var sk = E.skillOf(state, g), f = function (field, label, tip, val, step) {
      return '<label class="gl gqf"' + C.tip(tt(label), tt(tip)) + '>' + tt(label) + ' <input type="number" step="' + step + '" data-gq="' + i + '" data-gqf="' + field + '" value="' + val + '"></label>';
    };
    return f('pace', 'Slower by (%)', 'How much longer this team takes than an experienced one, with either approach. 50 means half as long again. It can fall away over the team\'s first applications (Defaults tab).', Math.round(sk.pace * 10) / 10, 5) +
      f('discount', 'Pay discount (%)', 'How much less this team is paid than an experienced one, as a percentage. It is separate from the slowdown and applies to both approaches: the same people deliver whichever is chosen.', Math.round(sk.discount * 10) / 10, 5) +
      f('enable', 'Training per developer', 'The one-off cost to train and coach each developer to learn OutSystems, charged at the start of the team\'s work. It applies to OutSystems only.', Math.round(sk.enable), 500);
  }
  /* When this delivery team starts: some months after the start, after the previous team finishes, or after a date. */
  function startControls(g, i) {
    if (i === 0) {   // the first team starts when the assessment does: this is the assessment's start date (clear it to work in relative time)
      return '<label class="gl"' + C.tip(tt('Starts'), tt('The first day of the assessment: the first delivery team starts then. Later teams can start after it, at the same time, or on a date of their own. Clear the date to work in relative time, without calendar dates.')) + '>' + tt('Starts') + ' <input type="date" data-text="startDate" value="' + esc(state.startDate || '') + '"></label>';
    }
    var st = g.start || { mode: 'after', date: '', team: '', months: 0 }, others = E.ensureGroups(state).filter(function (o) { return o.id !== g.id; });
    var opts = [['start', 'the start'], ['after', 'the previous team finishes'], ['fixed', 'a date']].concat(st.mode === 'team' && others.length ? [['team', 'another team finishes']] : []);   // 'another team' only for older files that use it
    var sel = '<select data-gstart="' + i + '" data-gfield="mode">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === st.mode ? ' selected' : '') + '>' + esc(tt(o[1])) + '</option>'; }).join('') + '</select>';
    var moIn = '<input type="number" min="0" step="0.5" data-gstart="' + i + '" data-gfield="months" value="' + esc(st.months) + '" style="width:60px">', more = '';
    if (st.mode === 'fixed') more = ' <input type="date" data-gstart="' + i + '" data-gfield="date" value="' + esc(st.date || '') + '"' + (state.startDate ? '' : ' disabled') + '>' + (state.startDate ? '' : ' <span class="note">' + tt('Set the assessment start date under Assumptions to use a date.') + '</span>');
    else if (st.mode === 'team') more = ' <select data-gstart="' + i + '" data-gfield="team">' + others.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === st.team ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select>';
    var sc = res && E.schedule(state, E.expectedTime(state, 'os'), 'os'), d0 = sc && sc.teamStart && sc.teamStart[g.id] !== undefined && state.startDate ? E.dateAtWeek(state, sc.teamStart[g.id]) : '';   // the date it works out to
    return '<label class="gl"' + C.tip(tt('Starts'), tt('When this team begins: some months after the start of the assessment (0 runs it alongside the first team), after the previous team finishes (0 is straight after), or after a date. The end date follows from its applications.')) + '>' + tt('Starts') + ' ' + moIn + ' ' + tt('months after') + ' ' + sel + more + (d0 ? ' <span class="note" data-gdate="' + esc(g.id) + '">' + esc(showDate(d0)) + '</span>' : '') + '</label>';
  }
  var gqOpen = {};   // delivery teams whose developer-experience details are open: they open by themselves once the team is not at the default level
  function gqIsOpen(g) { return gqOpen[g.id] !== undefined ? gqOpen[g.id] : (g.skill || 'experienced') !== 'experienced'; }
  function groupHeader(g, i, nGroups, open) {
    var q = g.mode === 'quote';
    return '<div class="dgh"><button type="button" class="b car" data-gtoggle="' + esc(g.id) + '" title="' + esc(tt('Show or hide the applications in this delivery team')) + '">' + (open ? '▾' : '▸') + '</button>' +
      '<input type="text" data-tpath="deliveryGroups.' + i + '.name" value="' + esc(g.name) + '" placeholder="' + esc(tt('Who delivers: a partner, Internal, Offshore…')) + '"' + C.tip(tt('Delivery team'), tt('Name the team after who delivers, such as a partner\'s name, Internal or Offshore. Teams can have different cost levels, and each has its own view on the Team tab.')) + '>' +
      '<div class="radios"><label><input type="radio" name="gmode-' + i + '" data-gmode="' + i + '" value="team"' + (q ? '' : ' checked') + '> ' + tt('Developer based') + '</label>' +
      '<label><input type="radio" name="gmode-' + i + '" data-gmode="' + i + '" value="quote"' + (q ? ' checked' : '') + '> ' + tt('Given cost') + '</label></div>' +
      (q ? '<label class="gl">' + tt('Delivery cost') + ' <i>' + esc(curSym()) + '</i> ' + inp('deliveryGroups.' + i + '.quote', 10000, 0) + '</label>' : '<label class="gl"' + C.tip('Rate level (%)', 'How the delivery people\'s cost compares with the reference rates for the country: 100% uses them as they are; a partner might be 140% and an internal team 85%.') + '>' + tt('Rate level (%)') + ' ' + inp('deliveryGroups.' + i + '.rate', 5, 10, 500) + '</label>') +
      startControls(g, i) +
      '<button type="button" class="b gqt" data-gqtoggle="' + esc(g.id) + '"' + C.tip(tt('Developer quality'), tt('How quick and experienced this team is. A less experienced team is usually paid less but takes longer, so the saving does not carry through to the cost, and the extra time delays go-live and the value. The level sets the three figures beside it, which you can change: the team then becomes Custom. The levels are on the Defaults tab.')) + '>' + tt('Skill level: {level}', { level: esc(tt(((SKILL_LEVELS.filter(function (x) { return x[0] === (g.skill || 'experienced'); })[0]) || ['custom', 'Custom'])[1])) }) + ' <span class="car">' + (gqIsOpen(g) ? '▾' : '▸') + '</span></button>' +
      (nGroups > 1 ? '<button class="b" data-act="gdel" data-i="' + i + '" title="' + esc(tt('Remove this delivery team')) + '">×</button>' : '') +
      '<div class="gqrow"' + (gqIsOpen(g) ? '' : ' hidden') + '>' + skillControl(g, i, q) + qualityRow(g, i, q) + '</div>' + '</div>';
  }

  /* The ratios behind the starting figures: how many people are in each role, and how volumes scale with customers or employees. All editable and resettable. */
  var SEED_FIELD = { volume: 'Volume per year', units: 'Starts or units per year' };
  function seedTables() {
    var sd = state.seeds || E.seedDefaults(), p = function (path, step, v) { return '<input type="number" data-path="' + path + '" data-scope="state" step="' + step + '" min="0" value="' + v + '">'; };
    var baseSel = function (path, v) { return bsel(path, [['customers', tt('Customers')], ['employees', tt('Employees')]], v); };
    var roles = '<tr><th>' + tt('Role group') + '</th><th' + C.tip(tt('% of employees'), tt('The share of all employees who work in this role. Used for the number of users of a people-time calculator.')) + '>' + tt('% of employees') + '</th></tr>' +
      R.ROLE_GROUPS.map(function (g) { return '<tr><td>' + esc(tt(g.label)) + '</td><td>' + p('seeds.roleShare.' + g.key, 0.5, num0((sd.roleShare || {})[g.key])) + '</td></tr>'; }).join('') +
      '<tr><td' + C.tip(tt('Share on one application'), tt('One application typically serves only part of a role. This is the share of the people in the role who use a single application.')) + '>' + tt('Share on one application') + ' %</td><td>' + p('seeds.coverage', 5, num0(sd.coverage)) + '</td></tr>';
    var head = '<tr><th>' + tt('Calculator') + '</th><th>' + tt('Sets') + '</th><th>' + tt('Scales with') + '</th><th' + C.tip(tt('Per year'), tt('How many of that figure there are each year for every employee or customer. 3 means three a year for each.')) + '>' + tt('Per employee or customer') + '</th></tr>';
    var lineRows = '', useRows = '';
    Object.keys(sd.lines || {}).forEach(function (ty) { Object.keys(sd.lines[ty]).forEach(function (f) {
      lineRows += '<tr><td>' + esc(tt(calcName(ty))) + '</td><td>' + esc(tt(SEED_FIELD[f] || f)) + '</td><td>' + baseSel('seeds.lines.' + ty + '.' + f + '.base', sd.lines[ty][f].base) + '</td><td>' + p('seeds.lines.' + ty + '.' + f + '.f', 0.01, num0(sd.lines[ty][f].f)) + '</td></tr>'; }); });
    E.USE_CASES.forEach(function (g) { g[1].forEach(function (uc) { var r = (sd.uses || {})[uc[0]]; if (!r) return;
      Object.keys(r).forEach(function (ty) { Object.keys(r[ty]).forEach(function (f) {
        useRows += '<tr><td>' + esc(tt(uc[1])) + '</td><td>' + esc(tt(calcName(ty))) + '</td><td>' + esc(tt(SEED_FIELD[f] || f)) + '</td><td>' + baseSel('seeds.uses.' + uc[0] + '.' + ty + '.' + f + '.base', r[ty][f].base) + '</td><td>' + p('seeds.uses.' + uc[0] + '.' + ty + '.' + f + '.f', 0.01, num0(r[ty][f].f)) + '</td></tr>'; }); }); }); });
    var orgRows = '<tr><th>' + tt('Country') + '</th><th>' + tt('Employees') + '</th><th>' + tt('Customers') + '</th></tr>' + R.REGIONS.map(function (r) {
      var t = ((sd.orgTypical || {})[r.id]) || [0, 0];
      return '<tr><td>' + esc(tt(r.name)) + '</td><td>' + p('seeds.orgTypical.' + r.id + '.0', 100, num0(t[0])) + '</td><td>' + p('seeds.orgTypical.' + r.id + '.1', 10000, num0(t[1])) + '</td></tr>'; }).join('');
    var roleKeys = R.ROLE_GROUPS.map(function (g) { return g.key; });
    var indRows = '<tr><th>' + tt('Industry') + '</th><th' + C.tip(tt('Customers ×'), tt('Multiplies the customers of the typical organisation: more than 1 for industries with many customers for each employee, less for those with few.')) + '>' + tt('Customers ×') + '</th>' +
      R.ROLE_GROUPS.map(function (g) { return '<th>' + esc(tt(g.label)) + ' ×</th>'; }).join('') + '</tr>' + E.INDUSTRIES.map(function (x) { var d = (sd.industry || {})[x[0]] || { customers: 1, roles: {} };
        return '<tr><td>' + esc(tt(x[0])) + '</td><td>' + p('seeds.industry.' + x[0] + '.customers', 0.1, num0(d.customers)) + '</td>' +
          roleKeys.map(function (r) { return '<td>' + p('seeds.industry.' + x[0] + '.roles.' + r, 0.1, d.roles && d.roles[r] !== undefined ? d.roles[r] : 1) + '</td>'; }).join('') + '</tr>'; }).join('');
    var wide = function (h) { return h.replace('<div class="card">', '<div class="card" style="grid-column:1/-1">'); };
    return wide(card('Starting figures from the size of the organisation', '<div class="note">' + tt('When a calculator is added, or an application type is chosen, its volumes start from the organisation\'s employees and customers (Inputs pane) using the ratios below. They are only starting points and never change a figure once it is in a calculator. These ratios are placeholders to refine; they are saved with this assessment.') + '</div>' +
      '<div class="refwrap"><table class="ref">' + roles + '</table></div>' +
      '<div class="refwrap"><table class="ref">' + head + lineRows + '</table></div>' +
      '<div class="refwrap"><table class="ref"><tr><th>' + tt('Application type') + '</th><th>' + tt('Calculator') + '</th><th>' + tt('Sets') + '</th><th>' + tt('Scales with') + '</th><th>' + tt('Per employee or customer') + '</th></tr>' + useRows + '</table></div>' +
      '<div class="note">' + tt('A typical large organisation in each country, used for the employee and customer figures until they are typed in. Illustrative placeholders: replace them with real medians.') + '</div>' +
      '<div class="refwrap"><table class="ref">' + orgRows + '</table></div>' +
      '<div class="note">' + tt('When an industry is chosen, these multiply the customers of the typical organisation and the share of employees in each role. 1 means no change. Illustrative placeholders.') + '</div>' +
      '<div class="refwrap"><table class="ref indtab">' + indRows + '</table></div>' +
      '<p><button type="button" class="b" data-act="seeds-reset">' + tt('Reset these ratios') + '</button></p>'));
  }
  /* Developer quality: how a team's level changes how long its work takes with each approach, what it is paid and what training it needs with OutSystems. */
  function skillTable() {
    var sk = state.skill || {}, p = function (path, step, v) { return '<input type="number" data-path="' + path + '" data-scope="state" step="' + step + '" value="' + v + '">'; };
    var th = function (label, tip) { return '<th' + C.tip(tt(label), tt(tip)) + '>' + tt(label) + '</th>'; };
    var rows = '<tr><th>' + tt('Developer quality') + '</th>' + th('Slower by (%)', 'How much longer the team takes than an experienced one, with either approach. 50 means half as long again.') +
      th('Pay discount (%)', 'How much less the team is paid than an experienced one, as a percentage. It applies to both approaches.') + th('Training per developer', 'The one-off cost to train and coach each developer to learn OutSystems, charged at the start of the team\'s work. It applies to OutSystems only.') + '</tr>' +
      SKILL_LEVELS.map(function (x) { var d = E.levelOf(state, x[0]); return '<tr><td>' + esc(tt(x[1])) + '</td><td>' + p('skill.levels.' + x[0] + '.pace', 5, d.pace) + '</td><td>' + p('skill.levels.' + x[0] + '.discount', 5, d.discount) + '</td><td>' + p('skill.levels.' + x[0] + '.enable', 500, d.enable) + '</td></tr>'; }).join('') +
      '<tr><td' + C.tip(tt('Applications to reach full speed'), tt('0 keeps the slowdown for every application. A number such as 3 means the slowdown falls away over a team\'s first few applications.')) + '>' + tt('Applications to reach full speed') + '</td><td>' + p('skill.learning', 1, num0(sk.learning)) + '</td><td></td><td></td></tr>';
    return card('Developer quality', '<div class="note">' + tt('A less experienced team is paid less but takes longer, so a lower rate does not mean a lower cost, and the extra time delays go-live and the value. Choose a team\'s quality on the Applications tab, where its figures can also be changed for that team (Custom). The levels here are placeholders to validate.') + '</div><div class="refwrap"><table class="ref">' + rows + '</table></div>');
  }
  function buildDefaults() {
    var regs = '<div class="refwrap"><table class="ref"><tr><th>Geography</th><th>Country</th><th>Currency</th>' + R.ROLE_KEYS.map(function (k) { return '<th>' + esc(R.ROLE_LABELS[k]) + '</th>'; }).join('') + '</tr>' +
      R.REGIONS.map(function (r) {
        return '<tr><td>' + r.geo + '</td><td>' + esc(r.name) + '</td><td>' + r.cur + '</td>' + R.ROLE_KEYS.map(function (k) { return '<td class="num">' + Number(r.roles[k]).toFixed(1) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table></div><div class="note">Loaded cost per hour of each role, in USD. Illustrative placeholders (see app/regions.js): a developer rate per country times a role relativity, to be replaced with a validated rate card.</div>';
        var fx = '<table class="ref"><tr><th>Currency</th><th>Units per 1 USD</th></tr>' + R.CURRENCIES.map(function (c) {
      return '<tr><td>' + c + '</td><td class="num">' + R.fxOf(c).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td></tr>';
    }).join('') + '</table><div class="note">Static and indicative, not live rates.</div>';
    var alts = '<table class="ref">' + ALT_TYPES.map(function (a) { return '<tr><td>' + esc(a.name) + '</td></tr>'; }).join('') + '</table>' +
      '<div class="note">Pick-list of alternatives. Details and prices are in config/alternatives.json.</div>';
    $('cfg-defaults').innerHTML = '<h2 class="pt">' + tt('Defaults') + '</h2><p class="pd">' + tt('General values that rarely change. They are the starting point for every assessment.') + ' ' +
      tt('Change a default here and any assessment still using it follows; values changed in one assessment stay as they are. In the finished tool these come from standard config files in the template folder.') + '</p>' +
      '<div class="resetbar"><button class="b" data-act="defaults-reset-all"' + C.tip(tt('Reset everything'), tt('Put every value on this tab, and the assessment\'s settings that follow them, back to the built-in defaults: stages and gates, cost drivers, analysis settings, starting figures, developer experience and the country rates you changed. Your applications, organisation and value figures are not touched.')) + '>' + tt('Reset everything to the built-in defaults') + '</button></div>' +
      sec('Stages and gates', deliveryCards('defaults')) + sec('Cost drivers', costCards('defaults')) + sec('Analysis settings', assumptionCards('defaults')) +
      sec('Starting figures', seedTables()) + sec('Developer experience', skillTable()) + sec('Sources', referencesCard()) + sec('Reference tables (read-only here)', card('Hourly cost of each role, by country (USD)', regs).replace('<div class="card">', '<div class="card" style="grid-column:1/-1">') + card('Currency table', fx) + card('Alternatives', alts));   // the role table has a column per role, so it takes the whole row
  }

  /* ---- Country rates screen: the loaded hourly cost of each role, in the country's own currency, viewable and changeable ---- */
  var rcSel = null;
  function rcLocal(id) {
    var base = R.roleRates(id), card = (state.rateCards || {})[id] || {}, out = {};
    R.ROLE_KEYS.forEach(function (k) { out[k] = card[k] !== undefined ? card[k] : base[k]; });
    return out;
  }
  function buildRates() {
    var host = $('cfg-rates'); if (!host) return;
    rcSel = state.country;   // the rates shown are always those of the assessment's country; change the country in the inputs pane
    var reg = R.byId(rcSel), base = R.roleRates(rcSel), cur = rcSel === state.country ? '' : '', groups = '';
    R.GEOS.forEach(function (g) {
      groups += '<optgroup label="' + g + '">' + regionsOf(g).map(function (r) { return '<option value="' + r.id + '"' + (r.id === rcSel ? ' selected' : '') + '>' + esc(tt(r.name)) + '</option>'; }).join('') + '</optgroup>';
    });
    var rth = function (label, tipBody) { return '<th' + C.tip(tt(label), tt(tipBody)) + '>' + tt(label) + '</th>'; };
    var rows = '<tr><th>' + tt('Role') + '</th>' + rth('Reference rate (loaded, per hour)', 'The reference loaded cost of one hour of this role in this country: salary plus on-costs, per productive hour. It is an illustrative placeholder until replaced by the organisation\'s own rate.') +
      rth('Rate used', 'The rate this assessment uses. Type the organisation\'s own loaded rate to replace the reference rate.') +
      rth('Loaded per person per year', 'The loaded hourly rate times the productive hours in a year: what one person in this role costs the organisation in a year.') +
      rth('Salary it implies', 'The loaded cost divided by the loaded cost multiplier: the base salary this rate corresponds to.') +
      rth('USD equivalent', 'The same rate in US dollars, so countries can be compared.') + '</tr>';
    var hrsY = Number(state.team.hours) * 52, dec = rateDec(reg.cur);
    var grp = function (label) { return '<tr class="grp"><td colspan="6">' + tt(label) + '</td></tr>'; };
    rows += grp('IT and delivery roles');
    R.ROLE_KEYS.forEach(function (k) {
      rows += '<tr><td>' + esc(R.ROLE_LABELS[k]) + '</td><td class="num">' + fmtFixed(base[k], dec) + '</td><td><input type="text" inputmode="decimal" data-fmt="1" data-rc="' + k + '" value="' + fmtFixed(rcLocal(rcSel)[k], dec) + '"></td><td class="num" id="rc-yr-' + k + '"></td><td class="num" id="rc-sal-' + k + '"></td><td class="num" id="rc-usd-' + k + '"></td></tr>';
    });
    rows += grp('Business roles');
    R.ROLE_GROUPS.forEach(function (g) {   // held as an annual salary; shown, like the rows above, as a loaded hourly rate
      rows += '<tr><td>' + esc(g.label) + '</td><td class="num">' + fmtFixed(R.groupSalary(rcSel, g.key) * R.loadMult(rcSel) / hrsY, dec) + '</td><td><input type="text" inputmode="decimal" data-fmt="1" data-rcg="' + g.key + '" value="' + fmtFixed(cardGroupSalary(rcSel, g.key) * cardMult(rcSel) / hrsY, dec) + '"></td><td class="num" id="rcg-yr-' + g.key + '"></td><td class="num" id="rcg-sal-' + g.key + '"></td><td class="num" id="rcg-usd-' + g.key + '"></td></tr>';
    });
    var used = rcSel === state.country;
    host.innerHTML = '<h2 class="pt">Rates</h2><p class="pd">The loaded cost of each role (salary plus on-costs such as employer taxes, pension, leave and equipment, blending employees and contractors) in the country\'s own currency. The loaded cost multiplier ties salary to loaded cost. Reference rates are illustrative placeholders; change any to match the organisation\'s rate card. Changes are kept with the assessment.</p>' +
      '<div class="cfgwrap"><div class="card" style="grid-column:1/-1"><h4>' + tt('Country') + '</h4>' +
      row('Country', '<div class="ro locked" data-go="panel"' + C.tip('Edited in the inputs pane', tt('Click to go to where this is edited.')) + '><b>' + esc(tt(reg.name)) + '</b></div>') +
      '<div class="note" style="margin:0 0 8px">' + tt('Currency: {cur} per hour', { cur: '<b>' + reg.cur + '</b>' }) + '</div>' +
      '<div class="note" style="margin:0 0 8px">' + (reg.basis === 'so' ? tt('The reference developer rate is the median developer pay in the Stack Overflow Developer Survey 2026, times this country\'s loaded cost multiplier, over 1,800 hours a year. The other roles use fixed relativities to the developer.') : reg.basis === 'rh' ? tt('The reference developer rate is based on the Robert Half 2026 salary guide median for this country, times the loaded cost multiplier, over 1,800 hours a year. The other roles use fixed relativities to the developer.') : tt('No published median was found for this country, so the reference developer rate is an estimate, scaled from countries of the same kind that have one. The other roles use fixed relativities to the developer.')) + '</div>' +
      '<div class="note" style="margin:0 0 8px"><b>' + tt('What is loaded cost?') + '</b> ' + tt('The full cost of a person to the organisation, not just salary: it adds employer taxes, pension or superannuation, leave, equipment and space. The loaded cost multiplier is that uplift, so a salary of 100,000 at 1.3 is a loaded cost of 130,000 a year. The model uses loaded cost for the delivery teams and for the business time the applications save, so people are not under-costed.') + '</div>' +
      '<div class="row"><label' + C.tip('Loaded cost multiplier', 'Employee cost divided by salary: employer taxes and pension or superannuation, leave, equipment and space. The same for every role in the country. It turns a salary into a loaded cost, and a loaded cost back into the salary it implies.') + ' style="cursor:help">' + tt('Loaded cost multiplier') + '</label><input type="number" step="0.05" min="1" data-rcm="1" value="' + cardMult(rcSel) + '"></div>' +
      '<p><button class="b" data-act="rc-reset">' + tt('Reset {country} to the reference rates', { country: esc(tt(reg.name)) }) + '</button></p></div>' +
      '<div class="card" style="grid-column:1/-1"><h4>' + tt('Rates by role') + '</h4>' +
      '<div class="refwrap"><table class="cmp rcs">' + rows + '</table></div>' +
      '<div class="note">' + (used ? tt('The Cost drivers tab starts from these rates (in the assessment currency, {cur}), where this assessment can still adjust them.', { cur: esc(state.currency) }) + ' ' : '') + tt('The USD equivalent uses the static, indicative exchange rate on the Defaults tab. Hours per week used for the yearly figure: {h}.', { h: esc(String(state.team.hours)) }) + ' ' + tt('IT and delivery roles are held as a loaded hourly rate, and business roles as an annual salary (the value builder starts from it). The table shows both as a loaded hourly rate: typing a rate sets the salary.') + '</div></div>' +
      '</div>';
    updateRatesLive();
  }
  /* Under each given delivery cost, the rate level it implies. */
  function updateRateNote() {
    var gf = res && res.groupFactors || {}, groups = E.ensureGroups(state);
    groups.forEach(function (g, i) {
      var txt = g.mode === 'quote' && gf[g.id] ? tt('This implies a rate level of {x}% of the reference rates.', { x: String(Math.round(gf[g.id] * 1000) / 10) }) : '';
      if (i === 0) { var p = $('rate-implied'); if (p) p.textContent = txt; }
      var gd = document.querySelector('[data-gdate="' + g.id + '"]'), sc0 = res && E.schedule(state, E.expectedTime(state, 'os'), 'os');   // the date this team starts, kept up to date
      if (gd && sc0 && sc0.teamStart && sc0.teamStart[g.id] !== undefined && state.startDate) gd.textContent = showDate(E.dateAtWeek(state, sc0.teamStart[g.id]));
    });
  }
  function updateRatesLive() {
    var host = $('cfg-rates'); if (!host || !rcSel) return;
    var reg = R.byId(rcSel), loc = rcLocal(rcSel), hrs = Number(state.team.hours) * 52;
    R.ROLE_KEYS.forEach(function (k) {
      var u = $('rc-usd-' + k), y = $('rc-yr-' + k);
      if (u) u.textContent = 'US$' + fmtFixed(loc[k] / R.fxOf(reg.cur), 2);
      if (y) y.textContent = reg.cur + ' ' + fmtFixed(loc[k] * hrs, 0);
      var sl = $('rc-sal-' + k); if (sl) sl.textContent = reg.cur + ' ' + fmtFixed(loc[k] * hrs / cardMult(rcSel), 0);
    });
    R.ROLE_GROUPS.forEach(function (g) {
      var sal = cardGroupSalary(rcSel, g.key), ld = sal * cardMult(rcSel), yr = $('rcg-yr-' + g.key), sl = $('rcg-sal-' + g.key), us = $('rcg-usd-' + g.key);
      if (yr) yr.textContent = reg.cur + ' ' + fmtFixed(ld, 0);
      if (sl) sl.textContent = reg.cur + ' ' + fmtFixed(sal, 0);
      if (us) us.textContent = 'US$' + fmtFixed(ld / hrs / R.fxOf(reg.cur), 2);
    });
    host.querySelectorAll('input[data-rcg]').forEach(function (el) { el.classList.toggle('ovr', Math.abs(cardGroupSalary(rcSel, el.dataset.rcg) - R.groupSalary(rcSel, el.dataset.rcg)) > 0.5); });
    host.querySelectorAll('input[data-rcm]').forEach(function (el) { el.classList.toggle('ovr', Math.abs(cardMult(rcSel) - R.loadMult(rcSel)) > 1e-9); });
    host.querySelectorAll('input[data-rc]').forEach(function (el) { el.classList.toggle('ovr', Math.abs(loc[el.dataset.rc] - R.roleRates(rcSel)[el.dataset.rc]) > 1e-9); });
  }
  function setRateCard(role, v) {
    state.rateCards = state.rateCards || {}; state.rateCards[rcSel] = state.rateCards[rcSel] || {};
    state.rateCards[rcSel][role] = v;
    if (rcSel === state.country) { state.rates[role] = R.round3(v * R.convertCurrency(R.byId(rcSel).cur, state.currency)); schedule(); }
    updateRatesLive();
  }
  function setGroupCard(group, v) {
    state.groupCards = state.groupCards || {}; state.groupCards[rcSel] = state.groupCards[rcSel] || {}; state.groupCards[rcSel][group] = v;
    cardChanged();
  }
  function setLoadCard(v) { if (!(v >= 1)) return; state.loadCards = state.loadCards || {}; state.loadCards[rcSel] = v; cardChanged(); }
  function cardChanged() {
    if (rcSel === state.country) { refreshAutoLines(); buildProjects(); schedule(); }   // lines that follow the country baseline pick up the new figures
    updateRatesLive();
  }
  var INDUSTRY_TIP = 'Optional. The industry changes the shape of the starting figures: how many customers there are for each employee, and how many people are in each role (an insurer has many more case handlers than a miner). It also brings the matching application types to the front. It never changes a figure you have already set. If yours is not listed, choose Other and name it: the general figures are used.';
  function buildInputs() { buildKey(); buildProjects(); buildDelivery(); buildCosts(); buildRates(); buildInfra(); buildAssumptions(); }
  function refreshStateInputs() { buildKey(); buildProjects(); buildDelivery(); buildCosts(); buildRates(); buildInfra(); buildAssumptions(); }

  var pendingFrame = null;
  function schedule() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(function () { pendingFrame = null; recalc(); });
  }


  /* ---- The yearly-pattern editor: opened from the icon at the right of an amount ---- */
  var yrCur = null;
  function yrBase(path) { var m = /^projectList\.(\d+)\.build\.(\d+)\.value$/.exec(path); if (m) { var v = E.lineValue(state.projectList[+m[1]].build[+m[2]]); return v.cost + v.rev + v.risk; } return Number(getPath(path)) || 0; }
  /* What a varying amount shows in its field: the average per year over the analysis period (the field still holds year 1). */
  function yrMeanOf(path) {
    var pt = getPat(path), n = Math.max(1, Math.floor(state.horizon) || 1), s = 0, i;
    for (i = 0; i < n; i++) s += E.factorAt(pt, i);
    return yrBase(path) * s / n;
  }
  function yrYears() { return Math.min(10, Math.max(2, Math.floor(state.horizon))); }
  function yrMode(pt) { return !pt ? 'flat' : (pt.y && pt.y.length ? 'y' : 'g'); }
  function yrArr(path, pt) {   // the year-by-year values, from the pattern, scaled so the first year is the amount in the field
    var base = yrBase(path), n = yrYears(), out = [], i;
    for (i = 0; i < n; i++) out.push(Math.round(base * E.factorAt(pt, i)));
    return out;
  }
  function renderYr() {
    var pop = $('yrpop'), path = yrCur.path, pt = getPat(path), mode = yrCur.mode || yrMode(pt), base = yrBase(path), n = yrYears(), h = '';
    var radio = function (v, label) { return '<label class="chk"><input type="radio" name="yrmode" data-yrmode="' + v + '"' + (mode === v ? ' checked' : '') + '> ' + tt(label) + '</label>'; };
    h += '<div class="yrt">' + tt('Over the years') + '</div><div class="note" style="margin:0 0 6px">' + tt('Year 1 is the starting amount. Choose how it changes in the later years. While it varies, the field shows the average per year.') + '</div>' +
      radio('flat', 'The same every year') + radio('g', 'Changes by a percentage each year') + radio('y', 'Set each year');
    if (mode === 'g') h += '<div class="yrr"><input type="number" step="0.5" data-yrg value="' + (pt && pt.g !== undefined ? pt.g : 0) + '"> % ' + tt('per year') + '</div>';
    if (mode === 'y') {
      var arr = yrArr(path, pt);
      h += '<table class="yrtab">' + arr.map(function (v, i) {
        return '<tr><td>' + tt('Year {n}', { n: i + 1 }) + '</td><td>' + (i === 0 ? '<input type="text" disabled value="' + fmtMoney(base) + '">' : '<input type="text" inputmode="decimal" data-yrv="' + i + '" value="' + fmtMoney(v) + '">') + '</td></tr>';
      }).join('') + '</table>';
    }
    h += '<div class="yrb"><button type="button" class="b pri" data-yrdone="1">' + tt('Done') + '</button></div>';
    pop.innerHTML = h;
  }
  function syncYr() {
    document.querySelectorAll('[data-yr]').forEach(function (el) {
      var on = E.hasPattern(getPat(el.dataset.yr));
      if (on) el.setAttribute('data-yron', '1'); else el.removeAttribute('data-yron');
      if (el.matches('input')) el.readOnly = on;
    });
  }
  function openYr(el) {
    var pop = $('yrpop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'yrpop'; document.body.appendChild(pop); pop.addEventListener('change', onYrChange); pop.addEventListener('input', onYrChange); pop.addEventListener('click', function (ev) { if (ev.target.dataset && ev.target.dataset.yrdone) closeYr(); }); }
    yrCur = { path: el.dataset.yr, el: el, mode: null };
    var pt = getPat(yrCur.path); yrCur.mode = yrMode(pt);
    if (pt && pt.y && pt.y.length) { var a = yrArr(yrCur.path, pt); setPat(yrCur.path, { y: a }); }   // keep year 1 equal to the field
    pop.hidden = false; renderYr();
    var r = el.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 16), left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), below = window.innerHeight - r.bottom > pop.offsetHeight + 12;
    pop.style.left = left + 'px'; pop.style.top = (below ? r.bottom + 4 : Math.max(8, r.top - pop.offsetHeight - 4)) + 'px';
  }
  function closeYr() { var pop = $('yrpop'); if (pop) pop.hidden = true; yrCur = null; }
  function onYrChange(ev) {
    var t = ev.target, path = yrCur && yrCur.path; if (!path) return;
    var pt = getPat(path), base = yrBase(path);
    if (t.dataset.yrmode && ev.type === 'change') {
      var m = t.dataset.yrmode; yrCur.mode = m;
      if (m === 'flat') setPat(path, null);
      else if (m === 'g') setPat(path, { g: pt && pt.y && pt.y[0] > 0 && pt.y.length > 1 ? Math.round((pt.y[1] / pt.y[0] - 1) * 1000) / 10 : (pt && pt.g) || 0 });
      else setPat(path, { y: yrArr(path, pt || { g: 0 }) });
      renderYr(); syncYr(); recalc();
    } else if (t.dataset.yrg !== undefined) {
      var g = parseFloat(t.value); setPat(path, { g: isFinite(g) ? g : 0 }); if (!isFinite(g) || g === 0) { /* keeps the editor open on a flat pattern */ } syncYr(); recalc();
    } else if (t.dataset.yrv !== undefined) {
      var arr = yrArr(path, pt || { g: 0 }); arr[0] = Math.round(base); arr[+t.dataset.yrv] = parseMoney(t.value); setPat(path, { y: arr }); syncYr(); recalc();
      if (ev.type === 'change') t.value = fmtMoney(arr[+t.dataset.yrv]);
    }
  }

  /* Convert every money amount using the static currency table (indicative rates, rounded to 4 significant figures). */
  function convertAmounts(from, to, includeRate) {
    var f = R.convertCurrency(from, to);
    MONEY_PATHS.forEach(function (p) { setPath(p, R.round3(getPath(p) * f)); });
    (state.deliveryGroups || []).forEach(function (g) { g.quote = R.round3(num0(g.quote) * f); });
    if (includeRate) E.ALL_ROLES.forEach(function (r) { state.rates[r.key] = R.round3(state.rates[r.key] * f); });
    [state.infraItems, state.toolItems, state.assureItems, state.appAssure].forEach(function (items) {
      if (items) items.forEach(function (it) { it.annual = R.round3(Number(it.annual) * f); });
    });
    if (state.projectList) state.projectList.forEach(function (p) {   // the value builder's money fields
      (p.build || []).forEach(function (l) { E.LINE_MONEY.forEach(function (k) { if (typeof l[k] === 'number') l[k] = R.round3(l[k] * f); }); });
    });
  }
  function changeCurrency(newCur) {
    if (newCur === state.currency) return;
    convertAmounts(state.currency, newCur, true);
    state.currency = newCur; refreshAutoLines();
    refreshForCurrency();
  }
  /* Choosing a country sets its own currency (converting amounts) and its hourly cost for each role. */
  /* After the country or currency changes: set the formatting first, so every screen is built with the new currency (not the old one), then rebuild what shows money. */
  function refreshForCurrency() {
    C.setCurrency(state.currency, curOpts());
    buildInputs(); buildDefaults(); if ($('pipeline') && sims) buildPipeline();
    recalc();
  }
  function changeCountry(newId) {
    var r = R.byId(newId);
    convertAmounts(state.currency, r.cur, false);
    state.country = newId; state.currency = r.cur; state.rates = rateDefaults(newId, r.cur); rcSel = newId; refreshAutoLines(); E.applyOrgDefaults(state);   // the typical organisation follows the country until the figures are typed over
    refreshForCurrency();
  }

  function onInput(ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.pick !== undefined) { openPick(parseInt(t.dataset.pick, 10), t.value); return; }   // the benefit picker's search
    if (t.dataset && t.dataset.sens) {   // the number, the chart and the takeaway follow the slider as it moves
      sensPct = parseInt(t.value, 10) || 25;
      var sv = $('sensv'); if (sv) sv.textContent = tt('Move each assumption by ±{n}%', { n: sensPct });
      var lab = tt('How sure are we');
      Array.prototype.forEach.call(document.querySelectorAll('#summary svg'), function (sg) { if (sg.getAttribute('aria-label') === lab) sg.outerHTML = svgSure(); });
      var tk = document.querySelector('#summary .vside .box.take'); if (tk) tk.innerHTML = '<h4>' + tt('Takeaway') + '</h4>' + esc(sureTake());
      return;
    }
    if (t.dataset && t.dataset.gq !== undefined) {   // a team's quality figure typed: the team becomes Custom, starting from what its level set
      var qg = E.ensureGroups(state)[parseInt(t.dataset.gq, 10)];
      if (qg) {
        if (qg.skill !== 'custom') { var cur1 = E.skillOf(state, qg); qg.custom = { pace: cur1.pace, discount: cur1.discount, enable: cur1.enable }; qg.skill = 'custom'; var qs = document.querySelector('select[data-gskill="' + t.dataset.gq + '"]'); if (qs) qs.value = 'custom'; }
        var qv = parseFloat(t.value); qg.custom[t.dataset.gqf] = isFinite(qv) && (t.dataset.gqf === 'pace' || qv >= 0) ? qv : 0;
                schedule();
      }
      return;
    }
    var sm = t.dataset && t.dataset.share && /^(toolItems|opsItems)\.(\d+)\.os$/.exec(t.dataset.path);
    if (sm) {   // typing a share makes it the user's own; clearing the box returns the line to the capability map
      var line = state[sm[1]][parseInt(sm[2], 10)];
      if (t.value === '') { delete line.auto; E.applyMapShares(state); } else line.auto = false;
      var ms2 = E.mapShare(line, sm[1] === 'opsItems' ? 'ops' : 'tool');
      t.classList.toggle('viamap', ms2 !== null && line.auto !== false); t.classList.toggle('ownshare', ms2 !== null && line.auto === false);
    }
    if (t.dataset && t.dataset.path) {
      var v = t.dataset.fmt ? parseMoney(t.value) : parseFloat(t.value); v = isFinite(v) ? v : 0;
      if (sm && t.value === '') v = Number(getPath(t.dataset.path)) * 100;
      if (t.dataset.pct) v = v / 100;   // shown as a percentage, stored as a fraction
      var cm = /^cases\.(\w+)\.(advantage|value)$/.exec(t.dataset.path || '');
      var xm = /^custom\.(advantage|value)$/.exec(t.dataset.path || '');
      if (xm) { state.custom = state.custom || { advantage: 1, value: 1 }; state.custom[xm[1]] = v; state.realiseCustom = true; state.realise = { advantage: state.custom.advantage, value: state.custom.value }; }   // typing your own percentages makes the setting Custom
      if (cm && lastCase === cm[1]) { state.realise = state.realise || {}; state.realise[cm[2]] = v; }   // editing the selected case moves the setting in use with it
      if (t.dataset.scope === 'defaults') {
        var oldDef = getPath(t.dataset.path, DEFAULTS);
        setPath(t.dataset.path, v, DEFAULTS);
        if (getPath(t.dataset.path) === oldDef) setPath(t.dataset.path, v);   // an assessment still on the default follows it
        refreshAfterDefault();
      } else {
        setPath(t.dataset.path, v);
        if (t.dataset.path === 'org.employees' || t.dataset.path === 'org.customers') { state.org.auto = false; }   // typed over: no longer follows the country
        else if (t.dataset.path.indexOf('seeds.orgTypical.') === 0 || t.dataset.path.indexOf('seeds.industry.') === 0) { E.applyOrgDefaults(state); buildInputs(); }   // the typical-organisation table drives the figures while they follow the country
        var bm = /^(projectList\.\d+\.build\.\d+)\.(salary|mult|fteCost)$/.exec(t.dataset.path); if (bm) setPath(bm[1] + '.auto', false);   // typed in: stop following the country baseline
        if (GENERAL[t.dataset.path]) t.classList.toggle('ovr', isOverridden(t.dataset.path));
        if (t.dataset.path.indexOf('projectList.') === 0) { updateProjectSummary(); }
      }
      schedule();
    } else if (t.dataset && t.dataset.rc) {
      setRateCard(t.dataset.rc, parseMoney(t.value));
    } else if (t.dataset && t.dataset.rcg) {
      setGroupCard(t.dataset.rcg, R.round3(parseMoney(t.value) * Number(state.team.hours) * 52 / cardMult(rcSel)));   // typed as a loaded hourly rate; held as a salary
    } else if (t.dataset && t.dataset.rcm) {
      setLoadCard(parseFloat(t.value));
    } else if (t.dataset && t.dataset.tpath) {
      setPath(t.dataset.tpath, t.value); schedule();
      var nm = /^projectList\.(\d+)\.build\.(\d+)\.note$/.exec(t.dataset.tpath);   // the note icon shows whether there is a note, and its text on hover
      if (nm) { var nbtn = document.querySelector('[data-note="' + nm[1] + '-' + nm[2] + '"]'); if (nbtn) { var hv = t.value.trim() !== ''; nbtn.classList.toggle('has', hv); nbtn.setAttribute('data-tip', tt('Why this figure') + '::' + (hv ? t.value : tt('Add a note: where the figure came from, or who confirmed it.'))); } }
    } else if (t.dataset && t.dataset.text) {
      state[t.dataset.text] = t.value;

      schedule();
    }
  }
  /* Set an application's type (blank is fine). A type adds its usual calculators; if the application already has some, it asks first. */
  function setAppType(ti, value) {
    var tp = state.projectList[ti]; if (!tp) return;
    tp.useCase = value;
    var addIt = function () { var n = addUseCase(ti, tp.useCase); buildKey(); buildProjects(); recalc(); if (n) toast(tt('Added {n} calculators. Replace the placeholder numbers with the customer\'s figures.', { n: n })); };
    if (value && E.hasBuild(tp)) askModal(tt('Add the calculators for this type?'), tt('This application already has calculators. The ones for this type are added alongside them; nothing is removed.'), tt('Add'), addIt);
    else if (value) addIt(); else { buildKey(); buildProjects(); recalc(); }
  }
  function onChange(ev) {
    var t = ev.target, sp = t.dataset && t.dataset.special;
    if (t.dataset && t.dataset.gexpall !== undefined) { if (E.setTeamExperience(state, t.value)) { E.ensureGroups(state); buildProjects(); recalc(); } return; }   // the portfolio's experience level
    if (t.dataset && t.dataset.gskill !== undefined) { var sg2 = E.ensureGroups(state)[parseInt(t.dataset.gskill, 10)]; if (sg2) { if (t.value === 'custom' && sg2.skill !== 'custom') { var cur0 = E.skillOf(state, sg2); sg2.custom = { pace: cur0.pace, discount: cur0.discount, enable: cur0.enable }; } sg2.skill = t.value; gqOpen[sg2.id] = true; E.ensureGroups(state); buildProjects(); buildInputs(); recalc(); } return; }   // a team's experience with OutSystems
    if (t.dataset && t.dataset.orgind !== undefined) { state.org.industry = t.value; E.applyOrgDefaults(state); buildInputs(); buildProjects(); recalc(); return; }   // the industry reshapes the starting figures
    if (t.dataset && t.dataset.usecase !== undefined) { setAppType(parseInt(t.dataset.usecase, 10), t.value); return; }   // an application's type
    if (t.dataset && t.dataset.text === 'startDate') { state.startDate = t.value; if (!t.value) state.licenceStart = ''; buildAssumptions(); buildProjects(); recalc(); return; }   // the date controls that depend on it are rebuilt
    if (t.dataset && t.dataset.sens) { sensPct = parseInt(t.value, 10) || 25; recalc(); return; }   // once released, everything that uses the setting is refreshed
    if (sp === 'scenario') {   // the scenario chosen in the inputs pane: same effect as clicking it on the Value tab
      if (t.value === 'custom') { state.custom = state.custom || { advantage: 1, value: 1 }; state.realiseCustom = true; state.realise = { advantage: state.custom.advantage, value: state.custom.value }; }
      else { delete state.realiseCustom; state.realise = { advantage: E.casesOf(state)[t.value].advantage, value: E.casesOf(state)[t.value].value }; }
      recalc(); buildAssumptions(); return;
    }
    if (t.dataset && t.dataset.lzsel) { if (t.dataset.lzsel === 'lang') lzLang = t.value; else lzFilter = t.value; lzPage = 0; buildLocalisation(); return; }
    if (t.dataset && t.dataset.lzsearch) { lzSearch = t.value; lzPage = 0; buildLocalisation(); return; }
    if (t.dataset && t.dataset.lzidx !== undefined) {
      var lc = I18N.catalogue()[parseInt(t.dataset.lzidx, 10)]; I18N.setTranslation(lzLang, lc.k, t.value.trim());
      var tr0 = I18N.translationOf(lzLang, lc.k); t.className = tr0 ? (I18N.placeholders(tr0) !== I18N.placeholders(lc.k) ? 'bad' : '') : 'todo';
      lzSaved(); return;
    }
    if (t.id === 'lzfile') {
      var lf = t.files && t.files[0]; if (!lf) return;
      var lr = new FileReader();
      lr.onload = function () { try { var n = I18N.importPack(lzLang, String(lr.result)); toast(tt('Loaded {n} translations.', { n: n })); buildLocalisation(); lzSaved(); } catch (e) { toast(e.message, 8000); } };
      lr.readAsText(lf); t.value = ''; return;
    }
    if (sp === 'country') changeCountry(t.value);
    else if (sp === 'currency') changeCurrency(t.value);
    else if (t.dataset && t.dataset.incl !== undefined) {
      state.projectList[parseInt(t.dataset.incl, 10)].include = t.checked;
      t.closest('.prow').classList.toggle('off', !t.checked);
      updateProjectSummary(); buildKey(); recalc();
    }
    else if (t.dataset && t.dataset.bsel) {
      setPath(t.dataset.bsel, t.value);
      var gm = /^(projectList\.\d+\.build\.\d+)\.group$/.exec(t.dataset.bsel); if (gm) refreshLine(getPath(gm[1]));
      buildProjects(); recalc();
    }
    else if (sp === 'altType') {
      state.altType = t.value;
      var a = ALT_TYPES.filter(function (x) { return x.id === t.value; })[0];
      state.altName = t.value === 'other' ? '' : (a ? a.name : '');
      buildKey(); recalc();
    } else if (t.dataset && t.dataset.setupinc) {
      state.setup.mode = t.checked ? 'included' : 'absorbed'; buildKey(); buildInfra(); recalc();
    } else if (sp === 'osHosting') {
      setBase(t.value);
    } else if (t.dataset && t.dataset.allprov) {
      showAllProviders = t.checked; buildInfra(); recalc();
    } else if (t.dataset && t.dataset.ext !== undefined) {
      state.infraItems[parseInt(t.dataset.ext, 10)].ext = t.checked; recalc();
    } else if (t.dataset && t.dataset.rccountry) {
      rcSel = t.value; buildRates();
    } else if (t.dataset && t.dataset.fullcur) {
      state.fullCurrency = t.checked; buildInputs(); recalc();
    } else if (t.dataset && t.dataset.ha) {
      setHA(t.checked);
    } else if (t.dataset && t.dataset.assure) {
      state.assurance = state.assurance || {};
      if (t.dataset.assure === 'required') { state.assurance.required = t.checked; if (state.osHosting === 'paas-sentry' && !t.checked) state.osHosting = 'paas'; }
      else state.assurance[t.dataset.assure] = t.checked;
      buildKey(); buildInfra(); recalc();
    } else if (t.name === 'deliveryMode') {
      // switching to a quote starts from the cost the team size implies, so nothing jumps
      var dg = E.ensureGroups(state)[0];
      if (t.value === 'quote' && dg.mode !== 'quote') dg.quote = R.round3(E.osDeliveryCost(state, dg.id));
      dg.mode = t.value; buildKey(); buildProjects(); recalc();
    } else if (t.dataset && t.dataset.gstart !== undefined) {   // when a delivery team starts
      var sg = E.ensureGroups(state)[parseInt(t.dataset.gstart, 10)], fld = t.dataset.gfield;
      if (sg) { sg.start[fld] = fld === 'months' ? Math.max(0, parseFloat(t.value) || 0) : t.value; if (fld === 'mode' && t.value === 'team' && !sg.start.team) { var oth = E.ensureGroups(state).filter(function (o) { return o.id !== sg.id; })[0]; sg.start.team = oth ? oth.id : ''; } E.ensureGroups(state); buildProjects(); recalc(); }
    } else if (t.dataset && t.dataset.gmode !== undefined) {   // a delivery group on the Applications tab
      var gg = state.deliveryGroups[parseInt(t.dataset.gmode, 10)];
      if (t.value === 'quote' && gg.mode !== 'quote') gg.quote = R.round3(E.osDeliveryCost(state, gg.id));
      gg.mode = t.value; buildKey(); buildProjects(); recalc();
    } else if (t.dataset && t.dataset.phasepath) {   // a line moved to another phase: its cost goes there, and (unless typed) its share follows that phase's map
      setPath(t.dataset.phasepath, t.value); E.applyMapShares(state); buildInfra(); recalc();
    } else if (t.dataset && t.dataset.rolepath) {
      setPath(t.dataset.rolepath, t.value); schedule();
    } else if (t.id === 'hardOnly' || t.id === 'hardOnly2') { state.hardOnly = t.checked; recalc(); }
  }

  /* ---------------------------------------------------------------- charts */
  function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function partHelp(ap) {
    var T = res[ap].T, out = {};
    out.design = tt('Requirements and design work before building starts.');
    out.build = tt('Writing the application. Both approaches use AI-assisted build.');
    state.gates.forEach(function (g) {
      var p = g[ap], s = E.passProb(p);
      out[g.id] = tt('Each attempt waits {w} weeks in the queue and takes {r} weeks to review. It passes first time {s}% of the time, so on average it takes {a} attempts. This bar is the expected total.', { w: f1(Number(p.w)), r: f1(Number(p.r)), s: Math.round(s * 100), a: f1(1 / s) });
    });
    out.rework = tt('Time the team spends fixing work that a review rejected, before it goes back to the queue. More rejections mean more rework.');
    out.integration = tt('Connecting the application to other systems.');
    out.deploy = tt('Releasing the application into production.');
    return out;
  }

  function svgStages() {
    var r = res, alt = altShort();
    var stageGo = function (key, who) {
      if (['design', 'build', 'integration', 'deploy'].indexOf(key) >= 0) return 'delivery#stages.' + key + '.' + who;
      if (key === 'rework') return 'delivery#gates.*.' + who + '.s,gates.*.' + who + '.f';
      var gi = -1; state.gates.forEach(function (g, i) { if (g.id === key) gi = i; });
      return gi >= 0 ? 'delivery#gates.' + gi + '.' + who + '.w,gates.' + gi + '.' + who + '.r' : null;
    };
    return C.stageBars({ go: stageGo, alt: r.alt.T, os: r.os.T, altLabel: alt, helpAlt: partHelp('alt'), helpOs: partHelp('os'), label: 'Average time to production' });
  }
  function svgBridge() {
    var r = res, alt = altLabel(), M = C.money, years = state.horizon;
    var costs = r.bridge.filter(function (b) { return b.kind === 'cost'; }).sort(function (x, y) { return x.delta - y.delta; });
    var values = r.bridge.filter(function (b) { return b.kind !== 'cost'; }).sort(function (x, y) { return y.delta - x.delta; });
    var items = costs.concat(values).filter(function (b) { return Math.abs(b.delta) > 0.5; }).map(function (b) {   // a line with no difference is left out
      var tipText;
      if (b.kind === 'cost') {
        tipText = tt(b.delta >= 0 ? 'In present-value terms, OutSystems spends {amt} less on this than {alt} over {yrs} years.' : 'In present-value terms, OutSystems spends {amt} more on this than {alt} over {yrs} years.', { amt: M(Math.abs(b.delta)), alt: alt, yrs: years }) + '\n' +
          (COST_HELP[b.key.indexOf('c_ops_') === 0 ? 'ops' : b.key.replace('c_', '')] || '');
      } else {
        tipText = tt(b.delta >= 0 ? 'The annual value is the same for both approaches, but OutSystems goes live sooner, so it starts earning sooner. Worth {amt} more in present value.' : 'The annual value is the same for both approaches, but OutSystems goes live sooner, so it starts earning sooner. Worth {amt} less in present value.', { amt: M(Math.abs(b.delta)) }) + '\n' + (b.hard ? tt('A hard saving.') : tt('A soft benefit: depends on the estimate being accepted.'));
      }
      var bgo = b.key.indexOf('c_ops_') === 0 ? costGo('ops') : b.key.indexOf('c_') === 0 ? costGo(b.key.slice(2), 1) : b.key.indexOf('v_') === 0 ? valueGo(b.key.slice(2)) : null;
      return { label: b.label, delta: b.delta, hard: b.hard, tip: tipText, go: bgo };
    });
    return C.waterfall({
      start: { label: 'Alternative NPV', value: r.alt.npv, tip: tt('Present value of everything {alt} delivers minus everything it costs over {n} years.', { alt: alt, n: years }) },
      end: { label: 'OutSystems NPV', value: r.os.npv, tip: 'Same measure for OutSystems. The difference from the left-hand bar is the net value advantage.' },
      items: items, label: 'Value bridge', range: bridgeRange()
    });
  }
  /* The extent of the bridge under every case, so the scale is the same whichever case is selected. */
  function bridgeRange() {
    var lo = 0, hi = 0;
    var CS = E.casesOf(state);
    Object.keys(CS).forEach(function (k) {
      var s = JSON.parse(JSON.stringify(state)); s.realise = { advantage: CS[k].advantage, value: CS[k].value };
      var r = E.run(s), run = r.alt.npv;
      lo = Math.min(lo, run, r.os.npv); hi = Math.max(hi, run, r.os.npv);
      r.bridge.filter(function (b) { return b.kind === 'cost'; }).sort(function (x, y) { return x.delta - y.delta; }).concat(r.bridge.filter(function (b) { return b.kind !== 'cost'; }).sort(function (x, y) { return y.delta - x.delta; }))
        .forEach(function (b) { run += b.delta; lo = Math.min(lo, run); hi = Math.max(hi, run); });
    });
    return [lo, hi];
  }
  function svgPay() {
    var r = res, alt = altShort();
    return C.lineChart({
      dateAt: function (w) { return E.dateAtWeek(state, w); }, showMonth: showMonth,
      weeks: r.os.W,
      series: [
        { name: 'OutSystems', color: 'var(--os)', data: r.os.cum, width: 3 },
        { name: alt, color: 'var(--alt)', data: r.alt.cum, dash: true, width: 2.5 }
      ],
      markers: [
        { week: r.os.paybackWeek, label: 'OutSystems payback ' + months(r.os.paybackMonths, r.os.paybackWeek), color: 'var(--os)', row: 0,
          tip: 'Cumulative value minus cost turns positive here and stays positive.' },
        { week: r.alt.paybackWeek, label: alt + ' payback ' + months(r.alt.paybackMonths, r.alt.paybackWeek), color: 'var(--alt)', row: 1,
          tip: 'Cumulative value minus cost turns positive here and stays positive.' }
      ],
      points: [lowPoint(r.os.cum, 'OutSystems', 'var(--os)', 0), lowPoint(r.alt.cum, alt, 'var(--alt)', 1)].filter(Boolean),
      label: 'Cumulative net benefit'
    });
  }
  /* The lowest point of a cumulative line: the peak cash outlay (the tile of the same name). */
  function lowPoint(cum, name, color, row) {
    var lo = 0, wk = -1; cum.forEach(function (v, i) { if (v < lo) { lo = v; wk = i + 1; } });
    return wk < 0 ? null : { week: wk, value: lo, color: color, row: row, label: tt('{name} peak outlay {amt}', { name: name, amt: C.moneyShort(-lo) }),
      tip: tt('The most cash that is out of pocket, cumulatively, before the programme turns positive: {amt}, around week {wk}. This is the Peak cash outlay figure.', { amt: C.money(-lo), wk: wk }) };
  }
  /* Costs and benefits side by side, for each approach on one scale: the gap between a pair of columns is the net. Benefits are what is actually earned within the
   * horizon, so an approach that goes live sooner earns more of the same annual value. */
  function svgCost() {
    if (cbBasis === 'bau') return svgBau();
    var r = res, alt = altShort();
    var catColors = { team: 'var(--b3)', tokens: 'var(--o1)', run: 'var(--b2)', platform: 'var(--g2)', tooling: 'var(--g1)', infra: 'var(--t2)', ops: 'var(--p2)', assure: 'var(--m2)', setup: 'var(--o2)' };
    var benColors = { cost: 'var(--t3)', risk: 'var(--t2)', rev: 'var(--t1)' };
    var benHelp = 'Earned only once an application is live and its benefit has ramped up. The annual value is the same for both approaches, but the one that goes live sooner earns more of it inside the horizon.';
    var cats = E.COST_CATS.map(function (c) { return { key: c.key, label: c.label, color: catColors[c.key], help: COST_HELP[c.key], go: function (gi) { return costGo(c.key, gi >= 2 ? 1 : 0); } }; })
      .concat(E.DRIVERS.map(function (d) { return { key: 'b_' + d.key, label: d.label, color: benColors[d.key], help: tt(benHelp) + ' ' + (d.soft ? tt('A soft benefit: it depends on the estimate being accepted.') : tt('A hard saving.')), go: valueGo(d.key) }; }));
    var ben = function (src) { var o = {}; E.DRIVERS.forEach(function (d) { o['b_' + d.key] = src[d.key]; }); return o; };
    return C.stacked({
      cats: cats, shareOf: 'costs (or benefits) over the horizon',
      groups: [{ label: 'Costs', label2: alt, values: r.alt.sumCost }, { label: 'Benefits', label2: alt, values: ben(r.alt.sumVal) },
        { label: 'Costs', label2: 'OutSystems', values: r.os.sumCost }, { label: 'Benefits', label2: 'OutSystems', values: ben(r.os.sumVal) }],
      label: 'Costs and benefits', height: 330
    });
  }
  function svgGantt() {
    var r = res;
    return C.gantt({ dateAt: function (w) { return E.dateAtWeek(state, w); }, showDate: showDate, showMonth: showMonth, go: appGo, alt: r.alt.projects, os: r.os.projects, weeks: r.os.W, altLabel: altShort(), label: 'Project timeline' });
  }


  /* Costs and benefits for both approaches, line by line, over the whole period or in present value. Lines that can be edited link to where. */
  var cbBasis = 'sum', bauPart = 'all';   // 'sum' = total over the period, 'bau' = the running cost of a year once everything is live (all of it, the platform's, or the applications')
  function cbToggle() {
    var b = function (attr, k, cur, label) { return '<button type="button" data-' + attr + '="' + k + '"' + (cur === k ? ' class="on"' : '') + '>' + label + '</button>'; };
    return '<div class="seg mseg">' + b('cbbasis', 'sum', cbBasis, tt('Total over {n} years', { n: state.horizon })) + b('cbbasis', 'bau', cbBasis, tt('Ongoing per year')) + '</div>' +
      (cbBasis === 'bau' ? ' <div class="seg mseg">' + b('baupart', 'all', bauPart, tt('Total')) + b('baupart', 'platform', bauPart, tt('Running the platform')) + b('baupart', 'app', bauPart, tt('Looking after the applications')) + '</div>' : '');
  }
  /* Ongoing per year (BAU): the running costs of a year once every application is live, split into looking after the applications and running the platform. */
  function bauData() { var s = (res && res.eff) || state; return { alt: E.bauYear(s, 'alt'), os: E.bauYear(s, 'os') }; }
  function svgBau() {
    var d = bauData(), lab = function (k) { return E.COST_CATS.filter(function (c) { return c.key === k; })[0].label; };
    var appCats = [{ key: 'fix', label: tt('Break/fix'), color: 'var(--b2)', help: tt('Fixing faults in the applications once they are live, as a share of their build cost each year.'), go: function (gi) { return costGo('run', gi >= 1 ? 1 : 0); } },
      { key: 'enh', label: tt('Enhancements'), color: 'var(--b1)', help: tt('Making the changes the business asks for once the applications are live, as a share of their build cost each year.'), go: function (gi) { return costGo('run', gi >= 1 ? 1 : 0); } }]
      .concat([{ key: 'tokens', label: tt('AI tokens'), color: 'var(--o1)', help: COST_HELP.tokens, go: function (gi) { return costGo('tokens', gi >= 1 ? 1 : 0); } }]);
    var platCats = ['platform', 'tooling', 'infra', 'ops', 'assure'].map(function (k) { return { key: k, label: lab(k), color: { platform: 'var(--g2)', tooling: 'var(--g1)', infra: 'var(--t2)', ops: 'var(--p2)', assure: 'var(--m2)' }[k], help: COST_HELP[k], go: function (gi) { return costGo(k, gi >= 1 ? 1 : 0); } }; });
    var cats = bauPart === 'app' ? appCats : bauPart === 'platform' ? platCats : appCats.concat(platCats);
    return C.stacked({ cats: cats, shareOf: 'ongoing cost per year', groups: [{ label: 'Costs', label2: altShort(), values: d.alt }, { label: 'Costs', label2: 'OutSystems', values: d.os }], label: tt('Ongoing cost per year'), height: 330 });
  }
  function htmlBau() {
    var d = bauData(), MS = C.moneyShort, Mf = C.money, alt = esc(altShort());
    var cell = function (v) { return '<td' + C.tip('', Mf(v)) + '>' + (v < 0 ? '−' : '') + MS(Math.abs(v)).replace('-', '') + '</td>'; };
    var line = function (label, a, o, go, cls) {
      var adv = a - o;
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' + (go ? '<td data-go="' + esc(go) + '"' + C.tip(label, tt('Click to go to where this is edited.')) + '><span class="golink">' + esc(label) + '</span></td>' : '<td>' + esc(label) + '</td>') +
        cell(a) + cell(o) + '<td class="' + (adv >= 0 ? 'pos' : 'neg') + '">' + (adv >= 0 ? '+' : '−') + MS(Math.abs(adv)).replace('-', '') + '</td></tr>';
    };
    var grp = function (t) { return '<tr class="grp"><td colspan="4">' + esc(t) + '</td></tr>'; }, lab = function (k) { return tt(E.COST_CATS.filter(function (c) { return c.key === k; })[0].label); };
    var appRows = grp(tt('Looking after the applications')) + line(tt('Break/fix'), d.alt.fix, d.os.fix, costGo('run')) + line(tt('Enhancements'), d.alt.enh, d.os.enh, costGo('run')) + line(tt('AI tokens'), d.alt.tokens, d.os.tokens, costGo('tokens')) + line(tt('Subtotal'), d.alt.app, d.os.app, null, 'tot');
    var platRows = grp(tt('Running the platform')) + line(lab('platform'), d.alt.platform, d.os.platform, costGo('platform', 1)) + line(lab('tooling'), d.alt.tooling, d.os.tooling, costGo('tooling', 1)) + line(lab('infra'), d.alt.infra, d.os.infra, costGo('infra')) + line(lab('ops'), d.alt.ops, d.os.ops, costGo('ops')) + line(lab('assure'), d.alt.assure, d.os.assure, costGo('assure')) + line(tt('Subtotal'), d.alt.nonApp, d.os.nonApp, null, 'tot');
    var part = bauPart === 'app' ? { a: d.alt.app, o: d.os.app } : bauPart === 'platform' ? { a: d.alt.nonApp, o: d.os.nonApp } : { a: d.alt.total, o: d.os.total };
    var rows = (bauPart === 'platform' ? '' : appRows) + (bauPart === 'app' ? '' : platRows) + grp(tt('Result')) + line(tt('Ongoing cost per year'), part.a, part.o, null, 'tot');
    var head = '<tr><th></th><th>' + alt + '</th><th>OutSystems</th><th>' + tt('OutSystems advantage') + '</th></tr>';
    return '<div class="cbwrap"><div class="finwrap"><table class="fin cbt">' + head + rows + '</table></div><div class="note">' +
      tt('A year once every application is live. Delivery, AI build tokens and one-off setup are left out, and so is the value of going live sooner, so this shows the running costs alone. It will not always favour OutSystems: its advantage here is only the running costs it avoids.') + '</div></div>';
  }
  function htmlBreakdown() {
    if (cbBasis === 'bau') return htmlBau();
    var r = res, MS = C.moneyShort, Mf = C.money, alt = esc(altShort());
    var AC = r.alt.sumCost, OC = r.os.sumCost, AV = r.alt.sumVal, OV = r.os.sumVal;   // totals over the period (the discounted figures are in the Financials tab and the headline tiles)
    var cell = function (v) { return '<td' + C.tip('', Mf(v)) + '>' + (v < 0 ? '−' : '') + MS(Math.abs(v)).replace('-', '') + '</td>'; };
    var line = function (label, a, o, benefit, go, cls) {
      var adv = benefit ? o - a : a - o;
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' + (go ? '<td data-go="' + esc(go) + '"' + C.tip(label, 'Click to go to where this is edited.') + '><span class="golink">' + esc(label) + '</span></td>' : '<td>' + esc(label) + '</td>') +
        cell(a) + cell(o) + '<td class="' + (adv >= 0 ? 'pos' : 'neg') + '">' + (adv >= 0 ? '+' : '−') + MS(Math.abs(adv)).replace('-', '') + '</td></tr>';
    };
    var grp = function (t) { return '<tr class="grp"><td colspan="4">' + t + '</td></tr>'; };
    var rows = '', sum = function (src, keys) { return keys.reduce(function (t, k) { return t + src[k]; }, 0); };
    rows += grp('Benefits');
    E.DRIVERS.forEach(function (d) { rows += line(d.label, AV[d.key], OV[d.key], true, valueGo(d.key)); });
    var dk = E.DRIVERS.map(function (d) { return d.key; }), aVal = sum(AV, dk), oVal = sum(OV, dk);
    rows += line('Total benefits', aVal, oVal, true, null, 'tot');
    var groups = [['Costs: delivering the applications', ['team', 'tokens', 'run']], ['Costs: the platform and its operation', ['platform', 'tooling', 'infra', 'ops', 'assure', 'setup']]], aCost = 0, oCost = 0;
    groups.forEach(function (g) {
      rows += grp(g[0]);
      g[1].forEach(function (k) {
        var cat = E.COST_CATS.filter(function (c) { return c.key === k; })[0];
        if (Math.abs(AC[k]) + Math.abs(OC[k]) < 0.5) return;   // a line that is nothing for both is left out
        rows += line(cat.label, AC[k], OC[k], false, k === 'platform' || k === 'tooling' ? costGo(k, 1) : costGo(k));
      });
      var sa = sum(AC, g[1]), so = sum(OC, g[1]); aCost += sa; oCost += so;
      rows += line('Subtotal', sa, so, false, null, 'tot');
    });
    rows += grp('Result');
    rows += line('Total costs', aCost, oCost, false, null, 'tot');
    rows += line('Net benefit', aVal - aCost, oVal - oCost, true, null, 'tot');
    var head = '<tr><th></th><th>' + alt + '</th><th>OutSystems</th><th>OutSystems advantage</th></tr>';
    return '<div class="cbwrap"><div class="finwrap"><table class="fin cbt">' + head + rows + '</table></div></div>';
  }

  /* Each application's go-live and annual value: what the run-rate annual value tile adds up. */
  function htmlLive() {
    var r = res, MS = C.moneyShort, Mf = C.money, alt = esc(altShort()), W = r.os.W, i, rows = '', rr = 0, n = 0;
    var cell = function (v) { return '<td' + C.tip('', Mf(v)) + '>' + MS(v) + '</td>'; };
    var wk = function (p) { return p.goLive < W ? tt('week {n}', { n: Math.round(p.goLive) }) : tt('after the period'); };
    for (i = 0; i < r.os.projects.length; i++) {
      var p = r.os.projects[i], q = r.alt.projects[i], live = p.goLive < W, go = appGo(i), nm = p.name || (tt('Application') + ' ' + (i + 1));
      if (live) { rr += p.annualIncluded; n++; }
      rows += '<tr' + (live ? '' : ' class="off"') + '>' + (go ? '<td data-go="' + esc(go) + '"' + C.tip(nm, 'Click to go to where this is edited.') + '><span class="golink">' + esc(nm) + '</span></td>' : '<td>' + esc(nm) + '</td>') +
        cell(p.annualIncluded) + '<td>' + wk(p) + '</td><td>' + wk(q) + '</td><td>' + (live ? tt('yes') : tt('no')) + '</td></tr>';
    }
    rows += '<tr class="tot"><td' + C.tip(tt('Run-rate annual value (OutSystems)'), tt('The yearly value of the OutSystems applications that are live within the analysis period, added up. Applications still waiting to go live are not counted.')) + '>' + tt('Run-rate annual value (OutSystems)') + '</td>' + cell(rr) + '<td colspan="2">' + tt('{live} of {n} applications live', { live: n, n: r.os.projects.length }) + '</td><td></td></tr>';
    return '<div class="cbwrap"><div class="finwrap"><table class="fin cbt"><tr><th></th><th' + C.tip(tt('Annual value'), tt('The yearly value the application earns once it is fully live: cost savings, risk reduction and revenue uplift. It is the same for both approaches; only the start date differs.')) + '>' + tt('Annual value') + '</th><th' + C.tip(tt('OutSystems goes live'), tt('The week OutSystems delivers this application into production.')) + '>' + tt('OutSystems goes live') + '</th><th' + C.tip(tt('{alt} goes live', { alt: altShort() }), tt('The week the alternative delivers this application into production.')) + '>' + tt('{alt} goes live', { alt: alt }) + '</th><th' + C.tip(tt('In the run-rate'), tt('Yes when the application is live within the analysis period, so its annual value counts towards the run-rate. Later ones are dimmed and not counted.')) + '>' + tt('In the run-rate') + '</th></tr>' + rows + '</table></div>' +
      '<div class="note">' + tt('The run-rate annual value is the yearly value of the applications that are live within the period. Applications still waiting to go live are dimmed and not counted.') + '</div></div>';
  }

  /* ---- How sure are we: sensitivity, what must be true, and the evidence behind the inputs ---- */
  var sensPct = 25;   // how far each assumption is moved in the how-sure chart (a viewing choice, not saved)
  function svgSure() {
    var s = E.sensitivity(state, sensPct);
    return C.tornado({ rows: s.rows.map(function (r) { return { label: tt(r.label), tip: tt(r.tip), low: r.low, high: r.high, swing: r.swing }; }), pct: s.pct, base: s.base, label: tt('How sure are we') });
  }
  /* The conditions under which OutSystems stays ahead, in plain sentences. */
  function mustBeTrueLines() {
    var m = E.mustBeTrue(state), MS = C.moneyShort, pc = function (x) { return Math.round(x * 100) + '%'; }, out = [];
    m.items.forEach(function (it) {
      if (it.key === 'licence') {
        out.push(it.at === null || !it.falls ? tt('The platform licence does not change whether OutSystems stays ahead.')
          : it.at <= 0 ? tt('OutSystems is not ahead at any licence price.') : tt('The platform licence can be up to {at} a year and OutSystems still comes out ahead (it is {now}).', { at: MS(it.at), now: MS(it.now) }));
      } else if (it.key === 'value') {
        out.push(it.at === null ? tt('The business value does not change whether OutSystems stays ahead.')
          : it.at <= 0 ? tt('OutSystems stays ahead even if none of the business value arrives.') : it.at >= 5 ? tt('OutSystems is only ahead with far more business value than claimed.') : tt('At least {at} of the business value has to arrive (this scenario assumes {now}).', { at: pc(it.at), now: pc(it.now) }));
      } else {
        out.push(it.at === null ? tt('How much faster OutSystems is does not change whether it stays ahead.')
          : it.at <= 0 ? tt('OutSystems stays ahead even if none of the claimed improvement arrives.') : it.at >= 5 ? tt('OutSystems is only ahead with far more improvement than claimed.') : tt('At least {at} of the claimed improvement over the alternative has to arrive (this scenario assumes {now}).', { at: pc(it.at), now: pc(it.now) }));
      }
    });
    return out;
  }
  function sureHtml() {
    return '<div class="sens"><label for="sensrange" id="sensv">' + tt('Move each assumption by ±{n}%', { n: sensPct }) + '</label><input type="range" id="sensrange" min="5" max="50" step="5" value="' + sensPct + '" data-sens="1"></div>' +
      '<div class="box" style="margin-top:10px"><h4>' + tt('What would have to be true') + '</h4><ul style="margin:6px 0 0 18px;padding:0">' + mustBeTrueLines().map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' +
      '';
  }
  function sureTake() {
    var s = E.sensitivity(state, sensPct), a = s.rows[0], b = s.rows[1], MS = C.moneyShort;
    return tt('The answer is most sensitive to {a}, then {b}. A {pct}% change in the largest moves the net advantage by up to {amt}.', { a: tt(a.label).toLowerCase(), b: tt(b.label).toLowerCase(), pct: s.pct, amt: MS(a.swing) });
  }
  /* The inputs that move the answer, for the one-page summary and the deck appendix. */
  function assumptionRows() {
    var M = C.money, rows = [], pl = E.projectList(state);
    var add = function (group, label, value, path) { rows.push({ group: group, label: label, value: value, path: path }); };
    var G1 = 'Key inputs', G2 = 'General assumptions';
    add(G1, tt('Months to deliver the portfolio'), tt('{n} months', { n: f1(state.deliveryMonths) }), 'deliveryMonths');
    E.ensureGroups(state).forEach(function (g) { if (g.mode === 'quote') add(G1, g.name + ': ' + tt('OutSystems delivery cost'), M(g.quote), 'deliveryQuote'); });
    add(G1, tt('OutSystems developers'), f1(E.devsFor(state, 'os')), 'team.devs');
    add(G1, tt('OutSystems platform licence'), tt('{amt} a year', { amt: M(state.platform.os) }), 'platform.os');
    if (E.sentryUplift(state) > 0) add(G1, tt('Additional Sentry licence'), tt('{amt} a year', { amt: M(state.platform.sentry) }), 'platform.sentry');
    pl.forEach(function (p) { add(G1, tt('{name}: value per year', { name: p.name }), M(p.value.cost + p.value.rev + p.value.risk), 'value'); });
    add(G2, tt('Analysis period'), tt('{n} years', { n: state.horizon }), 'horizon');
    add(G2, tt('Discount rate'), state.rate + '%', 'rate');
    add(G2, tt('Developers the alternative needs'), '×' + state.altDevFactor, 'altDevFactor');
    add(G2, tt('Alternative yearly run cost'), tt('{n}% of build cost', { n: E.maintPct(state, 'alt') }), 'run.alt');
    add(G2, tt('Alternative operating team'), tt('{n} people', { n: f1(E.opsFteTotal(state, 'alt')) }), 'opsFte.alt');
    add(G2, tt('AI token saving'), state.tokens.saving + '%', 'tokens.saving');
    var cs = E.caseOf(state); add(G2, tt('Scenario'), cs ? tt(E.casesOf(state)[cs].label) : tt('Custom'), 'case');
    return rows;
  }
  /* What a figure's tooltip says: its own field's explanation, or one written here for figures with no field of their own. */
  var EV_TIPS = {
    deliveryMonths: 'How long OutSystems takes to deliver the whole portfolio: the delivery teams\' active work on design, build and fixes, not review queues.',
    'platform.os': 'Annual OutSystems platform licence. It is the same whether OutSystems hosts it or the organisation does.',
    'platform.sentry': 'Annual licence for the additional Sentry product, needed with some OutSystems options.',
    value: 'Yearly value of the application once it is live: its cost savings, revenue uplift and risk reduction.'
  };
  function evTip(r) {
    if (r.path === 'case') return C.tip(r.label, tt('How much of the claimed benefit is assumed to arrive: Conservative, Likely or Optimistic. Choose one with the selector on the Value tab; the percentages behind each are on the Analysis settings tab.'));
    var raw = EV_TIPS[r.path] || FIELD_TIP[r.path]; return raw ? C.tip(r.label, tt(raw)) : '';
  }
  /* The numbers of the references behind an input, each hovering to what that source says. */
  function refNum(id) { for (var i = 0; i < AVARefs.REFS.length; i++) if (AVARefs.REFS[i].id === id) return i + 1; return 0; }
  function refCell(path) {
    return AVARefs.forKey(path).map(function (id) { var rf = AVARefs.byId(id); return '<span class="rfn" data-ref="' + id + '"' + C.tip(rf.short, tt(rf.says) + ' ' + tt(rf.caveat)) + '>[' + refNum(id) + ']</span>'; }).join(' ') || '–';
  }
  /* Every source behind figures in the tool, with what it says and what to be careful of. */
  function referencesCard() {
    var kinds = { primary: 'Primary source', vendor: 'Vendor-published or commissioned', secondary: 'Secondary source' };
    return '<div class="card" style="grid-column:1/-1"><h4>' + tt('References') + '</h4><p class="note" style="margin:0 0 8px">' + tt('Published sources behind figures in the tool. Each says what it shows and what to be careful of; amounts without a source here are placeholders to replace with the organisation\'s own.') + '</p>' +
      '<ol class="refs">' + AVARefs.REFS.map(function (rf) {
        return '<li id="ref-' + rf.id + '"><b>' + esc(rf.by) + '</b> (' + rf.year + '). ' + esc(rf.title) + '. <a href="' + esc(rf.url) + '" target="_blank" rel="noopener noreferrer">' + esc(rf.url) + '</a> <span class="rk ' + rf.kind + '">' + tt(kinds[rf.kind]) + '</span><br>' +
          esc(tt(rf.says)) + '<br><i>' + esc(tt(rf.caveat)) + '</i></li>';
      }).join('') + '</ol></div>';
  }
  function evidenceTable(rows) {
    var groups = [], seen = {};
    rows.forEach(function (r) { if (!seen[r.group]) { seen[r.group] = 1; groups.push(r.group); } });
    var h = '<table class="evt"><tr><th' + gloss('input') + '>' + tt('Input') + '</th><th class="num"' + gloss('value') + '>' + tt('Value') + '</th><th' + gloss('reference') + '>' + tt('Reference') + '</th></tr>';
    groups.forEach(function (g) {
      h += '<tr class="grp"><td colspan="3"' + gloss({ 'Key inputs': 'keyInputs', 'General assumptions': 'generalAssumptions' }[g]) + '>' + esc(tt(g)) + '</td></tr>';
      rows.filter(function (r) { return r.group === g; }).forEach(function (r) {
        h += '<tr><td' + evTip(r) + '>' + esc(r.label) + '</td><td class="num">' + esc(r.value) + '</td><td>' + refCell(r.path) + '</td></tr>';
      });
    });
    return h + '</table>';
  }
  function renderOnepage() {
    var host = $('cfg-onepage'); if (!host || !res) return;
    var f = summaryFacts(), M = C.moneyShort, r = res, sn = E.sensitivity(state, 25), named = state.company && state.company.trim();
    var tiles = '<div class="tiles t3">' + f.tiles.filter(function (t) { return t.tip !== 'tileCod'; }).map(function (t) { return tile(t.k, t.v, t.s, t.tip); }).join('') + '</div>';
    var cb = '<table class="evt"><tr><th></th><th class="num">' + esc(altShort()) + '</th><th class="num">OutSystems</th></tr>' +
      '<tr><td>' + tt('Total benefits') + '</td><td class="num">' + M(r.alt.totalValue) + '</td><td class="num">' + M(r.os.totalValue) + '</td></tr>' +
      '<tr><td>' + tt('Total costs') + '</td><td class="num">' + M(r.alt.totalCost) + '</td><td class="num">' + M(r.os.totalCost) + '</td></tr>' +
      '<tr><td><b>' + tt('Net benefit') + '</b></td><td class="num"><b>' + M(r.alt.totalValue - r.alt.totalCost) + '</b></td><td class="num"><b>' + M(r.os.totalValue - r.os.totalCost) + '</b></td></tr></table>';
    var sure = '<ul>' + sn.rows.slice(0, 3).map(function (x) { return '<li>' + esc(tt(x.label)) + ': ' + tt('{a} to {b}', { a: (x.low >= 0 ? '+' : '') + M(x.low), b: (x.high >= 0 ? '+' : '') + M(x.high) }) + '</li>'; }).join('') + '</ul>' +
      '<ul>' + mustBeTrueLines().map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
    var ev = assumptionRows();
    host.innerHTML = '<div class="noprint" style="margin:0 0 10px"><button class="b pri" data-act="print">' + tt('Print or save as PDF') + '</button> <button class="b" data-act="closeonepage">' + tt('Back') + '</button></div>' +
      '<div class="onepage">' + (named ? '' : '<div class="exbanner"><b>' + tt('Example numbers') + '</b> ' + tt('These are placeholders, not the customer\'s figures. Name the assessment and replace them.') + '</div>') +
      '<h2>' + esc(named ? state.company.trim() : tt('AI Value Assessment')) + '</h2><div class="sub">' + esc(tt('OutSystems compared with {alt}', { alt: altLabel() })) + ' · ' + esc(tt('{case} scenario', { case: (E.caseOf(state) ? tt(E.casesOf(state)[E.caseOf(state)].label) : tt('Custom')) })) + ' · ' + esc(state.horizon === 1 ? tt('1 year') : tt('{n} years', { n: state.horizon })) + '</div>' +
      tiles + '<p style="font-size:15px;margin:14px 0 4px"><b>' + esc(f.take) + '</b></p>' +
      '<h3>' + tt('Costs and benefits over the period') + '</h3>' + cb +
      '<h3>' + tt('How sure are we') + '</h3>' + sure +
      '<h3>' + tt('Assumptions and sources') + '</h3><div class="refwrap">' + evidenceTable(ev) + '</div>' +
      '<p class="note">' + tt('All figures use illustrative placeholder defaults unless a reference is shown.') + '</p></div>';
  }

  function chartDefs() {
    var r = res, alt = altLabel(), M = C.money, MS = C.moneyShort;
    var rw = function (T) { return T.parts.filter(function (p) { return p.key === 'rework'; })[0].weeks; };
    var facts = summaryFacts();
    var costDiff = 0, valDiff = 0;
    r.bridge.forEach(function (b) { if (b.kind === 'cost') costDiff += b.delta; else valDiff += b.delta; });
    var biggest = E.COST_CATS.slice().sort(function (a, b) { return r.os.sumCost[b.key] - r.os.sumCost[a.key]; })[0];
    var lastOs = 0, lastAlt = 0;
    r.os.projects.forEach(function (p) { lastOs = Math.max(lastOs, p.goLive); });
    r.alt.projects.forEach(function (p) { lastAlt = Math.max(lastAlt, p.goLive); });
    return [
      { id: 'summary', tab: 'The answer', step: 1, title: 'Economic summary', full: false, html: '<div class="tiles t3">' + facts.tiles.slice(1).map(function (t) { return tile(t.k, t.v, t.s, t.tip, t.to, t.d); }).join('') + '</div>',
        cap: 'The headline figures for this assessment: what OutSystems delivers against the alternative. Hover a card for how it is worked out.',
        read: 'Each card compares OutSystems with the alternative. Net present value advantage is the value of everything OutSystems delivers minus everything it costs, in today\'s terms, less the same for the alternative. Return on investment and payback show how much and how fast it earns back what it costs. Peak cash outlay is the most cash out before it turns positive. Use the tabs above to see where each number comes from.',
        take: facts.take,
        extra: '<div class="box"><h4>What this is based on</h4>' + facts.based.map(function (b2) { return esc(b2); }).join('<br>') + '<div class="meta" style="margin-top:8px">' + (mode === 'simple' ? '' : '<a data-gotab="assumptions">Edit assumptions</a>') + '</div></div>' },
      { id: 'stages', works: true, tab: 'Time at each phase', title: 'Average time to production', full: false, html: svgStages() + '<div class="wkpanel">' + weeksList() + '</div>' + more('pipeline', 'Watch applications go through each approach in the pipeline simulator: the stages, queues and review gates, with how many applications each approach puts into production over a period.'), deckSvg: svgStages(), extra: stagesExtra(),
        cap: 'Build is fast for both. Expected weeks per stage, including queues and repeat reviews after rejection.',
        read: 'Each bar is the expected journey of one application from approved idea to live. Coloured blocks are stages. Hover a block to see how it is made up. The Test, Architecture review and Security review blocks include the time spent waiting in the queue and the extra attempts needed when work is rejected. The dark red block is rework: time spent fixing rejected work.',
        take: tt('OutSystems gets an application to production in {os} weeks against {alt} for {name}, {diff} weeks sooner. Rework costs {name} {ra} weeks per application against {ro} for OutSystems.', { os: f1(r.os.T.total), alt: f1(r.alt.T.total), name: alt, diff: f1(r.weeksFaster), ra: f1(rw(r.alt.T)), ro: f1(rw(r.os.T)) }) },
      { id: 'cost', tab: 'What it costs and earns', step: 2, title: 'Costs and benefits', full: false, svg: svgCost(), html: htmlBreakdown(), toolbar: cbToggle(), extra: costExtra(),
        cap: 'Costs and benefits over the horizon for each approach, on one scale, then line by line. Benefits count only once an application is live, so going live sooner shows up here. Click a segment or a line to edit where it comes from.',
        read: 'Each pair of columns is one approach: its costs on the left and the benefits it earns on the right, on the same scale, so the gap between them is the net benefit. Benefits only start once an application is live, so the approach that gets there sooner earns more. The table below adds each line for both approaches, with the OutSystems advantage on the right (positive means OutSystems is better off), as a total over the period or in present value.',
        take: tt('Over {yrs} years OutSystems earns {earn} and costs {cost}, a net {net}, against {altnet} for {alt}. The largest OutSystems cost is {biggest}.', { yrs: state.horizon, earn: MS(r.os.totalValue), cost: MS(r.os.totalCost), net: MS(r.os.totalValue - r.os.totalCost), altnet: MS(r.alt.totalValue - r.alt.totalCost), alt: alt, biggest: tt(biggest.label).toLowerCase() }) },
      { id: 'sure', tab: 'How sure are we', step: 3, title: 'How sure are we', full: false, svg: svgSure(), html: sureHtml(),
        cap: 'Which assumptions move the answer most, and what would have to be true for OutSystems to stay ahead.',
        read: 'Each row changes one assumption by 25% lower and 25% higher, with everything else as it is, and shows how the net advantage moves. The rows at the top are the ones worth checking with the customer. Below are the conditions under which OutSystems stays ahead, and the cases at the side show how much of the claimed benefit has to arrive.',
        take: sureTake() },
      { id: 'payback', tab: 'When it pays back', step: 4, title: 'Break-even and payback', full: false, svg: svgPay(),
        cap: 'Cumulative net benefit (value minus cost) over time.',
        read: 'Each line shows the running total of value minus cost. Lines dip first because the team and platform are paid for before any application is live, and dip a little again each year when the annual licence is charged. The point where a line crosses zero for good is payback. Hover along the chart to compare both approaches at any week.',
        take: tt('OutSystems pays back in {os} against {alt} for {name}. Peak cash outlay is {po} against {pa}.', { os: months(r.os.paybackMonths, r.os.paybackWeek), alt: months(r.alt.paybackMonths, r.alt.paybackWeek), name: alt, po: MS(r.os.peakOutlay), pa: MS(r.alt.peakOutlay) }) },
      { id: 'bridge', tab: 'Advantage', min: 'case', title: 'Where the advantage comes from', full: false, svg: svgBridge(),
        cap: 'Alternative NPV to OutSystems NPV: cost differences first, then the value of going live sooner. Every bar adds up.',
        read: 'Start with the grey bar: the alternative\'s net present value. Each bar after it adds or takes away value. Green bars are in favour of OutSystems, red bars are against it. The first bars are cost differences, and any that count against OutSystems (such as a higher platform cost) come first, so you see them drop below the starting level before the gains. The rest are value that OutSystems collects earlier because it goes live sooner. The blue bar at the bottom is OutSystems\' net present value. Lighter bars are soft benefits that depend on the estimate being accepted.',
        take: r.hardShare !== null ? tt('Of the {adv} advantage, {cost} comes from cost differences and {val} from getting value sooner ({hard} hard savings).', { adv: MS(r.advantage), cost: MS(costDiff), val: MS(valDiff), hard: pct(r.hardShare) })
          : tt('Of the {adv} advantage, {cost} comes from cost differences and {val} from getting value sooner.', { adv: MS(r.advantage), cost: MS(costDiff), val: MS(valDiff) }) },
      { id: 'timeline', tab: 'Timeline', min: 'case', title: 'Application timeline', full: true, wide: true, svg: svgGantt(), html: htmlLive(),
        cap: 'When each application starts and goes live, for each approach.',
        read: 'Each application has two bars: grey for the alternative and blue for OutSystems. The solid part is active team work. The lighter part is time in review, rework and queues. The diamond marks go-live. Faster delivery lets teams start the next project sooner.',
        take: tt('All {n} applications are live by week {os} with OutSystems against week {alt} for {name}.', { n: r.os.projects.length, os: Math.round(lastOs), alt: Math.round(lastAlt), name: alt }) },
      { id: 'financials', tab: 'Financials', min: 'case', title: 'Year-by-year financials', full: true, wide: true, html: htmlFinancials(), extra: finExtra() + timingExtra(),
        cap: 'Value, cost, net and cumulative net for each approach, by year. Hover a figure for the exact amount.',
        read: 'Each approach has four rows. Value is what the applications earn once live (it ramps up after go-live). Cost is shown as a negative. Net is value minus cost, and Cumulative net is the running total. The bottom block turns everything into present value using the discount rate, and the last line is the net value advantage.',
        take: tt('Cumulative net after {yrs} years is {os} for OutSystems against {alt} for {name}. The present-value advantage is {adv}.', { yrs: state.horizon, os: MS(r.os.cum[r.os.W - 1]), alt: MS(r.alt.cum[r.alt.W - 1]), name: alt, adv: MS(r.advantage) }) }
    ];
  }

  /* A headline tile; with `to` it opens the sub-tab that breaks the figure down. */
  function tile(k, v, s, tipKey, to, d) {   // d: an optional difference to show as a pill, { t: text, good: true when OutSystems is better }
    var hp = HELP[tipKey].split('::');
    return '<div class="tile"' + (to ? ' data-sub="' + to + '"' : '') + C.tip(hp[0], hp[1] + (to ? '\n\n' + tt('Click for the breakdown.') : '')) + '><div class="k">' + tt(k) + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div>' +
      (d ? '<div class="d ' + (d.same ? 'same' : d.good ? 'good' : 'bad') + '">' + (d.same ? '● ' : d.good ? '▲ ' : '▼ ') + d.t + '</div>' : '') + '</div>';
  }
  function openSub(id) {
    if (id === 'stages') { goTo('pipeline'); setPipeSub('time'); return; }   // the time chart is on How it works
    var idx = visibleCharts(chartDefs()).map(function (d) { return d.id; }).indexOf(id), level0 = level;   // the view to come back to, before a drill-down raises it
    if (idx < 0) { ensureLevel('case'); idx = visibleCharts(chartDefs()).map(function (d) { return d.id; }).indexOf(id); }   // the detail sub-tabs belong to the business case view
    if (idx >= 0) {
      goBack = { level: level0, tab: curTab, chart: chartIdx, infra: infraSub, team: teamSub, label: 'the answer' };   // the way back, as for a chart click
      chartIdx = idx; recalc(); showBackChip();
    }
  }
  function chip(k, v, tipKey, full) { return '<span class="chip' + (full ? ' full-only' : '') + '"' + tipA(tipKey) + '>' + k + ': ' + v + '</span>'; }

  /* Plain-language reason a stage or review gate takes less time with OutSystems, with this assessment's numbers. */
  var SOONER_WHY = {
    sec: 'Security review: with AI coding tools, reviewers face far more generated code, and some of it is insecure (in one benchmark, AI-generated code introduced security flaws in about 45% of tests), so issues are found late and loop back. The OutSystems platform has security built in (permission-aware AI, runtime guardrails, platform controls), so issues are found and fixed earlier and reviewers have less custom code to judge. The gate stays; the queue and the repeat reviews shrink.',
    arch: 'Architecture review: AI tools judge each change on its own, so architecture drifts and every review is bigger and harder (review time is up about 91% on high-AI teams, with changes about 154% larger). On OutSystems the AI works on a visual model, changes are checked against the whole estate, and the review is AI-assisted against that estate, so there is less to approve and fewer rejections.',
    test: 'Test: AI generates code far faster than teams can test it, so a massive test queue forms and failures go back to build. On OutSystems testing is automated and built into the platform, and the output is a standard visual model rather than thousands of generated lines, so the queue is shorter and fewer builds fail.',
    design: 'Design: blueprint and plan mode confirm what will be built before anything is generated, and the result is reviewed as a visual model, so intent is agreed earlier and with fewer misunderstandings.',
    build: 'Build: generation is fast for both. OutSystems adds visual, model-driven development with reusable components and built-in data, logic and integration, so less is hand-assembled around the generated code, and the result stays consistent across the estate.',
    integration: 'Integration: data fabric, connectors, APIs and MCP are provided by the platform, so there is less hand-built wiring and fewer components to integrate.',
    deploy: 'Deploy: built-in, one-click promotion from Dev to QA to Prod with approvals, instead of building and maintaining a pipeline and environments from separate tools.',
    rework: 'Rework: failed reviews send work back to build and then back into the queues. With fewer failures at the gates, and work that has passed review not silently rewritten, less time goes round the loop (and fewer tokens are spent paying twice for regenerated work).'
  };
  var R2 = AVARefs, WHY_REFS = { sec: ['veracode2025'], arch: ['faros2025'] };
  function whySooner(x) {
    var key = x.key, base = tt(SOONER_WHY[key] || 'The OutSystems platform reduces the work or waiting in this step.'), g = null, n = '';
    state.gates.forEach(function (q) { if (q.id === key) g = q; });
    if (g) {
      var a = g.alt, o = g.os;
      n = '\n\n' + tt('This assessment: wait {aw} vs {ow} weeks, review {ar} vs {or} weeks, first-time pass rate {as}% vs {os}%. Time includes repeat reviews after rejection (Stages and gates tab).', { aw: a.w, ow: o.w, ar: a.r, or: o.r, as: a.s, os: o.s });
    } else if (state.stages[key]) {
      n = '\n\n' + tt('This assessment: {a} vs {o} weeks (Stages and gates tab).', { a: state.stages[key].alt, o: state.stages[key].os });
    }
    var rf = WHY_REFS[key] ? ' ' + R2.cite(WHY_REFS[key]) : '';   // a figure quoted above names its source
    return base + rf + n + '\n\n' + tt('The week figures are placeholders to validate.');
  }

  /* The three biggest places OutSystems saves time, in plain words. */
  function weeksList() {
    var r = res, rows = [];
    r.alt.T.parts.forEach(function (p, i) {
      var o = r.os.T.parts[i], d = p.weeks - o.weeks;
      if (d > 0.5) rows.push({ key: p.key, label: p.label, a: p.weeks, o: o.weeks, d: d });
    });
    rows.sort(function (x, y) { return y.d - x.d; });
    if (!rows.length) return '';
    return '<div class="wk"><b>' + tt('Where the {n} weeks go', { n: f1(Math.abs(r.weeksFaster)) }) + '</b>' + rows.slice(0, 3).map(function (x) {
      var line = tt('{label}: {a} → {o} weeks', { label: tt(x.label), a: f1(x.a), o: f1(x.o) });
      return '<div' + C.tip(line, whySooner(x)) + ' style="cursor:help">' + esc(line) + ' <i>(' + tt('{n} sooner', { n: f1(x.d) }) + ')</i></div>';
    }).join('') + '</div>';
  }

  function roiTxt(x) { return x === null ? 'n/a' : Math.round(x * 100) + '%'; }

  /* The six headline figures, the takeaway sentence and what it is based on, as plain data (used by the Economic summary tab and the slide deck). */
  function summaryFacts() {
    var r = res, alt = altLabel(), MS = C.moneyShort, adv = r.advantage, years = state.horizon, yrs = years === 1 ? tt('1 year') : tt('{n} years', { n: years }), n = r.os.projects.length;
    var company = state.company && state.company.trim() ? state.company.trim() : '';
    var wk = tt(r.weeksFaster >= 0 ? '{n} weeks sooner' : '{n} weeks later', { n: f1(Math.abs(r.weeksFaster)) });
    var same = { same: true, t: tt('Same as {alt}', { alt: altShort() }) }, lastOsW = 0, lastAltW = 0;
    r.os.projects.forEach(function (p) { lastOsW = Math.max(lastOsW, p.goLive); }); r.alt.projects.forEach(function (p) { lastAltW = Math.max(lastAltW, p.goLive); });
    var tiles = [
      { k: 'Average time to production', v: tt('{n} wks', { n: f1(r.os.T.total) }), s: tt('vs {a} weeks · {b}', { a: f1(r.alt.T.total), b: wk }), tip: 'tileTtp', to: 'stages' },
      { k: 'Net present value advantage', v: MS(adv), s: tt('OutSystems {a} vs {b}', { a: MS(r.os.npv), b: MS(r.alt.npv) }), tip: 'tileNpv', to: 'bridge',
        d: r.alt.npv > 0 && Math.abs(r.os.npv / r.alt.npv - 1) >= 0.005 ? { good: r.os.npv >= r.alt.npv, t: r.os.npv >= r.alt.npv ? tt('{n}% ahead', { n: Math.round((r.os.npv / r.alt.npv - 1) * 100) }) : tt('{n}% behind', { n: Math.round((1 - r.os.npv / r.alt.npv) * 100) }) } : null },
      { k: 'Value of the time saved', v: MS(r.costOfDelayTotal), s: wk, tip: 'tileCod', to: 'bridge',
        d: adv > 0 && r.costOfDelayTotal > 0 ? { good: true, t: tt('{n}% of the advantage', { n: Math.min(100, Math.round(r.costOfDelayTotal / adv * 100)) }) } : null },
      { k: 'Return on investment', v: roiTxt(r.os.roi), s: tt('vs {a} · over {yrs}', { a: roiTxt(r.alt.roi), yrs: yrs }), tip: 'tileRoi', to: 'cost',
        d: (r.os.roi === null || r.alt.roi === null) ? null : Math.round(Math.abs(r.os.roi - r.alt.roi) * 100) === 0 ? same : { good: r.os.roi >= r.alt.roi, t: r.os.roi >= r.alt.roi ? tt('{n}% higher', { n: Math.round(Math.abs(r.os.roi - r.alt.roi) * 100) }) : tt('{n}% lower', { n: Math.round(Math.abs(r.os.roi - r.alt.roi) * 100) }) } },
      { k: 'Payback period', v: months(r.os.paybackMonths, r.os.paybackWeek), s: tt('vs {a}', { a: months(r.alt.paybackMonths, r.alt.paybackWeek) }), tip: 'tilePay', to: 'payback',
        d: (r.os.paybackMonths === null || r.alt.paybackMonths === null) ? null : Math.abs(r.alt.paybackMonths - r.os.paybackMonths) < 0.05 ? same : { good: r.alt.paybackMonths >= r.os.paybackMonths, t: r.alt.paybackMonths >= r.os.paybackMonths ? tt('{n} months sooner', { n: f1(Math.abs(r.alt.paybackMonths - r.os.paybackMonths)) }) : tt('{n} months later', { n: f1(Math.abs(r.alt.paybackMonths - r.os.paybackMonths)) }) } },
      { k: 'Peak cash outlay', v: MS(r.os.peakOutlay), s: tt('vs {a}', { a: MS(r.alt.peakOutlay) }), tip: 'tilePeak', to: 'payback',
        d: Math.abs(r.alt.peakOutlay - r.os.peakOutlay) < 1 ? same : { good: r.os.peakOutlay <= r.alt.peakOutlay, t: r.os.peakOutlay <= r.alt.peakOutlay ? tt('{amt} lower', { amt: MS(Math.abs(r.alt.peakOutlay - r.os.peakOutlay)) }) : tt('{amt} higher', { amt: MS(Math.abs(r.alt.peakOutlay - r.os.peakOutlay)) }) } },
      { k: 'Run-rate annual value', v: MS(r.os.runRate), s: tt('{live} of {n} applications live', { live: r.os.liveProjects, n: n }), tip: 'tileRun', to: 'timeline',
        d: r.os.liveProjects === r.alt.liveProjects ? (lastAltW - lastOsW >= 1 ? { good: true, t: tt('All live {n} weeks sooner', { n: Math.round(lastAltW - lastOsW) }) } : same) : { good: r.os.liveProjects > r.alt.liveProjects, t: r.os.liveProjects > r.alt.liveProjects ? tt('{n} more live than {alt}', { n: r.os.liveProjects - r.alt.liveProjects, alt: altShort() }) : tt('{n} fewer live than {alt}', { n: r.alt.liveProjects - r.os.liveProjects, alt: altShort() }) } }
    ];
    var more0 = tt(adv >= 0 ? 'more' : 'less');
    var headline = company ? tt('For {company}, compared with {alt}: OutSystems reaches production {wk}, worth {amt} {more} net value over {yrs}.', { company: company, alt: alt, wk: wk, amt: MS(Math.abs(adv)), more: more0, yrs: yrs })
      : tt('Compared with {alt}: OutSystems reaches production {wk}, worth {amt} {more} net value over {yrs}.', { alt: alt, wk: wk, amt: MS(Math.abs(adv)), more: more0, yrs: yrs });
    var take = headline + ' ' + (r.hardShare !== null
      ? tt('It pays back in {a} against {b}, and {share} of the value advantage is hard savings.', { a: months(r.os.paybackMonths, r.os.paybackWeek), b: months(r.alt.paybackMonths, r.alt.paybackWeek), share: pct(r.hardShare) })
      : tt('It pays back in {a} against {b}.', { a: months(r.os.paybackMonths, r.os.paybackWeek), b: months(r.alt.paybackMonths, r.alt.paybackWeek) }));
    var host = HOSTS[cfgKey()], cs = E.caseOf(state);
    var based = [
      (n === 1 ? tt('1 application') : tt('{n} applications', { n: n })) + (!anyQuote() ? ', ' + tt('{n} OutSystems developers', { n: f1(E.avgDevs(state)) }) : ', ' + tt('an OutSystems delivery quote of {amt}', { amt: MS(state.deliveryQuote) })),
      tt('{amt} of value a year across the portfolio', { amt: MS(r.os.annualTotal) }),
      tt('OutSystems platform licence {amt} a year ({host})', { amt: MS(state.platform.os), host: host }),
      tt('{yrs}, future years reduced by a {rate}% discount rate', { yrs: yrs, rate: state.rate }),
      tt('{case} scenario', { case: cs ? tt(E.casesOf(state)[cs].label) : tt('Custom') })];
    return { tiles: tiles, headline: headline, take: take, based: based };
  }
  function renderSummary(defs) {
    var named = state.company && state.company.trim();
    var vw = viewer(defs);
    $('sumsteps').innerHTML = vw.steps;   // the sub-tab row sits above the scenario row and the example-numbers banner, and stays in view
    var cs0 = E.caseOf(state), ctxLine = '<div class="ctxline">' + esc(tt('{case} scenario', { case: cs0 ? tt(E.casesOf(state)[cs0].label) : tt('Custom') }) + ' · ' + (state.horizon === 1 ? tt('1 year') : tt('{n} years', { n: state.horizon })) + ' · ' + (state.hardOnly ? tt('Hard savings only') : tt('Soft benefits included'))) + '</div>';
    $('summary').innerHTML = (named ? '' : '<div class="exbanner" role="button" tabindex="0" data-focusname="1"' + C.tip(tt('Example numbers'), tt('Click to go to the name box and name the assessment.')) + '><b>' + tt('Example numbers') + '</b> ' + tt('These are placeholders, not the customer\'s figures. Name the assessment and replace them.') + '</div>') + ctxLine + vw.body +
      '<p class="note">' + tt('All figures use illustrative placeholder defaults, not benchmarks. Value is identical for both approaches; the advantage comes from cost and from reaching production sooner.') + '</p>';
    foldBoxes($('summary'));
  }

  /* Secondary figures sit beside the chart they belong to. */
  /* The three OutSystems configurations side by side: PaaS, PaaS + Sentry (which triggers the equivalent security cost on the alternative) and self-managed. */
  function hostBox() {
    var h = E.hostingCompare(state), MS = C.moneyShort, cur = E.hostingOf(state);
    var rows = CFG_ROWS.map(function (c) {
      return '<div class="cs host' + (c[0] === cfgKey() ? ' cur' : '') + '" data-host="' + c[0] + '" role="button" tabindex="0"' + C.tip(c[1], tt('Click to switch the OutSystems configuration to this one.')) + '><span>' + c[1] + '</span><b>' + MS(h[c[2]].advantage) + '</b><span>' + MS(h[c[2]].ongoing) + '</span></div>';
    }).join('');
    return '<div class="box"' + C.tip('OutSystems configurations', 'Net present value advantage and ongoing running cost for each way of running OutSystems. ODC + Sentry (PaaS) includes compliance-grade security, so the alternative is charged the equivalent security and certification cost it would need (editable on the Platform and infrastructure tab); plain PaaS is compared with base security. Self-managed adds the infrastructure and operating people the organisation provides.') +
      '><h4>' + tt('OutSystems configurations') + '</h4><div class="cases"><div class="ch"><span></span><span>' + tt('Net advantage') + '</span><span>' + tt('Running cost') + '</span></div>' + rows + '</div></div>';
  }
  /* How sure are we: the advantage under each case. */
  function casesBox() {
    var t = E.caseTable(state), MS = C.moneyShort, cur = E.caseOf(state);
    var rows = t.map(function (c) {
      return '<div class="cs ' + c.key + (c.key === cur ? ' cur' : '') + '" data-case="' + c.key + '" role="button" tabindex="0"' + C.tip(tt('{case} scenario', { case: tt(c.label) }), tt('Click to switch the whole assessment to this scenario.')) + '><span>' + tt(c.label) + '</span><b>' + MS(c.advantage) + '</b><span>' + months(c.osPayback) + '</span></div>';
    }).join('');
    return '<div class="box"' + C.tip('Scenarios', tt('The net present value advantage and OutSystems payback under each scenario, where only part of the claimed benefit arrives. Click one to switch to it.') + ' ' + caseWords() + ' ' + tt('Even the conservative scenario is worth looking at: this is how much of the story has to be true.')) +
      '><h4>' + tt('Scenarios') + '</h4><div class="cases"><div class="ch"><span></span><span>' + tt('Net advantage') + '</span><span>' + tt('Payback') + '</span></div>' + rows + '</div></div>';
  }
  /* Where key inputs came from: customer, estimate, benchmark or assumption. */
  /* Plain-language explanations of terms used on more than one screen (the Evidence page, the one-page summary, ...): one place, translated through the catalogue. */
  var GLOSS = {
    input: ['Input', 'A figure that moves the answer. Until you change it, it is a default.'],
    value: ['Value', 'The figure now in use, in the currency and units of this assessment.'],
    reference: ['Reference', 'Published sources behind this input, if any. Hover a number for what the source says; the full list is under References on this page.'],
    keyInputs: ['Key inputs', 'The figures that most directly set the size of the result: platform cost, business value, how long the work takes.'],
    generalAssumptions: ['General assumptions', 'Settings that apply to the whole assessment: the analysis period, the discount rate, the scenario.'],
  };
  function gloss(k) { var g = GLOSS[k]; return g ? C.tip(g[0], g[1]) : ''; }
  function stagesExtra() {
    var r = res, MS = C.moneyShort, bold = function (s) { return '<b>' + s + '</b>'; };
    return '<div class="box"><h4>' + tt('Delivery team') + '</h4>' + tt('The project team costs {os} per application with OutSystems against {alt} for the alternative, mainly because it is needed for {wk} more weeks per application{larger}', { os: bold(MS(r.os.sumCost.team / Math.max(1, r.os.projects.length))), alt: bold(MS(r.alt.sumCost.team / Math.max(1, r.alt.projects.length))), wk: f1(r.alt.T.active - r.os.T.active), larger: E.peoplePerDev(state, 'alt') > E.peoplePerDev(state, 'os') || state.altDevFactor > 1 ? ' ' + tt('and is larger.') : '.' }) + '</div>' +
      '<div class="box"><h4>' + tt('What a week is worth') + '</h4>' + tt('Each week sooner is worth about {a} per application. Going live sooner avoids {b} of delay cost per application.', { a: bold(MS(r.alt.annualPerProject / 52)), b: bold(MS(r.costOfDelayPerProject)) }) + '</div>';
  }
  function costExtra() {
    var r = res, MS = C.moneyShort, bold = function (s) { return '<b>' + s + '</b>'; };
    return '<div class="box"><h4>' + tt('AI tokens') + '</h4>' + tt('OutSystems saves {amt} of AI build-token spend over the horizon ({pct}% less than the alternative). Treat the saving as an assumption until measured.', { amt: bold(MS(r.tokenSaving)), pct: state.tokens.saving }) + '</div>' +
      '<div class="box"><h4>' + tt('Platform vs infrastructure') + '</h4>' + tt('The OutSystems platform and the people it needs compared with the alternative\'s infrastructure, tooling and operating resources: {link}', { link: '<a data-gotab="infrastructure" style="color:var(--text);text-decoration:underline;cursor:pointer">' + tt('see the breakdown') + ' ›</a>' }) + '</div>';
  }
  function timingExtra() {
    var r = res, MS = C.moneyShort, be = E.breakEvenLicence(state), bold = function (s) { return '<b>' + s + '</b>'; };
    return '<div class="box"><h4>' + tt('Break-even OutSystems licence') + '</h4>' + tt('The net value advantage over the alternative is zero at a licence of {be} a year. It is currently {now}. Above the break-even the alternative is better off; below it OutSystems is.', { be: bold(be === null ? tt('n/a') : MS(be)), now: MS(state.platform.os) }) + '</div>' +
      '<div class="box"><h4>' + tt('Cost crossover') + '</h4>' + (r.crossoverMonths === null ? tt('OutSystems\' cumulative cost does not stay below the alternative\'s within the horizon.')
        : tt('From about month {n} OutSystems\' cumulative cost stays below the alternative\'s (cost only, before the value of going live sooner).', { n: bold(Math.max(1, Math.ceil(r.crossoverMonths))) })) + '</div>';
  }
  function finExtra() {
    var r = res, roi = function (x) { return x === null ? tt('n/a') : Math.round(x * 100) + '%'; };
    return '<div class="box"><h4>' + tt('Return on investment') + '</h4>' + tt('ROI (net value ÷ cost, not discounted) is {os} for OutSystems against {alt} for {name}.', { os: '<b>' + roi(r.os.roi) + '</b>', alt: '<b>' + roi(r.alt.roi) + '</b>', name: esc(altLabel()) }) + '</div>';
  }

  /* Year-by-year numbers for a finance audience: value, cost, net and cumulative for each approach. */
  function htmlFinancials() {
    var r = res, M = C.moneyShort, Mf = C.money, W = r.os.W, years = Math.ceil(W / 52), alt = altShort(), y, k;
    function sums(arr) {
      var out = [];
      for (y = 0; y < years; y++) { var t = 0; for (k = y * 52; k < Math.min(W, (y + 1) * 52); k++) t += arr[k]; out.push(t); }
      return out;
    }
    function cell(v, bold) { return '<td' + C.tip('', Mf(v)) + '>' + (v < 0 ? '−' : '') + M(Math.abs(v)).replace('-', '') + '</td>'; }
    function block(label, o) {
      var v = sums(o.valueTotal), c = sums(o.costTotal), cum = 0, tv = 0, tc = 0, rows = '';
      v.forEach(function (x) { tv += x; }); c.forEach(function (x) { tc += x; });
      rows += '<tr class="grp"><td colspan="' + (years + 2) + '">' + esc(label) + '</td></tr>';
      rows += '<tr><td>Value</td>' + v.map(function (x) { return cell(x); }).join('') + cell(tv) + '</tr>';
      rows += '<tr><td>Cost</td>' + c.map(function (x) { return cell(-x); }).join('') + cell(-tc) + '</tr>';
      rows += '<tr class="tot"><td>Net</td>' + v.map(function (x, i) { return cell(x - c[i]); }).join('') + cell(tv - tc) + '</tr>';
      rows += '<tr><td>Cumulative net</td>' + v.map(function (x, i) { cum += x - c[i]; return cell(cum); }).join('') + '<td></td></tr>';
      return rows;
    }
    var head = '<tr><th></th>'; for (y = 1; y <= years; y++) head += '<th>' + tt('Year {n}', { n: y }) + '</th>'; head += '<th>' + tt('Total') + '</th></tr>';
    var foot = '<tr class="grp"><td colspan="' + (years + 2) + '">' + tt('Present value (future years reduced by a {rate}% discount rate)', { rate: state.rate }) + '</td></tr>' +
      '<tr><td>' + esc(alt) + ' NPV</td><td colspan="' + years + '"></td>' + cell(r.alt.npv) + '</tr>' +
      '<tr><td>OutSystems NPV</td><td colspan="' + years + '"></td>' + cell(r.os.npv) + '</tr>' +
      '<tr class="tot"><td>Net value advantage</td><td colspan="' + years + '"></td>' + cell(r.advantage) + '</tr>';
    return '<div class="finwrap"><table class="fin">' + head + block(alt, r.alt) + block('OutSystems', r.os) + foot + '</table></div>';
  }

  /* How much is shown: a conversation (the story and the pipeline), the business case (adds the detail, the evidence and the costs), or the whole workbench. Each view includes the one before. */
  var LEVELS = { conv: 0, case: 1, work: 2 }, level = 'conv';
  function tabMin(name) { var b = document.querySelector('#tabs button[data-tab="' + name + '"]'); return (b && b.dataset.min) || 'conv'; }
  function ensureLevel(min) { if (LEVELS[level] < LEVELS[min || 'conv']) setLevel(min); }
  function setLevel(l) {
    if (LEVELS[l] === undefined) l = 'conv';
    level = l; document.body.dataset.level = l;
    var sel = $('lvlsel'); if (sel) sel.value = l;
    document.querySelectorAll('#lvlseg button').forEach(function (b) { b.classList.toggle('on', b.dataset.level === l); });
    if (LEVELS[tabMin(curTab)] > LEVELS[l]) showTab('summary');   // the screen you were on is not part of this view
    if (res) recalc();
  }
  function visibleCharts(defs, withWorks) { return defs.filter(function (d) { return LEVELS[level] >= LEVELS[d.min || 'conv'] && (withWorks || !d.works); }); }   // 'works' charts live on the How it works tab (the deck still includes them)
  /* One chart at a time, chosen with the numbered chips or the left and right arrow keys. */
  var sideHidden = true, boxOpen = {};   // the whole notes pane, and each box in it (keyed by heading)
  /* Turn each box in the notes pane into a fold: the heading is the summary, and its open state is kept across redraws. */
  function foldBoxes(root) {
    Array.prototype.slice.call(root.querySelectorAll('.vside > .box')).forEach(function (box) {
      var h = box.querySelector('h4'); if (!h) return;
      var det = document.createElement('details'), sum = document.createElement('summary'), key = h.textContent;
      Array.prototype.forEach.call(box.attributes, function (a) { det.setAttribute(a.name, a.value); });
      det.classList.add('fold'); det.dataset.box = key; if (boxOpen[key] !== false) det.open = true;
      sum.appendChild(h); det.appendChild(sum);
      while (box.firstChild) det.appendChild(box.firstChild);
      box.parentNode.replaceChild(det, box);
    });
  }
  document.addEventListener('toggle', function (ev) { var t = ev.target; if (t.dataset && t.dataset.box) boxOpen[t.dataset.box] = t.open; }, true);
  /* One chart with its notes beside it (the Summary steps and the Pipeline's cost sub-tab share this). Returns the Notes button and the chart-and-notes markup. */
  function notesTitle() { return sideHidden ? tt('Show the takeaway and notes beside the chart') : tt('Hide the takeaway and notes beside the chart'); }
  function chartBody(d, plain) {
    var hb = plain ? '' : hostBox(), cb = plain ? '' : casesBox(), hasNotes = !!(d.take || d.read || d.extra || hb || cb);   // a sub-tab with nothing to say has no Notes button or pane
    var side = !hasNotes ? '' : '<aside class="vside">' + (d.take ? '<div class="box take"><h4>' + tt('Takeaway') + '</h4>' + esc(d.take) + '</div>' : '') + (d.wide ? '' : (d.extra || '')) + hb + cb +
      (d.read ? '<div class="box"><h4>' + tt('How to read this') + '</h4>' + esc(tt(d.read)) + '</div>' : '') + '</aside>';
    var head = '<h3>' + esc(tt(d.title)) + '</h3><p class="cap">' + tt(d.cap) + '</p>';
    if (d.toolbar) head = '<div class="phead"><div class="ptxt">' + head + '</div><div class="ptool">' + d.toolbar + '</div></div>';   // a choice that belongs to this chart sits top right, the text beside it wraps
    var chart = '<section class="panel">' + head + (d.svg || '') + (d.html || '') + '</section>';
    var sideBtn = !hasNotes ? '' : '<span class="sp"></span><button type="button" class="st sidebtn" data-sidetoggle="1" title="' + notesTitle() + '">' + (sideHidden ? '▸' : '▾') + ' ' + tt('Notes') + '</button>';
    return { sideBtn: sideBtn, html: '<div class="vgrid' + (d.wide ? ' wide' : '') + (sideHidden || !hasNotes ? ' noside' : '') + '">' + chart + side + '</div>' +
      (d.wide && d.extra && !sideHidden ? '<aside class="vside below">' + d.extra + '</aside>' : '') };
  }
  function viewer(defs) {
    var list = visibleCharts(defs);
    if (chartIdx >= list.length) chartIdx = list.length - 1;
    if (chartIdx < 0) chartIdx = 0;
    var d = list[chartIdx];
    var steps = list.map(function (x, i) {
      return (x.step === undefined && i > 0 && list[i - 1].step !== undefined ? '<span class="sep">' + tt('Detail') + ' ›</span>' : '') +
        '<button class="st' + (i === chartIdx ? ' on' : '') + '" data-step="' + i + '"' + (x.cap ? C.tip(tt(x.tab || x.title), tt(x.cap)) : '') + '>' + (x.step ? '<i>' + x.step + '</i> ' : '') + esc(tt(x.tab || x.title)) + '</button>';
    }).join('');
    var cbd = chartBody(d);
    return { steps: '<div class="steps sticky" id="viewsteps">' + steps + cbd.sideBtn + '</div>', body: cbd.html +
      '<p class="note">' + tt('Left and right arrow keys step through the charts. Hover anything for an explanation.') + '</p>' };
  }

  /* -------------------------------------------------------------- pipeline */
  var sims = null, running = false, speed = 4, periodWeeks = 104, lastTs = null;
  var pipeView = 'alt', seedN = 0;   // which lanes are shown: 'alt', 'os' or 'both'. Both always run; the traditional pipeline is shown alone at first
  var dom = { items: {}, flash: {}, prevRej: {} };
  var LAY = { w: 980, laneH: 112, left: 128, top: 8 };

  function osActive() { return pipeView !== 'alt'; }   // is the OutSystems lane shown
  function altShown() { return pipeView !== 'os'; }
  /* The simulation never starts by itself: it waits for Start, and comes back paused when you return to the tab. */
  function runLabel() { return running ? 'Pause' : (sims && sims.alt.finished ? 'Run again' : (sims && sims.alt.clock > 0 ? 'Resume' : 'Start')); }
  function updateRunBtn() { var b = $('runbtn'); if (b) b.textContent = runLabel(); }

  /* Seeds are fixed so a given run is repeatable; Reset moves on to the next pair so a presenter sees variety. */
  function makeSims() {
    sims = { alt: S.create(state, 'alt', 11 + 7 * seedN), os: S.create(state, 'os', 33 + 7 * seedN) };
    ['alt', 'os'].forEach(function (ap) { var sm = sims[ap]; sm.limitTeams = true; sm.period = periodWeeks; sm.supply = true; sm.fill(1); });   // new applications keep arriving for the whole period
    Object.keys(dom.items).forEach(function (k) { dom.items[k].el.remove(); });
    dom.items = {}; dom.prevRej = {}; dom.flash = {}; dom.resultKey = '';
    updateRunBtn();
    updateOsUi();   // the choice of lanes is kept: Reset restarts both lanes
  }

  /* Text inside a stage box wraps to the box's width (other languages run longer than English). Lines stack upwards from the text's own baseline, so a long
   * message never runs below the box; the pass-rate line sits lowest and the rejected line above it. */
  function stageBoxGo(st, ap) {   // where this stage's times are edited (the same places the time-to-production chart links to)
    if (st.type === 'gate') { var gi = -1; state.gates.forEach(function (g, i) { if (g.id === st.key) gi = i; }); return gi >= 0 ? 'delivery#gates.' + gi + '.' + ap + '.w,gates.' + gi + '.' + ap + '.r,gates.' + gi + '.' + ap + '.s' : null; }
    return ['design', 'build', 'integration', 'deploy'].indexOf(st.key) >= 0 ? 'delivery#stages.' + st.key + '.' + ap : null;
  }
  function setBoxText(el, str, boxW, size, bold, spacing) {
    if (!el) return;
    if (el.dataset.y0 === undefined) el.dataset.y0 = el.getAttribute('y');
    var lines = str ? wrap(str, Math.max(6, Math.floor(boxW / (size * (bold ? 0.62 : 0.56))))) : [];
    el.dataset.n = lines.length; el.dataset.sp = spacing; el.dataset.txt = str || '';
    el.textContent = '';
    lines.forEach(function (ln) { var t = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); t.textContent = ln; el.appendChild(t); });
  }
  function placeBoxText(ap, i) {
    var gp = $('gp-' + ap + '-' + i), rj = $('rj-' + ap + '-' + i), gn = gp ? +gp.dataset.n || 0 : 0;
    [[gp, 0], [rj, gn > 1 ? (gn - 1) * +gp.dataset.sp : 0]].forEach(function (p) {
      var el = p[0]; if (!el) return;
      var n = +el.dataset.n || 0, y0 = parseFloat(el.dataset.y0), sp = +el.dataset.sp || 10, x = el.getAttribute('x');
      Array.prototype.forEach.call(el.childNodes, function (t, k) { t.setAttribute('x', x); t.setAttribute('y', (y0 - p[1] - (n - 1 - k) * sp).toFixed(1)); });
    });
  }
  function wrap(s, n) {
    var words = s.split(' '), lines = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; });
    lines.push(cur.trim());
    return lines;
  }

  /* The Pipeline tab as a story: what each approach can do (capability), what it looks like (the simulator), and the numbers (time at each stage, then cost). */
  var pipeSub = 'capability', PIPE_SUBS = [['capability', 'Phase by phase', 'What each approach provides itself, helps with, or leaves to other tools, phase by phase across the software delivery lifecycle, with the time each phase adds and the people and tooling it needs.'],
    ['sim', 'Simulator', 'Watch applications move through each approach, with the review queues and rework that slow the alternative down.'],
    ['time', 'Time at each phase', 'Where the time goes for one application: each stage, the waiting at each review, and the repeats after a rejection.']];
  var PIPE_NOTES = { capability: true, sim: false, time: true };   // the sub-tabs that have a Notes pane
  function pipeStrip() {
    return '<div class="steps sticky" id="pipestrip">' + PIPE_SUBS.map(function (s, i) {
      return '<button type="button" class="st' + (s[0] === pipeSub ? ' on' : '') + '" data-pstep="' + s[0] + '"' + C.tip(tt(s[1]), tt(s[2])) + '><i>' + (i + 1) + '</i> ' + esc(tt(s[1])) + '</button>';
    }).join('') + '<span class="sp"></span><button type="button" class="st sidebtn" id="pipenotes" data-sidetoggle="1"' + (PIPE_NOTES[pipeSub] ? '' : ' hidden') + ' title="' + notesTitle() + '">' + (sideHidden ? '▸' : '▾') + ' ' + tt('Notes') + '</button></div>';
  }
  function setPipeSub(k) {
    if (k === pipeSub) return;
    if (pipeSub === 'sim') { running = false; updateRunBtn(); }   // leaving the simulator pauses it
    pipeSub = k;
    document.querySelectorAll('#pipestrip [data-pstep]').forEach(function (b) { b.classList.toggle('on', b.dataset.pstep === k); });
    var pn = $('pipenotes'); if (pn) pn.hidden = !PIPE_NOTES[k];
    document.querySelectorAll('#pipeline .psub').forEach(function (p) { p.hidden = p.dataset.psub !== k; });
    if (k === 'time') renderPipeTime();
  }
  /* Time at each phase is the Value tab's former second step, drawn by the same code, with a way on to the Value tab. */
  function renderPipeTime() {
    var host = $('pipetime'); if (!host || !res) return;
    var d = chartDefs().filter(function (x) { return x.id === 'stages'; })[0]; if (!d) return;
    var cbd = chartBody(d, true);
    host.innerHTML = cbd.html;
    foldBoxes(host);
  }
  function buildPipeline() {
    var stages = S.stageList(state, 'alt'), n = stages.length + 2;   // backlog + stages + production
    LAY.colW = (LAY.w - LAY.left - 10) / n; LAY.n = n; LAY.h = LAY.top + 2 * LAY.laneH + 6;
    var svg = '<svg id="pipesvg" viewBox="0 0 ' + LAY.w + ' ' + LAY.h + '" style="width:100%;height:auto;display:block" font-family="Arial, Helvetica, sans-serif">';
    ['alt', 'os'].forEach(function (ap, li) {
      var y0 = LAY.top + li * LAY.laneH;
      svg += '<g id="lane-' + ap + '"><rect x="0" y="' + y0 + '" width="' + LAY.w + '" height="' + (LAY.laneH - 6) + '" rx="8" style="fill:var(--panel2)"/>';
      var laneName = ap === 'os' ? ['OutSystems'] : [altShort()];
      laneName.forEach(function (ln, j) {
        svg += '<text x="10" y="' + (y0 + 34 + j * 15) + '" font-size="13" font-weight="700" style="fill:var(--text)">' + esc(ln) + '</text>';
      });
      var bx = LAY.left + 4, bw = LAY.colW - 8;
      svg += '<rect x="' + bx + '" y="' + (y0 + 8) + '" width="' + bw + '" height="' + (LAY.laneH - 22) + '" rx="6" style="fill:var(--bg);stroke:var(--line)" stroke-width="1"' +
        C.tip('Backlog', 'There is always a full backlog of applications waiting: new ones keep arriving for the whole period. A delivery team picks up the next one when it has finished designing, building and fixing the last, and another takes its place. Waiting in a review queue does not hold a team.') + '/>';
      svg += '<text x="' + (bx + bw / 2) + '" y="' + (y0 + 22) + '" font-size="10" text-anchor="middle" style="fill:var(--muted)">Backlog</text>';
      for (var bk = 0; bk < 12; bk++) {   // a full stack of waiting applications; one is taken when a team starts it and the stack refills straight away
        svg += '<circle id="bs-' + ap + '-' + bk + '" cx="' + (bx + bw / 2 + ((bk % 4) - 1.5) * 18) + '" cy="' + (y0 + 40 + Math.floor(bk / 4) * 18) + '" r="5.5" style="fill:var(--' + (ap === 'os' ? 'os' : 'alt') + ');opacity:.45"/>';
      }
      stages.forEach(function (st, i) {
        var x = LAY.left + (i + 1) * LAY.colW + 4, w = LAY.colW - 8, gate = st.type === 'gate', go = stageBoxGo(st, ap);   // a box goes to where its times are set, as the bars of the time-to-production chart do
        svg += '<rect id="sr-' + ap + '-' + i + '" x="' + x + '" y="' + (y0 + 8) + '" width="' + w + '" height="' + (LAY.laneH - 22) + '" rx="6" style="fill:var(--bg);stroke:' + (gate ? 'var(--warn)' : 'var(--line)') + (go ? ';cursor:pointer' : '') +
          '" stroke-width="' + (gate ? 1.5 : 1) + '"' + (gate ? ' stroke-dasharray="4 3"' : '') + (go ? ' data-go="' + esc(go) + '"' : '') + '/>';
        wrap(tt(st.label), 12).forEach(function (ln, j) {
          svg += '<text x="' + (x + w / 2) + '" y="' + (y0 + 22 + j * 11) + '" font-size="10" text-anchor="middle" style="fill:var(--muted);pointer-events:none">' + esc(ln) + '</text>';
        });
        if (gate) {
          svg += '<text id="rj-' + ap + '-' + i + '" x="' + (x + w / 2) + '" y="' + (y0 + LAY.laneH - 33) + '" font-size="10" font-weight="700" text-anchor="middle" style="fill:var(--neg);pointer-events:none"></text>';
          svg += '<text id="gp-' + ap + '-' + i + '" x="' + (x + w / 2) + '" y="' + (y0 + LAY.laneH - 20) + '" font-size="9" text-anchor="middle" style="fill:var(--warn);pointer-events:none"></text>';
        }
        if (st.key === 'build') svg += '<text id="fx-' + ap + '" x="' + (x + w / 2) + '" y="' + (y0 + LAY.laneH - 20) + '" font-size="10" font-weight="700" text-anchor="middle" style="fill:var(--neg);pointer-events:none"></text>';
      });
      var px = LAY.left + (stages.length + 1) * LAY.colW + 4, pw = LAY.colW - 8;
      svg += '<rect x="' + px + '" y="' + (y0 + 8) + '" width="' + pw + '" height="' + (LAY.laneH - 22) + '" rx="6" style="fill:var(--bg);stroke:var(--pos)" stroke-width="1.5"' +
        C.tip('Production', 'Applications that have passed every stage and are live.') + '/>';
      svg += '<text x="' + (px + pw / 2) + '" y="' + (y0 + 22) + '" font-size="10" text-anchor="middle" style="fill:var(--pos)">Production</text>';
      svg += '<text id="prod-' + ap + '" x="' + (px + pw / 2) + '" y="' + (y0 + 62) + '" font-size="30" font-weight="700" text-anchor="middle" style="fill:var(--text)">0</text>';
      svg += '<text x="' + (px + pw / 2) + '" y="' + (y0 + 72) + '" font-size="9" text-anchor="middle" style="fill:var(--muted)">in production</text></g>';
    });
    svg += '<g id="itemlayer-alt"></g><g id="itemlayer-os"></g></svg>';

    var ctrl = '<div class="ctrls">' +
      '<button class="b pri" id="runbtn">' + runLabel() + '</button>' +
      '<button class="b" id="resetbtn">' + tt('Reset') + '</button>' +
      '<label' + C.tip('Show', 'Which pipeline to show. Both always run, so what you see is where each would be; showing one alone keeps the screen simple.') + '>' + tt('Show') + ' <select id="viewsel"><option value="alt"' + (pipeView === 'alt' ? ' selected' : '') + '>' + esc(altShort()) + '</option><option value="os"' + (pipeView === 'os' ? ' selected' : '') + '>OutSystems</option><option value="both"' + (pipeView === 'both' ? ' selected' : '') + '>' + tt('Both') + '</option></select></label>' +
      '<label>' + tt('Speed') + ' <input type="range" id="speed" min="0.5" max="12" step="0.5" value="' + speed + '"> <span id="speedv">' + speed + '</span> ' + tt('wks/s') + '</label>' +
      '<label' + C.tip('Run for', 'How many weeks the simulation runs before both pipelines stop, so you can compare how many applications each put into production in that time.') + '>' + tt('Run for') + ' <input type="number" id="period" min="4" step="4" value="' + periodWeeks + '"> ' + tt('weeks') + '</label>' +
      '<label' + C.tip('Delivery teams', 'How many teams build applications at the same time. A team takes the next new application when it has finished designing, building and fixing the last one.') + '>' + tt('Delivery teams') + ' ' + inp('lanes', 1, 1, 10) + '</label>' +
      '<span class="note" id="clock"></span></div>';

    var hdr = '<section class="panel wide"><h3>' + tt('Applications moving through the AI delivery pipeline') + '</h3><p class="cap">' +
      tt('Each dot is an application. There is always a full backlog of new applications, and a delivery team picks up the next one when it is free. Both pipelines run for the same period, then stop, so you can compare how many applications each puts into production.') + ' ' +
      tt('The gate values drive pass or reject at random (repeatable).') + ' ' +
      tt('Red dots are being reworked after a rejection; red counters show rejections at each gate. Hover anything for detail.') + '</p>';
    var tune = '<div class="tune"><span></span><span class="th">' + esc(altShort()) + '<br>' + tt('passes first time %') + '</span><span class="th">' + esc(altShort()) + '<br>' + tt('queue wait (weeks)') + '</span>' +
      '<span class="th os">OutSystems<br>' + tt('passes first time %') + '</span><span class="th os">OutSystems<br>' + tt('queue wait (weeks)') + '</span>';
    state.gates.forEach(function (g, i) {
      tune += '<span class="tl">' + esc(tt(g.name)) + '</span>' + inp('gates.' + i + '.alt.s', 1, 1, 100) + inp('gates.' + i + '.alt.w', 0.5, 0) + inp('gates.' + i + '.os.s', 1, 1, 100) + inp('gates.' + i + '.os.w', 0.5, 0);
    });
    tune += '</div>';
    var psub = function (k, html) { return '<div class="psub" data-psub="' + k + '"' + (pipeSub === k ? '' : ' hidden') + '>' + html + '</div>'; };
    $('pipeline').innerHTML = pipeStrip() +
      psub('capability', '<div class="vgrid' + (sideHidden ? ' noside' : '') + '"><div class="capmain">' + sec('Phase by phase', sdlcCards(false)) + '</div><aside class="vside capnotes">' + capNotesInner() + '</aside></div>') +
      psub('sim', hdr + ctrl + svg + '<div id="presult"></div><div class="stats" id="pstats"></div></section>' +
        '<div style="height:14px"></div><section class="panel wide"><h3>' + tt('Adjust the delivery assumptions') + '</h3><p class="cap">' + tt('Change how often a review passes first time and how long work waits in the queue.') + ' ' +
        tt('The animation, the charts and the headline all update. More detail is on the Stages and gates tab.') + '</p>' + tune + '</section>' +
        '<p class="note">' + tt('Illustrative. The animation uses the same gate settings and arithmetic as the Value tab; it is a discussion tool, not a forecast.') + '</p>') +
      psub('time', '<div id="pipetime"></div>');
    renderPipeTime();
    updateStageTips(); updateOsUi();
  }

  function updateOsUi() {
    var a = $('lane-alt'), o = $('lane-os'), la = $('itemlayer-alt'), lo = $('itemlayer-os'), svg = $('pipesvg'), both = pipeView === 'both', shift = pipeView === 'os' ? -LAY.laneH : 0;
    if (!a || !o) return;
    a.style.display = altShown() ? '' : 'none'; o.style.display = osActive() ? '' : 'none';
    if (la) la.style.display = altShown() ? '' : 'none'; if (lo) lo.style.display = osActive() ? '' : 'none';
    [o, lo].forEach(function (g) { if (g) g.setAttribute('transform', 'translate(0,' + shift + ')'); });   // OutSystems alone moves up into the first row
    if (svg) svg.setAttribute('viewBox', '0 0 ' + LAY.w + ' ' + (LAY.top + (both ? 2 : 1) * LAY.laneH + 6));
    var sel = $('viewsel'); if (sel) sel.value = pipeView;
  }

  /* Hover text for each stage box, refreshed when the inputs change. */
  function updateStageTips() {
    var stages = S.stageList(state, 'alt');
    ['alt', 'os'].forEach(function (ap) {
      var who = ap === 'os' ? 'OutSystems' : altShort();
      stages.forEach(function (st, i) {
        var rect = $('sr-' + ap + '-' + i), gp = $('gp-' + ap + '-' + i);
        if (!rect) return;
        var tipText;
        if (st.type === 'gate') {
          var p = st.gate[ap], s = E.passProb(p);
          tipText = who + ' · ' + tt(st.label) + '::' + tt('Each attempt waits {w} weeks in the queue and takes {r} weeks to review. Passes first time {s}%. If rejected the application goes back to build for {f} weeks, then queues again. Expected {a} attempts.', { w: f1(Number(p.w)), r: f1(Number(p.r)), s: Math.round(s * 100), f: f1(Number(p.f)), a: f1(1 / s) });
          if (gp) { setBoxText(gp, tt('pass {s}% · {t} wks', { s: Math.round(p.s), t: f1(Number(p.w) + Number(p.r)) }), parseFloat(rect.getAttribute('width')), 9, false, 10); placeBoxText(ap, i); }
        } else {
          var dur = state.stages[st.key] ? state.stages[st.key][ap] : 0;
          tipText = who + ' · ' + tt(st.label) + '::' + tt('Takes {n} weeks.', { n: f1(Number(dur)) }) + (st.key === 'build' ? ' ' + tt('Rejected work comes back here to be fixed.') : '');
        }
        rect.setAttribute('data-tip', tipText + (rect.getAttribute('data-go') ? '\n\n' + tt('Click to go to where this is edited.') : ''));
      });
    });
  }

  function colOf(item) { return (item.state === 'fix' || item.state === 'fixwait') ? 2 : item.idx + 1; }   // column 0 is the backlog
  function itemTip(ap, it) {
    var who = ap === 'os' ? 'OutSystems' : altShort(), lab = tt(it.stage.label);
    var where = it.state === 'fixwait' ? tt('Rejected: waiting for a free team to fix it') : it.state === 'fix' ? tt('Rejected: back in build being fixed') :
      it.state === 'gate' ? tt('In {stage} (waiting and being reviewed)', { stage: lab }) : tt('In {stage}', { stage: lab });
    return tt('{who} · application #{id}', { who: who, id: it.id }) + '::' + where + '.\n' + tt('Time in the pipeline: {t} weeks. Rejected {n} times so far.', { t: f1(it.elapsed), n: it.rejections });
  }
  function drawItems() {
    if (!$('itemlayer-alt')) return;
    var seen = {}, now = performance.now();
    ['alt', 'os'].forEach(function (ap, li) {
      var y0 = LAY.top + li * LAY.laneH, fixing = 0;
      sims[ap].items.forEach(function (it) {
        if (it.state === 'queued') return;   // still in the backlog: counted, not drawn
        var key = ap + it.id; seen[key] = true;
        var rework = it.state === 'fix' || it.state === 'fixwait';
        if (rework) fixing++;
        var d = dom.items[key];
        var tx = LAY.left + colOf(it) * LAY.colW + LAY.colW / 2 + ((it.id * 53) % 7 - 3) * 6;
        var ty = y0 + LAY.laneH / 2 - 2 + ((it.id * 31) % 5 - 2) * 8 + (rework ? 10 : 0);
        if (!d) {
          var el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          el.setAttribute('r', 6.5); $('itemlayer-' + ap).appendChild(el);
          d = dom.items[key] = { el: el, x: LAY.left + LAY.colW / 2, y: y0 + 40 + 18 };
          dom.pick = dom.pick || {}; dom.pick[ap] = { k: it.id % 12, t: now };   // that application leaves the backlog stack; it refills a moment later
        }
        var col = colOf(it);
        if (d.col !== undefined && col < d.col && Math.abs(tx - d.x) > 20) d.kick = { dist: Math.abs(tx - d.x) };   // sent back: fly over the stages in between in an arc, as if kicked
        d.col = col;
        var lift = 0;
        if (d.kick) {
          var pr = 1 - Math.abs(tx - d.x) / d.kick.dist;
          if (pr >= 0.98 || pr < 0) d.kick = null; else lift = -Math.min(46, d.kick.dist * 0.3) * 4 * pr * (1 - pr);
        }
        d.x += (tx - d.x) * 0.18; d.y += (ty - d.y) * 0.18;
        d.el.setAttribute('cx', d.x.toFixed(1)); d.el.setAttribute('cy', (d.y + lift).toFixed(1));
        d.el.style.fill = rework ? 'var(--neg)' : (ap === 'os' ? 'var(--os)' : 'var(--alt)');
        d.el.style.stroke = 'none';
        d.el.setAttribute('data-tip', itemTip(ap, it));
      });
      for (var bk = 0; bk < 12; bk++) {
        var bd = $('bs-' + ap + '-' + bk), pk = dom.pick && dom.pick[ap];
        if (bd) bd.style.opacity = (pk && pk.k === bk && now - pk.t < 500) ? 0.06 : 0.45;
      }
      var fx = $('fx-' + ap); if (fx) { var ftxt = fixing ? tt('↩ {n} in rework', { n: fixing }) : ''; if (fx.dataset.txt !== ftxt) { setBoxText(fx, ftxt, LAY.colW - 8, 10, true, 11); Array.prototype.forEach.call(fx.childNodes, function (t, k) { t.setAttribute('x', fx.getAttribute('x')); t.setAttribute('y', (parseFloat(fx.dataset.y0) - (fx.childNodes.length - 1 - k) * 11).toFixed(1)); }); } }
      // flash gate boxes on a fresh rejection
      S.stageList(state, ap).forEach(function (st, i) {
        if (st.type !== 'gate') return;
        var n = sims[ap].gateRejects[st.key] || 0, k = ap + st.key;
        if (n > (dom.prevRej[k] || 0)) dom.flash[k] = now;
        dom.prevRej[k] = n;
        var rect = $('sr-' + ap + '-' + i), rj = $('rj-' + ap + '-' + i);
        if (rect) {
          var on = dom.flash[k] && now - dom.flash[k] < 700;
          rect.style.stroke = on ? 'var(--neg)' : 'var(--warn)';
          rect.setAttribute('stroke-width', on ? 3.5 : 1.5);
        }
        if (rj) { var rtxt = n ? tt('↩ {n} rejected', { n: n }) : ''; if (rj.dataset.txt !== rtxt) { setBoxText(rj, rtxt, parseFloat(rect.getAttribute('width')), 10, true, 11); placeBoxText(ap, i); } }
      });
    });
    Object.keys(dom.items).forEach(function (k) {
      if (!seen[k]) { dom.items[k].el.remove(); delete dom.items[k]; }
    });
  }

  function drawStats() {
    var out = '';
    ['alt', 'os'].forEach(function (ap) {
      var st = sims[ap].stats(), T = res ? res[ap].T.total : null, active = ap === 'alt' ? altShown() : osActive();
      $('prod-' + ap).textContent = st.delivered;
      if (!active) return;
      out += '<div class="stat"><h4>' + (ap === 'os' ? 'OutSystems' : esc(altShort())) + '</h4>' +
        (active ?
          tt('In production: {a} · In progress: {b}', { a: '<b>' + st.delivered + '</b>', b: '<b>' + st.active + '</b>' }) + '<br>' +
          tt('Average time to production (delivered so far): {a} · Model expects: {b}', { a: '<b>' + (st.avg === null ? '–' : tt('{n} wks', { n: f1(st.avg) })) + '</b>', b: '<b>' + (T === null ? '–' : tt('{n} wks', { n: f1(T) })) + '</b>' }) + '<br>' +
          tt('Rejections: {a}', { a: '<b>' + st.rejections + '</b>' }) + (st.delivered ? ' ' + tt('({n} per delivered app)', { n: f1(st.rejections / st.delivered) }) : '')
          : '') + '</div>';
    });
    if (out !== dom.statsKey) { dom.statsKey = out; $('pstats').innerHTML = out; }   // only touch the page when the text changes
    var clk = (!running && sims.alt.clock === 0 ? tt('Press Start to begin.') + ' ' : '') + tt('Simulated time: {a} of {b} weeks', { a: f1(sims.alt.clock), b: periodWeeks });
    if (clk !== dom.clockKey) { dom.clockKey = clk; $('clock').textContent = clk; }

    var msg = '';
    if (sims.alt.finished) {
      var na = sims.alt.stats().delivered, no = sims.os.stats().delivered, plural = function (n) { return n === 1 ? tt('1 application') : tt('{n} applications', { n: n }); }, B = function (s) { return '<b>' + s + '</b>'; };
      if (pipeView === 'both') {
        var diff = no > na ? tt('({n} more)', { n: no - na }) : no < na ? tt('({n} fewer)', { n: na - no }) : tt('(the same)');
        msg = '<div class="result">' + tt('After {weeks} weeks, {alt} put {na} into production and {os} put {no} into production {diff}.', { weeks: B(periodWeeks), alt: B(esc(altShort())), na: B(plural(na)), os: B('OutSystems'), no: B(plural(no)), diff: diff }) + '</div>';
      } else {
        msg = '<div class="result">' + tt('After {weeks} weeks, {who} put {n} into production. Choose “Both” to compare.', { weeks: B(periodWeeks), who: B(pipeView === 'os' ? 'OutSystems' : esc(altShort())), n: B(plural(pipeView === 'os' ? no : na)) }) + '</div>';
      }
    }
    if (msg !== dom.resultKey) { dom.resultKey = msg; $('presult').innerHTML = msg; }
  }

  function stepSims(dt) {
    var steps = Math.max(1, Math.ceil(dt / 0.1));
    for (var i = 0; i < steps; i++) { sims.alt.step(dt / steps); sims.os.step(dt / steps); }   // OutSystems always runs in step, even when hidden
  }
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    var real = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
    if (sims && curTab === 'pipeline' && pipeSub === 'sim') {   // the simulator is only drawn while it is on screen
      if (running && !sims.alt.finished) stepSims(real * speed);
      if (running && sims.alt.finished) running = false;
      updateRunBtn();   // keeps Start / Pause / Resume / Run again in step with the state
      drawItems(); drawStats();
    }
    requestAnimationFrame(frame);
  }

  function onPipelineClick(ev) {
    var t = ev.target, ps = t.closest && t.closest('[data-pstep]');
    if (ps) { setPipeSub(ps.dataset.pstep); return; }
    if (t.id === 'runbtn') {
      if (sims.alt.finished) { seedN++; makeSims(); running = true; } else running = !running;   // after a finished run, start a fresh one
      updateRunBtn();
    }
    else if (t.id === 'resetbtn') { seedN++; makeSims(); }
  }
  function onPipelineChange(ev) {
    var t = ev.target;
    if (t.id === 'viewsel') { pipeView = t.value; updateOsUi(); dom.resultKey = ''; }
    else if (t.id === 'speed') { speed = parseFloat(t.value); $('speedv').textContent = speed; }
    else if (t.id === 'period') {
      periodWeeks = Math.max(4, parseFloat(t.value) || 104);
      ['alt', 'os'].forEach(function (ap) { sims[ap].period = periodWeeks; sims[ap].finished = sims[ap].clock >= periodWeeks - 1e-9; });
      dom.resultKey = ''; updateRunBtn();
    }
  }
  function onPipelineInput(ev) {
    if (ev.target.id === 'speed') { speed = parseFloat(ev.target.value); $('speedv').textContent = speed; }
  }

  /* ----------------------------------------------------------------- recalc */
  function recalc() {
    C.setCurrency(state.currency, curOpts());
    E.ensureList(state); E.migrateMonths(state); E.deriveMonths(state);
    res = E.run(state);
    var defs = chartDefs();
    renderSummary(defs);
    renderOnepage(); if (pipeSub === 'time') renderPipeTime();
    syncBuild(); syncYr(); refreshSdlc(); updateRateNote(); updateProjectSummary();
    updateCaseUi();
    scheduleSave();
    syncTitle();
    var dr = $('deliveryReadout'), ro = $('teamReadout'), M = C.money, an = esc(altShort());
    if (dr) dr.innerHTML = tt('Delivery team cost, whole portfolio: {os} OutSystems vs {alt} {an}. The team is active {wo} vs {wa} weeks per application.', { os: '<b>' + M(res.os.sumCost.team) + '</b>', alt: '<b>' + M(res.alt.sumCost.team) + '</b>', an: an, wo: f1(res.os.T.active), wa: f1(res.alt.T.active) });
    if (ro) ro.innerHTML = tt('OutSystems: {od} developers, {op} people, {ow} a week. {an}: {ad} developers, {ap} people, {aw} a week.', { od: '<b>' + f1(E.devsFor(state, 'os')) + '</b>', op: '<b>' + f1(E.devsFor(state, 'os') * E.peoplePerDev(state, 'os')) + '</b>', ow: '<b>' + M(E.weekCost(state, 'os')) + '</b>', an: an, ad: '<b>' + f1(E.devsFor(state, 'alt')) + '</b>', ap: '<b>' + f1(E.devsFor(state, 'alt') * E.peoplePerDev(state, 'alt')) + '</b>', aw: '<b>' + M(E.weekCost(state, 'alt')) + '</b>' });
    updateBreakdownTotals();
    renderTeam();
    document.querySelectorAll('[data-path][data-scope="state"]').forEach(function (el) {
      if (el !== document.activeElement) { var v = getPath(el.dataset.path); if (el.dataset.yr && E.hasPattern(getPat(el.dataset.yr))) v = yrMeanOf(el.dataset.yr); if (el.dataset.pct) v = Math.round(v * 1000) / 10; if (el.dataset.fmt) v = fmtMoney(v); if (String(el.value) !== String(v)) el.value = v; }
      if (GENERAL[el.dataset.path]) el.classList.toggle('ovr', isOverridden(el.dataset.path));
    });
    var ps = $('pstages');
    if (ps) ps.innerHTML = svgStages();
    updateStageTips();
    updateBadges();
    syncTitle();
    document.title = (state.company ? state.company + ' – ' : '') + tt('AVA – AI Value Assessment (prototype)');
  }

  /* ---------------------------------------------------- defaults / projects */
  function updateBadges() {
    ['delivery', 'costs', 'assumptions'].forEach(function (g) {
      var n = overriddenCount(g), b = $('bdg-' + g), s = $('ovr-' + g);
      if (s) s.textContent = n ? (n === 1 ? tt('1 value changed from the defaults') : tt('{n} values changed from the defaults', { n: n })) : tt('Using the defaults');
    });
  }
  function anyQuote() { return E.ensureGroups(state).some(function (g) { return g.mode === 'quote' && Number(g.quote) > 0; }); }
  function updateProjectSummary() {
    var list = E.ensureList(state), inc = list.filter(function (p) { return p.include !== false; }), sum = { cost: 0, risk: 0, rev: 0 };
    E.projectList(state).forEach(function (p) { ['cost', 'risk', 'rev'].forEach(function (k) { sum[k] += p.value[k]; }); });
    var set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    set('projsum', tt('Included: {a} of {b} rows. The portfolio takes {m} months, worked out from the rows.', { a: inc.length, b: list.length, m: f1(state.deliveryMonths) }));
    set('dm-ro', tt('{n} months, from the applications', { n: f1(state.deliveryMonths) })); set('dv-ro', f1(E.avgDevs(state)));
    ['cost', 'risk', 'rev'].forEach(function (k) { set('vr-' + k, C.money(sum[k])); });
    var ro = res && res.os && res.os.projects || [], ra = res && res.alt && res.alt.projects || [], incIdx = [];
    state.projectList.forEach(function (p, j) { if (p.include !== false) incIdx.push(j); });
    state.projectList.forEach(function (p, j) {
      var k = incIdx.indexOf(j), el = $('appcost-' + j); if (!el) return;
      if (k < 0 || !ro[k]) { el.textContent = '–'; el.removeAttribute('data-tip'); return; }
      el.textContent = C.moneyShort(ro[k].teamCost);
      el.setAttribute('data-tip', tt('Delivery cost') + '::' + tt('OutSystems {os}; the alternative {alt}.', { os: C.money(ro[k].teamCost), alt: C.money(ra[k] ? ra[k].teamCost : 0) }));
    });
  }
  /* A default changed: refresh the assessment pages (but not the Defaults page being edited). */
  function refreshAfterDefault() { buildKey(); buildProjects(); buildDelivery(); buildCosts(); buildRates(); buildInfra(); buildAssumptions(); }
  function resetGroup(g) {
    GROUPS[g].forEach(function (p) { setPath(p, defaultOf(p)); });
    buildInputs(); recalc();
  }
  function onActClick(ev) {
    var t = ev.target.closest ? ev.target.closest('[data-act],[data-reset]') : null;
    if (!t) return;
    var act = t.dataset.act;
    if (act === 'print') { window.print(); return; }
    if (act === 'closeonepage') { showTab(prevTab && prevTab !== 'onepage' ? prevTab : 'summary'); return; }
    if (act && act.indexOf('lz-') === 0 && lzAct(act)) return;
    if (t.dataset.reset) { resetGroup(t.dataset.reset); return; }
    if (act === 'infra-study' || act === 'infra-default') {
      var fxu = R.fxOf(state.currency), items = state.infraItems;
      if (items && items.length) {
        if (act === 'infra-default') { var dflt = E.defaultState().infraItems; items.forEach(function (it, i) { if (dflt[i]) it.annual = R.round3(dflt[i].annual * fxu); }); }
        else {
          var cur0 = 0, ext0 = 0; items.forEach(function (it) { if (it.ext) ext0 += Number(it.annual); else cur0 += Number(it.annual); });
          var target = 694000 * fxu, f = cur0 > 0 ? target / cur0 : 1; items.forEach(function (it) { if (!it.ext) it.annual = R.round3(Number(it.annual) * f); });
        }
      }
      buildInfra(); recalc(); return;
    }
    if (act === 'rc-reset') {
      if (state.rateCards) delete state.rateCards[rcSel];
      if (state.groupCards) delete state.groupCards[rcSel];
      if (state.loadCards) delete state.loadCards[rcSel];
      if (rcSel === state.country) { refreshAutoLines(); buildProjects(); }
      if (rcSel === state.country) { state.rates = rateDefaults(state.country, state.currency); schedule(); }
      buildRates(); buildCosts(); return;
    }
    if (act === 'sdlc-edit') { sdlcEdit = !sdlcEdit; renderSdlcCost(); return; }
    if (act === 'bd-expand' || act === 'bd-collapse' || act === 'item-add' || act === 'item-del') {
      var key = t.dataset.key, lk = t.dataset.list;
      if (act === 'bd-expand') E.expandBreakdown(state, key);
      else if (act === 'bd-collapse') E.collapseBreakdown(state, key);
      else if (act === 'item-add') { var arr = state[lk]; arr.push(lk === 'opsItems' ? { name: 'New resource', role: 'ops', fte: 0.25 } : { name: 'New line', annual: 0 }); }
      else { var ar = state[lk]; ar.splice(parseInt(t.dataset.i, 10), 1); if (!ar.length) state[lk] = null; }
      buildKey(); buildInfra(); recalc(); return;
    }
    if (act === 'add') {
      var cur = E.projectList(state), n = Math.max(1, cur.length), mavg = R.round3(state.projectList.reduce(function (t, p) { return t + (parseFloat(p.months) || 0); }, 0) / Math.max(1, state.projectList.length));
      var np = { name: tt('Application') + ' ' + (state.projectList.length + 1), include: true, months: mavg || 1, devs: R.round3(E.avgDevs(state)) || 1, build: [] };   // starts like a typical application
      ['cost', 'rev', 'risk'].forEach(function (k) {
        var avg = R.round3(cur.reduce(function (t, p) { return t + p.value[k]; }, 0) / n);
        if (avg > 0) { var l = E.newLine('simple', { driver: k }); l.amount = avg; np.build.push(l); }
      });
      np.group = t.dataset.g || E.ensureGroups(state)[0].id;
      state.projectList.push(np); appOpen[state.projectList.length - 1] = true;   // the new application opens so it can be filled in
    }
    else if (act === 'gadd') {
      var gs = E.ensureGroups(state), gid = 'g' + (gs.length + 1); while (gs.some(function (g) { return g.id === gid; })) gid += 'x';
      gs.push({ id: gid, name: tt('Delivery team') + ' ' + (gs.length + 1), rate: 100, mode: 'team', quote: 0 });
    }
    else if (act === 'gdel') {
      var gl = E.ensureGroups(state);
      if (gl.length > 1) { var gone = gl.splice(parseInt(t.dataset.i, 10), 1)[0]; state.projectList.forEach(function (p) { if (p.group === gone.id) p.group = gl[0].id; }); }
    }
    else if (act === 'sv-add') { var sl = E.newLine('simple', { driver: t.dataset.k }); state.projectList[0].build.push(sl); }
    else if (act === 'bl-add') {
      var ap = state.projectList[parseInt(t.dataset.i, 10)]; ap.build = ap.build || [];
      var nl = E.newLine(t.dataset.t, t.dataset.t === 'simple' ? { driver: t.dataset.d } : lineDefaults()); if (nl.what) nl.what = tt(nl.what);   // the label starts in the reader's language
      var sd = E.seedLine(nl, state); if (sd.length) nl.note = seedNote(sd).trim();   // sized from the organisation figures, with the basis said
      ap.build.push(nl);
    }
    else if (act === 'bl-del') { var dp = state.projectList[parseInt(t.dataset.i, 10)]; dp.build.splice(parseInt(t.dataset.j, 10), 1); }
    else if (act === 'bl-example') {
      var xp = state.projectList[parseInt(t.dataset.i, 10)], xl = E.newLine('labour', lineDefaults()); xl.group = 'case'; xl.salary = cardGroupSalary(state.country, 'case', state.currency); xl.users = 40; xl.saved = 20; xl.adopt = 80;
      xl.note = tt('Example: replace with the customer\'s figures and say where they came from.'); xp.build = [xl];
    }
    else if (act === 'bl-copy') {
      var src = state.projectList[parseInt(t.dataset.i, 10)], targets = state.projectList.filter(function (p) { return p !== src && p.include !== false && !E.hasBuild(p); });
      targets.forEach(function (p) { p.build = JSON.parse(JSON.stringify(src.build)); });
      toast(targets.length ? tt('Copied {n} lines to {m} applications.', { n: src.build.length, m: targets.length }) : tt('Every other application already has benefit lines.'));
    }
    else if (act === 'uc-pick') { setAppType(parseInt(t.dataset.i, 10), t.dataset.k); return; }
    else if (act === 'org-auto') { state.org.auto = true; E.applyOrgDefaults(state); buildInputs(); }
    else if (act === 'defaults-reset-all') {
      if (!window.confirm(tt('Reset every default, and the assessment settings that follow them, to the built-in values? Your applications, organisation and value figures stay as they are.'))) return;
      DEFAULTS = E.defaultState(); delete state.rateCards;   // the rates then come from the built-in rate card again
      Object.keys(GROUPS).forEach(function (g) { GROUPS[g].forEach(function (p) { setPath(p, defaultOf(p)); }); });
      state.seeds = E.seedDefaults(); state.skill = JSON.parse(JSON.stringify(DEFAULTS.skill)); E.applyOrgDefaults(state);
      buildInputs(); buildDefaults(); recalc(); toast(tt('Everything is back to the built-in defaults.'));
    }
    else if (act === 'seeds-reset') { state.seeds = E.seedDefaults(); E.applyOrgDefaults(state); buildInputs(); buildDefaults(); toast(tt('The starting-figure ratios are back to the built-in values.')); }
    else if (act === 'remove') {
      if (state.projectList.length > 1) { state.projectList.splice(parseInt(t.dataset.i, 10), 1); appOpen = {}; }
    }
    buildKey(); buildProjects(); recalc();
  }

  /* Analysis period: 3 and 5 years are the usual choices, but any length from 1 to 10 works. */
  /* The cases in words, from the current settings. */
  function caseWords() {
    var c = E.casesOf(state), pc = function (x) { return Math.round(x * 100) + '%'; };
    return ['conservative', 'likely', 'optimistic'].map(function (k) { return tt('{label}: {adv} of OutSystems\' improvement and {val} of the business value', { label: tt(c[k].label), adv: pc(c[k].advantage), val: pc(c[k].value) }); }).join('. ') + '.';
  }
  function caseSeg() {
    var b = Object.keys(E.CASES).map(function (k) { return '<button type="button" data-case="' + k + '">' + tt(E.CASES[k].label) + '</button>'; }).join('') + '<button type="button" data-case="custom">' + tt('Custom') + '</button>';
    return '<span class="caseseg"' + C.tip('Scenario', tt('How much of the claimed benefit is assumed to arrive.') + ' ' + caseWords() + ' ' + tt('Change them on the Analysis settings tab. Placeholder percentages to validate.')) + '><span class="clab" data-go="assumptions#scenario" style="cursor:pointer;text-decoration:underline dotted">' + tt('Scenario') + '</span><span class="seg" id="caseseg">' + b + '</span><span id="casecustom" hidden></span></span>';
  }
  var lastCase = 'likely';   // the case in use at the last update, so editing it moves the live setting with it
  function updateCaseUi() {
    var k = E.caseOf(state); if (k) lastCase = k;
    document.body.dataset.casemode = k || 'custom';   // colours the tiles and the case buttons
    document.querySelectorAll('button[data-case], .casecfg td[data-case]').forEach(function (b) { b.classList.toggle('on', b.dataset.case === (k || 'custom')); });
    var c = $('casecustom'); if (c) c.hidden = k !== null;
    var ss = $('sc-sel'); if (ss) ss.value = k || 'custom';
    document.querySelectorAll('select[data-path="horizon"]').forEach(function (s) { s.value = String(state.horizon); });
    ['hardOnly', 'hardOnly2'].forEach(function (id) { var cb = $(id); if (cb) cb.checked = !!state.hardOnly; });
  }
  function periodSelect() {
    var o = '';
    for (var y = 1; y <= 10; y++) o += '<option value="' + y + '"' + (y === state.horizon ? ' selected' : '') + '>' + (y === 1 ? tt('1 year') : tt('{n} years', { n: y })) + '</option>';
    return '<label' + C.tip('Analysis period', 'How many years the comparison covers. 3 and 5 years are typical. Every figure and chart updates as you change it.') +
      '><span>' + tt('Analysis period') + '</span> <select data-path="horizon" data-scope="state">' + o + '</select></label>';
  }

  /* ----------------------------------------------------------- tabs / modes */
  var TABS = ['summary', 'pipeline', 'applications', 'team', 'infrastructure', 'delivery', 'costs', 'rates', 'assumptions', 'defaults', 'localisation', 'onepage'];
  function showTab(name) {
    if (name === 'pipeline' && curTab !== 'pipeline') { running = false; updateRunBtn(); }   // arriving at the tab: wait for Start
    curTab = name;
    TABS.forEach(function (n) { $('tab-' + n).classList.toggle('hidden', n !== name); });
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
  }
  function setMode(m) {
    mode = m; document.body.dataset.mode = m; foldOpen = {};
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === m); });
    if (m === 'simple' && ['team', 'infrastructure', 'delivery', 'costs', 'rates', 'assumptions', 'defaults', 'localisation'].indexOf(curTab) >= 0) showTab('summary');
    if (res) { buildKey(); recalc(); }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('themebtn').textContent = t === 'dark' ? tt('Light') : tt('Dark');
    try { localStorage.setItem('ava-theme', t); } catch (e) { /* storage may be unavailable */ }
  }

  /* ---------------------------------------------------------------- tooltip */
  var presenting = false;   // hides the inputs and controls: only the story is shown
  function setPresent(on) {
    presenting = on; document.body.classList.toggle('present', on);
    var b = $('presentbtn'); if (b) b.textContent = on ? tt('Exit presentation mode') : tt('Present');
    if (on && curTab !== 'summary' && curTab !== 'pipeline') showTab('summary');
  }
  var tipsOn = true;
  function setTips(on) {
    tipsOn = on; document.body.classList.toggle('notips', !on);
    var b = $('tipsbtn'); if (b) { b.textContent = tt('Tips: {state}', { state: on ? tt('On') : tt('Off') }); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    var el = $('tip'); if (!on && el) el.classList.add('hidden');
    try { localStorage.setItem('ava-tips', on ? '1' : '0'); } catch (e) { /* storage may be unavailable */ }
  }
  function initTooltip() {
    var el = $('tip'), shown = null, lastRaw = null;
    el.setAttribute('data-notr', '1');   // the tooltip is already in the right language; keep the page translator out of it
    var savedTips = null; try { savedTips = localStorage.getItem('ava-tips'); } catch (e) { /* ignore */ }
    setTips(savedTips !== '0');
    if ($('tipsbtn')) $('tipsbtn').addEventListener('click', function () { setTips(!tipsOn); });
    function place(ev) {
      var pad = 14, w = el.offsetWidth, h = el.offsetHeight;
      var x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
    }
    document.addEventListener('mouseover', function (ev) {
      var t = tipsOn && ev.target.closest ? ev.target.closest('[data-tip]') : null;
      if (!t) { el.classList.add('hidden'); shown = null; return; }
      var raw = t.getAttribute('data-tip'), i = raw.indexOf('::');
      var title = i >= 0 ? raw.slice(0, i) : '', body = i >= 0 ? raw.slice(i + 2) : raw;
      if (raw !== lastRaw) { lastRaw = raw; el.innerHTML = (title ? '<b>' + esc(title) + '</b>' : '') + esc(body); }
      el.classList.remove('hidden'); shown = t; place(ev);
    });
    document.addEventListener('mousemove', function (ev) {
      if (shown) {
        // refresh text for live elements (e.g. moving dots) and keep the tooltip near the pointer
        var raw = shown.getAttribute && shown.getAttribute('data-tip');
        if (raw && raw !== lastRaw) { lastRaw = raw; var i = raw.indexOf('::'); el.innerHTML = (i >= 0 ? '<b>' + esc(raw.slice(0, i)) + '</b>' : '') + esc(i >= 0 ? raw.slice(i + 2) : raw); }
        place(ev);
      }
    });
    document.addEventListener('mouseleave', function () { el.classList.add('hidden'); });
    /* A click, a key press or leaving the window puts the tooltip away; it comes back when the pointer moves onto something with a tip. */
    function hideTip() { el.classList.add('hidden'); shown = null; lastRaw = null; }
    document.addEventListener('mousedown', hideTip, true);
    document.addEventListener('keydown', hideTip, true);
    document.addEventListener('mouseout', function (ev) { if (!ev.relatedTarget) hideTip(); });   // the pointer left the page
    document.addEventListener('visibilitychange', hideTip);
    window.addEventListener('blur', hideTip);
    window.addEventListener('scroll', function () { el.classList.add('hidden'); }, true);
  }

  /* ------------------------------------------------------------------- init */
  /* ---------------------------------------------------------------- saving and loading */
  var SAVE_KEY = 'ava-autosave', saveTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.hidden = true; }, ms || 5000);
  }
  /* The assessment's name (the organisation) is the editable title at the top. It is needed before exporting. */
  function syncTitle() { var t = $('titleinp'); if (t && document.activeElement !== t) t.value = state.company || ''; }
  function needName() {
    if (state.company && state.company.trim()) return true;
    var t = $('titleinp'); if (t) { t.focus(); t.classList.add('need'); setTimeout(function () { t.classList.remove('need'); }, 2500); }
    toast('Give the assessment a name first: type the organisation name in the title at the top left. (Your work is still autosaved.)', 7000);
    return false;
  }
  function setSaveStatus(txt) { var e = $('savestatus'); if (e) e.textContent = txt; }
  function saveNow() {
    saveTimer = null;
    try {
      /* Only what differs from the defaults is kept (version 2), so anything left alone follows the defaults; a version 1 save held everything and still loads the same way. */
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, t: Date.now(), state: ST.diff(E.defaultState(), state) || {} }));
      var d = new Date(); setSaveStatus(tt('Autosaved {time}', { time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));
    } catch (e) { setSaveStatus('Autosave is not available in this browser'); }
  }
  window.addEventListener('pagehide', function () { if (saveTimer) saveNow(); });   // a change made in the last moments before closing is still kept
  function scheduleSave() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
  /* A saved assessment keeps the name of the default alternative it was made with; bring it up to date when it still uses a default. */
  function normalizeAlt() {
    E.migrateDefaults(state);
    var def = ALT_TYPES.filter(function (a) { return a.id === 'code-ai'; })[0];
    if (state.altType === 'code-ai' || /^(AI coding tools|Traditional code with AI tools)$/.test(state.altName || '')) { state.altType = 'code-ai'; state.altName = def.name; }
  }
  function loadAutosave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
      var o = JSON.parse(raw); if (!o || !o.state) return false;
      state = ST.merge(E.defaultState(), o.state); normalizeAlt();
      return true;
    } catch (e) { return false; }
  }
  /* After the state is replaced (import, new assessment): rebuild every input and restart the pipeline. */
  function afterStateReplaced() {
    var h = $('hardOnly'); if (h) h.checked = !!state.hardOnly;
    syncTitle();
    buildInputs(); if (sims) makeSims();
    recalc(); saveNow();
  }
  function resultRows() {
    var r = res, rows = [], a = function (label, o, al, key) { rows.push([label, o, al, key]); };
    var cy = state.currency;
    a(tt('Average time to production (weeks)'), Math.round(r.os.T.total * 10) / 10, Math.round(r.alt.T.total * 10) / 10);
    a(tt('Net present value ({cur})', { cur: cy }), Math.round(r.os.npv), Math.round(r.alt.npv), 'npv');
    a(tt('Net present value advantage ({cur})', { cur: cy }), Math.round(r.advantage), '', 'advantage');
    a(tt('Return on investment (%)'), r.os.roi === null ? '' : Math.round(r.os.roi * 100), r.alt.roi === null ? '' : Math.round(r.alt.roi * 100), 'roi');
    a(tt('Payback (months)'), r.os.paybackMonths === null ? '' : Math.round(r.os.paybackMonths * 10) / 10, r.alt.paybackMonths === null ? '' : Math.round(r.alt.paybackMonths * 10) / 10, 'payback');
    if (state.startDate) a(tt('Payback date'), r.os.paybackWeek === null ? '' : E.dateAtWeek(state, r.os.paybackWeek), r.alt.paybackWeek === null ? '' : E.dateAtWeek(state, r.alt.paybackWeek));
    a(tt('Peak cash outlay ({cur})', { cur: cy }), Math.round(r.os.peakOutlay), Math.round(r.alt.peakOutlay), 'peak');
    a(tt('Total value over {n} years ({cur})', { n: state.horizon, cur: cy }), Math.round(r.os.totalValue), Math.round(r.alt.totalValue), 'value');
    a(tt('Total cost over {n} years ({cur})', { n: state.horizon, cur: cy }), Math.round(r.os.totalCost), Math.round(r.alt.totalCost), 'cost');
    var bd = bauData(); a(tt('Ongoing cost per year once live ({cur})', { cur: cy }), Math.round(bd.os.total), Math.round(bd.alt.total));
    E.COST_CATS.forEach(function (c) { a(tt('Cost: {what} ({cur})', { what: tt(c.label), cur: cy }), Math.round(r.os.sumCost[c.key] || 0), Math.round(r.alt.sumCost[c.key] || 0)); });
    var cs = E.caseTable(state); cs.forEach(function (c) { a(tt('NPV advantage, {case} scenario ({cur})', { case: tt(c.label), cur: cy }), Math.round(c.advantage), ''); });
    return rows;
  }
  function exportExcel() {
    if (!needName()) return;
    var bytes = ST.buildXlsx(state, resultRows(), {}), blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var name = 'AVA - ' + ((state.company || 'assessment').replace(/[\\\/:*?"<>|]/g, '').trim() || 'assessment') + ' - ' + new Date().toISOString().slice(0, 10) + '.xlsx';
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(tt('Exported {name}', { name: name }));
  }
  function importExcel(file) {
    var fr = new FileReader();
    fr.onload = function () {
      ST.parseXlsx(new Uint8Array(fr.result)).then(function (rows) {
        var go = function () { state = ST.merge(E.defaultState(), ST.inflate(rows)); normalizeAlt(); afterStateReplaced(); toast(tt('Imported {name}', { name: file.name })); };
        if (rows.warnings && rows.warnings.length) askModal('Check the workbook before importing', rows.warnings.join(' '), 'Import anyway', go); else go();
      }).catch(function (e) { toast(tt('Could not import:') + ' ' + (e && e.message ? e.message : e), 9000); });
    };
    fr.onerror = function () { toast('Could not read the file', 7000); };
    fr.readAsArrayBuffer(file);
  }
  function newAssessment() {
    if (!window.confirm('Start a new assessment? The current one is replaced (export it to Excel first if you want to keep it).')) return;
    state = E.defaultState(); try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    afterStateReplaced(); toast('Started a new assessment');
  }

  /* ---------------------------------------------------------------- slides (PowerPoint) */
  /* The brand palette for charts drawn into slides (light background): OutSystems blue, grey alternative, red for warnings. */
  var PPT_PAL = { bg: '#FFFFFF', panel: '#FFFFFF', panel2: '#F5F5ED', line: '#D9D9D2', grid: '#E8E8E1', text: '#181A1F', muted: '#5B5F66', faint: '#8A8D93', on: '#181A1F',
    os: '#234BFF', alt: '#9A9DA6', pos: '#00A3BF', neg: '#FF2400', warn: '#E58A00' };
  if (typeof AVAPalette !== 'undefined') Object.keys(AVAPalette.light).forEach(function (k) { if (k !== 'os' && k !== 'alt' && k !== 'osx' && k !== 'altx') PPT_PAL[k] = AVAPalette.light[k]; });   // the deck uses the light-theme palette (its os and alt stay the brand colours)
  function svgToPng(svg, scale) {
    return new Promise(function (resolve, reject) {
      var vb = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg); if (!vb) { reject(new Error('chart has no size')); return; }
      var w = parseFloat(vb[1]), h = parseFloat(vb[2]);
      var x = svg.replace(/var\(--([a-z0-9]+)\)/g, function (m, n) { return PPT_PAL[n] || '#181A1F'; }).replace(/style="width:100%;height:auto;display:block"/, '')
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" ');
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        var g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { if (!b) { reject(new Error('could not draw a chart')); return; } b.arrayBuffer().then(function (ab) { resolve({ bytes: new Uint8Array(ab), w: w, h: h }); }); }, 'image/png');
      };
      img.onerror = function () { reject(new Error('could not draw a chart')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(x);
    });
  }
  /* The boxes beside a chart as plain text: [{title, lines}] */
  function boxesOf(html) {
    var d = document.createElement('div'), out = []; d.innerHTML = html;
    Array.prototype.forEach.call(d.children, function (el) {
      var h = el.querySelector('h4, b'), title = h ? h.textContent.trim() : '', lines = [];
      if (el.querySelector('.cases')) { Array.prototype.forEach.call(el.querySelectorAll('.cases > div'), function (r) { lines.push(Array.prototype.map.call(r.children, function (c) { return c.textContent.trim(); }).join('  ·  ')); }); }
      else if (el.classList.contains('wk')) { Array.prototype.forEach.call(el.querySelectorAll('div'), function (r) { lines.push(r.textContent.trim()); }); }
      else { var t = el.textContent.trim(); if (title && t.indexOf(title) === 0) t = t.slice(title.length).trim(); if (t) lines.push(t); }
      if (title || lines.length) out.push({ title: title, lines: lines });
    });
    return out;
  }
  function tableRowsOf(html) {
    var d = document.createElement('div'); d.innerHTML = html;
    return Array.prototype.map.call(d.querySelectorAll('tr'), function (tr) {
      return { grp: tr.classList.contains('grp'), tot: tr.classList.contains('tot'), head: !!tr.querySelector('th'), cells: Array.prototype.map.call(tr.children, function (c) { return { t: c.textContent.trim(), span: parseInt(c.getAttribute('colspan') || '1', 10) }; }) };
    });
  }
  function deckSpec(charts) {
    var C0 = DK.COL, org = state.company && state.company.trim() ? state.company.trim() : '', alt = altLabel(), MS = C.moneyShort, M = C.money;
    var f1t = (org ? org + '  ·  ' : tt('EXAMPLE NUMBERS') + '  ·  ') + 'AI Value Assessment', f2t = 'Illustrative figures: placeholders until validated', slides = [], images = {};
    var facts = summaryFacts(), tiles = facts.tiles, lede = facts.take;
    var caseKey = E.caseOf(state), caseName = caseKey ? E.casesOf(state)[caseKey].label : 'Custom', yrs = state.horizon === 1 ? tt('1 year') : tt('{n} years', { n: state.horizon });
    var cm = { conservative: C0.amber, likely: C0.os, optimistic: C0.cyan }, accent = cm[caseKey] || C0.alt;
    // 1 cover
    slides.push({ layout: 'cover', title: org ? tt('Value assessment') + '\n' + org : tt('AI Value Assessment'), titleSize: 40, subtitle: tt('AI Value Assessment') + '\n' + tt('OutSystems compared with {alt}', { alt: alt }) + '\n' + new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), subtitleSize: 18 });
    // 2 summary
    var tw = (12.21 - (tiles.length - 1) * 0.18) / tiles.length, items = [];
    tiles.forEach(function (t, i) {
      var x = 0.56 + i * (tw + 0.18);
      items.push({ t: 'text', x: x, y: 1.6, w: tw, h: 0.07, fill: accent, inset: 0 });
      items.push({ t: 'text', x: x, y: 1.67, w: tw, h: 1.75, fill: C0.panel, inset: 0.14, paras: [
        { t: t.k.toUpperCase(), size: 10, color: C0.muted, after: 8 }, { t: t.v, size: 28, bold: true, after: 6 }, { t: t.s, size: 12, color: C0.muted }] });
    });
    items.push({ t: 'text', x: 0.56, y: 3.85, w: 12.21, h: 1.1, inset: 0, paras: [{ t: lede, size: 22 }] });
    var meta = [tt('{case} scenario', { case: tt(caseName) }), tt('Analysis period {yrs}', { yrs: yrs }), tt('Hard savings only: {v}', { v: state.hardOnly ? tt('yes') : tt('no') })];
    items.push({ t: 'text', x: 0.56, y: 4.9, w: 12.21, h: 0.9, inset: 0, paras: [{ t: meta.join('   ·   '), size: 12, color: C0.muted }] });
    slides.push({ layout: 'content', title: tiles.length ? 'Summary' : 'Summary', items: items, footer1: f1t, footer2: f2t });
    // chart slides
    var jobs = [];
    charts.forEach(function (d, i) {
      var name = 'chart' + (i + 1), it = [], side = boxesOf((d.extra || '') + hostBox() + casesBox());
      var slide = { layout: 'content', title: d.title, items: it, footer1: f1t, footer2: f2t };
      if (d.id === 'financials') {
        var rows = tableRowsOf(htmlFinancials()), ncol = rows[0].cells.length, cw = [3.2]; for (var q = 1; q < ncol; q++) cw.push((12.21 - 3.2) / (ncol - 1));
        it.push({ t: 'table', x: 0.56, y: 1.55, colW: cw, rowH: 0.27, size: 9.5, rows: rows.map(function (r) {
          var cells = r.cells.map(function (c, ci) { return { t: c.t, span: c.span > 1 ? c.span : 0, bold: r.grp || r.tot || r.head, fill: r.grp ? C0.panel : null, align: ci === 0 ? 'l' : 'r', size: 9.5 }; });
          return cells; }) });
        it.push({ t: 'text', x: 0.56, y: 6.05, w: 12.21, h: 0.5, inset: 0, paras: [{ t: d.take, size: 11, color: C0.muted }] });
      } else {
        var wide = d.wide, svg = d.deckSvg || d.svg;
        jobs.push({ name: name, svg: svg });
        var vb = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg), ar = parseFloat(vb[1]) / parseFloat(vb[2]), maxW = wide ? 12.21 : 7.7, maxH = wide ? 4.0 : 4.15, w = Math.min(maxW, maxH * ar), h = w / ar;
        it.push({ t: 'img', name: name, x: 0.56, y: 1.55, w: w, h: h, alt: d.title });
        var rd = d.read ? [{ runs: [{ t: tt('How to read this.') + '  ', bold: true }, { t: tt(d.read) }], size: 9.5, color: C0.muted }] : [];
        if (wide) {
          it.push({ t: 'text', x: 0.56, y: 5.65, w: 12.21, h: 0.9, inset: 0, paras: [{ t: d.take, size: 13, bold: true, after: 4 }].concat(rd) });
        } else {
          var col = [{ t: 'TAKEAWAY', size: 10, color: C0.muted, after: 3 }, { t: d.take, size: 15, bold: true, after: 12 }];
          side.slice(0, 3).forEach(function (b) {
            col.push({ t: b.title.toUpperCase(), size: 10, color: C0.muted, after: 2 });
            b.lines.slice(0, 5).forEach(function (ln) { col.push({ t: ln.length > 260 ? ln.slice(0, 257) + '…' : ln, size: 12, after: 4 }); });
            col.push({ t: '', size: 5 });
          });
          it.push({ t: 'text', x: 8.5, y: 1.55, w: 4.27, h: 4.95, inset: 0.05, paras: col });
          if (rd.length) it.push({ t: 'text', x: 0.56, y: 1.55 + h + 0.15, w: w, h: 1.0, inset: 0, paras: rd });
        }
      }
      slides.push(slide);
    });
    // assumptions appendix: what moves the answer, and the published source behind each figure
    var evr = assumptionRows().slice(0, 16);
    var hdc = function (tx, al) { return { t: tx, bold: true, fill: C0.panel, align: al || 'l', size: 10 }; };
    var arows = [[hdc(tt('Input')), hdc(tt('Value'), 'r'), hdc(tt('Reference'))]].concat(evr.map(function (x) {
      var refs = AVARefs.forKey(x.path).map(function (id) { return AVARefs.byId(id).short; }).join('; ');
      return [{ t: x.label, size: 10, align: 'l' }, { t: x.value, size: 10, align: 'r' }, { t: refs || '–', size: 10, align: 'l' }];
    }));
    slides.push({ layout: 'content', title: tt('Assumptions and sources'), items: [{ t: 'table', x: 0.56, y: 1.55, colW: [6.4, 2.9, 2.9], rowH: 0.3, size: 10, rows: arows }], footer1: f1t, footer2: f2t });
    // configurations and cases
    var hc = E.hostingCompare(state), ct = E.caseTable(state), hd = function (t, al) { return { t: t, bold: true, fill: C0.panel, align: al || 'r' }; };
    var ci = [{ t: 'text', x: 0.56, y: 1.55, w: 6, h: 0.4, inset: 0, paras: [{ t: 'OutSystems configurations', size: 15, bold: true }] },
      { t: 'table', x: 0.56, y: 2.0, colW: [2.1, 1.6, 1.9], rowH: 0.4, size: 12, rows: [[hd('', 'l'), hd('Net advantage'), hd('Running cost a year')]].concat(CFG_ROWS.map(function (c) { return [c[1], M(hc[c[2]].advantage), M(hc[c[2]].ongoing)]; })) },
      { t: 'text', x: 6.9, y: 1.55, w: 6, h: 0.4, inset: 0, paras: [{ t: 'If less of the benefit arrives', size: 15, bold: true }] },
      { t: 'table', x: 6.9, y: 2.0, colW: [2.0, 1.9, 1.9], rowH: 0.4, size: 12, rows: [[hd('', 'l'), hd('Net advantage'), hd('OutSystems payback')]].concat(ct.map(function (c) { return [c.label + (c.key === caseKey ? '  (selected)' : ''), M(c.advantage), months(c.osPayback)]; })) },
      { t: 'text', x: 0.56, y: 4.3, w: 12.21, h: 1.6, inset: 0, paras: [
        { t: tt('ODC + Sentry (PaaS) includes compliance-grade security, so the alternative is charged the equivalent security and certification cost it would need ({amt} a year when required). Plain PaaS is compared with base security. Self-managed adds the infrastructure and operating people the organisation provides.', { amt: MS(E.assureAnnual(state, 'alt')) }), size: 12, color: C0.muted, after: 8 },
        { t: caseWords() + ' ' + tt('Placeholder percentages.'), size: 12, color: C0.muted }] }];
    slides.push({ layout: 'content', title: 'Configurations and confidence', items: ci, footer1: f1t, footer2: f2t });
    // basis
    var hostName = CFG_ROWS.filter(function (c) { return c[0] === cfgKey(); })[0][1];
    var pl = E.projectList(state), left = [['Organisation', org || 'Example (not named)'], ['Compared against', alt], ['Applications', String(pl.length)], ['Months to deliver the portfolio', String(state.deliveryMonths)],
      [anyQuote() ? 'OutSystems delivery cost' : 'OutSystems developers', anyQuote() ? M(E.osDeliveryCost(state)) : f1(E.avgDevs(state))], ['Country and currency', state.country + ', ' + state.currency]];
    var vs = { cost: 0, risk: 0, rev: 0 }; pl.forEach(function (p) { ['cost', 'risk', 'rev'].forEach(function (k) { vs[k] += p.value[k]; }); });
    var right = [['Cost savings a year', M(vs.cost)], ['Revenue uplift a year', M(vs.rev)], ['Risk reduction a year', M(vs.risk)], ['OutSystems platform licence a year', M(state.platform.os)], ['OutSystems hosting', hostName + (E.assuranceOn(state) ? ', compliance-grade security' : '')],
      ['Discount rate and period', state.rate + '%, ' + yrs], ['Value ramp after go-live', state.rampWeeks + ' weeks']];
    var rowsOf = function (a) { return a.map(function (r) { return [{ t: r[0], align: 'l', color: C0.muted }, { t: r[1], align: 'r', bold: true }]; }); };
    slides.push({ layout: 'content', title: 'What this is based on', footer1: f1t, footer2: f2t, items: [
      { t: 'table', x: 0.56, y: 1.55, colW: [3.1, 2.8], rowH: 0.42, size: 12, rows: rowsOf(left) }, { t: 'table', x: 6.95, y: 1.55, colW: [3.1, 2.7], rowH: 0.42, size: 12, rows: rowsOf(right) },
      { t: 'text', x: 0.56, y: 5.0, w: 12.21, h: 1.2, inset: 0, paras: [{ t: 'All figures use illustrative placeholder defaults unless a reference is shown. The same annual value applies to both approaches; the advantage comes from cost and from reaching production sooner.', size: 12, color: C0.muted }] }] });
    return { slides: slides, jobs: jobs, images: images };
  }
  function deckBytes() {
    var defs = chartDefs(), charts = visibleCharts(defs, true).filter(function (d) { return d.id !== 'summary'; }), spec = deckSpec(charts);
    return Promise.all(spec.jobs.map(function (j) { return svgToPng(j.svg, 3).then(function (r) { spec.images[j.name] = r.bytes; }); })).then(function () {
      return DK.build({ slides: spec.slides, images: spec.images }, typeof AVABrandTemplate !== 'undefined' ? AVABrandTemplate : false);   // the public build has no brand template and writes a plain deck
    });
  }
  function exportSlides() {
    if (!needName()) return;
    toast('Building slides…', 15000);
    deckBytes().then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      var name = 'AVA - ' + ((state.company || 'assessment').replace(/[\\\/:*?"<>|]/g, '').trim() || 'assessment') + ' - ' + new Date().toISOString().slice(0, 10) + '.pptx';
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(tt('Downloaded {name}. To use it in Google Slides, upload it to Drive and open it with Google Slides.', { name: name }), 9000);
    }).catch(function (e) { toast(tt('Could not build the slides:') + ' ' + (e && e.message ? e.message : e), 9000); });
  }

  function initFile() {
    var btn = $('filebtn'), menu = $('filemenu'); if (!btn) return;
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', function (ev) { if (!menu.hidden && !menu.contains(ev.target) && ev.target !== btn) menu.hidden = true; });
    $('fexport').addEventListener('click', function () { menu.hidden = true; exportExcel(); });
    $('fimport').addEventListener('click', function () { $('importfile').click(); });
    $('importfile').addEventListener('change', function () { menu.hidden = true; if (this.files && this.files[0]) importExcel(this.files[0]); this.value = ''; });
    $('fslides').addEventListener('click', function () { menu.hidden = true; exportSlides(); });
    $('fonepage').addEventListener('click', function () { menu.hidden = true; prevTab = curTab; showTab('onepage'); });   // a print view, not a tab: it has no button in the tab row
    if ($('pptxbtn')) $('pptxbtn').addEventListener('click', exportSlides);
    $('fnew').addEventListener('click', function () { menu.hidden = true; newAssessment(); });
  }


  /* ---------------------------------------------------------------- languages */
  /* Text in the page that is not built by code carries data-i18n (the element's text) or data-i18n-attr (attributes such as title); the English is remembered and translated in place. */
  /* A short explanation for each tab, shown by the tooltip layer (so it follows the Tips switch and the chosen language). */
  var TAB_TIPS = {
    summary: ['Value', 'What the speed is worth: the answer, what it costs and earns, how sure we are, and when it pays back.'],
    pipeline: ['How it works', 'What each approach can do, what it looks like in practice, and how long an application takes at each stage.'],
    team: ['Team', 'People and effort by role, phase and domain for each approach, and why they differ.'],
    infrastructure: ['Platform / Infrastructure', 'The platform, the cloud infrastructure and the people who run it, for the OutSystems options and the alternative.'],
    applications: ['Applications', 'The applications in the portfolio, starting as one: its months, developers and value calculators, from simple amounts to detailed build-ups.'],
    delivery: ['Stages and gates', 'The stages and review gates between an approved idea and production, for each approach.'],
    costs: ['Cost drivers', 'How the delivery team, run costs, AI tokens and operations are worked out.'],
    rates: ['Rates', 'The loaded hourly cost of each role and typical salaries for business roles, by country.'],
    assumptions: ['Analysis settings', 'Settings for the whole assessment: the discount rate, the scenarios, and how benefits ramp up.'],
    defaults: ['Defaults', 'General defaults that rarely change.'],
    localisation: ['Languages', 'Translate the interface into another language.']
  };
  function applyTabTips() {
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) { var t = TAB_TIPS[b.dataset.tab]; if (t) b.setAttribute('data-tip', tt(t[0]) + '::' + tt(t[1])); });
  }
  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { if (el.dataset.en === undefined) el.dataset.en = el.textContent.trim(); el.textContent = tt(el.dataset.en); });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.dataset.i18nAttr.split(',').forEach(function (a) { var k = 'en' + a.replace(/-/g, ''); if (el.dataset[k] === undefined) el.dataset[k] = el.getAttribute(a) || ''; el.setAttribute(a, tt(el.dataset[k])); });
    });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.dataset.label = b.textContent.trim(); });
    applyTabTips();
  }
  /* Text already on the page is translated as it appears: whole text nodes (and titles and placeholders) that match a catalogue string are swapped, so notes and
   * labels written straight into the markup need no code of their own. The Localisation screen's English column is left alone (data-notr). */
  var noTr = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 0 };
  function trNode(node) {
    var s = node.nodeValue; if (!s || !/\S/.test(s)) return;
    var p = node.parentNode; if (!p || noTr[p.nodeName] || (p.closest && p.closest('[data-notr]'))) return;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), r = I18N.lookup(m[2]);
    if (!r && /( \u00b7 |: )/.test(m[2])) {   // "Name: figure" or "a · b": translate the pieces that have a translation
      var parts = m[2].split(/( \u00b7 |: )/), got = false;
      parts = parts.map(function (p, i) { if (i % 2) return p; var q = I18N.lookup(p.trim()); if (q) { got = true; return p.replace(p.trim(), q); } return p; });
      if (got) r = parts.join('');
    }
    if (r) node.nodeValue = m[1] + r + m[3];
  }
  function trTree(root) {
    if (I18N.lang() === 'en') return;
    if (root.nodeType === 3) { trNode(root); return; }
    if (root.nodeType !== 1 || (root.closest && root.closest('[data-notr]'))) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(trNode);
    var els = root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll('[title],[placeholder]')) : [];
    els.push(root);
    els.forEach(function (el) {
      if (el.closest && el.closest('[data-notr]')) return;
      ['title', 'placeholder'].forEach(function (a) { var v = el.getAttribute && el.getAttribute(a); if (v && !el.hasAttribute('data-i18n-attr')) { var r = I18N.lookup(v); if (r) el.setAttribute(a, r); } });
    });
  }
  function watchPage() {
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(function (muts) { muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, trTree); }); }).observe(document.body, { childList: true, subtree: true });
  }
  function buildLangSelect() {
    var sel = $('langsel'); if (!sel) return;
    sel.innerHTML = I18N.languages().map(function (l) { return '<option value="' + esc(l.code) + '">' + esc(l.code.slice(0, 2).toUpperCase() + ' ' + l.name) + '</option>'; }).join('');
    sel.value = I18N.lang();
  }
  function buildSumtools() {
    $('sumtools').innerHTML = caseSeg() + periodSelect() + '<label' + C.tip('Hard savings only', 'Leaves out soft benefits (risk reduction and revenue uplift) and keeps cost savings, cost differences and anything else that can be verified. A more cautious view.') +
      '><input type="checkbox" id="hardOnly"> ' + tt('Hard savings only') + '</label>';
    if ($('hardOnly')) $('hardOnly').checked = !!state.hardOnly;
  }
  /* Choosing a language that implies one country switches to that country and its currency, without asking, when that loses nothing. Amounts are converted to the new
   * currency, so the only thing a new country discards is hourly rates edited for this assessment on the Cost drivers tab; with those untouched the switch is safe, and with
   * them edited the country is left alone. */
  function ratesUnedited() {
    var d = rateDefaults(state.country, state.currency), r = state.rates || {};
    return Object.keys(d).every(function (k) { return r[k] === undefined || Math.abs(Number(r[k]) - d[k]) <= Math.max(1e-6, Math.abs(d[k]) * 0.005); });
  }
  function switchCountryFor(code) {
    var l = I18N.find(code), cid = l && l.country;
    if (cid && cid !== state.country && ratesUnedited()) changeCountry(cid);
  }
  /* Every way of choosing a language (the header menu, the Languages screen) comes through here: the country and currency first, so a problem redrawing
   * the screens in the new language cannot stop them, then the language. */
  function chooseLanguage(code) {
    try { switchCountryFor(code); } catch (e) { /* the language change still goes ahead */ }
    I18N.setLang(code);
  }
  /* The language changed: translate the page and rebuild every screen from the state. */
  function relocalise() {
    applyStatic(); setTips(tipsOn); setPresent(presenting); applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    buildLangSelect(); buildSumtools(); buildInputs(); buildDefaults(); if ($('pipeline') && sims) buildPipeline(); recalc(); buildLocalisation();
  }

  /* ---------------------------------------------------------------- the Localisation screen */
  var lzLang = null, lzFilter = 'all', lzSearch = '', lzPage = 0, LZ_PAGE = 40;
  function lzRows() {
    var q = lzSearch.trim().toLowerCase(), bad = I18N.problems(lzLang), badSet = {}; bad.forEach(function (k) { badSet[k] = true; });
    return I18N.catalogue().filter(function (c) {
      var tr = I18N.translationOf(lzLang, c.k);
      if (lzFilter === 'todo' && tr) return false;
      if (lzFilter === 'done' && !tr) return false;
      if (lzFilter === 'bad' && !badSet[c.k]) return false;
      if (q && c.k.toLowerCase().indexOf(q) < 0 && tr.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function buildLocalisation() {
    var host = $('cfg-localisation'); if (!host) return;
    var targets = I18N.languages().filter(function (l) { return l.code !== 'en'; });
    if (!lzLang || !I18N.find(lzLang) || lzLang === 'en') lzLang = I18N.lang() !== 'en' ? I18N.lang() : targets[0].code;
    if (!I18N.ready(lzLang)) {   // the pack file is only fetched when a language is first needed: fetch it, then draw the screen
      host.innerHTML = '<div class="lz"><p class="note">…</p></div>';
      I18N.load(lzLang, function () { if ($('cfg-localisation')) buildLocalisation(); });
      return;
    }
    var cov = I18N.coverage(lzLang), pctDone = cov.total ? Math.round(cov.done / cov.total * 100) : 0, bad = I18N.problems(lzLang), rows = lzRows(), pages = Math.max(1, Math.ceil(rows.length / LZ_PAGE));
    if (lzPage >= pages) lzPage = pages - 1;
    var opts = targets.map(function (l) { return '<option value="' + esc(l.code) + '"' + (l.code === lzLang ? ' selected' : '') + '>' + esc(l.name) + ' (' + esc(l.code) + ')</option>'; }).join('');
    var fopts = [['todo', 'Not translated'], ['bad', 'Needs checking'], ['done', 'Translated'], ['all', 'All']].map(function (f) { return '<option value="' + f[0] + '"' + (f[0] === lzFilter ? ' selected' : '') + '>' + esc(tt(f[1])) + '</option>'; }).join('');
    var body = rows.slice(lzPage * LZ_PAGE, (lzPage + 1) * LZ_PAGE).map(function (c) {
      var tr = I18N.translationOf(lzLang, c.k), flag = tr && I18N.placeholders(tr) !== I18N.placeholders(c.k) ? ' bad' : (tr ? '' : ' todo');
      var idx = I18N.catalogue().indexOf(c);
      return '<tr><td class="en" data-notr>' + esc(c.k) + '</td><td><textarea data-lzidx="' + idx + '" class="' + flag.trim() + '" rows="' + (c.k.length > 90 ? 3 : 1) + '">' + esc(tr) + '</textarea></td></tr>';
    }).join('');
    host.innerHTML = '<div class="lz"><h2 class="pt">' + esc(tt('Languages')) + '</h2><p class="pd">' + esc(tt('Translate the interface into another language. Pick a language, fill in the translations next to the English, and they apply straight away. Edits are kept in this browser; download the language file to share it or to put in the app\'s lang folder. Keep any {placeholders} exactly as they are, and move them to where the language needs them.')) + '</p>' +
      '<div class="bar"><label>' + esc(tt('Language to edit')) + ' <select data-lzsel="lang">' + opts + '</select></label>' +
      '<b>' + cov.done + ' / ' + cov.total + ' (' + pctDone + '%)</b>' + (bad.length ? '<span style="color:var(--neg)">' + esc(tt('{n} need checking', { n: bad.length })) + '</span>' : '') +
      '<button type="button" class="b pri" data-act="lz-use">' + esc(tt('Show the app in this language')) + '</button></div>' +
      '<div class="bar"><label>' + esc(tt('Show')) + ' <select data-lzsel="filter">' + fopts + '</select></label>' +
      '<input type="text" data-lzsearch="1" placeholder="' + esc(tt('Search')) + '" value="' + esc(lzSearch) + '">' +
      '<span>' + esc(tt('{a} of {b}', { a: Math.min(rows.length, lzPage * LZ_PAGE + 1) + '–' + Math.min(rows.length, (lzPage + 1) * LZ_PAGE), b: rows.length })) + '</span>' +
      '<button type="button" class="b" data-act="lz-prev"' + (lzPage ? '' : ' disabled') + '>‹</button><button type="button" class="b" data-act="lz-next"' + (lzPage < pages - 1 ? '' : ' disabled') + '>›</button></div>' +
      '<table><tr><th>English</th><th>' + esc(I18N.find(lzLang).name) + '</th></tr>' + (body || '<tr><td colspan="2" class="en">' + esc(tt('Nothing to show with this filter.')) + '</td></tr>') + '</table>' +
      '<div class="bar" style="margin-top:12px"><button type="button" class="b" data-act="lz-export">' + esc(tt('Download language file')) + '</button><button type="button" class="b" data-act="lz-import">' + esc(tt('Load language file…')) + '</button><input type="file" id="lzfile" accept=".js,.json,.txt" hidden>' +
      '<span style="flex:1"></span><label>' + esc(tt('Add a language')) + ' <input type="text" id="lzcode" placeholder="code, e.g. de" size="6"> <input type="text" id="lzname" placeholder="' + esc(tt('Name, e.g. Deutsch')) + '" size="14"></label><button type="button" class="b" data-act="lz-add">' + esc(tt('Add')) + '</button></div></div>';
  }
  function lzSaved() {   // after an edit: the screens behind use the new text at once; this screen is left alone so typing is not interrupted
    if (I18N.lang() === lzLang) { applyStatic(); buildKey(); buildInputs(); recalc(); }
    var cov = I18N.coverage(lzLang), b = document.querySelector('#cfg-localisation .bar b'); if (b) b.textContent = cov.done + ' / ' + cov.total + ' (' + (cov.total ? Math.round(cov.done / cov.total * 100) : 0) + '%)';
  }
  function lzAct(act) {
    if (act === 'lz-use') { chooseLanguage(lzLang); return true; }
    if (act === 'lz-prev') { lzPage = Math.max(0, lzPage - 1); buildLocalisation(); return true; }
    if (act === 'lz-next') { lzPage++; buildLocalisation(); return true; }
    if (act === 'lz-export') {
      var blob = new Blob([I18N.exportPack(lzLang)], { type: 'text/javascript' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = lzLang + '.js'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(tt('Downloaded {file}. Put it in the app\'s lang folder to make it permanent.', { file: lzLang + '.js' })); return true;
    }
    if (act === 'lz-import') { $('lzfile').click(); return true; }
    if (act === 'lz-add') {
      var code = ($('lzcode').value || '').trim().toLowerCase(), name = ($('lzname').value || '').trim();
      if (!I18N.addLanguage(code, name || code)) { toast(tt('Use a short, unused language code such as de or pt-br.'), 6000); return true; }
      lzLang = code; buildLangSelect(); buildLocalisation(); return true;
    }
    return false;
  }

  function init() {
    var restored = loadAutosave();
    var saved = null;
    try { saved = localStorage.getItem('ava-theme'); } catch (e) { /* ignore */ }
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(saved || (prefersLight ? 'light' : 'dark'));
    $('themebtn').addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    level = 'conv'; document.body.dataset.level = level;   // every session starts as a conversation: the story first, the inputs pane open, the notes beside the chart closed
    document.querySelectorAll('#lvlseg button').forEach(function (b) { b.classList.toggle('on', b.dataset.level === level); b.addEventListener('click', function () { setLevel(b.dataset.level); }); });
    if ($('lvlsel')) { $('lvlsel').value = level; $('lvlsel').addEventListener('change', function () { setLevel($('lvlsel').value); }); }
    document.querySelectorAll('#tabs button').forEach(function (b) { b.dataset.label = b.textContent.trim(); if (b.dataset.tab) b.addEventListener('click', function () { showTab(b.dataset.tab); }); });   // the Inputs button is not a tab

    buildSumtools(); applyStatic(); buildLangSelect();
    $('langsel').addEventListener('change', function () { chooseLanguage($('langsel').value); });
    I18N.onChange(relocalise); watchPage(); trTree(document.body);
    buildInputs(); buildDefaults(); buildLocalisation();
    initFile();
    if (restored) { $('hardOnly').checked = !!state.hardOnly; toast('Restored your last assessment. Use File, then New assessment, to start fresh.', 7000); }
    document.addEventListener('click', onActClick);
    document.addEventListener('click', function (ev) {   // the icon at the right of an amount opens its yearly pattern
      var el = ev.target.closest && ev.target.closest('[data-yr]');
      if (el && (el.hasAttribute('data-yron') || ev.clientX >= el.getBoundingClientRect().right - 40)) { openYr(el); return; }
      var pop = $('yrpop'); if (pop && !pop.hidden && !pop.contains(ev.target)) closeYr();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && yrCur) closeYr(); });
    document.addEventListener('input', onInput);
    document.addEventListener('focusin', function (ev) { var t = ev.target; if (t && t.dataset && t.dataset.pick !== undefined) openPick(parseInt(t.dataset.pick, 10), t.value); });
    document.addEventListener('click', function (ev) { var t = ev.target; if (!(t && t.closest && t.closest('.addrow'))) closePicks(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closePicks(); });
    document.addEventListener('focusout', function (ev) { var t = ev.target; if (t.dataset && t.dataset.rcg) { t.value = fmtFixed(cardGroupSalary(rcSel, t.dataset.rcg) * cardMult(rcSel) / (Number(state.team.hours) * 52), rateDec(R.byId(rcSel).cur)); return; } if (t.dataset && t.dataset.rc) { t.value = fmtFixed(rcLocal(rcSel)[t.dataset.rc], rateDec(R.byId(rcSel).cur)); return; } if (t.dataset && t.dataset.fmt) { var sc = t.dataset.scope === 'defaults' ? DEFAULTS : state; t.value = fmtMoney(getPath(t.dataset.path, sc)); } });
    document.addEventListener('change', onChange);
    makeSims();
    buildPipeline();
    $('pipeline').addEventListener('click', onPipelineClick);
    $('pipeline').addEventListener('change', onPipelineChange);
    $('pipeline').addEventListener('input', onPipelineInput);
    recalc();

    document.addEventListener('click', function (ev) {
      var t = ev.target, sidx = t.dataset && t.dataset.step, dir = t.dataset && t.dataset.stepdir;
      var mcEl = t.closest && t.closest('[data-mc]');
      if (mcEl) { closeModal(mcEl.dataset.mc === 'yes'); return; }
      if (t.id === 'modal') { closeModal(false); return; }
      var fnEl = t.closest && t.closest('[data-focusname]');
      if (fnEl) {   // the example-numbers banner: go to the name box and highlight it
        var ti = $('titleinp'); if (ti) { ti.focus(); ti.select(); ti.classList.add('hl'); setTimeout(function () { ti.classList.remove('hl'); }, 3000); }
        return;
      }
      var subEl = t.closest && t.closest('[data-sub]');
      if (subEl) { openSub(subEl.dataset.sub); return; }
      var goEl = t.closest && t.closest('[data-go]');
      if (goEl) { goTo(goEl.dataset.go); return; }
      if (t.dataset && t.dataset.gotab) {
        var gt = t.dataset.gotab;
        goBack = { level: level, tab: curTab, chart: chartIdx, infra: infraSub, team: teamSub };
        if (LEVELS[level] < LEVELS[tabMin(gt)]) showBackChip();   // only when the link raised the view: that is the case where a way back matters
        ensureLevel(tabMin(gt));   // these tabs belong to a fuller view
        showTab(gt);
      }
      else if (t.closest && t.closest('tr[data-sdlc]')) {
        var k = t.closest('tr[data-sdlc]').dataset.sdlc;
        sdlcOpen[k] = !sdlcOpen[k];   // the same phase opens on every tab that shows the table
        document.querySelectorAll('tr[data-sdlc]').forEach(function (tr) {
          if (tr.dataset.sdlc !== k) return;
          var nx = tr.nextElementSibling; tr.classList.toggle('open', sdlcOpen[k]); tr.querySelector('.car').textContent = sdlcOpen[k] ? '▾' : '▸'; if (nx) nx.hidden = !sdlcOpen[k];
        });
      }
      else if (t.dataset && t.dataset.infra) { infraSub = t.dataset.infra; buildInfra(); recalc(); }
      else if (t.dataset && t.dataset.stfilter) { stackFilter = t.dataset.stfilter; buildInfra(); recalc(); }
      else if (t.dataset && t.dataset.prov) { state.cloudProvider = t.dataset.prov; buildInfra(); recalc(); }
      else if (t.closest && t.closest('[data-base]')) { setBase(t.closest('[data-base]').dataset.base); }
      else if (t.closest && t.closest('[data-host]')) { setHosting(t.closest('[data-host]').dataset.host); }
      else if (t.closest && t.closest('[data-case]')) { t = t.closest('[data-case]'); if (t.dataset.case === 'custom') { state.custom = state.custom || { advantage: 1, value: 1 }; state.realiseCustom = true; state.realise = { advantage: state.custom.advantage, value: state.custom.value }; } else { delete state.realiseCustom; state.realise = { advantage: E.casesOf(state)[t.dataset.case].advantage, value: E.casesOf(state)[t.dataset.case].value }; } recalc(); buildAssumptions(); }   // the Assumptions screen shows the percentages now in use
      else if (t.dataset && t.dataset.note) { var nbx = $('nb-' + t.dataset.note); if (nbx) { nbx.hidden = !nbx.hidden; if (!nbx.hidden) { var nta = nbx.querySelector('textarea'); if (nta) nta.focus(); } } }   // open or close a line's note
      else if (t.dataset && t.dataset.gqtoggle) {   // a delivery team's developer experience details
        var gqg = E.ensureGroups(state).filter(function (x) { return x.id === t.dataset.gqtoggle; })[0];
        if (gqg) { gqOpen[gqg.id] = !gqIsOpen(gqg); var gqd = t.closest('.dgh'), gqr = gqd && gqd.querySelector('.gqrow'); if (gqr) gqr.hidden = !gqOpen[gqg.id]; var gqc = t.querySelector('.car'); if (gqc) gqc.textContent = gqOpen[gqg.id] ? '▾' : '▸'; }
      }
      else if (t.dataset && t.dataset.appfold !== undefined) { var fi = parseInt(t.dataset.appfold, 10); appOpen[fi] = !isAppOpen(fi, state.projectList.length); applyAppFold(); }
      else if (t.dataset && t.dataset.appfoldall) { state.projectList.forEach(function (p, j) { appOpen[j] = t.dataset.appfoldall === 'open'; }); applyAppFold(); }
      else if (t.dataset && t.dataset.gtoggle) {
        var gid2 = t.dataset.gtoggle; gClosed[gid2] = !gClosed[gid2];
        var gel = document.querySelector('.dgroup[data-g="' + gid2 + '"]'); if (gel) { gel.classList.toggle('closed', !!gClosed[gid2]); t.textContent = gClosed[gid2] ? '▸' : '▾'; }
      }
      else if (t.dataset && t.dataset.typ) { typicalMonths = Math.min(36, Math.max(1, typicalMonths + parseInt(t.dataset.typ, 10))); refreshSdlc(true); renderSdlcCost(); }
      else if (t.dataset && t.dataset.sdlcmeasure) { sdlcMeasure = t.dataset.sdlcmeasure; refreshSdlc(true); renderSdlcCost(); }
      else if (t.dataset && t.dataset.sdlcview) { sdlcScope = t.dataset.sdlcview; if (sdlcScope === 'port' && sdlcMeasure === 'time') sdlcMeasure = 'effort'; refreshSdlc(true); renderSdlcCost(); }
      else if (t.dataset && t.dataset.teamgroup !== undefined) { teamGroup = t.dataset.teamgroup || null; recalc(); }
      else if (t.dataset && t.dataset.teamsub) { teamSub = t.dataset.teamsub; recalc(); }
      else if (t.dataset && t.dataset.cbbasis) { cbBasis = t.dataset.cbbasis; recalc(); }
      else if (t.dataset && t.dataset.baupart) { bauPart = t.dataset.baupart; recalc(); }
      else if (t.dataset && t.dataset.teammetric) { teamMetric = t.dataset.teammetric; recalc(); }
      else if (t.dataset && t.dataset.sidetoggle) {
        sideHidden = !sideHidden;
        document.querySelectorAll('.sidebtn').forEach(function (b) { b.textContent = (sideHidden ? '▸' : '▾') + ' ' + tt('Notes'); b.title = notesTitle(); });
        document.querySelectorAll('.vgrid').forEach(function (g) { if (g.querySelector(':scope > .vside')) g.classList.toggle('noside', sideHidden); });
        recalc();
      }
      else if (sidx !== undefined && sidx !== '') { chartIdx = parseInt(sidx, 10); recalc(); }
      else if (dir) { chartIdx += parseInt(dir, 10); recalc(); }
    });
    if ($('panetoggle')) $('panetoggle').addEventListener('click', function () {
      var hide = !document.body.classList.contains('nopane'); document.body.classList.toggle('nopane', hide);
      this.querySelector('.car').textContent = hide ? '▸' : '◂'; this.setAttribute('data-tip', 'Inputs::' + (hide ? 'Show the inputs' : 'Hide the inputs'));
    });
    if ($('presentbtn')) $('presentbtn').addEventListener('click', function () { setPresent(!presenting); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && $('modal') && !$('modal').hidden) { closeModal(false); return; }
      if (ev.key === 'Escape' && presenting) { setPresent(false); return; }
      if (curTab !== 'summary' && curTab !== 'pipeline') return;
      var tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      var fwd = ev.key === 'ArrowRight';
      /* One story: the sub-tabs of How it works, then the steps of Value; the arrow keys walk through both, and across the join. */
      if (curTab === 'pipeline') {
        var pi = PIPE_SUBS.map(function (s) { return s[0]; }).indexOf(pipeSub);
        if (fwd) { if (pi < PIPE_SUBS.length - 1) setPipeSub(PIPE_SUBS[pi + 1][0]); else { chartIdx = 0; showTab('summary'); recalc(); } }
        else if (pi > 0) setPipeSub(PIPE_SUBS[pi - 1][0]);
      } else if (fwd) { chartIdx++; recalc(); }
      else if (chartIdx > 0) { chartIdx--; recalc(); }
      else { showTab('pipeline'); setPipeSub(PIPE_SUBS[PIPE_SUBS.length - 1][0]); }
    });
    initTooltip();

    /* Deep links for testing: #mode=full&theme=light&charts&chart=2&pipeline&t=30 */
    var h = location.hash;
    if (/noanim/.test(h)) document.body.classList.add('no-anim');
    if (/theme=light/.test(h)) applyTheme('light'); else if (/theme=dark/.test(h)) applyTheme('dark');
    if (/mode=full/.test(h)) setMode('full');
    if (/expand/.test(h)) {   // test link: break the portfolio down, make one project bigger and switch another off
      state.projects = 6; E.expandProjects(state); state.projectList[0].months = 2; state.projectList[0].name = 'Customer portal (group)';
      state.projectList[3].include = false;
      buildKey(); buildProjects(); recalc();
    }
    if (/[#&]conservative/.test(h)) { state.realise = { advantage: 0.6, value: 0.7 }; recalc(); }   // test link
    if (/[#&]pptx/.test(h)) {   // test link: build the deck and put it in the page as base64
      deckBytes().then(function (b) { var bin = '', k; for (k = 0; k < b.length; k += 8192) bin += String.fromCharCode.apply(null, b.subarray(k, k + 8192)); var pre = document.createElement('pre'); pre.id = 'pptxout'; pre.textContent = 'B64:' + btoa(bin) + ':END'; document.body.appendChild(pre); })
        .catch(function (e) { var pre = document.createElement('pre'); pre.id = 'pptxout'; pre.textContent = 'ERR:' + e.message + ':END'; document.body.appendChild(pre); });
    }
    var rc = /[#&]clickrow=([a-z]+)/.exec(h); if (rc) { var row = document.querySelector('.cases > div.cs.' + rc[1]); if (row) row.click(); }   // test link
    var rh = /[#&]clickhost=([a-z-]+)/.exec(h); if (rh) { var hr = document.querySelector('.cases > div.cs[data-host="' + rh[1] + '"]'); if (hr) hr.click(); }   // test link
    var so = /[#&]sdlc=([A-Za-z,]+)/.exec(h); if (so) { so[1].split(',').forEach(function (k) { sdlcOpen[k] = true; }); buildPipeline(); }   // test link
    var cc = /[#&]country=([A-Z]{2})/.exec(h); if (cc) changeCountry(cc[1]);   // test link
    if (/[#&]sentry/.test(h)) { state.osHosting = 'paas-sentry'; state.assurance.required = true; buildInputs(); recalc(); }   // test link
    var cm = /chart=(\d+)/.exec(h); if (cm) { chartIdx = parseInt(cm[1], 10); recalc(); }
    TABS.forEach(function (n) { if (new RegExp('[#&]' + n + '(&|$)').test(h)) showTab(n); });
    var am = /[#&]act=([a-z,]+)/.exec(h);   // test link: click these buttons by id, in order, e.g. act=osbtn,resetbtn
    if (am) am[1].split(',').forEach(function (id) { var el = $(id); if (el) el.click(); });
    var m = /[#&]t=(\d+(\.\d+)?)/.exec(h);
    if (m) {
      if (/osadd/.test(h)) pipeView = 'both'; if (/osonly/.test(h)) pipeView = 'os'; updateOsUi();
      var weeks = parseFloat(m[1]);
      for (var t = 0; t < weeks; t += 0.1) { sims.alt.step(0.1); sims.os.step(0.1); }
      for (var k = 0; k < 120; k++) drawItems();
    }
    requestAnimationFrame(frame);
  }
  var boot = function () { I18N.setLang(I18N.initialLang(), init); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
