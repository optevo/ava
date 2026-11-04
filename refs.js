/* AVA references: the published sources behind figures in the tool, with what each one does and does not show (docs/AVA-data-references.md has the full research log).
 * Only sources that were opened and read are listed here. kind: 'primary' (the report, a price page or a dataset), 'vendor' (a vendor's own research or a commissioned study) or
 * 'secondary' (a summary of another source). The Evidence page lists them all; a tooltip that quotes a figure names its source in brackets. No DOM needed. */
(function (root) {
  'use strict';

  var REFS = [
    { id: 'faros2025', short: 'Faros AI 2025', kind: 'vendor', title: 'The AI Productivity Paradox Report 2025', by: 'Faros AI', year: 2025, url: 'https://www.faros.ai/blog/ai-productivity-paradox-report-2025',
      says: 'On teams with high AI adoption, pull request review time rose 91% and average pull request size rose 154%; no significant link between AI adoption and company-level improvement.',
      caveat: 'Telemetry from over 10,000 developers in 1,255 teams; correlational; Faros sells engineering analytics.', usedFor: 'Why architecture review takes longer with AI-generated code.' },
    { id: 'veracode2025', short: 'Veracode 2025', kind: 'vendor', title: '2025 GenAI Code Security Report', by: 'Veracode', year: 2025, url: 'https://www.veracode.com/resources/2025-genai-code-security-report/',
      says: 'AI-generated code introduced risky security flaws in 45% of tests.',
      caveat: '80 curated coding tasks across more than 100 models, each with a secure and an insecure way to write the code: a benchmark, not a measure of code in production; Veracode sells security scanning.', usedFor: 'Why security review of AI-generated code is slower and rejects more often.' },
    { id: 'dora2024', short: 'DORA 2024', kind: 'primary', title: 'Announcing the 2024 DORA report', by: 'Google Cloud (DORA)', year: 2024, url: 'https://cloud.google.com/blog/products/devops-sre/announcing-the-2024-dora-report',
      says: 'For every 25% increase in AI adoption, estimated delivery throughput fell 1.5% and delivery stability fell 7.2%; 39% of respondents had little or no trust in AI-generated code.',
      caveat: 'Survey-based estimates; the 2025 report reports a more positive throughput effect and has not been checked against its primary text.', usedFor: 'Why review gates stay with AI-generated code.' },
    { id: 'metr2025', short: 'METR 2025', kind: 'primary', title: 'Measuring the impact of early-2025 AI on experienced open-source developer productivity', by: 'METR', year: 2025, url: 'https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/',
      says: 'In a randomised trial, experienced developers using AI tools took 19% longer; they had expected to be 24% faster.',
      caveat: '16 developers, 246 issues in mature repositories; the authors call it a snapshot of early-2025 tools.', usedFor: 'The range of evidence on AI coding speed (a lower bound).' },
    { id: 'github2022', short: 'GitHub Copilot study', kind: 'vendor', title: 'Quantifying GitHub Copilot\'s impact on developer productivity and happiness', by: 'GitHub', year: 2022, url: 'https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness/',
      says: 'Developers with Copilot finished an HTTP server task 55% faster (1h11m against 2h41m).',
      caveat: '95 developers, one greenfield task, run by the vendor; an upper bound, not a lifecycle figure.', usedFor: 'The range of evidence on AI coding speed (an upper bound).' },
    { id: 'linearb2026', short: 'LinearB 2026', kind: 'vendor', title: '2026 Software Engineering Benchmarks Report', by: 'LinearB', year: 2026, url: 'https://linearb.io/blog/engineering-benchmarks-report',
      says: 'Pull requests raised by AI were accepted 32.7% of the time against 84.4% for manual ones.',
      caveat: '8.1 million pull requests; measures pull request acceptance, not a review gate; LinearB sells engineering analytics.', usedFor: 'First-time pass rates at review gates for AI-generated code.' },
    { id: 'forrester2025', short: 'Forrester TEI 2025', kind: 'vendor', title: 'The Total Economic Impact of OutSystems', by: 'Forrester Consulting for OutSystems', year: 2025, url: 'https://tei.forrester.com/go/Outsystems/DevelopmentPlatform/',
      says: 'A composite organisation saw 363% three-year ROI, payback under six months and development 60% faster than high-code, using a 10% discount rate and risk-adjusting benefits by 5% to 15%.',
      caveat: 'Commissioned by OutSystems; six customer interviews combined into one composite; the comparison is with traditional development, not AI-assisted development.', usedFor: 'The OutSystems speed claim and the 10% discount rate option; the only published evidence on OutSystems speed.' },
    { id: 'damodaran-wacc', short: 'Damodaran WACC 2026', kind: 'primary', title: 'Cost of capital by industry (US), January 2026', by: 'Aswath Damodaran, NYU Stern', year: 2026, url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html',
      says: 'Cost of capital: software (system and application) 9.34%, computer services 7.83%, information services 7.00%, total market 6.96%.',
      caveat: 'US companies; an industry average, not any one organisation\'s rate.', usedFor: 'The default 8% discount rate (inside the 7% to 9% band).' },
    { id: 'damodaran-margin', short: 'Damodaran margins 2026', kind: 'primary', title: 'Margins by industry (US), January 2026', by: 'Aswath Damodaran, NYU Stern', year: 2026, url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/margin.html',
      says: 'Total market gross margin 37.76% and EBITDA margin 16.56%; software (system and application) gross margin 71.72%; insurance (general) 44.70%.',
      caveat: 'Gross margin is not contribution margin; US companies.', usedFor: 'The default 30% contribution margin on revenue lines.' },
    { id: 'azure-prices', short: 'Azure retail prices', kind: 'primary', title: 'Azure Retail Prices API: Standard_D8s_v5, East US, Linux, pay-as-you-go', by: 'Microsoft', year: 2026, url: 'https://prices.azure.com/api/retail/prices',
      says: '8 vCPU / 32 GB virtual machine at US$0.384 an hour (about US$3,364 a year); ten nodes about US$33,640.',
      caveat: 'List price on demand; reserved and spot prices are lower; queried 3 November 2026.', usedFor: 'The Kubernetes worker nodes line (about US$34,000 a year).' },
    { id: 'aws-eks', short: 'AWS EKS and EBS pricing', kind: 'primary', title: 'Amazon EKS pricing; Amazon EBS pricing', by: 'Amazon Web Services', year: 2026, url: 'https://aws.amazon.com/eks/pricing/',
      says: 'EKS control plane US$0.10 per cluster per hour (about US$876 a year); EBS gp3 storage US$0.08 per GB-month (4 TB about US$3,840 a year).',
      caveat: 'List price; regions differ.', usedFor: 'The control-plane and storage lines.' },
    { id: 'secureframe', short: 'Secureframe SOC 2', kind: 'vendor', title: 'SOC 2 audit cost', by: 'Secureframe', year: 2025, url: 'https://secureframe.com/hub/soc-2/audit-cost.md',
      says: 'A SOC 2 audit alone costs an average of US$7,000 to US$100,000; the total with readiness, penetration testing and maintenance runs US$80,000 to US$350,000.',
      caveat: 'A compliance-software vendor; a wide range.', usedFor: 'The SOC 2 readiness and audit line (US$55,000).' },
    { id: 'datadog', short: 'Datadog pricing', kind: 'primary', title: 'Datadog pricing', by: 'Datadog', year: 2026, url: 'https://www.datadoghq.com/pricing/',
      says: 'APM from US$31 per host per month on annual billing (Infrastructure Pro US$15 per host per month).',
      caveat: 'List price for one product; other tools and tiers differ.', usedFor: 'The application performance monitoring line.' },
    { id: 'edana', short: 'Edana maintenance', kind: 'secondary', title: 'Estimating software maintenance costs', by: 'Edana', year: 2026, url: 'https://edana.ch/en/2026/01/03/estimating-software-maintenance-costs-the-forgotten-key-to-total-cost-of-ownership/',
      says: 'A common rule estimates annual maintenance at 15% to 25% of the initial development cost.',
      caveat: 'A consultancy article citing no primary source: a rule of thumb, not an analyst finding.', usedFor: 'The yearly run cost as a percentage of build cost.' },
    { id: 'copilot-plans', short: 'GitHub Copilot plans', kind: 'primary', title: 'Plans for GitHub Copilot', by: 'GitHub', year: 2026, url: 'https://docs.github.com/en/copilot/get-started/plans',
      says: 'Copilot Business US$19 and Enterprise US$39 per seat per month.',
      caveat: 'Pricing is credit-based; usage beyond the included credits is extra.', usedFor: 'AI tool licence cost per developer.' },
    { id: 'claude-costs', short: 'Claude Code costs', kind: 'vendor', title: 'Manage costs effectively (Claude Code)', by: 'Anthropic', year: 2026, url: 'https://code.claude.com/docs/en/costs',
      says: 'Average cost is around US$13 per developer per active day and US$150 to US$250 per developer per month.',
      caveat: 'The vendor\'s own average at API list price; multi-agent use costs more.', usedFor: 'AI token spend per developer.' },
    { id: 'ecb-fx', short: 'ECB reference rates', kind: 'primary', title: 'Euro foreign exchange reference rates, 2 November 2026', by: 'European Central Bank', year: 2026, url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
      says: 'Reference rates per euro for the date; converted to units per US dollar through the euro-dollar rate (1.1216) for AUD, JPY, SGD, NZD, HKD, KRW, MYR, THB, PHP, IDR, INR, GBP, CHF, ZAR, CAD, BRL and MXN.',
      caveat: 'The ECB does not publish TWD, VND, AED or SAR, so those keep earlier indicative values (AED and SAR are pegged to the dollar). Indicative only; not live rates.', usedFor: 'The currency table on the Defaults tab.' },
    { id: 'so2026', short: 'Stack Overflow 2026 pay', kind: 'vendor', title: 'Developer Survey 2026: compensation by country', by: 'Stack Overflow', year: 2026, url: 'https://survey.stackoverflow.co/2026/work/data/scatter-compensation-country',
      says: 'Median current total annual compensation of professional developers (US$, before tax, including bonus and perks): United States 154,000; Switzerland 139,262; Australia 104,550; United Kingdom 96,333; Canada 94,315; Germany 85,296; Netherlands 82,453; New Zealand 80,858; Spain 68,237; France 62,550; Portugal 61,413; Italy 47,766; Brazil 36,002; India 18,802.',
      caveat: 'Self-selected respondents who skew towards better-paid developers; includes bonus and perks; read through a page summary; 14 of the tool\'s 28 countries appear.', usedFor: 'The reference hourly rates: median pay x the country\'s loaded cost multiplier / 1,800 hours.' },
    { id: 'bls-ecec', short: 'BLS employer costs', kind: 'primary', title: 'Employer Costs for Employee Compensation', by: 'US Bureau of Labor Statistics', year: 2026, url: 'https://www.bls.gov/news.release/ecec.htm',
      says: 'In private industry wages and salaries were 70.0% of employer costs (June 2026), so total compensation is about 1.43 times wages; for information and professional occupations wages were 64.9%, about 1.54 times.',
      caveat: 'United States only; wages include paid leave.', usedFor: 'The loaded cost multiplier (employee cost divided by salary).' },
    { id: 'eurostat-labour', short: 'Eurostat labour costs', kind: 'primary', title: 'EU hourly labour costs ranged from EUR 11 to EUR 55 in 2024', by: 'Eurostat', year: 2025, url: 'https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20250328-1',
      says: 'Non-wage costs were 24.7% of total labour cost in the EU, 32.2% in France and 4.8% in Romania (2024), which is a multiplier of about 1.33 for the EU and 1.47 for France.',
      caveat: 'Firms with 10 or more staff; employer contributions and taxes net of subsidies.', usedFor: 'The loaded cost multiplier for European countries.' },
    { id: 'bls-ooh', short: 'BLS software developers', kind: 'primary', title: 'Occupational Outlook Handbook: Software Developers', by: 'US Bureau of Labor Statistics', year: 2026, url: 'https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm',
      says: 'Median annual wage of software developers, quality assurance analysts and testers was US$135,980 (May 2025); computer systems analysts US$105,850, information security analysts US$129,180, project management specialists US$102,320.',
      caveat: 'US occupations are proxies for the tool\'s roles. At a 1.45 multiplier and 1,800 hours a year the developer median is about US$110 an hour loaded, well above the tool\'s placeholder US rate.', usedFor: 'A check on the reference hourly rates and on role relativities.' },
    { id: 'robert-half-sg', short: 'Robert Half Singapore 2026', kind: 'vendor', title: 'Software engineer salary guide, Singapore', by: 'Robert Half', year: 2026, url: 'https://www.roberthalf.com/sg/en/job-details/software-engineer',
      says: 'Software engineer S$85,000 / S$105,000 / S$125,000 (25th, 50th and 75th percentile) excluding bonus and CPF; business analyst S$120,000, solutions architect S$145,000, DevOps engineer S$130,000.',
      caveat: 'A recruiter\'s guide; one country; midpoints not survey microdata.', usedFor: 'A check on the Singapore rate and on role relativities.' },
    { id: 'owid-hours', short: 'Annual hours worked (OWID)', kind: 'secondary', title: 'Annual working hours per worker', by: 'Our World in Data (Penn World Table)', year: 2023, url: 'https://ourworldindata.org/grapher/annual-working-hours-per-worker',
      says: 'Average hours actually worked per worker in 2023: United States 1,765, United Kingdom 1,668, Germany 1,386, France 1,505, Australia 1,727, Japan 1,691, Singapore 2,283, India 2,383.',
      caveat: 'Includes part-time and self-employed workers; the tool\'s 1,800 hours is a reasonable global default but overstates Germany and France.', usedFor: 'The productive hours per year behind hourly and annual conversions.' },
    { id: 'os-pricing', short: 'OutSystems pricing page', kind: 'primary', title: 'OutSystems pricing and editions', by: 'OutSystems', year: 2026, url: 'https://www.outsystems.com/pricing-and-editions/',
      says: 'Pricing is by Application Objects (a typical medium app is about 150) and starts at 100 internal users; the page lists no prices and asks for a custom quote.',
      caveat: 'No public list price exists, so licence amounts in the tool are placeholders to replace with a quote.', usedFor: 'The OutSystems platform licence and Sentry amounts.' },
    { id: 'os-sentry', short: 'OutSystems Sentry', kind: 'primary', title: 'OutSystems Sentry', by: 'OutSystems', year: 2026, url: 'https://www.outsystems.com/platform/security/sentry/',
      says: 'A security offering for OutSystems Developer Cloud covering SOC 2 Type II, HIPAA, PCI DSS, intrusion detection, malware scanning, audit-log streaming to a SIEM and IP filtering.',
      caveat: 'No price is published.', usedFor: 'What the Sentry option includes; its licence is a placeholder.' }
  ];

  /* Which input or line each source supports, by the same keys the Evidence page uses (dots as in the state). */
  var FOR = {
    rate: ['damodaran-wacc', 'forrester2025'],
    'platform.os': ['os-pricing'],
    'platform.sentry': ['os-pricing', 'os-sentry'],
    'tokens.saving': ['claude-costs', 'copilot-plans'],
    'run.alt': ['edana'],
    'run.os': ['edana'],
    altDevFactor: ['metr2025', 'github2022'],
    case: ['forrester2025']
  };

  function byId(id) { for (var i = 0; i < REFS.length; i++) if (REFS[i].id === id) return REFS[i]; return null; }
  /* A short bracketed citation for a tooltip: [Faros AI 2025; Veracode 2025]. */
  function cite(ids) { return '[' + (ids || []).map(function (i) { var r = byId(i); return r ? r.short : i; }).join('; ') + ']'; }
  function forKey(key) { return FOR[key] || []; }

  var api = { REFS: REFS, FOR: FOR, byId: byId, cite: cite, forKey: forKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVARefs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
