/* AVA regions (prototype v0.3): country -> native currency, and the loaded hourly cost of each delivery role.
 *
 * !! PLACEHOLDERS !!  Illustrative estimates (written by Claude), NOT sourced data. Public salary data found online was sparse and
 * inconsistent between sources (the only usable anchors were Robert Half's Australian 2025 medians: developer about A$99k, business
 * analyst A$127.5k, test analyst about A$100k). Each country has a loaded DEVELOPER rate (salary plus on-costs, per hour, in USD,
 * blending employees and contractors); the other roles are that rate times a role relativity (ROLE_MULT), and the result is stored as
 * an explicit table (`roles`) so it can be inspected and replaced with a validated rate card. Tests check the table is plausible.
 *
 * Roles: developer, architect, business analyst, UX/UI designer, tester (QA), project manager, security specialist,
 *        DevOps / operations, business & IT stakeholders (executive time).
 * fx = local currency units per 1 USD (indicative, static).
 * This will move into the standard config files loaded by the launcher; kept as JS so the page works from file://.
 */
(function (root) {
  'use strict';

  var ROLE_KEYS = ['dev', 'arch', 'ba', 'ux', 'qa', 'pm', 'sec', 'ops', 'biz', 'sre', 'dba', 'net', 'soc', 'grc', 'coach'];
  var ROLE_LABELS = { dev: 'Developer', arch: 'Architect', ba: 'Business analyst', ux: 'UX / UI designer', qa: 'Tester (QA)',
    pm: 'Project manager', sec: 'Security specialist', ops: 'DevOps / operations', biz: 'Business & IT stakeholders',
    sre: 'Site reliability / platform engineer', dba: 'Database administrator', net: 'Network and identity engineer', soc: 'Security operations analyst', grc: 'Compliance and risk lead', coach: 'Agile coach' };
  /* Hourly cost of each role relative to a developer (typical role cost relativities, tempered by the Australian anchors above). */
  var ROLE_MULT = { dev: 1, arch: 1.5, ba: 1.2, ux: 1.0, qa: 0.85, pm: 1.3, sec: 1.4, ops: 1.0, biz: 1.8, sre: 1.15, dba: 1.1, net: 1.1, soc: 0.95, grc: 1.3, coach: 1.2 };

  /* geo: the three geographies shown in the country list (APAC, EMEA, AMER). tier: advanced or developing economy, used only to check the rates are plausible. */
  var GEOS = ['APAC', 'EMEA', 'AMER'];
  var REGIONS = [
    { id: 'AU',  name: 'Australia',         cur: 'AUD', fx: 1.427,   usdPerHour: 75, geo: 'APAC', basis: 'so', tier: 'advanced' },
    { id: 'JP',  name: 'Japan',             cur: 'JPY', fx: 157.9,   usdPerHour: 42, geo: 'APAC', basis: 'est', tier: 'advanced' },
    { id: 'SG',  name: 'Singapore',         cur: 'SGD', fx: 1.279,  usdPerHour: 55, geo: 'APAC', basis: 'rh', tier: 'advanced' },
    { id: 'NZ',  name: 'New Zealand',       cur: 'NZD', fx: 1.777,  usdPerHour: 54, geo: 'APAC', basis: 'so', tier: 'advanced' },
    { id: 'HK',  name: 'Hong Kong',         cur: 'HKD', fx: 7.846,   usdPerHour: 66, geo: 'APAC', basis: 'est', tier: 'advanced' },
    { id: 'TW',  name: 'Taiwan',            cur: 'TWD', fx: 32,    usdPerHour: 40, geo: 'APAC', basis: 'est', tier: 'advanced' },
    { id: 'KR',  name: 'South Korea',       cur: 'KRW', fx: 1343,  usdPerHour: 54, geo: 'APAC', basis: 'est', tier: 'advanced' },
    { id: 'MY',  name: 'Malaysia',          cur: 'MYR', fx: 4.07,   usdPerHour: 24, geo: 'APAC', basis: 'est', tier: 'developing' },
    { id: 'TH',  name: 'Thailand',          cur: 'THB', fx: 33.76,    usdPerHour: 21, geo: 'APAC', basis: 'est', tier: 'developing' },
    { id: 'PH',  name: 'Philippines',       cur: 'PHP', fx: 63.55,    usdPerHour: 16, geo: 'APAC', basis: 'est', tier: 'developing' },
    { id: 'VN',  name: 'Vietnam',           cur: 'VND', fx: 25000, usdPerHour: 17, geo: 'APAC', basis: 'est', tier: 'developing' },
    { id: 'ID',  name: 'Indonesia',         cur: 'IDR', fx: 18136, usdPerHour: 16, geo: 'APAC', basis: 'est', tier: 'developing' },
    { id: 'IN',  name: 'India',             cur: 'INR', fx: 94.91,    usdPerHour: 12.5, geo: 'APAC', basis: 'so', tier: 'developing' },
    { id: 'GB',  name: 'United Kingdom',    cur: 'GBP', fx: 0.7452,  usdPerHour: 70, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'DE',  name: 'Germany',           cur: 'EUR', fx: 0.8916,  usdPerHour: 64, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'FR',  name: 'France',            cur: 'EUR', fx: 0.8916,  usdPerHour: 50, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'NL',  name: 'Netherlands',       cur: 'EUR', fx: 0.8916,  usdPerHour: 62, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'PT',  name: 'Portugal',          cur: 'EUR', fx: 0.8916,  usdPerHour: 45, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'ES',  name: 'Spain',             cur: 'EUR', fx: 0.8916,  usdPerHour: 50, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'IT',  name: 'Italy',             cur: 'EUR', fx: 0.8916,  usdPerHour: 37, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'CH',  name: 'Switzerland',       cur: 'CHF', fx: 0.8196,  usdPerHour: 93, geo: 'EMEA', basis: 'so', tier: 'advanced' },
    { id: 'AE',  name: 'United Arab Emirates', cur: 'AED', fx: 3.67, usdPerHour: 54, geo: 'EMEA', basis: 'est', tier: 'advanced' },
    { id: 'SA',  name: 'Saudi Arabia',      cur: 'SAR', fx: 3.75,  usdPerHour: 51, geo: 'EMEA', basis: 'est', tier: 'advanced' },
    { id: 'ZA',  name: 'South Africa',      cur: 'ZAR', fx: 16.64,  usdPerHour: 27, geo: 'EMEA', basis: 'est', tier: 'developing' },
    { id: 'GEN', name: 'United States',     cur: 'USD', fx: 1,     usdPerHour: 124, geo: 'AMER', basis: 'so', tier: 'advanced' },
    { id: 'CA',  name: 'Canada',            cur: 'CAD', fx: 1.397,  usdPerHour: 66, geo: 'AMER', basis: 'so', tier: 'advanced' },
    { id: 'BR',  name: 'Brazil',            cur: 'BRL', fx: 5.438,   usdPerHour: 34, geo: 'AMER', basis: 'so', tier: 'developing' },
    { id: 'MX',  name: 'Mexico',            cur: 'MXN', fx: 18.72,    usdPerHour: 24, geo: 'AMER', basis: 'est', tier: 'developing' }
  ];

  /* The explicit role table, in USD per hour, one row per country. */
  REGIONS.forEach(function (r) {
    r.roles = {};
    ROLE_KEYS.forEach(function (k) { r.roles[k] = Math.round(r.usdPerHour * ROLE_MULT[k] * 10) / 10; });
  });

  /* Static, indicative currency table: units per 1 USD. */
  var FX = { USD: 1, EUR: 0.8916 };
  REGIONS.forEach(function (r) { FX[r.cur] = r.fx; });
  var CURRENCIES = (function () {
    var out = ['USD', 'EUR'];
    REGIONS.forEach(function (r) { if (out.indexOf(r.cur) < 0) out.push(r.cur); });
    return out;
  })();

  function byId(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    for (i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === 'GEN') return REGIONS[i];   // unknown id: the default (United States)
    return REGIONS[0];
  }
  /* 4 significant figures, so converted amounts stay readable. (Name kept for compatibility.) */
  function round3(x) {
    if (!isFinite(x) || x === 0) return 0;
    var p = Math.pow(10, 3 - Math.floor(Math.log10(Math.abs(x))));
    return Math.round(x * p) / p;
  }
  function fxOf(cur) { return FX[cur] === undefined ? 1 : FX[cur]; }
  /* Factor to convert an amount from one currency to another using the static table. */
  function convertCurrency(from, to) { return fxOf(to) / fxOf(from); }
  /* A country's currencies on offer: its own (the default), then USD and EUR. */
  function currencyChoices(id) {
    var out = [byId(id).cur];
    ['USD', 'EUR'].forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
    return out;
  }
  /* Hourly cost of every role in a country, in the given currency (default: the country's own). */
  function roleRates(id, cur) {
    var r = byId(id), f = fxOf(cur || r.cur), out = {};
    ROLE_KEYS.forEach(function (k) { out[k] = round3(r.roles[k] * f); });
    return out;
  }
  /* Loaded developer rate per hour in the country's own currency. */
  function ratePerHour(id) { return roleRates(id).dev; }
  /* Factor to convert amounts from one country's native currency to another's. */
  function convertFactor(fromId, toId) { return byId(toId).fx / byId(fromId).fx; }


  /* ---- Business role groups for the value builder (docs/AVA-value-builder.md) ----
   * Placeholders. rel = typical cost of the group relative to a developer. LOAD = the default loaded multiplier (employee cost / salary) for each country,
   * from employer on-costs such as pension or superannuation, payroll taxes, leave and equipment. Salary = developer loaded rate x rel x productive hours / multiplier. */
  var ROLE_GROUPS = [
    { key: 'ops', label: 'Operations and back office', rel: 0.45 }, { key: 'cs', label: 'Customer service', rel: 0.42 },
    { key: 'case', label: 'Case and claims handling', rel: 0.58 }, { key: 'uw', label: 'Underwriting and credit analysis', rel: 0.9 },
    { key: 'fin', label: 'Finance and accounting', rel: 0.75 }, { key: 'hr', label: 'HR and recruitment', rel: 0.7 },
    { key: 'sales', label: 'Sales and account management', rel: 0.95 }, { key: 'field', label: 'Field service and technicians', rel: 0.6 },
    { key: 'grc', label: 'Compliance and risk analysis', rel: 0.95 }, { key: 'proc', label: 'Procurement and supply chain', rel: 0.75 },
    { key: 'lead', label: 'Team leads and supervisors', rel: 0.95 }, { key: 'mgr', label: 'Managers', rel: 1.3 },
    { key: 'ba', label: 'Business and IT analysts', rel: 0.95 }, { key: 'it', label: 'IT operations and support', rel: 0.95 },
    { key: 'clin', label: 'Clinical staff', rel: 1.3 }, { key: 'legal', label: 'Legal and paralegal', rel: 1.15 }, { key: 'eng', label: 'Engineers and inspectors', rel: 1.1 },
    { key: 'logi', label: 'Warehouse and logistics', rel: 0.5 }, { key: 'edu', label: 'Educators and trainers', rel: 0.8 }
  ];
  var LOAD = { AU: 1.3, JP: 1.3, SG: 1.2, NZ: 1.2, HK: 1.15, TW: 1.25, KR: 1.25, MY: 1.25, TH: 1.2, PH: 1.3, VN: 1.25, ID: 1.25, IN: 1.2, GB: 1.3, DE: 1.35, FR: 1.45, NL: 1.35,
    ES: 1.33, PT: 1.33, IT: 1.4, CH: 1.2, AE: 1.15, SA: 1.15, ZA: 1.2, GEN: 1.45, CA: 1.25, BR: 1.7, MX: 1.35 };
  var PRODUCTIVE_HOURS = 1800;
  function loadMult(id) { var v = LOAD[byId(id).id]; return v === undefined ? 1.3 : v; }
  /* The loaded annual cost of one person in a role group, in the given currency (default the country's own). */
  function groupLoaded(id, group, cur) {
    var r = byId(id), g = ROLE_GROUPS.filter(function (x) { return x.key === group; })[0] || ROLE_GROUPS[0];
    return round3(r.usdPerHour * g.rel * PRODUCTIVE_HOURS * fxOf(cur || r.cur));
  }
  /* The typical annual salary of a role group in a country, in the given currency: the loaded cost less the country's on-costs. */
  function groupSalary(id, group, cur) { return round3(groupLoaded(id, group, cur) / loadMult(id)); }

  var api = {
    REGIONS: REGIONS, GEOS: GEOS, CURRENCIES: CURRENCIES, FX: FX, ROLE_KEYS: ROLE_KEYS, ROLE_LABELS: ROLE_LABELS, ROLE_MULT: ROLE_MULT,
    ROLE_GROUPS: ROLE_GROUPS, loadMult: loadMult, groupSalary: groupSalary, groupLoaded: groupLoaded,
    byId: byId, ratePerHour: ratePerHour, roleRates: roleRates, currencyChoices: currencyChoices,
    convertFactor: convertFactor, fxOf: fxOf, convertCurrency: convertCurrency, round3: round3
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVARegions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
