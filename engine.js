/* AVA engine (prototype v0.1)
 * Pure functions, no DOM. Implements the model in docs/AVA-model.md for the Simple view:
 * two approaches ('alt' = alternative, 'os' = OutSystems), weekly timeline, gate-based time to production.
 * Works in a browser (global AVAEngine), in node (module.exports) and in macOS osascript (global).
 */
(function (root) {
  'use strict';

  var WPY = 52;
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var num = function (x) { x = parseFloat(x); return isFinite(x) ? x : 0; };
  var zeros = function (n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; };

  var DRIVERS = [
    { key: 'cost', label: 'Cost savings', soft: false },
    { key: 'risk', label: 'Risk reduction', soft: true },
    { key: 'rev', label: 'Revenue uplift', soft: true }
  ];
  var COST_CATS = [
    { key: 'team', label: 'Delivery team' },
    { key: 'tokens', label: 'AI tokens' },
    { key: 'run', label: 'Run & maintenance' },
    { key: 'platform', label: 'Licences' },
    { key: 'infra', label: 'Infrastructure' },
    { key: 'ops', label: 'Operating people' },
    { key: 'assure', label: 'Security & compliance' },
    { key: 'setup', label: 'Setup (one-off)' }
  ];

  /* Illustrative defaults only. They are placeholders, not benchmarks. */
  function defaultState() {
    var st = {
      company: '',
      currency: 'USD',
      altType: 'code-ai',
      altName: 'AI coding + cloud native',
      horizon: 5,          // years
      rate: 10,            // discount rate, % per year
      /* Developers' experience with OutSystems, set on each delivery team. Less experienced developers are paid less but take longer, so the saving per day does not carry through to the cost,
       * and the extra time delays go-live. effort = multiple of the active build time, pay = % of the team's usual pay level, enable = one-off training and coaching per developer.
       * learning = the applications it takes a team to reach full speed (0 = the effort multiple stays for every application). Placeholders to validate. */
      skill: { learning: 0, levels: { experienced: { pace: 0, discount: 0, enable: 0 }, mixed: { pace: 20, discount: 10, enable: 3000 }, newer: { pace: 50, discount: 25, enable: 8000 } } },
      seeds: seedDefaults(),   // the ratios that turn the organisation's size into starting volumes
      org: { employees: 0, customers: 0, auto: true, industry: '', industryOther: '' },   // optional: the organisation's size, used only to set sensible starting figures when a calculator is added
      startDate: '',   // optional: the assessment's first day (YYYY-MM-DD); without it everything stays in relative time
      licenceStart: '',   // optional: when licences start charging; blank = the project start
      deliveryMonths: 3,   // time for OutSystems to deliver the whole portfolio (the delivery teams' active work: design, build and fixes). 0 = use the application sizes as entered
      projects: 1,         // seeds the application list when there is none (older assessments, tests); the list below is what the model reads
      projectList: null,   // the applications, delivered one after another by one team: [{name, include, months, devs, build: [value calculators]}]. Made from the seeds on first use (ensureList), and always at least one ("Portfolio")
      lanes: 2,            // the pipeline simulator's number of delivery teams (the model itself delivers the applications one after another)
      country: 'GEN',      // see regions.js; sets currency and the default blended rate
      deliveryMode: 'team', // seeds the first delivery group's mode (older assessments); the delivery groups below are what the model reads
      deliveryQuote: 0,     // seeds the first delivery group's given cost
      /* Delivery groups: who delivers which applications and at what cost level. Each application belongs to one group (p.group). A group is either developer based
       * (developers x role mix x the reference rates x rate %, so a partner can be 140% and an internal team 85%) or has a given cost for its applications, which fixes
       * its rate level. Made on first use (ensureGroups); there is always at least one. */
      deliveryGroups: null,
      team: { devs: 3, hours: 38 },   // OutSystems developers, and hours per person per week
      altDevFactor: 1,      // developers the alternative needs for each OutSystems developer
      /* What 1 developer is equal to: people of each role per developer, for each approach (the developer is always 1) */
      mix: {
        os:  { dev: 1, arch: 0.6, ba: 0.2, ux: 0.25, qa: 0.5, pm: 0.4,  sec: 0.3, ops: 0.1,  biz: 0.08 },
        alt: { dev: 1, arch: 0.7, ba: 0.2, ux: 0.25, qa: 0.6, pm: 0.45, sec: 0.4, ops: 0.25, biz: 0.09 }
      },
      /* Loaded cost per hour of each role, in the assessment currency (default: the generic USD column of regions.js) */
      rates: { dev: 124, arch: 186, ba: 148.8, ux: 124, qa: 105.4, pm: 161.2, sec: 173.6, ops: 124, biz: 223.2, sre: 142.6, dba: 136.4, net: 136.4, soc: 117.8, grc: 161.2, coach: 148.8 },
      /* Effort by domain and phase (see DOMAINS). w = typical share of the alternative's delivery effort (relative weights);
       * r = % less effort with OutSystems in that domain. Totals still come from the delivery model; this shows where the difference falls. */
      domains: domainDefaults(),
      /* How much of the claimed benefit is assumed to arrive (the cases). advantage: share of OutSystems' improvement over the alternative that is realised
       * (stage times, review waits and pass rates, team mix, token saving); value: share of the business value that is realised, for both approaches. */
      realise: { advantage: 1, value: 1 },
      /* The Custom scenario's own percentages (100% = the figures as entered); used when Custom is chosen. */
      custom: { advantage: 1, value: 1 },
      /* What each named case means (editable on the Assumptions tab): advantage = share of OutSystems' improvement realised, value = share of the business value realised. */
      cases: { conservative: { advantage: 0.6, value: 0.7 }, likely: { advantage: 1, value: 1 }, optimistic: { advantage: 1.2, value: 1 } },
      cloudProvider: 'azure',   // which cloud the traditional build is shown on in the what's-in-the-box table: azure | aws | gcp (display only: the costs are the infrastructure lines)
      rateCards: {},      // changes to the built-in hourly rate card, by country id, in the country's own currency: {countryId: {role: rate}}
      /* Where each key input came from: customer, estimate, benchmark or assumption (the default) */
      evidence: {},
      rampWeeks: 20,       // weeks for value to ramp to full after go-live
      growth: 0,           // % per year growth of value after go-live
      /* Yearly change of costs, % per year from the second year: labour (every role's rate), licences (platform, tooling, security services) and infrastructure.
       * Any single amount can override its family with its own pattern, kept in state.over[path with / for .] (or in a line item's own over): {g: % per year} or {y: [year 1, year 2, ...]}. */
      escal: { labour: 0, licence: 0, infra: 0 },
      over: {},
      hardOnly: false,     // exclude soft value drivers
      osTooling: 0,         // OutSystems-side tooling beyond the platform licence, per year (used when the tooling breakdown is a single total)
      platform: { alt: 150000, os: 400000, sentry: 60000 },        // licences per year: the OutSystems platform; the alternative's toolchain (AI tools, CI/CD, scanning, observability...)
      /* Compliance-grade security. ODC PaaS with the Sentry add-on gives intrusion detection, runtime integrity monitoring, malware scanning, IP filtering,
       * audit-trail streaming, 24x7 monitoring and contractually valid SOC 2 Type II, HIPAA and PCI attestations out of the box (per OutSystems' description of the Sentry offering);
       * Sentry is available for PaaS only. Another approach has to buy and run the equivalent. 'required' switches the equivalent costs on for the alternative (and for
       * self-managed ODC); with PaaS the Sentry licence uplift applies instead. 'attest' includes the audit and certification costs (optional). */
      assurance: { required: false, attest: true },
      /* Security work every application needs whatever the platform, so OutSystems does not make it zero: penetration testing, and for some customers (government, say) an
       * accreditation of the application itself such as IRAP. They are project-specific rather than enterprise costs, but sit with Security and compliance. annual = the
       * yearly cost for the portfolio; os = the share still needed with OutSystems (the platform's own assessment can be relied on for part of an accreditation).
       * Placeholders, with no source: replace with quotes. */
      appAssure: [
        { name: 'Penetration testing of each application', annual: 40000, os: 1, phase: 'Validate' },
        { name: 'Compliance accreditation of the applications (for example IRAP)', annual: 50000, os: 0.75, phase: 'Enterprise trust & control' }
      ],
      assureItems: [        // what the alternative has to buy or staff for equivalent assurance; os = share still needed when ODC is self-managed
        { name: 'Network intrusion detection (NDR / IDS)', kind: 'tool', annual: 30000, os: 1 },
        { name: 'Runtime workload integrity monitoring (container / host)', kind: 'tool', annual: 35000, os: 1 },
        { name: 'Container malware scanning', kind: 'tool', annual: 10000, os: 1 },
        { name: 'Web application firewall and IP filtering', kind: 'tool', annual: 10000, os: 1 },
        { name: 'SIEM, audit-trail streaming and log retention', kind: 'tool', annual: 36000, os: 1 },
        { name: '24x7 managed detection and response (security operations centre service)', kind: 'tool', annual: 100000, os: 1 },
        { name: 'SOC 2 Type II readiness and annual audit', kind: 'attest', annual: 55000, os: 0.7 },
        { name: 'PCI DSS / HIPAA assessment and attestation', kind: 'attest', annual: 45000, os: 0.7 },
        { name: 'Security engineers (detection, hardening, vulnerability response)', kind: 'people', role: 'sec', fte: 1.2, os: 1 },
        { name: 'Compliance and risk lead (controls, evidence, auditor liaison)', kind: 'people', role: 'grc', fte: 0.8, os: 0.7 }
      ],
      osHosting: 'paas',    // 'paas' | 'paas-sentry' | 'self'. 'paas' = OutSystems provisions and runs the cloud (no extra infrastructure or operating people, no setup); 'self' = the organisation runs it (infrastructure and some people, cheap prescriptive setup)
      infra: { alt: 66500, os: 66500 },                // cloud infrastructure per year at full run, whole portfolio: the alternative runs its own; OutSystems PaaS includes it
      opsFte: { alt: 2.4, os: 1 },                // the OutSystems figures here (infra, ops lines' shares) apply only when self-managed; with PaaS they are zero
      /* Optional breakdowns of the alternative's run costs. When set, the lines replace the single total above. */
      /* Defaults follow OutSystems' cloud-native infrastructure TCO research (see docs/NS-Cloud-Native-TCO.md): a 12-person cloud team
       * (2 architects, 4 DevOps/SRE, 2 platform testers, 2 security, programme manager, agile coach) spending about 40% of their time on
       * ongoing maintenance and scaling, and an infrastructure bill that is mostly the cloud provider (about 95%). */
      /* Infrastructure the client provisions, from the ODC self-hosted system requirements (OutSystems' ODC self-hosted requirements): per cluster at least 5 worker nodes of
       * 8 vCPU / 32 GB / 250 GB, 769 GB of persistent storage, PostgreSQL 16 per stage (baseline 2 vCPU / 4 GB), an OCI registry, a layer-7 load balancer, an OIDC
       * identity provider and an OTLP-capable APM tool. Two clusters (test, production). A roughly equivalent cloud estate is assumed for a cloud-native build,
       * so the OutSystems self-managed share is 100% (the same infrastructure; the difference is automated install and simpler maintenance, see the people lines).
       * Amounts are approximate public cloud list prices rounded (see docs/odc-self-hosted-reference.md) and need validating. OutSystems PaaS needs none of it. */
      infraItems: [
        { name: 'Kubernetes worker nodes (2 clusters x 5 nodes of 8 vCPU / 32 GB)', annual: 34000, os: 1 },
        { name: 'Managed Kubernetes control planes', annual: 2000, os: 1 },
        { name: 'Persistent and block storage (about 4 TB)', annual: 4000, os: 1 },
        { name: 'PostgreSQL databases (test and production, high availability)', annual: 6000, os: 1 },
        { name: 'Load balancers, DNS and certificates', annual: 1500, os: 1 },
        { name: 'Container registry, backup and network egress', annual: 2000, os: 1 },
        { name: 'Application performance monitoring (APM) tool', annual: 11000, os: 1, ext: true },
        { name: 'Identity provider (OIDC)', annual: 6000, os: 1, ext: true }
      ],
      /* Tooling the alternative has to assemble, by capability layer (from OutSystems' comparison of what lies beneath a typical portal).
       * annual = the alternative's cost per year; os = the share of that still needed with OutSystems (0 = built in / made redundant, 1 = still separate).
       * Amounts and shares are illustrative placeholders. The AI-agent layers start at zero until data is found. */
      toolItems: [
        { name: 'Front ends and accessibility (WCAG)', annual: 10000, os: 0.5 },
        { name: 'Security, privacy and compliance tooling', annual: 30000, os: 0.2 },
        { name: 'Storage and data management', annual: 20000, os: 0.25 },
        { name: 'Integration and APIs', annual: 15000, os: 0.25 },
        { name: 'Observability and monitoring', annual: 20000, os: 0.1 },
        { name: 'Business process and workflow orchestration', annual: 15000, os: 0 },
        { name: 'Authentication (identity providers)', annual: 10000, os: 0.5 },
        { name: 'Governance, risk and compliance', annual: 10000, os: 0.5 },
        { name: 'CI/CD and DevOps', annual: 15000, os: 0 },
        { name: 'Infrastructure and hosting tooling', annual: 5000, os: 0 },
        { name: 'AI agents: observability, tools, orchestration, memory, model routing, enterprise data', annual: 0, os: 1 }
      ],
      opsItems: [           // alternative operating resources, ongoing FTE: [{name, role, fte}]
        { name: 'Cloud architects (2 people at 20%)', role: 'arch', fte: 0.4, os: 0.15 },
        { name: 'DevOps / site reliability engineers (4 at 20%)', role: 'sre', fte: 0.8, os: 0.35 },
        { name: 'Platform testers (2 at 20%)', role: 'qa', fte: 0.4, os: 0.1 },
        { name: 'Security experts (2 at 20%)', role: 'sec', fte: 0.4, os: 0.2 },
        { name: 'Programme manager (1 at 20%)', role: 'pm', fte: 0.2, os: 0.1 },
        { name: 'Agile coach (1 at 20%)', role: 'coach', fte: 0.2, os: 0 }
      ],
      /* One-off setup costs. 'absorbed' (the default) leaves them out so the comparison focuses on ongoing costs; 'included' counts them.
       * Alternative figures follow the same research: hiring and onboarding about 660K, then building the environment about 1.2M (80% team, 20% tools). */
      setup: { mode: 'absorbed',
        os:  { paas: 0, self: 10000, envShare: 0 }, // OutSystems setup: PaaS is provisioned for you; self-managed adds a small ODC install (self) plus the cloud environment it runs on (envShare: % of the cloud-native build)
        alt: { hiring: 660000, build: 960000, tools: 240000 },
        weeks: { os: 4, alt: 52 } },                 // people to run and maintain the platform / cloud services (minimal for OutSystems PaaS)
      /* Looking after the applications once they are live, as a % of an application's build cost per year: break/fix, and enhancement (the changes the business asks for).
       * OutSystems is cheaper on both: about half the break/fix (the platform removes much of the infrastructure and library upkeep behind faults) and two thirds of the
       * enhancement (visual, model-driven change). The totals (25% against 15%) follow the maintenance rule of thumb in docs/AVA-data-references.md; the split and the
       * ratios are judgements to replace with the customer's own. */
      maint: { fix: { alt: 10, os: 5 }, enh: { alt: 15, os: 10 } },
      /* AI tokens. spend = what the alternative's build uses per application (US$100,000: agent-assisted design, build, test and review across a portfolio, well above the
       * published per-developer averages, since organisations report token costs as a real and growing line); runPct = the yearly spend after go-live as a % of that, for
       * AI-assisted fixes and changes and any model use inside the applications; saving = how much less OutSystems uses (25%: no source, so kept modest). Judgements to replace with measured figures. */
      tokens: { spend: 100000, runPct: 40, saving: 25 },         // alt build token spend per project; OS % saving
      value: { cost: 900000, risk: 360000, rev: 1500000 }, // seeds the first application's simple value calculators; after that the calculators hold the figures
      stages: {
        design: { alt: 3, os: 3 },
        build: { alt: 10, os: 8 },
        integration: { alt: 3, os: 1.5 },
        deploy: { alt: 1, os: 0.5 }
      },
      gates: [
        { id: 'test', name: 'Test',
          alt: { w: 1, r: 1.5, s: 80, f: 1.5 }, os: { w: 0.5, r: 1, s: 90, f: 1 } },
        { id: 'arch', name: 'Architecture review',
          alt: { w: 1, r: 1, s: 85, f: 1.5 }, os: { w: 0.5, r: 0.5, s: 95, f: 1 } },
        { id: 'sec', name: 'Security review',
          alt: { w: 1.5, r: 1.5, s: 80, f: 2 }, os: { w: 1, r: 1, s: 90, f: 1 } }
      ]
    };
    applyOrgDefaults(st);
    return st;
  }

  var PHASES = [{ key: 'ideate', label: 'Ideate' }, { key: 'design', label: 'Design' }, { key: 'build', label: 'Build' }, { key: 'validate', label: 'Validate' }, { key: 'deploy', label: 'Deploy' }];
  /* 12 skill domains, each costed at the hourly rate of the closest role. */
  var DOMAINS = [
    { key: 'd1', label: 'Business and product analysis', role: 'ba' }, { key: 'd2', label: 'UX and design', role: 'ux' },
    { key: 'd3', label: 'Solution architecture and data', role: 'arch' }, { key: 'd4', label: 'Front-end engineering', role: 'dev' },
    { key: 'd5', label: 'Back-end and business logic', role: 'dev' }, { key: 'd6', label: 'Integration and APIs', role: 'dev' },
    { key: 'd7', label: 'AI and agent engineering', role: 'dev' }, { key: 'd8', label: 'QA and test automation', role: 'qa' },
    { key: 'd9', label: 'Security and compliance', role: 'sec' }, { key: 'd10', label: 'DevOps and release', role: 'ops' },
    { key: 'd11', label: 'Cloud infrastructure and SRE', role: 'ops' }, { key: 'd12', label: 'Delivery management', role: 'pm' }
  ];
  function domainDefaults() {
    /* Placeholder weights: ideate, design, build, validate, deploy; and % reduction with OutSystems */
    var t = { d1: [4, 3, 1, 1, 0, 15], d2: [1, 3, 1, 0.5, 0, 20], d3: [0.5, 3, 3, 0.5, 0.5, 55], d4: [0, 1, 7, 1, 0.5, 60], d5: [0, 1, 9, 1, 0.5, 65],
      d6: [0, 1, 5, 1, 0.5, 55], d7: [0, 0.5, 2, 0.5, 0.2, 30], d8: [0, 0.5, 1, 8, 0.5, 45], d9: [0, 0.5, 0.5, 3, 0.5, 50],
      d10: [0, 0, 1, 0.5, 6, 85], d11: [0, 0.3, 0.7, 0.5, 3, 90], d12: [1, 1.5, 2, 1.5, 1, 35] };
    var o = { w: {}, r: {} };
    DOMAINS.forEach(function (d) {
      o.w[d.key] = {}; PHASES.forEach(function (p, i) { o.w[d.key][p.key] = t[d.key][i]; }); o.r[d.key] = t[d.key][5];
    });
    return o;
  }

  /* Defaults that were later revised: a saved assessment that still holds the earlier default (untouched) takes the new one; anything the user changed stays. */
  var OLD_GATES = [{ id: 'test', alt: { w: 2, r: 2, s: 65, f: 2 }, os: { w: 0.5, r: 1, s: 90, f: 1 } }, { id: 'arch', alt: { w: 3, r: 1, s: 65, f: 2 }, os: { w: 0.5, r: 0.5, s: 95, f: 1 } },
    { id: 'sec', alt: { w: 4, r: 2, s: 60, f: 3 }, os: { w: 1, r: 1, s: 90, f: 1 } }];
  function migrateDefaults(state) {
    if (state.skill && state.skill.levels) Object.keys(state.skill.levels).forEach(function (k) { var lv = state.skill.levels[k]; if (lv && (lv.pace === undefined || lv.discount === undefined)) { var d = levelOf(state, k); state.skill.levels[k] = { pace: d.pace, discount: d.discount, enable: d.enable }; } });   // files saved with effort multiples and pay levels
    if (state.org && state.org.auto === undefined) state.org.auto = !(num(state.org.employees) > 0 || num(state.org.customers) > 0);   // an older file with figures typed in keeps them
    applyOrgDefaults(state);
    if (state.tokens && state.tokens.spend === 40000) { state.tokens.spend = 100000; if (state.tokens.saving === 40) state.tokens.saving = 25; }   // the earlier defaults: spend a tiny share of the total, and a saving with no source; untouched token settings move to the new ones together
    if (state.run && typeof state.run === 'object') {   // an older assessment held one maintenance rate per approach: split it 40/60 (alternative) and 1/3, 2/3 (OutSystems), as the defaults do
      state.maint = { fix: { alt: Math.round(num(state.run.alt) * 0.4 * 100) / 100, os: Math.round(num(state.run.os) / 3 * 100) / 100 }, enh: { alt: Math.round(num(state.run.alt) * 0.6 * 100) / 100, os: Math.round(num(state.run.os) * 2 / 3 * 100) / 100 } };
      delete state.run;
    }
    /* Assessments saved before shares followed the capability map have no mark on their lines. A share that differs from the default for a default line was typed by the user, so it
     * stays theirs; one that equals the default (never changed) follows the map. Lines the map has marked, or that are not default lines, are left alone. */
    var def = defaultState();
    ['toolItems', 'opsItems'].forEach(function (k) {
      (state[k] || []).forEach(function (it) {
        if (it.auto !== undefined) return;
        var d = (def[k] || []).filter(function (x) { return x.name === it.name; })[0];
        if (d && Math.abs(num(it.os) - num(d.os)) > 1e-9) it.auto = false;
      });
    });
    var so = state.setup && state.setup.os;
    if (so && so.envShare === 100 && so.self === 10000 && so.paas === 0) so.envShare = 0;   // the earlier default added the whole cloud environment build to a self-managed install; now it is the install alone
    var g = state.gates;
    if (g && g.length === OLD_GATES.length && g.every(function (x, i) { return x.id === OLD_GATES[i].id && JSON.stringify(x.alt) === JSON.stringify(OLD_GATES[i].alt) && JSON.stringify(x.os) === JSON.stringify(OLD_GATES[i].os); })) {
      state.gates = defaultState().gates;
    }
    return state;
  }

  function passProb(p) { return clamp(num(p.s) / 100, 0.01, 1); }

  /* Roles that only the operating resources and security lines use (not the delivery team mix): they have their own rates on the Country rates tab. */
  var EXTRA_ROLES = [{ key: 'sre', label: 'Site reliability / platform engineer' }, { key: 'dba', label: 'Database administrator' }, { key: 'net', label: 'Network and identity engineer' },
    { key: 'soc', label: 'Security operations analyst' }, { key: 'grc', label: 'Compliance and risk lead' }, { key: 'coach', label: 'Agile coach' }];
  var ROLES = [
    { key: 'dev', label: 'Developer' }, { key: 'arch', label: 'Architect' }, { key: 'ba', label: 'Business analyst' },
    { key: 'ux', label: 'UX / UI designer' }, { key: 'qa', label: 'Tester (QA)' }, { key: 'pm', label: 'Project manager' },
    { key: 'sec', label: 'Security specialist' }, { key: 'ops', label: 'DevOps / operations' }, { key: 'biz', label: 'Business & IT stakeholders' }
  ];
  var ALL_ROLES = ROLES.concat(EXTRA_ROLES);
  /* Cost of one developer-hour of the whole team: the developer plus the other roles that one developer implies. */
  function mixCost(state, ap) {
    var c = 0;
    ROLES.forEach(function (r) { c += (r.key === 'dev' ? 1 : num(state.mix[ap][r.key])) * num(state.rates[r.key]); });
    return c;
  }
  /* People in the team per developer (the developer plus the implied roles). */
  function peoplePerDev(state, ap) {
    var n = 0;
    ROLES.forEach(function (r) { n += r.key === 'dev' ? 1 : num(state.mix[ap][r.key]); });
    return n;
  }
  /* Developers on the alternative's team: the OutSystems developers times the factor for the alternative. */
  /* Developers on the team for one application (dev); with none given, the average across the applications, weighted by their size. */
  function avgDevs(state) {
    var pl = projectList(state), w = 0, t = 0;
    pl.forEach(function (p) { w += p.scale; t += p.scale * p.devs; });
    return w > 0 ? t / w : num(state.team.devs);
  }
  function devsFor(state, ap, devs) { return (devs > 0 ? devs : avgDevs(state)) * (ap === 'alt' ? Math.max(0.1, num(state.altDevFactor)) : 1); }
  /* Delivery team cost per week while an application is being designed, built and fixed. */
  function weekCost(state, ap, devs) { return devsFor(state, ap, devs) * num(state.team.hours) * mixCost(state, ap); }

  /* Expected time to production for one project.
   * E[T] = sum(non-gate stages) + sum_i (w_i + r_i)/s_i + sum_i (1/s_i - 1) * f_i
   */
  function expectedTime(state, ap) {
    /* Each part has the weeks it takes for a normal-sized application and the share of them (work) that grows with the application's size: the work itself (design, build, fixes),
     * integration testing, and the time spent testing or reviewing at a gate. What does not grow is waiting (the queue for a review, on each attempt) and releasing, which take
     * about as long whatever the size. */
    var st = state.stages, parts = [], fixTotal = 0;
    var design = num(st.design[ap]), build = num(st.build[ap]);
    parts.push({ key: 'design', label: 'Design', weeks: design, work: design });
    parts.push({ key: 'build', label: 'Build', weeks: build, work: build });
    state.gates.forEach(function (g) {
      var p = g[ap], att = 1 / passProb(p);
      fixTotal += (att - 1) * num(p.f);
      parts.push({ key: g.id, label: g.name, weeks: (num(p.w) + num(p.r)) * att, work: num(p.r) * att, gate: true });
    });
    parts.push({ key: 'rework', label: 'Rework (fixes)', weeks: fixTotal, work: fixTotal });
    parts.push({ key: 'integration', label: 'Integration testing', weeks: num(st.integration[ap]), work: num(st.integration[ap]) });
    parts.push({ key: 'deploy', label: 'Deploy', weeks: num(st.deploy[ap]), work: 0 });
    var total = 0, scalable = 0;
    parts.forEach(function (p) { total += p.weeks; scalable += p.work; });
    return { total: total, scalable: scalable, active: design + build + fixTotal, designBuild: design + build, parts: parts };
  }

  var round2 = function (x) { return Math.round(x * 100) / 100; };

  /* The applications included in the assessment. An application is one application or a group of them delivered together; the portfolio starts as one,
   * called "Portfolio". Its value comes from its calculators (build), its team size from devs, and its size from months (the OutSystems team's active
   * work on it). They are delivered one after another by one team, so the portfolio's months are the sum. A row switched off is left out. */
  function projectList(state) {
    ensureList(state);
    var out = [], mm = monthsMode(state);
    state.projectList.forEach(function (p, idx) {
      if (p.include === false) return;
      var sc = parseFloat(p.scale), mo = parseFloat(p.months), dv = parseFloat(p.devs), val = {}, bv = hasBuild(p) ? buildValue(p) : null;
      DRIVERS.forEach(function (d) {
        val[d.key] = bv ? bv[d.key] : 0;
      });
      out.push({ name: p.name && String(p.name).trim() ? String(p.name).trim() : 'Application ' + (idx + 1),
        scale: mm ? mo : (isFinite(sc) && sc > 0 ? sc : 1), months: mm ? mo : null, devs: dv > 0 ? dv : num(state.team.devs), value: val, build: p.build, group: p.group });
    });
    return out;
  }
  /* Make sure the portfolio is a list of applications. With none, build it from the seeds (projects, deliveryMonths, team.devs, value): one application
   * called Portfolio, or N similar ones sharing the value equally. An application that has typed-in values and no calculators gets a simple calculator for each. */
  function ensureList(state) {
    if (!state.projectList || !state.projectList.length) {
      var n = Math.max(1, Math.floor(num(state.projects))), list = [], i;
      var per = num(state.deliveryMonths) > 0 ? num(state.deliveryMonths) / n : expectedTime(state, 'os').active * 12 / WPY;
      for (i = 0; i < n; i++) {
        var v = {}; DRIVERS.forEach(function (d) { v[d.key] = round2(num((state.value || {})[d.key]) / n); });
        list.push({ name: n === 1 ? 'Portfolio' : 'Application ' + (i + 1), include: true, months: per, devs: num(state.team.devs) || 1, group: 'g1', value: v });
      }
      state.projectList = list;
    }
    if (state.projectList.length === 1 && /^Application 1$/.test(String(state.projectList[0].name || '').trim())) state.projectList[0].name = 'Portfolio';   // older assessments named the only row after the numbering
    state.projectList.forEach(function (p) {
      if (!(parseFloat(p.devs) > 0)) p.devs = num(state.team.devs) || 1;   // assessments saved before applications had their own team size
      if (p.value && !hasBuild(p)) {   // typed-in values (an older assessment, or the seeds) become simple calculators
        var lines = [];
        DRIVERS.forEach(function (d) { if (num(p.value[d.key]) > 0) { var l = newLine('simple', { driver: d.key }); l.amount = num(p.value[d.key]); lines.push(l); } });
        p.build = lines;
      }
      delete p.value;
    });
    ensureGroups(state);
    applyMapShares(state);
    return state.projectList;
  }
  /* The share of a line still needed with OutSystems that the capability map gives it, from how much of the line's phase OutSystems leaves to other tools and people
   * compared with the alternative. null when the map has no evidence (the alternative needs nothing extra there). kind: 'tool' (a tooling layer) or 'ops' (an operating role). */
  function sdlcMap() { return root.AVASdlc || (typeof require !== 'undefined' ? require('./sdlc.js') : null); }
  function mapShare(it, kind) {
    var D = sdlcMap(); if (!D) return null;
    var ph = D.byKey(it.phase || (kind === 'ops' ? D.phaseOfRole(it.role) : D.phaseOfLayer(it.name)));
    return ph ? D.impliedOsShare(ph) : null;
  }
  /* One rule for the tooling and operating-people lines: a line follows the capability map (its share is the map's) unless the user has typed a share of their own
   * (auto === false), or the map has no evidence for its phase, in which case the line keeps its own estimate. Applied whenever the assessment is read, so there is nothing to sync. */
  function applyMapShares(state) {
    var n = 0;
    [['toolItems', 'tool'], ['opsItems', 'ops']].forEach(function (g) {
      (state[g[0]] || []).forEach(function (it) {
        if (it.auto === false) return;
        var s = mapShare(it, g[1]);
        if (s !== null) { it.os = Math.round(s * 1000) / 1000; it.auto = true; n++; }   // marked, so a later load can tell a map figure from one typed before the map existed
      });
    });
    return n;
  }
  /* When a delivery team starts: straight after the previous team ('after', the default), on a fixed date ('fixed'), or a number of months after another team ends ('team'). */
  function normaliseStart(g) {
    var s = g.start && typeof g.start === 'object' ? g.start : {};
    g.start = { mode: s.mode === 'fixed' || s.mode === 'team' || s.mode === 'start' ? s.mode : 'after', date: typeof s.date === 'string' ? s.date : '', team: s.team || '', months: isFinite(parseFloat(s.months)) ? Math.max(0, parseFloat(s.months)) : 0 };
  }
  /* Dates are optional ISO strings (YYYY-MM-DD). Without them everything stays in relative time. */
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]); return isFinite(t) && new Date(t).getUTCMonth() === +m[2] - 1 ? t : null;
  }
  function fmtDate(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  /* The calendar date of a week offset from the assessment start ('' without a start date). */
  function dateAtWeek(state, w) { var t = parseDate(state.startDate); return t === null ? '' : fmtDate(t + Math.round(w * 7) * 86400000); }
  /* Weeks from the assessment start to a date (never before the start); null if either date is missing. */
  function weeksFromStart(state, s) {
    var a = parseDate(state.startDate), b = parseDate(s); if (a === null || b === null) return null;
    return Math.max(0, (b - a) / 86400000 / 7);
  }
  /* Week the licences start charging: the licence start date if set, else the project start. */
  function licenceStartWeek(state) { var w = weeksFromStart(state, state.licenceStart); return w === null ? 0 : Math.round(w); }
  function ensureGroups(state) {
    if (!state.deliveryGroups || !state.deliveryGroups.length) state.deliveryGroups = [{ id: 'g1', name: 'Delivery team', rate: 100, mode: state.deliveryMode === 'quote' ? 'quote' : 'team', quote: num(state.deliveryQuote) }];
    var ids = {};
    state.deliveryGroups.forEach(function (g) { ids[g.id] = 1; if (g.rate === undefined) g.rate = 100; if (g.mode !== 'quote') g.mode = 'team'; if (g.skill !== 'mixed' && g.skill !== 'newer' && g.skill !== 'custom') g.skill = 'experienced';
      if (g.skill === 'custom') g.custom = customOf(state, g); else delete g.custom; normaliseStart(g); });
    var g0 = state.deliveryGroups[0];   // the first team starts when the assessment does: an earlier fixed date for it becomes the assessment's start date
    if (g0.start && g0.start.mode === 'fixed') { if (!state.startDate && g0.start.date) state.startDate = g0.start.date; g0.start = { mode: 'after', date: '', team: '', months: 0 }; }
    (state.projectList || []).forEach(function (p) { if (!ids[p.group]) p.group = state.deliveryGroups[0].id; });
    return state.deliveryGroups;
  }


  /* ---- The value builder (docs/AVA-value-builder.md) ----
   * An application can carry lines (p.build) that add up to its annual cost savings, revenue/productivity and risk reduction. Percentages are 0 to 100. */
  var LINE_DEFAULTS = {
    simple: { type: 'simple', driver: 'cost', amount: 0, note: '' },
    labour: { type: 'labour', group: 'ops', users: 10, salary: 0, mult: 1.3, saved: 20, adopt: 80, how: 'capacity', realise: 50, auto: true, note: '' },
    decom: { type: 'decom', what: 'Legacy system', lic: 0, infra: 0, support: 0, fte: 0, fteCost: 0, retired: 100, auto: true, note: '' },
    revenue: { type: 'revenue', basis: 'customers', units: 1000, per: 1000, uplift: 5, margin: 30, note: '' },
    risk: { type: 'risk', what: 'Risk', exposure: 0, reduction: 20, note: '' },
    /* The general calculators: each takes the business metric directly (volumes, rates, cost per unit), whatever the industry or the platform. */
    handling: { type: 'handling', what: 'Transactions', group: 'ops', volume: 10000, mins: 5, salary: 0, mult: 1.3, how: 'capacity', realise: 50, auto: true, note: '' },
    deflect: { type: 'deflect', what: 'Requests', volume: 20000, share: 30, per: 8, note: '' },
    completion: { type: 'completion', what: 'Applications started', units: 5000, from: 60, to: 65, per: 500, margin: 30, note: '' },
    errors: { type: 'errors', what: 'Transactions', volume: 20000, from: 5, to: 2, per: 50, note: '' },
    cycle: { type: 'cycle', what: 'Cases', volume: 5000, days: 2, per: 5, realise: 50, note: '' },
    events: { type: 'events', what: 'Events', volume: 500, reduction: 20, per: 300, note: '' },
    other: { type: 'other', what: 'Other', amount: 0, how: 'cash', note: '' }
  };
  /* Application types (use cases): a starting set of the general calculators with business wording and a sensible role. Numbers are placeholders; a type adds no arithmetic. */
  var USE_CASES = [
    ['General', [
      ['portal', 'Customer, partner or broker self-service portal', [['deflect', { what: 'Status and service requests' }], ['errors', { what: 'Requests keyed in by hand', from: 4, to: 1.5 }]], ['Requests per year: status, service or information requests that arrive today by phone, email or counter. Self-service %: the share customers or partners would now complete on their own. Cost per request: the loaded cost of a person handling one.', 'Transactions per year: requests that are keyed in by hand. Error rates: the share keyed wrongly or needing rework, before and after people enter their own details. Cost per error: the time to correct it plus any knock-on cost.']],
      ['onboarding', 'Digital onboarding and sign-up', [['completion', { what: 'Sign-ups started' }], ['handling', { what: 'Applications processed', group: 'ops', mins: 8 }]], ['Starts per year: people who begin signing up or applying. Completion rate: the share who finish, before and after the new journey. Value of each completion: the first-year revenue or lifetime value of one new customer. Margin: the share of that which is profit.', 'Transactions per year: applications processed. Minutes saved: checking, keying and chasing time removed per application. Role: the people who process them.']],
      ['cases', 'Claims, cases and requests handling', [['handling', { what: 'Cases handled', group: 'case', mins: 10 }], ['errors', { what: 'Cases with rework or leakage' }], ['cycle', { what: 'Cases completed' }]], ['Transactions per year: cases (claims, requests or complaints) handled. Minutes saved: handling time removed per case through better workflow, fewer hand-offs and less re-keying. Role: the case handlers.', 'Transactions per year: cases handled. Error rates: the share with rework, wrong payment or leakage, before and after. Cost per error: the cost of correcting one, including any overpayment.', 'Cases per year: cases completed. Days saved: the reduction from lodgement to resolution. Value of a day: what one day sooner is worth for one case (interest, cash flow or keeping the customer). Keep the realised share modest: it is a soft benefit.']],
      ['approvals', 'Approval and workflow automation', [['handling', { what: 'Approvals processed', group: 'ops', mins: 6, seed: { volume: ['employees', 20] } }], ['errors', { what: 'Approvals with errors or rework' }]], ['Transactions per year: requests that need approval. Minutes saved: effort removed per request from routing, reminders and status chasing. Role: the approvers and administrators.', 'Transactions per year: approvals. Error rates: the share approved wrongly, incomplete or sent back, before and after. Cost per error: the rework and delay each one causes.']],
      ['backoffice', 'Finance, HR and procurement back office', [['handling', { what: 'Invoices, expenses and requests', group: 'fin', mins: 6, seed: { volume: ['employees', 15] } }], ['errors', { what: 'Corrections and re-keying', per: 40 }]], ['Transactions per year: invoices, expenses, leave or purchase requests processed. Minutes saved: time removed per item through automation and validation. Role: finance, HR or procurement staff.', 'Transactions per year: items processed. Error rates: the share needing correction, before and after (duplicate payments, wrong coding). Cost per error: the time to fix it plus any leakage.']],
      ['field', 'Field inspection and service', [['handling', { what: 'Inspections and jobs', group: 'field', mins: 20, seed: { volume: ['customers', 0.05] } }], ['events', { what: 'Repeat visits', per: 250 }]], ['Transactions per year: inspections or jobs recorded. Minutes saved: paperwork, logging and re-entry removed per job. Role: technicians or inspectors.', 'Events per year: repeat visits, meaning a return trip because information or parts were missing. Reduction: the share avoided. Cost per event: travel and time for one extra visit.']],
      ['compliance', 'Compliance and regulatory reporting', [['handling', { what: 'Reports and checks', group: 'grc', mins: 30, seed: { volume: ['employees', 0.2] } }], ['risk', { what: 'Penalties and findings', exposure: 250000 }]], ['Transactions per year: reports, checks or attestations produced. Minutes saved: preparation and collation time removed per item. Role: compliance and risk analysts.', 'Exposure per year: the expected yearly loss from penalties, findings or breaches. Reduction: the share removed by better control and evidence. Be cautious: it is a soft benefit.']]]],
    ['Banking and lending', [['lending', 'Loan or application origination', [['completion', { what: 'Applications started', seed: { units: ['customers', 0.1] } }], ['cycle', { what: 'Applications decided' }], ['handling', { what: 'Applications assessed', group: 'uw', mins: 15 }]], ['Starts per year: applications begun. Completion rate: the share that reach a funded outcome, before and after. Value of each completion: the first-year or lifetime revenue of one. Margin: the share of that which is profit.', 'Cases per year: applications decided. Days saved: the reduction from application to decision. Value of a day: what one day sooner is worth per application (interest earned or drop-off avoided).', 'Transactions per year: applications assessed. Minutes saved: assessment and data-gathering time removed per application. Role: credit and underwriting analysts.']]]],
    ['Insurance', [['fnol', 'Claims lodgement and tracking portal', [['deflect', { what: 'Claim status enquiries', seed: { volume: ['customers', 0.5] } }], ['cycle', { what: 'Claims settled' }], ['errors', { what: 'Claims with leakage', per: 120 }]], ['Requests per year: claim status enquiries and updates. Self-service %: the share customers or brokers now check themselves. Cost per request: the cost of a person handling one call or email.', 'Cases per year: claims settled. Days saved: the reduction from lodgement to settlement. Value of a day: what one day sooner is worth per claim (keeping the customer, handling cost).', 'Transactions per year: claims paid. Error rates: the share with leakage (overpayment, duplicates, missed recoveries), before and after. Cost per error: the average amount lost or cost to recover.']]]],
    ['Healthcare', [['scheduling', 'Appointment and resource scheduling', [['handling', { what: 'Bookings handled', group: 'ops', mins: 4, seed: { volume: ['customers', 1.5] } }], ['events', { what: 'Missed appointments', per: 120, seed: { volume: ['customers', 0.3] } }]], ['Transactions per year: bookings, changes and cancellations handled. Minutes saved: administration removed per booking. Role: schedulers and administrators.', 'Events per year: missed appointments or unused slots. Reduction: the share avoided through reminders and easier rebooking. Cost per event: the revenue or capacity lost in one slot.']]]],
    ['Public sector', [['permits', 'Permits and licensing', [['handling', { what: 'Applications assessed', group: 'case', mins: 20, seed: { volume: ['customers', 0.05] } }], ['cycle', { what: 'Applications decided' }]], ['Transactions per year: applications assessed. Minutes saved: checking, chasing and data-entry time removed per application. Role: case officers.', 'Cases per year: applications decided. Days saved: the reduction from lodgement to decision. Value of a day: what one day sooner is worth per application (fees earlier, activity sooner, fewer complaints).']]]],
    ['Energy and utilities', [['assets', 'Asset inspection and maintenance', [['events', { what: 'Asset failures', per: 1500, seed: { volume: ['employees', 0.05] } }], ['handling', { what: 'Inspections recorded', group: 'field', mins: 15, seed: { volume: ['employees', 2] } }]], ['Events per year: asset failures or unplanned stoppages. Reduction: the share avoided through better inspection and maintenance records. Cost per event: repair, lost output and call-out cost.', 'Transactions per year: inspections recorded. Minutes saved: paperwork and re-entry removed per inspection. Role: technicians and engineers.']]]],
    ['Education', [['enrolment', 'Student enrolment and services', [['completion', { what: 'Enrolments started', per: 3000 }], ['handling', { what: 'Student requests processed', group: 'edu', mins: 8 }]],
      ['Starts per year: people who begin enrolling or registering. Completion rate: the share who finish, before and after the new journey. Value of each completion: the revenue or funding from one enrolled student. Margin: the share of that which is surplus.', 'Transactions per year: student requests handled (records, changes, enquiries). Minutes saved: administration removed per request. Role: the staff who handle them.']]]],
    ['Legal and professional services', [['contracts', 'Contract and matter management', [['handling', { what: 'Contracts and matters handled', group: 'legal', mins: 25 }], ['cycle', { what: 'Contracts completed' }]],
      ['Transactions per year: contracts, matters or requests handled. Minutes saved: drafting, review and tracking time removed per item. Role: legal and paralegal staff.', 'Cases per year: contracts or matters completed. Days saved: the reduction from request to signature or closure. Value of a day: what one day sooner is worth for one contract (revenue earlier, fewer delays). Keep the realised share modest: it is a soft benefit.']]]],
    ['Logistics and supply chain', [['dispatch', 'Warehouse, dispatch and delivery tracking', [['handling', { what: 'Orders and deliveries tracked', group: 'logi', mins: 3, seed: { volume: ['customers', 2] } }], ['events', { what: 'Failed or repeated deliveries', per: 35, seed: { volume: ['customers', 0.1] } }]],
      ['Transactions per year: orders, picks or deliveries recorded. Minutes saved: manual recording and checking removed per item. Role: warehouse and logistics staff.', 'Events per year: failed, repeated or misrouted deliveries. Reduction: the share avoided through better tracking and notices. Cost per event: the cost of the repeat trip, handling and any compensation.']]]],
    ['Construction and engineering', [['site', 'Site and engineering inspections', [['handling', { what: 'Inspections and reports', group: 'eng', mins: 25, seed: { volume: ['employees', 3] } }], ['events', { what: 'Rework and defects', per: 400, seed: { volume: ['employees', 0.5] } }]],
      ['Transactions per year: inspections, checks or reports completed. Minutes saved: writing up, photos and re-entry removed per inspection. Role: engineers and inspectors.', 'Events per year: defects or rework items found late. Reduction: the share avoided by catching them earlier. Cost per event: the cost of putting one right.']]]],
    ['Telecommunications', [['activation', 'Service activation and order management', [['completion', { what: 'Orders started', per: 600 }], ['deflect', { what: 'Order status enquiries' }]],
      ['Starts per year: orders or sign-ups begun. Completion rate: the share that reach an active service, before and after. Value of each completion: the first-year revenue of one service. Margin: the share of that which is profit.', 'Requests per year: order and activation status enquiries. Self-service %: the share customers now check themselves. Cost per request: the cost of a person handling one contact.']]]],
    ['Retail', [['returns', 'Order and returns management', [['handling', { what: 'Orders and returns processed', group: 'ops', mins: 4 }], ['errors', { what: 'Orders with errors', per: 30 }]],
      ['Transactions per year: orders, returns or exchanges processed. Minutes saved: handling time removed per item. Role: the operations staff who process them.', 'Transactions per year: orders handled. Error rates: the share shipped wrongly or needing correction, before and after. Cost per error: the cost of the correction, return and any refund.']]]]
  ];
  /* Starting figures from the organisation's size. A calculator starts from these when it is added (or an application type is chosen), so a 300,000-person organisation
   * does not begin with the same numbers as a 50,000-person one. They are one-off defaults, not live formulas: once added, a number is the user's to change.
   * The ratios live in state.seeds (a table on the Defaults tab that can be viewed, changed and reset); these are the built-in values. */
  var SEED_ROLE_SHARE = { ops: 8, cs: 4, case: 2, uw: 0.5, fin: 3, hr: 1.5, sales: 6, field: 5, grc: 1, proc: 1, lead: 2, mgr: 8, ba: 2, it: 3, clin: 20, legal: 0.5, eng: 5, logi: 5, edu: 3 };   // % of employees in each role group
  var SEED_LINES = {   // calculator -> field -> what it scales with and by how much per year
    handling: { volume: { base: 'customers', f: 0.1 } }, deflect: { volume: { base: 'customers', f: 3 } }, completion: { units: { base: 'customers', f: 0.2 } },
    errors: { volume: { base: 'customers', f: 0.2 } }, cycle: { volume: { base: 'customers', f: 0.05 } }, events: { volume: { base: 'customers', f: 0.02 } }, revenue: { units: { base: 'customers', f: 0.1 } }
  };
  /* A typical large organisation in each market: employees and customers (or citizens, patients, students). Illustrative placeholders that scale a reference
   * enterprise of 5,000 people and 500,000 customers by the size of the market; replace them with real medians. Editable on the Defaults tab. */
  var ORG_TYPICAL = { AU: [3500, 350000], JP: [6000, 600000], SG: [2000, 200000], NZ: [1500, 150000], HK: [2000, 200000], TW: [2500, 250000], KR: [4000, 400000], MY: [2500, 250000],
    TH: [3000, 300000], PH: [3500, 350000], VN: [3500, 350000], ID: [6000, 600000], IN: [7500, 750000], GB: [5000, 500000], DE: [5000, 500000], FR: [5000, 500000], NL: [2500, 250000],
    PT: [1500, 150000], ES: [3500, 350000], IT: [4000, 400000], CH: [2500, 250000], AE: [2000, 200000], SA: [3000, 300000], ZA: [3000, 300000], GEN: [7500, 750000], CA: [4000, 400000],
    BR: [6000, 600000], MX: [4500, 450000] };
  /* Industry adjusts the shape of the organisation: how many customers there are per employee, and how the roles are weighted (an insurer has many more case handlers and
   * underwriters than a miner). Optional; blank leaves every default as it is. The labels match the application type groups, so the industry also brings its types forward.
   * Multipliers on the usual tables; placeholders to refine. Editable on the Defaults tab. */
  var INDUSTRIES = [
    ['Banking and lending', 2, { cs: 2, uw: 3, fin: 1.5, grc: 2, sales: 1.5 }], ['Insurance', 2, { case: 3, uw: 3, cs: 2, sales: 1.5, grc: 1.5 }],
    ['Healthcare', 1, { clin: 1.2, cs: 0.5 }], ['Public sector', 4, { case: 3, ops: 1.5 }], ['Energy and utilities', 5, { field: 2.5, eng: 2, cs: 1.5 }],
    ['Telecommunications', 5, { cs: 2.5, sales: 2, field: 1.5 }], ['Retail', 5, { sales: 2, logi: 2.5, ops: 1.2, cs: 1.5 }], ['Logistics and supply chain', 1.5, { logi: 3, field: 1.5 }],
    ['Construction and engineering', 0.2, { eng: 3, field: 2, proc: 1.5 }], ['Education', 2, { edu: 4, ops: 1 }], ['Legal and professional services', 0.1, { legal: 8, ba: 1.5 }]
  ];
  function industryDefaults() {
    var out = {};
    INDUSTRIES.forEach(function (x) { var roles = {}; Object.keys(SEED_ROLE_SHARE).forEach(function (r) { roles[r] = x[2][r] !== undefined ? x[2][r] : 1; }); out[x[0]] = { customers: x[1], roles: roles }; });
    return out;
  }
  /* While the organisation figures have not been typed in, they follow the typical organisation for the country (org.auto). */
  function applyOrgDefaults(state) {
    var o = state.org = state.org || { employees: 0, customers: 0, auto: true };
    if (o.auto === false) return;
    var t = ((state.seeds && state.seeds.orgTypical) || ORG_TYPICAL)[state.country] || ORG_TYPICAL.GEN;
    var ind = o.industry && ((state.seeds && state.seeds.industry) || industryDefaults())[o.industry];
    o.employees = t[0]; o.customers = ind ? Math.round(t[1] * num(ind.customers)) : t[1]; o.auto = true;
  }
  /* Other words people use for each application type, matched as they type. Several names for one thing; the canonical name is shown in the list. */
  var USE_ALIASES = {
    portal: 'self-service portal, customer portal, partner portal, broker portal, member portal, citizen portal, account portal, status tracking, web self service, contact deflection',
    onboarding: 'onboarding, sign up, signup, registration, account opening, new customer, kyc, customer enrolment, application form, digital journey',
    cases: 'claims, case management, complaints, service requests, tickets, disputes, incident handling, back office workflow, work items',
    approvals: 'approval, workflow, authorisation, sign-off, request routing, delegation of authority, requisition, process automation',
    backoffice: 'finance, accounts payable, invoices, expenses, purchase orders, procurement, hr, leave, payroll, recruitment, employee onboarding, suppliers',
    field: 'field service, inspection, maintenance visit, technician, work orders, mobile workforce, audit visits, site visit',
    compliance: 'compliance, regulatory reporting, audit, risk register, governance, attestation, policy, anti money laundering, aml',
    lending: 'loan, mortgage, credit application, lending, origination, underwriting, credit card application, finance application',
    fnol: 'insurance, claim lodgement, first notice of loss, fnol, policy, broker, claims portal',
    scheduling: 'appointment, booking, scheduling, patient, clinic, roster, resource booking, reservations, hospital',
    permits: 'permit, licence, license, planning application, council, government service, registration, certificate, approval application',
    assets: 'asset, utilities, predictive maintenance, inspection, plant, rail, energy, grid, equipment',
    enrolment: 'student, enrolment, enrollment, admissions, course, university, school, learner, training',
    contracts: 'contract, legal, matter, documents, case file, law firm, contract lifecycle',
    dispatch: 'warehouse, delivery, dispatch, logistics, fleet, tracking, shipment, courier, freight, supply chain',
    site: 'construction, site inspection, engineering, defects, snagging, quality, project delivery',
    activation: 'telco, telecom, mobile plan, service activation, order management, broadband, provisioning, sim',
    returns: 'retail, orders, returns, ecommerce, e-commerce, fulfilment, customer orders, refunds'
  };
  /* Rank candidates for what the user typed. items: [{key, text}] where text is every name and keyword for it (any language). Forgiving: ignores case, accents and plurals,
   * matches word starts, and matches runs of characters for scripts written without spaces. Returns [{key, score, words}] best first (words = what matched). */
  function normText(s) {
    s = String(s || '').toLowerCase();
    try { s = s.replace(/[\u00c0-\u024f\u1e00-\u1eff]+/g, function (seg) { return seg.normalize('NF' + 'D').replace(/[\u0300-\u036f]/g, ''); }); } catch (e) {}   // accents come off Latin letters only: Hangul and Thai keep their forms
    return s.replace(/[^a-z0-9\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0e00-\u0e7f\u1e00-\u1eff\u2e80-\u9fff\uac00-\ud7af]+/g, ' ').trim();
  }
  function stemWord(w) { return w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }
  function matchTypes(query, items, max) {
    var q = normText(query); if (!q) return [];
    var cjk = /[\u2e80-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/.test(q); if (!cjk && q.length < 2) return [];
    var qt = q.split(' ').map(stemWord).filter(function (w) { return w.length >= 2; }), out = [];
    items.forEach(function (it) {
      var text = normText(it.text), words = text.split(' ').map(stemWord), score = 0, hit = {};
      if (cjk && text.indexOf(q) >= 0) { score += 6; hit[q] = 1; }
      if (!cjk && text.indexOf(q) >= 0) score += 3;
      qt.forEach(function (w) {
        var s = 0, k;
        for (k = 0; k < words.length; k++) { if (words[k] === w) { s = Math.max(s, 4); } else if (w.length >= 3 && words[k].indexOf(w) === 0) { s = Math.max(s, 3); } else if (w.length >= 4 && words[k].indexOf(w) > 0) { s = Math.max(s, 1); } }
        if (s) { score += s; hit[w] = 1; }
      });
      if (score > 0) out.push({ key: it.key, score: score + (it.boost || 0), words: Object.keys(hit) });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, max || 5);
  }
  function seedDefaults() {
    var uses = {};
    USE_CASES.forEach(function (g) { g[1].forEach(function (uc) { uc[2].forEach(function (ln) {
      var sd = ln[1].seed; if (!sd) return;
      uses[uc[0]] = uses[uc[0]] || {}; uses[uc[0]][ln[0]] = uses[uc[0]][ln[0]] || {};
      Object.keys(sd).forEach(function (f) { uses[uc[0]][ln[0]][f] = { base: sd[f][0], f: sd[f][1] }; });
    }); }); });
    return { coverage: 25, roleShare: JSON.parse(JSON.stringify(SEED_ROLE_SHARE)), lines: JSON.parse(JSON.stringify(SEED_LINES)), uses: uses, orgTypical: JSON.parse(JSON.stringify(ORG_TYPICAL)), industry: industryDefaults() };
  }
  function roundSig(x) { if (!(x > 0)) return 0; var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10) - 1); return Math.max(1, Math.round(x / p) * p); }
  /* Set a new line's volumes from the organisation figures (state.org: employees, customers; blank or zero leaves the placeholder), using the ratios in state.seeds.
   * ucKey is the application type the line comes from: its own rule wins over the calculator's usual one. Returns [{field, base, n, f}] describing what was set,
   * so the line can say where its number came from. */
  function industryRoleMult(sd, industry, role) {
    var ind = industry && ((sd.industry || {})[industry]); if (!ind || !ind.roles) return 1;
    var m = num(ind.roles[role]); return m > 0 ? m : 1;
  }
  function seedLine(l, state, ucKey) {
    var out = [], o = (state && state.org) || {}, sd = (state && state.seeds) || seedDefaults();
    if (l.type === 'labour') {
      var emp = num(o.employees), sh = num((sd.roleShare || {})[l.group]) / 100 * industryRoleMult(sd, o.industry, l.group), cov = num(sd.coverage) / 100;
      if (emp > 0 && sh > 0 && cov > 0) { l.users = Math.max(1, roundSig(emp * sh * cov)); out.push({ field: 'users', base: 'employees', n: emp, f: roundSig(sh * cov * 1e4) / 1e4 }); }
      return out;
    }
    var rules = ((sd.uses || {})[ucKey] || {})[l.type] || (sd.lines || {})[l.type] || {};
    Object.keys(rules).forEach(function (f) {
      var base = rules[f].base === 'employees' ? 'employees' : 'customers', n = num(o[base]), k = num(rules[f].f);
      if (n > 0 && k > 0 && l[f] !== undefined) { l[f] = roundSig(n * k); out.push({ field: f, base: base, n: n, f: k }); }
    });
    return out;
  }
  var LINE_HOURS = 1800;   // productive hours in a year, to turn a loaded annual cost into an hourly one (the same figure the country baselines use)
  var LINE_MONEY = ['salary', 'lic', 'infra', 'support', 'fteCost', 'per', 'exposure', 'amount'];
  /* A new line of a type; d carries the country-dependent defaults (salary, mult, fteCost) that the engine cannot know. */
  function newLine(type, d) {
    var l = JSON.parse(JSON.stringify(LINE_DEFAULTS[type]));
    Object.keys(d || {}).forEach(function (k) { if (l[k] !== undefined || k === 'group') l[k] = d[k]; });
    return l;
  }
  /* The annual value of one line, split into the three drivers. */
  function lineValue(l) {
    var out = { cost: 0, rev: 0, risk: 0 }, pc = function (x) { return Math.max(0, num(x)) / 100; };
    if (l.type === 'labour') {
      var base = num(l.users) * num(l.salary) * num(l.mult) * pc(l.saved) * pc(l.adopt);
      if (l.how === 'cash') out.cost = base; else out.rev = base * pc(l.realise);   // freed capacity is soft and only partly realised
    } else if (l.type === 'decom') {
      out.cost = (num(l.lic) + num(l.infra) + num(l.support) + num(l.fte) * num(l.fteCost)) * pc(l.retired);
    } else if (l.type === 'revenue') {
      out.rev = num(l.units) * num(l.per) * pc(l.uplift) * pc(l.margin);
    } else if (l.type === 'risk') {
      out.risk = num(l.exposure) * pc(l.reduction);
    } else if (l.type === 'handling') {   // time saved on each transaction handled, at the loaded hourly cost of the people who handle them
      var hb = num(l.volume) * num(l.mins) / 60 * num(l.salary) * num(l.mult) / LINE_HOURS;
      if (l.how === 'cash') out.cost = hb; else out.rev = hb * pc(l.realise);
    } else if (l.type === 'deflect') {   // requests that no longer need a person
      out.cost = num(l.volume) * pc(l.share) * num(l.per);
    } else if (l.type === 'completion') {   // more people finish what they start
      out.rev = num(l.units) * Math.max(0, num(l.to) - num(l.from)) / 100 * num(l.per) * pc(l.margin);
    } else if (l.type === 'errors') {   // fewer mistakes and reworks
      out.cost = num(l.volume) * Math.max(0, num(l.from) - num(l.to)) / 100 * num(l.per);
    } else if (l.type === 'cycle') {   // each case completes sooner; a soft benefit, realised in part
      out.rev = num(l.volume) * num(l.days) * num(l.per) * pc(l.realise);
    } else if (l.type === 'events') {   // fewer failures, incidents or repeat visits
      out.cost = num(l.volume) * pc(l.reduction) * num(l.per);
    } else if (l.type === 'simple') {
      out[l.driver === 'rev' || l.driver === 'risk' ? l.driver : 'cost'] = Math.max(0, num(l.amount));
    } else if (l.type === 'other') {
      if (l.how === 'cash') out.cost = num(l.amount); else out.rev = num(l.amount);
    }
    if (l.vs !== undefined) { out.cost *= num(l.vs); out.rev *= num(l.vs); out.risk *= num(l.vs); }
    return out;
  }
  /* Two calculators in one application that can count the same saving: time saved per user or per transaction, and requests deflected. */
  function overlapping(build) {
    var t = {}; (build || []).forEach(function (l) { t[l.type] = true; });
    return (t.deflect && (t.handling || t.labour)) || (t.handling && t.labour) ? true : false;
  }
  function hasBuild(p) { return !!(p && p.build && p.build.length); }
  /* The three values of an application built from its lines, with each line's own value. */
  function buildValue(p) {
    var t = { cost: 0, rev: 0, risk: 0, lines: [] };
    (p.build || []).forEach(function (l) { var v = lineValue(l); t.lines.push(v); t.cost += v.cost; t.rev += v.rev; t.risk += v.risk; });
    return t;
  }
  /* Simple mode: one application whose calculators are all simple, at most one per driver. The cards on the left edit it directly; with anything more
   * (a second application, a detailed calculator) they only add up the applications, so editing them cannot overwrite application-level figures. */
  function isSimple(state) {
    var list = ensureList(state), seen = {};
    if (list.length !== 1) return false;
    return (list[0].build || []).every(function (b) { if (b.type !== 'simple' || seen[b.driver]) return false; seen[b.driver] = 1; return true; });
  }
  /* Index of the simple calculator for a driver in the first application, or -1. */
  function simpleIndex(state, key) {
    var b = ensureList(state)[0].build || [], i;
    for (i = 0; i < b.length; i++) if (b[i].type === 'simple' && b[i].driver === key) return i;
    return -1;
  }
  /* Annual value of one application, counting only the drivers in the current view (soft ones are left out in "hard savings only"). */
  function annualOf(state, value) {
    var a = 0;
    DRIVERS.forEach(function (d) { if (!(state.hardOnly && d.soft)) a += num(value[d.key]); });
    return a;
  }

  /* Rebuild the application list from the seeds (projects, deliveryMonths, team.devs, value): N similar applications sharing the value equally. */
  function expandProjects(state) { state.projectList = null; return ensureList(state); }

  /* The sizes of every row in the portfolio, whether or not it is switched on, so that excluding an application does not rescale the others. */
  function allScales(state) {
    var list = ensureList(state), out = [];
    if (list && list.length) { list.forEach(function (p) { var sc = parseFloat(p.scale); out.push(isFinite(sc) && sc > 0 ? sc : 1); }); return out; }
    return out;
  }
  /* With applications listed, each carries its own months: how long the OutSystems team is actively working on it (design, build and fixes, not review queues).
   * Months mode needs every included row to have them; the portfolio's months are then worked out from the rows (deriveMonths). */
  function monthsMode(state) {
    var list = ensureList(state);
    if (!list || !list.length) return false;
    var inc = list.filter(function (p) { return p.include !== false; });
    return inc.length > 0 && inc.every(function (p) { return parseFloat(p.months) > 0; });
  }
  /* The portfolio's months: the included applications' months added up, as one team delivers them one after another. */
  function deriveMonths(state) {
    if (!monthsMode(state)) return;
    var t = 0;
    state.projectList.forEach(function (p) { if (p.include !== false) t += parseFloat(p.months); });
    state.deliveryMonths = round2(t);
  }
  /* An assessment made with relative sizes: turn each application's size into months, keeping the portfolio's duration as it was. */
  function migrateMonths(state) {
    var list = state.projectList;
    if (!list || !list.length || list.every(function (p) { return parseFloat(p.months) > 0; })) return;
    var f = legacyFactor(state), T = expectedTime(state, 'os');
    list.forEach(function (p) {
      if (parseFloat(p.months) > 0) return;
      var sc = parseFloat(p.scale); sc = isFinite(sc) && sc > 0 ? sc : 1;
      p.months = round2(Math.max(0.1, sc * f * T.active * 12 / WPY));
    });
  }
  /* Scale that makes the OutSystems team's active work on the whole portfolio last exactly deliveryMonths (sizes as relative numbers). The scheduling is linear in
   * application size, so one factor does it. The same factor sizes the same scope for the alternative, which then takes longer. */
  function legacyFactor(state) {
    var w = num(state.deliveryMonths) * WPY / 12;
    if (!(w > 0)) return 1;
    var T = expectedTime(state, 'os'), lanes = 1, free = zeros(lanes), mk = 0;
    allScales(state).forEach(function (sc) {
      var lane = 0, l;
      for (l = 1; l < lanes; l++) if (free[l] < free[lane]) lane = l;
      free[lane] += T.active * sc;
      if (free[lane] > mk) mk = free[lane];
    });
    return mk > 0 ? w / mk : 1;
  }
  function sizeFactor(state) {
    if (monthsMode(state)) { var T = expectedTime(state, 'os'); return T.active > 0 ? (WPY / 12) / T.active : 1; }   // months are absolute: one month of work is WPY/12 active weeks
    return legacyFactor(state);
  }

  /* Projects are assigned to the delivery team (lane) that is free first. A team is busy only for active
   * work (design, build, fixes), not while waiting in a review queue. */
  /* Developer quality of a delivery team: how long its work takes (an effort multiple for each approach: the team's own pace, and for OutSystems also learning the platform), what it is
   * paid (a level against an experienced team's), and the one-off training it needs with OutSystems. Three levels set these; Custom keeps the team's own figures. Only developer-based
   * teams: a given cost already says what the team costs. The pay level applies to both approaches (the same people deliver whichever is used); training is for OutSystems only. */
  /* A level's figures: how much slower the team is (a percentage, for whichever approach it delivers), the discount on its pay (a percentage) and the training each developer needs to learn
   * OutSystems (an amount, charged only with OutSystems). Files saved with the earlier figures are converted: an effort multiple becomes a slowdown, and a pay level a discount. */
  function legacyLevel(lv, def) {
    var o = { pace: def.pace, discount: def.discount, enable: lv && lv.enable !== undefined ? num(lv.enable) : def.enable };
    if (!lv) return { pace: def.pace, discount: def.discount, enable: def.enable };
    if (lv.pace !== undefined) o.pace = num(lv.pace); else if (lv.effort !== undefined) o.pace = ((lv.altEffort !== undefined ? num(lv.altEffort) : num(lv.effort)) || 1) * 100 - 100;
    if (lv.discount !== undefined) o.discount = num(lv.discount); else if (lv.pay !== undefined) o.discount = 100 - num(lv.pay);
    return o;
  }
  function levelOf(state, key) {
    var lv = ((state.skill || {}).levels || {})[key], def = defaultState().skill.levels[key] || { pace: 0, discount: 0, enable: 0 };
    return legacyLevel(lv, def);
  }
  function customOf(state, g) {   // a team's own figures, started from the level it was on
    var base = levelOf(state, g.skill === 'newer' ? 'newer' : 'mixed');
    return legacyLevel(g.custom, base);
  }
  function skillOf(state, g) {
    var sk = state.skill || {}, lv = g.skill === 'custom' ? customOf(state, g) : levelOf(state, g.skill), pace = Math.max(-90, num(lv.pace)), disc = Math.min(100, num(lv.discount));
    return { pace: pace, discount: disc, effort: 1 + pace / 100, pay: Math.max(0, 100 - disc) / 100, enable: Math.max(0, num(lv.enable)), learning: Math.max(0, num(sk.learning)) };
  }
  function schedule(state, T, ap) {
    var f = sizeFactor(state), list = projectList(state), groups = ensureGroups(state), res = [], begins = {}, ends = {}, visiting = {}, byId = {};
    var idxOf = {}; groups.forEach(function (g, gi) { idxOf[g.id] = gi; byId[g.id] = g; });
    var placed = {};
    /* A team's apps in list order, one after another, from the team's start. */
    var place = function (g) {
      if (placed[g.id]) return placed[g.id];
      var st = g.start, s = 0, w, dep = null;
      if (visiting[g.id]) return { start: 0, end: 0, apps: [], cycle: true };   // a loop of "after team" rules: fall back to the start
      visiting[g.id] = true;
      var prev = idxOf[g.id] > 0 ? groups[idxOf[g.id] - 1] : null;
      if (st.mode === 'fixed' && (w = weeksFromStart(state, st.date)) !== null) s = w + st.months * WPY / 12;   // on a date, or some months after it
      else if (st.mode === 'team' && st.team && st.team !== g.id && byId[st.team]) s = place(byId[st.team]).end + st.months * WPY / 12;
      else if (st.mode === 'start') s = st.months * WPY / 12;   // some months after the start of the assessment (0: alongside the first team)
      else if (prev) s = place(prev).end + (st.mode === 'after' ? st.months * WPY / 12 : 0);   // straight after the previous team, or some months later
      var free = s, apps = [], sk = g.skill !== 'experienced' ? skillOf(state, g) : null, nth = 0;
      list.forEach(function (p, i) {
        if (p.group !== g.id) return;
        var sc = p.scale * f, ref = T.active * sc, mult = 1, pay = 1;
        if (sk) { mult = 1 + (sk.effort - 1) * (sk.learning > 0 ? Math.max(0, 1 - nth / sk.learning) : 1); pay = sk.pay; }   // the slowdown can fade over a team's first applications
        var active = ref * mult, total = T.total + (sc - 1) * T.scalable + (active - ref), start = free;   // a slower team also pushes go-live back by the extra time
        free = start + active; nth++;
        apps.push({ index: i, name: p.name, scale: sc, devs: p.devs, build: p.build, group: p.group, value: p.value, annualIncluded: annualOf(state, p.value), lane: 0,
          start: start, active: active, activeRef: ref, pay: pay, skillMult: mult, designBuild: T.designBuild * sc * mult, activeEnd: start + active, goLive: start + total });
      });
      visiting[g.id] = false;
      return (placed[g.id] = { start: s, end: free, apps: apps });
    };
    groups.forEach(function (g) { var pl = place(g); begins[g.id] = pl.start; ends[g.id] = pl.end; pl.apps.forEach(function (x) { res[x.index] = x; }); });
    res = res.filter(function (x) { return x; });
    res.teamStart = begins; res.teamEnd = ends;
    return res;
  }

  function sumAnnual(items) { var t = 0; items.forEach(function (it) { t += num(it.annual); }); return t; }
  /* The share of a line still needed with OutSystems (0 = made redundant, 1 = still separate). */
  function osShare(it) { var x = parseFloat(it.os); return isFinite(x) ? Math.min(1, Math.max(0, x)) : 1; }
  function sumOs(items) { var t = 0; items.forEach(function (it) { t += num(it.annual) * osShare(it); }); return t; }
  var hasItems = function (a) { return a && a.length; };
  /* Cloud infrastructure per year at full run, for the whole portfolio. With line items, the OutSystems side is each line times its OutSystems share. */
  var selfHosted = function (state) { return state.osHosting === 'self'; };
  /* Compliance-grade security is needed when asked for, or when PaaS with Sentry is chosen. Sentry exists only for PaaS, so asking for it with plain PaaS means PaaS + Sentry. */
  function assuranceOn(state) { return !!(state.assurance && state.assurance.required) || state.osHosting === 'paas-sentry'; }
  function hostingOf(state) { return state.osHosting === 'paas' && assuranceOn(state) ? 'paas-sentry' : (state.osHosting || 'paas'); }
  /* Cost per year of the security and compliance the approach has to provide itself. OutSystems PaaS (with Sentry) provides it out of the box (the Sentry licence
   * uplift is in the licences); self-managed ODC needs its share of the lines; the alternative needs all of them. Attestation lines are optional. */
  /* The per-application security work (penetration testing, accreditation) that is needed whatever the platform and whether or not high assurance is chosen. */
  function appAssureAnnual(state, ap) {
    var t = 0; (state.appAssure || []).forEach(function (it) { t += num(it.annual) * (ap === 'os' ? osShare(it) : 1); });
    return t;
  }
  /* Security and compliance in total: the high-assurance estate (when chosen) plus the per-application work. */
  function assureAnnual(state, ap) { return highAssureAnnual(state, ap) + appAssureAnnual(state, ap); }
  function highAssureAnnual(state, ap) {
    if (!assuranceOn(state)) return 0;
    if (ap === 'os' && hostingOf(state) !== 'self') return 0;
    var t = 0, h = num(state.team.hours), attest = !state.assurance || state.assurance.attest !== false;
    (state.assureItems || []).forEach(function (it) {
      if (it.kind === 'attest' && !attest) return;
      var amount = it.kind === 'people' ? num(it.fte) * h * WPY * num(state.rates[it.role] !== undefined ? state.rates[it.role] : state.rates.sec) : num(it.annual);
      t += amount * (ap === 'os' ? osShare(it) : 1);
    });
    return t;
  }
  /* The additional Sentry licence per year (platform.sentry, a placeholder of 15% of the platform licence), charged only when Sentry is on. Older saved assessments held a percentage (sentryPct) instead. */
  function sentryUplift(state) {
    if (hostingOf(state) !== 'paas-sentry') return 0;
    return state.platform.sentry !== undefined ? num(state.platform.sentry) : num(state.platform.os) * (state.sentryPct === undefined ? 15 : num(state.sentryPct)) / 100;
  }
  function infraAnnual(state, ap) {
    if (hasItems(state.infraItems)) {
      if (ap === 'alt') return sumAnnual(state.infraItems);
      if (selfHosted(state)) return sumOs(state.infraItems);
      return 0;   // OutSystems PaaS: OutSystems provisions and runs the cloud, so the customer has no infrastructure cost (external services they run anyway are in the licences and tooling, see externalAnnual)
    }
    if (ap === 'os' && !selfHosted(state)) return 0;
    return num(state.infra[ap]);
  }
  /* Licences per year: OutSystems = the platform licence plus any tooling still needed; the alternative = its AI tools and toolchain. */
  /* Services the organisation runs whatever the hosting (an identity provider, an APM tool: the infrastructure lines ticked "Also with ODC"). With self-managed ODC
   * they are part of the infrastructure; with PaaS there is no infrastructure, so they are counted with the licences and tooling, at the same cost as the alternative's. */
  function externalAnnual(state) {
    return hasItems(state.infraItems) && !selfHosted(state) ? sumOs(state.infraItems.filter(function (it) { return it.ext; })) : 0;
  }
  function licenceAnnual(state, ap) {
    if (ap === 'alt') return hasItems(state.toolItems) ? sumAnnual(state.toolItems) : num(state.platform.alt);
    return num(state.platform.os) + sentryUplift(state) + (hasItems(state.toolItems) ? sumOs(state.toolItems) : num(state.osTooling)) + externalAnnual(state);
  }
  /* People who run the platform or cloud services, per week at full run. Each line is costed at its own role's rate; OutSystems needs only its share. */
  function opsWeekCost(state, ap, raw) {
    if (ap === 'os' && !raw && !selfHosted(state)) return 0;   // PaaS needs no extra operating people
    var h = num(state.team.hours), items = state.opsItems, c = 0;
    if (hasItems(items)) {
      items.forEach(function (it) { c += num(it.fte) * (ap === 'os' ? osShare(it) : 1) * h * num(state.rates[it.role] !== undefined ? state.rates[it.role] : state.rates.ops); });
      return c;
    }
    return num(state.opsFte[ap]) * h * num(state.rates.ops);
  }
  function opsFteTotal(state, ap, raw) {
    if (ap === 'os' && !raw && !selfHosted(state)) return 0;
    var items = state.opsItems, t = 0;
    if (hasItems(items)) { items.forEach(function (it) { t += num(it.fte) * (ap === 'os' ? osShare(it) : 1); }); return t; }
    return num(state.opsFte[ap]);
  }

  /* Default ways to split each total into line items (shares are placeholders until a researched breakdown is provided). */
  // [name, share of the alternative total, default OutSystems share]
  var INFRA_SPLIT = [['Kubernetes worker nodes', 0.45, 1], ['Managed Kubernetes control planes', 0.03, 1], ['Persistent and block storage', 0.05, 1], ['PostgreSQL databases', 0.08, 1],
    ['Load balancers, DNS and certificates', 0.02, 1], ['Container registry, backup and network egress', 0.03, 1], ['Application performance monitoring (APM) tool', 0.26, 1, true], ['Identity provider (OIDC)', 0.08, 1, true]];
  var TOOL_SPLIT = [['Front ends and accessibility (WCAG)', 10 / 150, 0.5], ['Security, privacy and compliance tooling', 30 / 150, 0.2], ['Storage and data management', 20 / 150, 0.25],
    ['Integration and APIs', 15 / 150, 0.25], ['Observability and monitoring', 20 / 150, 0.1], ['Business process and workflow orchestration', 15 / 150, 0],
    ['Authentication (identity providers)', 10 / 150, 0.5], ['Governance, risk and compliance', 10 / 150, 0.5], ['CI/CD and DevOps', 15 / 150, 0], ['Infrastructure and hosting tooling', 5 / 150, 0]];
  // [name, role, share of the 12-person team, default OutSystems share]
  var OPS_SPLIT = [['Cloud architects', 'arch', 2 / 12, 0.15], ['DevOps / site reliability engineers', 'ops', 4 / 12, 0.35], ['Platform testers', 'qa', 2 / 12, 0.1],
    ['Security experts', 'sec', 2 / 12, 0.2], ['Programme manager', 'pm', 1 / 12, 0.1], ['Agile coach', 'pm', 1 / 12, 0]];
  /* Split a total into lines. The OutSystems shares are scaled so the OutSystems total is the same as before the split. */
  function splitAnnual(total, split, osTarget) {
    var out = [], acc = 0, base = 0;
    split.forEach(function (sp) { base += total * sp[1] * sp[2]; });
    var f = base > 0 ? osTarget / base : 0;
    split.forEach(function (sp, i) {
      var v = i === split.length - 1 ? Math.round((total - acc) * 100) / 100 : Math.round(total * sp[1] * 100) / 100;
      acc += v; out.push({ name: sp[0], annual: v, os: Math.round(Math.min(1, sp[2] * f) * 1000) / 1000, ext: !!sp[3] });
    });
    return out;
  }
  /* Break a total down into line items. Neither side's total changes. key: 'infra' | 'tools' | 'ops'. */
  function expandBreakdown(state, key) {
    if (key === 'infra') state.infraItems = splitAnnual(num(state.infra.alt), INFRA_SPLIT, num(state.infra.os));
    else if (key === 'tools') { state.toolItems = splitAnnual(num(state.platform.alt), TOOL_SPLIT, num(state.osTooling)); state.toolItems.forEach(function (it) { it.auto = false; }); }   // keeps the single total's shares, so nothing jumps; "Use the map for every line" hands them to the capability map
    else if (key === 'ops') {
      // split by the team's headcount shares, scaled so the cost equals the single total's cost (at the operations rate)
      var h = Math.max(1e-9, num(state.team.hours)), weekly = num(state.opsFte.alt) * h * num(state.rates.ops), S = 0, base = 0;
      OPS_SPLIT.forEach(function (sp) { S += sp[2] * num(state.rates[sp[1]]); });
      var k = weekly / (h * Math.max(1e-9, S));
      OPS_SPLIT.forEach(function (sp) { base += sp[2] * k * sp[3] * num(state.rates[sp[1]]); });
      var f = base > 0 ? (num(state.opsFte.os) * num(state.rates.ops)) / base : 0;   // keep the OutSystems cost the same too
      state.opsItems = OPS_SPLIT.map(function (sp) {
        return { name: sp[0], role: sp[1], fte: Math.round(sp[2] * k * 10000) / 10000, os: Math.round(Math.min(1, sp[3] * f) * 1000) / 1000, auto: false };
      });
    }
  }
  /* Go back to a single total per side (the sum of the lines). */
  function collapseBreakdown(state, key) {
    if (key === 'infra' && hasItems(state.infraItems)) { state.infra.alt = sumAnnual(state.infraItems); state.infra.os = Math.round(sumOs(state.infraItems) * 100) / 100; state.infraItems = null; }
    else if (key === 'tools' && hasItems(state.toolItems)) { state.platform.alt = sumAnnual(state.toolItems); state.osTooling = Math.round(sumOs(state.toolItems) * 100) / 100; state.toolItems = null; }
    else if (key === 'ops' && hasItems(state.opsItems)) {
      var h = Math.max(1e-9, num(state.team.hours)), r0 = Math.max(1e-9, num(state.rates.ops));
      var altFte = opsWeekCost(state, 'alt') / (h * r0), osFte = opsWeekCost(state, 'os', true) / (h * r0);   // raw: the self-managed figures, whichever hosting is chosen   // FTE at the operations rate with the same cost
      state.opsFte.alt = Math.round(altFte * 10000) / 10000; state.opsFte.os = Math.round(osFte * 10000) / 10000; state.opsItems = null;
    }
  }

  /* The one-off cost of building the cloud environment (hiring and onboarding the cloud team, then building it): what the cloud-native alternative has to do. */
  function envBuild(state) { var a = state.setup.alt; return num(a.hiring) + num(a.build) + num(a.tools); }
  /* The OutSystems setup for a hosting choice. PaaS: provisioned for you. Self-managed: a small ODC install, plus the same kind of cloud environment to build
   * (a share of the cloud-native build; 100% unless the self-managed estate is smaller). Older assessments without a share count all of it. */
  function osSetupFor(state, hosting) {
    var o = state.setup.os;
    if (hosting !== 'self') return num(o.paas);
    return num(o.self) + envBuild(state) * (o.envShare === undefined ? 0 : Math.min(100, Math.max(0, num(o.envShare)))) / 100;
  }
  /* One-off setup cost for an approach: counted only when setup costs are not absorbed. */
  function setupAmount(state, ap) {
    var st = state.setup;
    if (!st || st.mode !== 'included') return 0;
    return ap === 'os' ? osSetupFor(state, selfHosted(state) ? 'self' : 'paas') : envBuild(state);
  }
  /* Weeks over which the setup is spread. Building a cloud environment takes as long for self-managed ODC as for the alternative; a PaaS or install-only setup is short. */
  function setupWeeks(state, ap) {
    var w = state.setup && state.setup.weeks ? state.setup.weeks : {};
    if (ap === 'os' && selfHosted(state) && num(state.setup.os.envShare === undefined ? 0 : state.setup.os.envShare) > 0) return Math.max(1, num(w.os), num(w.alt));
    return Math.max(1, num(w[ap] === undefined ? 1 : w[ap]));
  }

  /* The OutSystems delivery team's cost at the reference rates (rate level 100%), for each delivery group. */
  function groupBase(state, ref) {   // ref: the work of an experienced team (a given cost is for that), not this team's slower work
    var T = expectedTime(state, 'os'), base = {};
    schedule(state, T).forEach(function (p) { base[p.group] = (base[p.group] || 0) + (ref && p.activeRef !== undefined ? p.activeRef : p.active) * weekCost(state, 'os', p.devs); });
    return base;
  }
  /* What the developers and rate levels imply for the OutSystems delivery cost: of one group, or of the whole portfolio. */
  function osDeliveryCost(state, gid) {
    var base = groupBase(state), t = 0;
    ensureGroups(state).forEach(function (g) { if (gid === undefined || g.id === gid) t += (base[g.id] || 0) * num(g.rate) / 100; });
    return t;
  }
  /* The multiple of the reference rates each group's people cost: its rate level when developer based, or what makes its OutSystems team cost the given amount. */
  function groupFactors(state) {
    var base = groupBase(state, true), out = {};
    ensureGroups(state).forEach(function (g) {
      out[g.id] = g.mode === 'quote' && num(g.quote) > 0 && base[g.id] > 0 ? num(g.quote) / base[g.id] : Math.max(0, num(g.rate)) / 100;
    });
    return out;
  }

  function addUniform(arr, t0, t1, total) {
    var W = arr.length;
    if (total === 0) return;
    if (t1 <= t0) { var k0 = Math.floor(t0); if (k0 >= 0 && k0 < W) arr[k0] += total; return; }
    var len = t1 - t0;
    for (var k = Math.floor(t0); k < Math.ceil(t1) && k < W; k++) {
      if (k < 0) continue;
      var ov = Math.min(t1, k + 1) - Math.max(t0, k);
      if (ov > 0) arr[k] += total * ov / len;
    }
  }

  function sum(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s; }

  /* ---- Values that change from year to year ----
   * A pattern is {g: n} (n% more each year) or {y: [v1, v2, ...]} (a value for each year; the last repeats). Only its shape matters: the field itself holds the first
   * year's value, and the later years are that value times the pattern's factor. */
  function factorAt(pt, y) {
    if (!pt) return 1;
    if (pt.y && pt.y.length) { var a0 = num(pt.y[0]); return a0 > 0 ? num(pt.y[Math.min(y, pt.y.length - 1)]) / a0 : 1; }
    return Math.pow(1 + num(pt.g) / 100, y);
  }
  function hasPattern(pt) { return !!(pt && ((pt.y && pt.y.length) || num(pt.g) !== 0)); }
  function itemsVary(items) { return (items || []).some(function (it) { return it.over && hasPattern(it.over.annual); }); }
  function varies(state) {
    var es = state.escal || {};
    return num(es.labour) !== 0 || num(es.licence) !== 0 || num(es.infra) !== 0 || Object.keys(state.over || {}).some(function (k) { return hasPattern(state.over[k]); }) ||
      itemsVary(state.toolItems) || itemsVary(state.infraItems) || itemsVary(state.assureItems) || itemsVary(state.appAssure);
  }
  /* The assessment as it stands in year y (0 is the first year): every cost with a pattern, or in a family with a yearly change, scaled to that year. */
  function yearState(state, y) {
    if (y <= 0 || !varies(state)) return state;
    var s = JSON.parse(JSON.stringify(state)), es = state.escal || {}, ov = state.over || {};
    var fam = function (k) { return Math.pow(1 + num(es[k]) / 100, y); };
    var top = function (obj, key, path, family) { if (obj[key] !== undefined) obj[key] = num(obj[key]) * (hasPattern(ov[path]) ? factorAt(ov[path], y) : fam(family)); };
    ALL_ROLES.forEach(function (r) { if (s.rates[r.key] !== undefined) s.rates[r.key] = num(s.rates[r.key]) * fam('labour'); });
    ['alt', 'os', 'sentry'].forEach(function (k) { top(s.platform, k, 'platform/' + k, 'licence'); });
    top(s, 'osTooling', 'osTooling', 'licence');
    ['alt', 'os'].forEach(function (k) { top(s.infra, k, 'infra/' + k, 'infra'); });
    [['toolItems', 'licence'], ['assureItems', 'licence'], ['appAssure', 'licence'], ['infraItems', 'infra']].forEach(function (g) {
      (s[g[0]] || []).forEach(function (it) { if (it.annual !== undefined) it.annual = num(it.annual) * (it.over && hasPattern(it.over.annual) ? factorAt(it.over.annual, y) : fam(g[1])); });
    });
    return s;
  }
  /* An application's value per driver in year y: its calculators, each scaled by its own pattern. */
  function buildValueYear(build, y) {
    var t = { cost: 0, rev: 0, risk: 0 };
    (build || []).forEach(function (l) {
      var v = lineValue(l), f = l.over ? factorAt(l.over.value, y) : 1;
      t.cost += v.cost * f; t.rev += v.rev * f; t.risk += v.risk * f;
    });
    return t;
  }
  function linesVary(build) { return (build || []).some(function (l) { return l.over && hasPattern(l.over.value); }); }

  /* The yearly maintenance rate, % of build cost: break/fix plus enhancement. */
  function maintPct(state, ap) { return num(state.maint.fix[ap]) + num(state.maint.enh[ap]); }
  /* The steady-state cost of a year once every application is live (BAU): looking after the applications (break/fix and enhancement) and running the platform
   * (licences and tooling, infrastructure, operating people, security and compliance). Delivery, AI build tokens, one-off setup and the timing of value are left out. */
  function bauYear(state, ap) {
    var fix = 0, enh = 0;
    approachResult(state, ap).projects.forEach(function (p) { fix += p.teamCost * num(state.maint.fix[ap]) / 100; enh += p.teamCost * num(state.maint.enh[ap]) / 100; });
    var tokPer = num(state.tokens.spend) * (ap === 'os' ? 1 - clamp(num(state.tokens.saving), 0, 100) / 100 : 1), tok = 0;
    approachResult(state, ap).projects.forEach(function (p) { tok += tokPer * p.scale * num(state.tokens.runPct) / 100; });
    var o = { fix: fix, enh: enh, tokens: tok, platform: licenceAnnual(state, ap), infra: infraAnnual(state, ap), ops: opsWeekCost(state, ap) * WPY, assure: assureAnnual(state, ap) };
    o.app = o.fix + o.enh + o.tokens; o.nonApp = o.platform + o.infra + o.ops + o.assure; o.total = o.app + o.nonApp;
    return o;
  }
  function approachResult(state, ap) {
    var W = Math.max(1, Math.round(num(state.horizon) * WPY));
    var T = expectedTime(state, ap);
    var sched = schedule(state, T, ap);
    var cost = {}, val = {};
    COST_CATS.forEach(function (c) { cost[c.key] = zeros(W); });
    DRIVERS.forEach(function (d) { val[d.key] = zeros(W); });

    var k, vary = varies(state), views = {};
    var ys = function (y) { y = Math.min(y, Math.ceil(W / WPY)); return views[y] || (views[y] = yearState(state, y)); };
    var yr = function (week) { return Math.floor(week / WPY); };
    /* Licences are charged once a year, in advance, from the start: a full year's licence in week 0 and on each anniversary (so the cumulative lines step down every year). */
    var licW = licenceStartWeek(state);
    for (k = 0; k < W; k++) cost.platform[k] = k >= licW && (k - licW) % WPY === 0 ? licenceAnnual(ys(yr(k)), ap) : 0;
    addUniform(cost.setup, 0, setupWeeks(state, ap), setupAmount(state, ap));   // one-off, spread over the setup period

    var ramp = Math.max(0, num(state.rampWeeks)), growth = num(state.growth) / 100;
    var tokenPer = num(state.tokens.spend) * (ap === 'os' ? 1 - clamp(num(state.tokens.saving), 0, 100) / 100 : 1), tokenRunPct = num(state.tokens.runPct) / 100;

    /* Delivery cost: developers x role mix x rates x active weeks, times the rate level of the application's delivery group (the same people deliver
     * whichever approach is used, so a given cost for OutSystems sets the level for the alternative too). */
    var gf = groupFactors(state);
    var nApps = Math.max(1, sched.length), figs = {};
    /* Infrastructure, operations and security at full run, per week, in the year of the week (they change from year to year when a pattern or yearly change is set). */
    var fig = function (y) { return figs[y] || (figs[y] = { i: infraAnnual(ys(y), ap) / WPY, o: opsWeekCost(ys(y), ap), a: assureAnnual(ys(y), ap) / WPY }); };
    sched.forEach(function (p) {
      var gfac = (gf[p.group] === undefined ? 1 : gf[p.group]) * (p.pay === undefined ? 1 : p.pay), buildCost = p.active * weekCost(state, ap, p.devs) * gfac;
      var refBuild = (p.activeRef === undefined ? p.active : p.activeRef) * weekCost(state, ap, p.devs) * (gf[p.group] === undefined ? 1 : gf[p.group]);   // what the application costs to look after does not depend on who built it
      p.teamCost = buildCost;   // this application's share of the delivery team's cost, at the delivery team's rate level
      if (vary && p.active > 0) {   // people cost more (or less) as the years pass: charge each week at its own year's rates
        for (k = Math.floor(p.start); k < Math.ceil(p.start + p.active) && k < W; k++) {
          if (k < 0) continue;
          var tov = Math.min(p.start + p.active, k + 1) - Math.max(p.start, k);
          if (tov > 0) cost.team[k] += weekCost(ys(yr(k)), ap, p.devs) * gfac * tov;
        }
      } else addUniform(cost.team, p.start, p.start + p.active, buildCost);
      addUniform(cost.tokens, p.start, p.start + Math.max(p.designBuild, 0.0001), tokenPer * p.scale);
      var runWeekly = maintPct(state, ap) / 100 * refBuild / WPY, tokenRunWeekly = tokenPer * p.scale * tokenRunPct / WPY;   // AI tokens after go-live, in proportion to the application's size
      // infrastructure and operations grow as applications go live (each carries an equal share of the portfolio's full-run cost)
      var kk;
      for (kk = Math.floor(p.goLive); kk < W; kk++) {
        if (kk < 0) continue;
        var ov = Math.min(1, (kk + 1) - p.goLive);
        if (ov > 0) { var fg = fig(yr(kk)); cost.run[kk] += runWeekly * ov; cost.tokens[kk] += tokenRunWeekly * ov; cost.infra[kk] += fg.i / nApps * ov; cost.ops[kk] += fg.o / nApps * ov; cost.assure[kk] += fg.a / nApps * ov; }
      }
      DRIVERS.forEach(function (d) {
        if (state.hardOnly && d.soft) return;
        var annual = num(p.value[d.key]), lvary = linesVary(p.build), lmemo = {};
        if (!annual) return;
        for (kk = Math.floor(p.goLive); kk < W; kk++) {
          if (kk < 0) continue;
          var mid = kk + 0.5;
          if (mid < p.goLive) continue;
          var r = ramp > 0 ? clamp((mid - p.goLive) / ramp, 0, 1) : 1;
          var g = Math.pow(1 + growth, (mid - p.goLive) / WPY);
          var an = lvary ? (lmemo[yr(kk)] || (lmemo[yr(kk)] = buildValueYear(p.build, yr(kk))))[d.key] : annual;
          val[d.key][kk] += an / WPY * r * g;
        }
      });
    });

    if (ap === 'os') {   // training and coaching for a team new to OutSystems, as a one-off at the start of its work
      ensureGroups(state).forEach(function (g) {
        if (g.skill === 'experienced') return;
        var sk = skillOf(state, g), devs = 0, start = sched.teamStart ? sched.teamStart[g.id] : 0;
        sched.forEach(function (p) { if (p.group === g.id) devs = Math.max(devs, num(p.devs)); });
        if (sk.enable > 0 && devs > 0) addUniform(cost.setup, start || 0, (start || 0) + 8, sk.enable * devs);
      });
    }
    var rateW = Math.pow(1 + num(state.rate) / 100, 1 / WPY) - 1;
    var df = zeros(W);
    for (k = 0; k < W; k++) df[k] = Math.pow(1 + rateW, -(k + 0.5));

    var costTotal = zeros(W), valueTotal = zeros(W), net = zeros(W), cum = zeros(W);
    var pvCost = {}, pvVal = {}, sumCost = {}, sumVal = {};
    COST_CATS.forEach(function (c) {
      var a = cost[c.key], pv = 0;
      for (k = 0; k < W; k++) { costTotal[k] += a[k]; pv += a[k] * df[k]; }
      pvCost[c.key] = pv; sumCost[c.key] = sum(a);
    });
    DRIVERS.forEach(function (d) {
      var a = val[d.key], pv = 0;
      for (k = 0; k < W; k++) { valueTotal[k] += a[k]; pv += a[k] * df[k]; }
      pvVal[d.key] = pv; sumVal[d.key] = sum(a);
    });
    var running = 0, minCum = 0, lastNeg = -1;
    for (k = 0; k < W; k++) {
      net[k] = valueTotal[k] - costTotal[k];
      running += net[k]; cum[k] = running;
      if (running < minCum) minCum = running;
      if (running < 0) lastNeg = k;
    }
    var paybackWeek = (lastNeg === W - 1) ? null : lastNeg + 1;

    var pvCostTotal = 0, pvValTotal = 0, totalCost = 0, totalValue = 0;
    COST_CATS.forEach(function (c) { pvCostTotal += pvCost[c.key]; totalCost += sumCost[c.key]; });
    DRIVERS.forEach(function (d) { pvValTotal += pvVal[d.key]; totalValue += sumVal[d.key]; });

    var annualTotal = 0, runRate = 0, live = 0;
    sched.forEach(function (p) {
      annualTotal += p.annualIncluded;
      if (p.goLive < W) { live++; runRate += p.annualIncluded; }
    });
    var annualIncluded = sched.length ? annualTotal / sched.length : 0; // average per included application

    return {
      ap: ap, W: W, T: T, projects: sched,
      cost: cost, val: val, costTotal: costTotal, valueTotal: valueTotal, net: net, cum: cum,
      pvCost: pvCost, pvVal: pvVal, sumCost: sumCost, sumVal: sumVal,
      totalCost: totalCost, totalValue: totalValue, pvCostTotal: pvCostTotal, pvValueTotal: pvValTotal,
      npv: pvValTotal - pvCostTotal,
      roi: totalCost > 0 ? (totalValue - totalCost) / totalCost : null,
      peakOutlay: -minCum,
      paybackWeek: paybackWeek,
      paybackMonths: paybackWeek === null ? null : paybackWeek / WPY * 12,
      runRate: runRate, liveProjects: live,
      annualPerProject: annualIncluded, annualTotal: annualTotal
    };
  }

  /* Run the whole model. The bridge items sum exactly to the NPV advantage. */
  var CASES = {
    conservative: { label: 'Conservative', advantage: 0.6, value: 0.7 },
    likely: { label: 'Likely', advantage: 1, value: 1 },
    optimistic: { label: 'Optimistic', advantage: 1.2, value: 1 }
  };
  /* The cases for an assessment: the labels, with the percentages the user has set (or the defaults). */
  function casesOf(state) {
    var out = {};
    Object.keys(CASES).forEach(function (k) {
      var c = (state.cases && state.cases[k]) || {};
      out[k] = { label: CASES[k].label, advantage: c.advantage !== undefined ? num(c.advantage) : CASES[k].advantage, value: c.value !== undefined ? num(c.value) : CASES[k].value };
    });
    return out;
  }
  function caseOf(state) {
    if (state.realiseCustom) return null;   // Custom was chosen (or typed in)
    var r = state.realise || { advantage: 1, value: 1 }, k = null, C = casesOf(state);
    Object.keys(C).forEach(function (n) { if (Math.abs(C[n].advantage - num(r.advantage)) < 1e-9 && Math.abs(C[n].value - num(r.value)) < 1e-9) k = n; });
    return k;   // null = a custom setting
  }
  /* The state the model actually runs on: OutSystems' improvements scaled back (or forward) by the advantage realised, and the business value scaled by the value realised. */
  function effectiveState(state) {
    var rl = state.realise || { advantage: 1, value: 1 }, f = Math.max(0, num(rl.advantage)), v = Math.max(0, num(rl.value));
    if (Math.abs(f - 1) < 1e-12 && Math.abs(v - 1) < 1e-12) return state;
    var s = JSON.parse(JSON.stringify(state)), lerp = function (a, o) { return num(a) + f * (num(o) - num(a)); };
    Object.keys(s.stages).forEach(function (k) { s.stages[k].os = Math.max(0, lerp(s.stages[k].alt, s.stages[k].os)); });
    s.gates.forEach(function (g) { ['w', 'r', 'f', 's'].forEach(function (k) { g.os[k] = lerp(g.alt[k], g.os[k]); }); g.os.s = Math.min(100, Math.max(1, g.os.s)); });
    Object.keys(s.mix.os).forEach(function (k) { s.mix.os[k] = lerp(s.mix.alt[k], s.mix.os[k]); });
    s.tokens.saving = Math.min(100, num(s.tokens.saving) * f);
    ['cost', 'risk', 'rev'].forEach(function (k) { s.value[k] = num(s.value[k]) * v; });
    if (s.projectList) s.projectList.forEach(function (p) {
      if (p.value) ['cost', 'risk', 'rev'].forEach(function (k) { p.value[k] = num(p.value[k]) * v; });
      (p.build || []).forEach(function (l) { l.vs = (l.vs === undefined ? 1 : num(l.vs)) * v; });   // the share of each calculator's value that is realised
    });
    s.realise = { advantage: 1, value: 1 };
    return s;
  }
  function run(state) {
    var eff = effectiveState(state), r = runCore(eff);
    r.eff = eff; r.groupFactors = groupFactors(eff);
    return r;
  }
  /* Net advantage and payback under each case (and the current setting), for the "how sure are we" box. */
  function caseTable(state) {
    var out = [];
    var CS = casesOf(state);
    Object.keys(CS).forEach(function (k) {
      var s = JSON.parse(JSON.stringify(state)); s.realise = { advantage: CS[k].advantage, value: CS[k].value };
      var r = run(s);
      out.push({ key: k, label: CS[k].label, advantage: r.advantage, osPayback: r.os.paybackMonths, altPayback: r.alt.paybackMonths, weeksFaster: r.weeksFaster, osTime: r.os.T.total });
    });
    return out;
  }
  /* The operating people cost split by role, as shares of each side's total (they add up to 1 on a side that has any). Null when the people are a single total. */
  var OPS_GROUPS = { arch: 'Operations: architecture', ops: 'Operations: DevOps and SRE', qa: 'Operations: platform testing', sec: 'Operations: security', pm: 'Operations: programme management' };
  var OPS_ROLE_GROUP = { arch: 'arch', ops: 'ops', sre: 'ops', dba: 'ops', net: 'ops', qa: 'qa', sec: 'sec', soc: 'sec', grc: 'sec', pm: 'pm', coach: 'pm' };
  function opsSplit(state) {
    if (!hasItems(state.opsItems)) return null;
    var h = num(state.team.hours), self = selfHosted(state), g = {}, order = [], ta = 0, to = 0;
    state.opsItems.forEach(function (it) {
      var role = OPS_ROLE_GROUP[it.role] || 'ops', rate = num(state.rates[it.role] !== undefined ? state.rates[it.role] : state.rates.ops), a = num(it.fte) * h * rate, o = self ? a * osShare(it) : 0;
      if (!g[role]) { g[role] = { role: role, label: OPS_GROUPS[role], a: 0, o: 0 }; order.push(role); }
      g[role].a += a; g[role].o += o; ta += a; to += o;
    });
    return order.map(function (k) { return { role: k, label: g[k].label, alt: ta > 0 ? g[k].a / ta : 0, os: to > 0 ? g[k].o / to : 0 }; });
  }
  function runCore(state) {
    var alt = approachResult(state, 'alt'), os = approachResult(state, 'os');
    var bridge = [];
    var split = opsSplit(state);   // operating people split by role, so the biggest bar is not one lump
    COST_CATS.forEach(function (c) {
      if (c.key === 'ops' && split) {
        split.forEach(function (g) {
          bridge.push({ key: 'c_ops_' + g.role, label: g.label, kind: 'cost', hard: true, delta: alt.pvCost.ops * g.alt - os.pvCost.ops * g.os });
        });
        return;
      }
      bridge.push({ key: 'c_' + c.key, label: c.label, kind: 'cost', hard: true,
        delta: alt.pvCost[c.key] - os.pvCost[c.key] });
    });
    DRIVERS.forEach(function (d) {
      bridge.push({ key: 'v_' + d.key, label: d.label + ' (earlier)', kind: 'value', hard: !d.soft,
        delta: os.pvVal[d.key] - alt.pvVal[d.key] });
    });
    var advantage = os.npv - alt.npv, hard = 0, bridgeSum = 0;
    bridge.forEach(function (b) { bridgeSum += b.delta; if (b.hard) hard += b.delta; });
    var weeksFaster = alt.T.total - os.T.total, codTotal = 0, i;
    /* Cost of delay avoided: each project's annual value / 52 x the weeks it goes live sooner with OutSystems. */
    for (i = 0; i < alt.projects.length; i++) {
      var pa = alt.projects[i], po = os.projects[i];
      codTotal += pa.annualIncluded / WPY * ((pa.goLive - pa.start) - (po.goLive - po.start));
    }
    /* Cost crossover: the first week from which OutSystems' cumulative cost stays at or below the alternative's. */
    var ca = 0, co = 0, lastAbove = -1, kk;
    for (kk = 0; kk < alt.W; kk++) { ca += alt.costTotal[kk]; co += os.costTotal[kk]; if (co > ca) lastAbove = kk; }
    var crossoverWeek = lastAbove === alt.W - 1 ? null : lastAbove + 1;
    return {
      crossoverWeek: crossoverWeek, crossoverMonths: crossoverWeek === null ? null : crossoverWeek / WPY * 12,
      alt: alt, os: os, bridge: bridge, bridgeSum: bridgeSum, advantage: advantage,
      hardShare: advantage > 0 ? hard / advantage : null,
      weeksFaster: weeksFaster,
      costOfDelayPerProject: alt.projects.length ? codTotal / alt.projects.length : 0,
      costOfDelayTotal: codTotal,
      tokenSaving: alt.sumCost.tokens - os.sumCost.tokens
    };
  }

  /* The delivery team by role: person-days and cost for each approach over the whole portfolio, and the ratio (alternative / OutSystems)
   * with the three things that drive it: how long the team is needed, how many developers, and how many of this role per developer.
   * Works in both team-size and quote modes (the quote's cost is shared out by role according to the role mix). r = the result of run(). */
  /* Each delivery team's share of an approach's delivery cost (at the rates the model ran on). */
  function teamShares(state, ap) {
    var gf = groupFactors(state), out = {}, tot = 0;
    schedule(state, expectedTime(state, ap), ap).forEach(function (p) { var c = p.active * weekCost(state, ap, p.devs) * (gf[p.group] === undefined ? 1 : gf[p.group]) * (p.pay === undefined ? 1 : p.pay); out[p.group] = (out[p.group] || 0) + c; tot += c; });
    Object.keys(out).forEach(function (k) { out[k] = tot > 0 ? out[k] / tot : 0; });
    return out;
  }
  function roleBreakdown(state, r, gid) {
    if (r.eff) state = r.eff;   // the settings the model ran on (the case)
    var cost = { os: r.os.sumCost.team, alt: r.alt.sumCost.team }, mc = { os: mixCost(state, 'os'), alt: mixCost(state, 'alt') };
    if (gid) ['os', 'alt'].forEach(function (ap) { cost[ap] *= teamShares(state, ap)[gid] || 0; });   // one delivery team's applications only
    var fAvg = {};   // the average rate level the team was paid at, so person-days stay person-days whatever the rate level
    ['os', 'alt'].forEach(function (ap) {
      var unscaled = 0; schedule(state, expectedTime(state, ap), ap).forEach(function (p) { if (!gid || p.group === gid) unscaled += p.active * weekCost(state, ap, p.devs); });
      fAvg[ap] = unscaled > 0 ? cost[ap] / unscaled : 1;
    });
    var time = r.alt.T.active / Math.max(1e-9, r.os.T.active), devs = devsFor(state, 'alt') / Math.max(1e-9, devsFor(state, 'os'));
    var rows = [], tot = { os: { days: 0, cost: 0 }, alt: { days: 0, cost: 0 } };
    ROLES.forEach(function (role) {
      var rate = Math.max(1e-9, num(state.rates[role.key])), row = { key: role.key, label: role.label, rate: rate, os: null, alt: null };
      ['os', 'alt'].forEach(function (ap) {
        var m = role.key === 'dev' ? 1 : num(state.mix[ap][role.key]);
        var c = mc[ap] > 0 ? cost[ap] * m * rate / mc[ap] : 0;
        row[ap] = { perDev: m, cost: c, days: c / (rate * fAvg[ap] * 8) };
        tot[ap].days += row[ap].days; tot[ap].cost += c;
      });
      row.ratio = row.os.days > 0 ? row.alt.days / row.os.days : null;
      row.factors = { time: time, devs: devs, mix: row.os.perDev > 0 ? row.alt.perDev / row.os.perDev : null };
      rows.push(row);
    });
    return { rows: rows, total: tot, ratio: tot.os.days > 0 ? tot.alt.days / tot.os.days : null, time: time, devs: devs,
      activeWeeks: { os: r.os.T.active, alt: r.alt.T.active } };
  }

  /* Effort by domain and phase. The alternative's delivery person-days and cost (from roleBreakdown) are shared out by the weights; OutSystems
   * effort is the same weights reduced by each domain's %, scaled so the OutSystems total matches the delivery model. Cost uses each domain's role rate. */
  function domainBreakdown(state, r, gid) {
    if (r.eff) state = r.eff;
    var rb = roleBreakdown(state, r, gid), D = state.domains, out = { rows: [], phases: {}, total: { os: { days: 0, cost: 0 }, alt: { days: 0, cost: 0 } }, days: rb.total };
    var W = 0, Wo = 0;
    DOMAINS.forEach(function (d) {
      PHASES.forEach(function (p) { var w = Math.max(0, num(D.w[d.key][p.key])); W += w; Wo += w * (1 - clamp(num(D.r[d.key]) / 100, 0, 0.99)); });
    });
    W = W || 1; Wo = Wo || 1;
    /* The typed reductions set how OutSystems' effort is shared between the domains; the total is fixed by the delivery model. When that total leaves less
     * of a reduction than the shape asks for, a domain could come out worse than the alternative. No domain is allowed to: it is held at the alternative's
     * effort (no saving) and the rest share what is left, so the totals still tie. */
    var altDom = {}, baseDom = {}, held = {};
    DOMAINS.forEach(function (d) {
      altDom[d.key] = 0; baseDom[d.key] = 0;
      PHASES.forEach(function (p) { var w = Math.max(0, num(D.w[d.key][p.key])); altDom[d.key] += rb.total.alt.days * w / W; baseDom[d.key] += w * (1 - clamp(num(D.r[d.key]) / 100, 0, 0.99)); });
    });
    var perUnit = rb.total.os.days / Wo, iter, again = rb.total.os.days < rb.total.alt.days;   // when OutSystems needs as many days as the alternative (a team new to it), no domain can be held at the alternative's effort and the totals still tie
    for (iter = 0; iter < DOMAINS.length && again; iter++) {
      again = false;
      var free = 0, fixedDays = 0;
      DOMAINS.forEach(function (d) { if (held[d.key]) fixedDays += altDom[d.key]; else free += baseDom[d.key]; });
      perUnit = free > 0 ? Math.max(0, rb.total.os.days - fixedDays) / free : 0;
      DOMAINS.forEach(function (d) { if (!held[d.key] && perUnit * baseDom[d.key] > altDom[d.key] + 1e-9) { held[d.key] = true; again = true; } });
    }
    var cells = [], sum = { os: 0, alt: 0 };
    DOMAINS.forEach(function (d) {
      var rate = Math.max(1e-9, num(state.rates[d.role])), row = { key: d.key, label: d.label, role: d.role, rate: rate, phases: {}, os: { days: 0, cost: 0 }, alt: { days: 0, cost: 0 } };
      PHASES.forEach(function (p) {
        var w = Math.max(0, num(D.w[d.key][p.key])), keep = 1 - clamp(num(D.r[d.key]) / 100, 0, 0.99);
        var altDays = rb.total.alt.days * w / W, days = { alt: altDays, os: held[d.key] ? altDays : perUnit * w * keep };
        row.phases[p.key] = { alt: { days: days.alt, cost: 0 }, os: { days: days.os, cost: 0 } };
        ['os', 'alt'].forEach(function (ap) { sum[ap] += days[ap] * rate; });
      });
      cells.push(row);
    });
    cells.forEach(function (row) {
      PHASES.forEach(function (p) {
        ['os', 'alt'].forEach(function (ap) {
          var c = row.phases[p.key][ap]; c.cost = sum[ap] > 0 ? rb.total[ap].cost * c.days * row.rate / sum[ap] : 0;
          row[ap].days += c.days; row[ap].cost += c.cost;
          var ph = out.phases[p.key] || (out.phases[p.key] = { os: { days: 0, cost: 0 }, alt: { days: 0, cost: 0 } });
          ph[ap].days += c.days; ph[ap].cost += c.cost; out.total[ap].days += c.days; out.total[ap].cost += c.cost;
        });
      });
      row.saving = row.alt.cost - row.os.cost; row.reduction = row.alt.days > 0 ? 1 - row.os.days / row.alt.days : 0;
      out.rows.push(row);
    });
    return out;
  }

  /* The OutSystems licence per year at which the net value advantage is zero. The advantage is linear in the licence, so two runs find it.
   * Null if the advantage does not depend on the licence. */
  /* The three hosting routes side by side: the alternative (cloud native), OutSystems PaaS and OutSystems self-managed. Ongoing cost per year at full run
   * (licences, infrastructure, operating people), the one-off setup, and the net value advantage when OutSystems is hosted that way. */
  function hostingCompare(state) {
    var out = {}, mk = function (s, ap, setupRaw) {
      var lic = licenceAnnual(s, ap), up = ap === 'os' ? sentryUplift(s) : 0;
      return { licences: lic, sentry: up, infra: infraAnnual(s, ap), ops: opsWeekCost(s, ap) * WPY, opsFte: opsFteTotal(s, ap), assure: assureAnnual(s, ap), setup: setupRaw };
    };
    var s0 = JSON.parse(JSON.stringify(state)); out.alt = mk(s0, 'alt', num(state.setup.alt.hiring) + num(state.setup.alt.build) + num(state.setup.alt.tools));
    /* Each route is shown with the security the organisation needs: the plain routes with none required, PaaS + Sentry and self-managed + assured with high assurance required. */
    [['paas', 'paas', false], ['sentry', 'paas-sentry', true], ['self', 'self', false], ['diy', 'self', true]].forEach(function (r) {
      var s = JSON.parse(JSON.stringify(state)); s.osHosting = r[1]; s.assurance = s.assurance || {}; if (r[2] !== null) s.assurance.required = r[2];
      out[r[0]] = mk(s, 'os', osSetupFor(state, r[1])); out[r[0]].advantage = run(s).advantage;
      out[r[0]].altAssure = assureAnnual(s, 'alt');
    });
    ['alt', 'paas', 'sentry', 'self', 'diy'].forEach(function (k) { out[k].ongoing = out[k].licences + out[k].infra + out[k].ops + out[k].assure; });
    return out;
  }

  /* ---- How sure are we: what moves the answer ---- */
  function cloneState(state) { return JSON.parse(JSON.stringify(state)); }
  var SENS = [
    { key: 'value', label: 'How much of the business value arrives', tip: 'How much of the business value you entered actually turns up once the applications are live. Lower means the benefits come in smaller than planned.', set: function (s, k) { var r = s.realise || { advantage: 1, value: 1 }; s.realise = { advantage: r.advantage, value: num(r.value) * k }; } },
    { key: 'speed', label: 'How much faster OutSystems delivers', tip: 'How much faster OutSystems delivers than the alternative. A smaller advantage shrinks the time saved and the value from going live earlier.', set: function (s, k) { var r = s.realise || { advantage: 1, value: 1 }; s.realise = { advantage: num(r.advantage) * k, value: r.value }; } },
    { key: 'licence', label: 'OutSystems licence price', tip: 'The yearly price of the OutSystems platform licence.', set: function (s, k) { s.platform.os = num(s.platform.os) * k; } },
    { key: 'altteam', label: 'Developers the alternative needs', tip: 'How many developers the alternative needs compared with OutSystems. Needing fewer narrows the gap in delivery cost.', set: function (s, k) { s.altDevFactor = num(s.altDevFactor) * k; } },
    { key: 'tokens', label: 'Saving on AI usage costs', tip: 'How much of the cost of AI usage OutSystems saves compared with the alternative.', set: function (s, k) { s.tokens.saving = Math.min(100, num(s.tokens.saving) * k); } },
    { key: 'discount', label: 'How much future money is worth today', tip: 'The yearly rate used to treat money received later as worth less than money today. A higher rate shrinks benefits that arrive years from now.', set: function (s, k) { s.rate = num(s.rate) * k; } }
  ];
  /* The net advantage with each key assumption pct% lower and pct% higher, one at a time, largest swing first. */
  function sensitivity(state, pct) {
    var f = (pct === undefined ? 25 : pct) / 100, base = run(state).advantage;
    var rows = SENS.map(function (d) {
      var lo = cloneState(state), hi = cloneState(state);
      d.set(lo, 1 - f); d.set(hi, 1 + f);
      var a = run(lo).advantage - base, b = run(hi).advantage - base;
      return { key: d.key, label: d.label, tip: d.tip, low: a, high: b, swing: Math.max(Math.abs(a), Math.abs(b)) };
    });
    rows.sort(function (x, y) { return y.swing - x.swing; });
    return { base: base, pct: pct === undefined ? 25 : pct, rows: rows };
  }
  /* What would have to be true for OutSystems to stay ahead: the value of one assumption at which the net advantage reaches zero (null when it never does). */
  function mustBeTrue(state) {
    var a0 = run(state).advantage, rl = state.realise || { advantage: 1, value: 1 }, out = [];
    function zero(set, x0, step) {
      var s = cloneState(state); set(s, x0 + step);
      var slope = (run(s).advantage - a0) / step;
      return Math.abs(slope) < 1e-9 ? null : { at: x0 - a0 / slope, falls: slope < 0 };
    }
    var p0 = num(state.platform.os);
    var z = zero(function (s, x) { s.platform.os = x; }, p0, Math.max(1000, p0 * 0.1));
    out.push({ key: 'licence', now: p0, at: z ? z.at : null, falls: z ? z.falls : true });
    z = zero(function (s, x) { s.realise = { advantage: rl.advantage, value: x }; }, num(rl.value), 0.1);
    out.push({ key: 'value', now: num(rl.value), at: z ? z.at : null, falls: z ? z.falls : false });
    z = zero(function (s, x) { s.realise = { advantage: x, value: rl.value }; }, num(rl.advantage), 0.1);
    out.push({ key: 'speed', now: num(rl.advantage), at: z ? z.at : null, falls: z ? z.falls : false });
    return { advantage: a0, items: out };
  }

  function breakEvenLicence(state) {
    var p0 = num(state.platform.os), a0 = run(state).advantage, h = Math.max(1000, p0 * 0.1);
    var s2 = JSON.parse(JSON.stringify(state)); s2.platform.os = p0 + h;
    var slope = (run(s2).advantage - a0) / h;
    return slope < -1e-12 ? p0 - a0 / slope : null;
  }


  /* ---- Cost by phase of the capability map ----
   * Every cost belongs to a phase, so the phase view adds up to the cost totals. Each cost category's total over the analysis period (the model's own figure) is shared
   * between phases in proportion to the lines behind it: the delivery team by its effort per phase, tooling and security by each line's phase, operating people by their role's phase,
   * and the rest by where the work happens (platform, cloud and operating people in Operate; looking after the applications in Evolve; setup in Deploy; AI tokens in Build until go-live, then Operate). */
  function linePhase(it, kind) {
    var D = sdlcMap(); if (!D) return 'Operate';
    var k = it.phase && D.byKey(it.phase) ? it.phase : (kind === 'ops' ? D.phaseOfRole(it.role) : D.phaseOfLayer(it.name));
    return D.byKey(k) ? k : 'Operate';   // a line the map cannot place is counted where things are run
  }
  function costByPhaseCore(state, r) {
    var s = r.eff || state, dom = domainBreakdown(s, r), out = {}, DK = { ideate: 'Ideate', design: 'Design', build: 'Build', validate: 'Validate', deploy: 'Deploy' };
    var h = num(s.team.hours), TRUST = 'Enterprise trust & control';
    ['alt', 'os'].forEach(function (ap) {
      var res = r[ap], sc = res.sumCost, ph = {}, total = 0;
      var entry = function (p) { return ph[p] || (ph[p] = { total: 0, cats: {}, eff: {}, effort: 0, fte: 0 }); };
      var addEff = function (p, cat, d) { if (!(d > 0)) return; var x = entry(p); x.eff[cat] = (x.eff[cat] || 0) + d; x.effort += d; };   // person-days of work: only the costs that are people have them
      var add = function (p, cat, amt) { if (!(amt > 0)) return; var x = entry(p); x.total += amt; x.cats[cat] = (x.cats[cat] || 0) + amt; total += amt; };
      var spread = function (cat, T, w, fb) {
        if (!(T > 0)) return;
        var S = 0, k; for (k in w) S += w[k];
        if (!(S > 0)) { add(fb, cat, T); return; }
        for (k in w) add(k, cat, T * w[k] / S);
      };
      var bump = function (w, p, v) { if (v > 0) w[p] = (w[p] || 0) + v; };
      var teamDays = 0;
      Object.keys(dom.phases).forEach(function (k) { var x = dom.phases[k][ap]; addEff(DK[k], 'team', x.days); add(DK[k], 'team', x.cost); teamDays += x.days; });
      var tokPer = num(s.tokens.spend) * (ap === 'os' ? 1 - clamp(num(s.tokens.saving), 0, 100) / 100 : 1), tokBuild = 0;
      res.projects.forEach(function (p) { if (p.start < res.W) tokBuild += tokPer * p.scale; });
      add('Build', 'tokens', Math.min(sc.tokens, tokBuild)); add('Operate', 'tokens', Math.max(0, sc.tokens - tokBuild));
      add('Evolve', 'run', sc.run);   // looking after the live applications (break/fix and enhancements) is Evolve
      if (teamDays > 0) addEff('Evolve', 'run', sc.run / (sc.team / teamDays));   // at what the delivery team costs a day
      var wl = {};
      if (hasItems(s.toolItems)) s.toolItems.forEach(function (it) { bump(wl, linePhase(it, 'tool'), num(it.annual) * (ap === 'os' ? osShare(it) : 1)); });
      else bump(wl, 'Operate', ap === 'alt' ? num(s.platform.alt) : num(s.osTooling));
      if (ap === 'os') bump(wl, 'Operate', num(s.platform.os) + sentryUplift(s) + externalAnnual(s));
      spread('platform', sc.platform, wl, 'Operate');
      add('Operate', 'infra', sc.infra);
      var wo = {}, wf = {};
      if (hasItems(s.opsItems)) s.opsItems.forEach(function (it) {
        var p = linePhase(it, 'ops'), f = num(it.fte) * (ap === 'os' ? osShare(it) : 1);
        bump(wo, p, f * h * num(s.rates[it.role] !== undefined ? s.rates[it.role] : s.rates.ops)); bump(wf, p, f);
      });
      else { bump(wo, 'Operate', num(s.opsFte[ap]) * h * num(s.rates.ops)); bump(wf, 'Operate', num(s.opsFte[ap])); }
      spread('ops', sc.ops, wo, 'Operate');
      var oAnnual = 0, k2; for (k2 in wo) oAnnual += wo[k2] * WPY;
      if (sc.ops > 0 && oAnnual > 0) for (k2 in wf) { var e = entry(k2); e.fte = wf[k2]; addEff(k2, 'ops', wf[k2] * h * WPY / 8 * (sc.ops / oAnnual)); }
      var wa = {};
      bump(wa, TRUST, highAssureAnnual(s, ap));
      (s.appAssure || []).forEach(function (it) { bump(wa, it.phase && sdlcMap().byKey(it.phase) ? it.phase : TRUST, num(it.annual) * (ap === 'os' ? osShare(it) : 1)); });
      spread('assure', sc.assure, wa, TRUST);
      var waAll = 0, kA; for (kA in wa) waAll += wa[kA];
      if (sc.assure > 0 && waAll > 0 && assuranceOn(s) && !(ap === 'os' && hostingOf(s) !== 'self')) (s.assureItems || []).forEach(function (it) {   // the people among the security items have days; certification and tools are money only
        if (it.kind === 'people') addEff(TRUST, 'assure', num(it.fte) * h * WPY / 8 * (ap === 'os' ? osShare(it) : 1) * sc.assure / waAll);
      });
      add('Deploy', 'setup', sc.setup);
      out[ap] = { phases: ph, total: total };
    });
    return out;
  }

  /* A typical application: how big it is is its build time with OutSystems, in months (the same measure as an application on the Applications tab). Its scale is the number of
   * OutSystems weeks of active work over a normal application's, and the alternative is given the same scale, so it takes longer. Work (design, build, fixes, integration testing and the testing or review at gates) scales
   * with size; waiting in queues and releasing do not (as for every application). */
  function typicalScale(state, months) { var T = expectedTime(state, 'os'); return T.active > 0 ? num(months) * (WPY / 12) / T.active : 1; }
  function typicalTime(state, ap, months) {
    var T = expectedTime(state, ap), sc = typicalScale(state, months), total = 0;
    var parts = T.parts.map(function (p) { var w = (p.weeks - p.work) + p.work * sc; total += w; return { key: p.key, label: p.label, weeks: w, fixed: p.weeks - p.work, gate: p.gate }; });
    return { total: total, active: T.active * sc, parts: parts, scale: sc };
  }
  /* Cost by phase for the whole portfolio (no months), or for getting one typical application of that many months into production. Running the platform, tooling, cloud, operating people
   * and looking after live applications are shared between applications, so they belong to the portfolio; one application's cost is what it takes to deliver it: its delivery team and
   * AI build tokens (scaled from the average application to its size) and its share of the per-application security work (penetration testing, accreditation: one year's amount). */
  function costByPhase(state, r, months) {
    var base = costByPhaseCore(state, r);
    if (!(num(months) > 0)) return base;
    var s = r.eff || state, sc = typicalScale(s, months), TRUST = 'Enterprise trust & control', out = {};
    ['alt', 'os'].forEach(function (ap) {
      var projs = r[ap].projects, n = Math.max(1, projs.length), avg = 0, ph = {}, total = 0;
      projs.forEach(function (p) { avg += p.scale; }); avg = projs.length && avg > 0 ? avg / projs.length : 1;
      var k = sc / avg, entry = function (p) { return ph[p] || (ph[p] = { total: 0, cats: {}, eff: {}, effort: 0, fte: 0 }); };
      Object.keys(base[ap].phases).forEach(function (p) {
        var x = base[ap].phases[p];
        if (x.cats.team > 0) { entry(p).cats.team = x.cats.team * k / n; }
        if (p === 'Build' && x.cats.tokens > 0) entry(p).cats.tokens = x.cats.tokens * k / n;   // the tokens used to build, not those used after go-live
        if (x.eff.team > 0) { var e = entry(p); e.eff.team = x.eff.team * k / n; e.effort += e.eff.team; }
      });
      (s.appAssure || []).forEach(function (it) {
        var amt = num(it.annual) * (ap === 'os' ? osShare(it) : 1) / n, p = it.phase && sdlcMap().byKey(it.phase) ? it.phase : TRUST;
        if (amt > 0) entry(p).cats.assure = (entry(p).cats.assure || 0) + amt;
      });
      Object.keys(ph).forEach(function (p) { var t = 0; Object.keys(ph[p].cats).forEach(function (c) { t += ph[p].cats[c]; }); ph[p].total = t; total += t; });
      out[ap] = { phases: ph, total: total };
    });
    return out;
  }

  /* What a team's developer quality does, compared with the same team at the experienced level: the change in the delivery team's cost, in the weeks to production of its
   * applications, in the value earned over the period and in the net benefit, for each approach. (r is the result of run() for the assessment as it stands.) */
  function qualityImpact(state, r, gid) {
    var g = ensureGroups(state).filter(function (x) { return x.id === gid; })[0];
    if (!g || g.skill === 'experienced') return null;
    var base = JSON.parse(JSON.stringify(state)); ensureGroups(base).forEach(function (x) { if (x.id === gid) { x.skill = 'experienced'; } });
    var r0 = run(base), out = {};
    ['os', 'alt'].forEach(function (ap) {
      var wk = function (rr) { var n = 0, t = 0; rr[ap].projects.forEach(function (p) { if (p.group === gid) { n++; t += p.goLive - p.start; } }); return n ? t / n : 0; };
      out[ap] = { team: r[ap].sumCost.team - r0[ap].sumCost.team, teamPct: r0[ap].sumCost.team > 0 ? r[ap].sumCost.team / r0[ap].sumCost.team - 1 : 0, weeks: wk(r) - wk(r0),
        value: r[ap].totalValue - r0[ap].totalValue, net: r[ap].totalValue - r[ap].totalCost - (r0[ap].totalValue - r0[ap].totalCost) };
    });
    return out;
  }

  /* The inputs behind each kind of cost, as the Cost by phase editor lists them (the delivery team's inputs are the applications, delivery times and rates). A test changes each of
   * them and checks that the cost it is listed under moves, so the editor never offers an input that does nothing to its row. */
  var CAT_INPUTS = {
    tokens: ['tokens.spend', 'tokens.saving', 'tokens.runPct'],
    run: ['maint.fix.alt', 'maint.fix.os', 'maint.enh.alt', 'maint.enh.os'],
    platform: ['platform.os', 'platform.sentry', 'platform.alt', 'osTooling', 'toolItems.0.annual', 'toolItems.0.os'],
    infra: ['infraItems.0.annual', 'infraItems.0.os', 'infra.alt', 'infra.os'],
    assure: ['assureItems.0.annual', 'assureItems.0.os', 'appAssure.0.annual', 'appAssure.0.os'],
    setup: ['setup.alt.hiring', 'setup.alt.build', 'setup.alt.tools', 'setup.os.paas', 'setup.os.self']
  };

  var api = {
    WPY: WPY, CAT_INPUTS: CAT_INPUTS, costByPhase: costByPhase, typicalTime: typicalTime, typicalScale: typicalScale, linePhase: linePhase, sensitivity: sensitivity, mustBeTrue: mustBeTrue, breakEvenLicence: breakEvenLicence, roleBreakdown: roleBreakdown, domainBreakdown: domainBreakdown, hostingCompare: hostingCompare, assureAnnual: assureAnnual, highAssureAnnual: highAssureAnnual, appAssureAnnual: appAssureAnnual, highAssureAnnual: highAssureAnnual, appAssureAnnual: appAssureAnnual, assuranceOn: assuranceOn, hostingOf: hostingOf, sentryUplift: sentryUplift, CASES: CASES, casesOf: casesOf, caseOf: caseOf, caseTable: caseTable, effectiveState: effectiveState, DOMAINS: DOMAINS, PHASES: PHASES, domainDefaults: domainDefaults, DRIVERS: DRIVERS, COST_CATS: COST_CATS,
    defaultState: defaultState, passProb: passProb, ROLES: ROLES, ALL_ROLES: ALL_ROLES, mixCost: mixCost, peoplePerDev: peoplePerDev, devsFor: devsFor, weekCost: weekCost,
    sizeFactor: sizeFactor, osDeliveryCost: osDeliveryCost, setupAmount: setupAmount, osSetupFor: osSetupFor, envBuild: envBuild, infraAnnual: infraAnnual, externalAnnual: externalAnnual, licenceAnnual: licenceAnnual, opsWeekCost: opsWeekCost, opsFteTotal: opsFteTotal,
    expandBreakdown: expandBreakdown, collapseBreakdown: collapseBreakdown, expectedTime: expectedTime,
    parseDate: parseDate, dateAtWeek: dateAtWeek, weeksFromStart: weeksFromStart, licenceStartWeek: licenceStartWeek, schedule: schedule, skillOf: skillOf, levelOf: levelOf, qualityImpact: qualityImpact,
    projectList: projectList, ensureList: ensureList, bauYear: bauYear, maintPct: maintPct, mapShare: mapShare, applyMapShares: applyMapShares, ensureGroups: ensureGroups, groupFactors: groupFactors, migrateDefaults: migrateDefaults, factorAt: factorAt, hasPattern: hasPattern, yearState: yearState, buildValueYear: buildValueYear, overlapping: overlapping, LINE_HOURS: LINE_HOURS, seedLine: seedLine, seedDefaults: seedDefaults, applyOrgDefaults: applyOrgDefaults, INDUSTRIES: INDUSTRIES, matchTypes: matchTypes, USE_ALIASES: USE_ALIASES, ORG_TYPICAL: ORG_TYPICAL, roundSig: roundSig, USE_CASES: USE_CASES, avgDevs: avgDevs, isSimple: isSimple, simpleIndex: simpleIndex, annualOf: annualOf, monthsMode: monthsMode, deriveMonths: deriveMonths, migrateMonths: migrateMonths, LINE_MONEY: LINE_MONEY, newLine: newLine, lineValue: lineValue, hasBuild: hasBuild, buildValue: buildValue, expandProjects: expandProjects,
    schedule: schedule, approachResult: approachResult, run: run
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVAEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
