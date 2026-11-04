/* AVA SDLC capability map (prototype v0.3)
 * From an SDLC comparison of the two approaches ("The Software Delivery Lifecycle in the AI Era"). Each capability is rated for two approaches:
 *   N = Native (provided by the approach), A = Assisted (helped, but not owned), E = External (needs other tools or teams).
 * Columns per capability: [name, AI coding tools alone, OutSystems].
 * Transcribed by reading the colour-coded pages; check against the PDF before relying on any single cell.
 * Complexity footprint (from the same pages): typical stack 20+ technology components, 12+ skill domains, 15+ handoffs;
 * with AI coding tools 15+ / 8+ / 12+; OutSystems 6 / 5 / 4.
 */
(function (root) {
  'use strict';

  var PHASES = [
    { key: 'Ideate', caps: [['Business Discovery', 'N', 'E'], ['Requirements & Stories', 'A', 'E'], ['Process Discovery', 'E', 'E'], ['Business & Solution Feasibility', 'N', 'E'], ['Rapid Prototyping', 'N', 'N']] },
    { key: 'Design', caps: [['UX & User Journeys', 'A', 'A'], ['Application Architecture', 'A', 'N'], ['Data Modeling', 'A', 'N'], ['Integration & API Design', 'A', 'N'],
      ['Workflow / Process Design', 'A', 'N'], ['Agent & AI Design', 'A', 'N'], ['Security & Access Design', 'A', 'N']] },
    { key: 'Build', caps: [['UI Development', 'N', 'N'], ['Application Logic', 'N', 'N'], ['Data Layer', 'N', 'N'], ['Integrations & APIs', 'N', 'N'], ['Workflow & Automation', 'N', 'N'],
      ['Agent Development', 'N', 'N'], ['Agent / Tool Orchestration', 'N', 'N'], ['Code Gen & Refactoring', 'N', 'N'], ['Cross-Toolchain Orchestration', 'N', 'A']] },
    { key: 'Validate', caps: [['Functional Testing', 'N', 'A'], ['Integration Testing', 'N', 'A'], ['Regression Testing', 'A', 'A'], ['Performance Testing', 'A', 'E'],
      ['Security Review & Testing', 'E', 'A'], ['SAST / DAST / Penetration Testing', 'E', 'E'], ['Code Quality', 'A', 'N'], ['AI / Agent Evaluations', 'A', 'N'], ['Guardrails & AI Safety', 'A', 'N']] },
    { key: 'Deploy', caps: [['Source & Version Control', 'A', 'N'], ['CI/CD', 'A', 'N'], ['Environment Management', 'E', 'N'], ['Release Management', 'E', 'N'],
      ['Approvals & Promotion', 'E', 'A'], ['Configuration & Secrets', 'A', 'N'], ['Dependency Management', 'N', 'N'], ['Rollback & Recovery', 'A', 'N']] },
    { key: 'Operate', caps: [['Application Runtime', 'E', 'N'], ['Scaling & Availability', 'E', 'N'], ['Application Monitoring', 'E', 'N'], ['Logs & Error Tracking', 'E', 'N'],
      ['Performance Monitoring', 'E', 'N'], ['Agent Observability', 'E', 'N'], ['Agent / Tool Tracing', 'E', 'N'], ['Model Monitoring', 'E', 'N'],
      ['Runtime AI Token & Cost Monitoring', 'E', 'N'], ['Incident Management', 'E', 'A']] },
    { key: 'Evolve', caps: [['User Feedback & Analytics', 'A', 'A'], ['Change Impact Analysis', 'A', 'N'], ['Enhancement Development', 'N', 'N'], ['Refactoring', 'N', 'N'],
      ['Technical Debt Management', 'A', 'N'], ['Dependency Upgrades', 'A', 'N'], ['Application Lifecycle', 'E', 'N']] },
    { key: 'Enterprise trust & control', caps: [['Enterprise Context', 'A', 'N'], ['Architecture & Standards', 'N', 'N'], ['Security Controls', 'A', 'N'], ['Identity & Permissions', 'E', 'N'],
      ['Governance & Policies', 'E', 'N'], ['Compliance & Audit', 'E', 'N'], ['Observability', 'E', 'N']] }
  ];

  var FOOTPRINT = {
    typical: { label: 'Typical stack', components: '20+', skills: '12+', handoffs: '15+' },
    ai: { label: 'With AI coding tools', components: '15+', skills: '8+', handoffs: '12+' },
    os: { label: 'OutSystems', components: '6', skills: '5', handoffs: '4' }
  };

  /* How much of a capability still needs extra tools or people: native none, assisted half, external all (placeholder weights). */
  /* Why each capability is rated the way it is, for each approach: [AI coding tools, OutSystems]. Explanations are indicative (the ratings are from the SDLC comparison; the reasons are drawn from OutSystems material and ODC's published capabilities) and are to be checked by product. */
  var WHY = {
 "Business Discovery": [
  "AI can research the organisation, industry and market quickly, so most discovery work is something it does itself.",
  "OutSystems is not a discovery tool. Understanding the business problem happens before and outside the platform, in research, workshops and other tools."
 ],
 "Requirements & Stories": [
  "AI drafts requirements and user stories from notes and conversations, but people still own, refine and approve them.",
  "Requirements are captured in other tools (Jira, Confluence, workshops). Mentor can turn requirement documents into an app, but the requirements work itself is outside the platform."
 ],
 "Process Discovery": [
  "Understanding how work really flows through people and systems needs process mining and interviews, which coding tools do not do.",
  "The same: process mining and discovery are separate disciplines and tools. OutSystems builds the process once it is understood."
 ],
 "Business & Solution Feasibility": [
  "AI can quickly produce options, estimates and rough feasibility checks, so it carries much of this itself.",
  "Judging whether a business case or solution is feasible is done outside the platform, although a fast prototype helps to test it."
 ],
 "Rapid Prototyping": [
  "AI coding tools generate working prototypes from a prompt in minutes. This is their headline strength.",
  "Prototypes are generated and edited visually (Mentor, blueprint) and then become the real application on the same platform."
 ],
 "UX & User Journeys": [
  "AI generates screens and flows, but design judgement, user research and brand consistency stay with designers.",
  "OutSystems UI and AI-assisted screens help, but user research and journey design are still done by designers."
 ],
 "Application Architecture": [
  "AI proposes structure, but each change is judged on its own, so architecture drifts unless someone governs it.",
  "Architecture is guided by the platform: standard layers, a visual model and checks against the whole estate, so it stays consistent."
 ],
 "Data Modeling": [
  "AI can suggest schemas, but the team owns the database design, migrations and consistency.",
  "Entities and relationships are modelled visually and the platform creates and evolves the database."
 ],
 "Integration & API Design": [
  "AI drafts API contracts and clients, but the team designs, secures and maintains them.",
  "Integrations and APIs are defined in the model (REST, SOAP, connectors) with governed exposure."
 ],
 "Workflow / Process Design": [
  "AI can sketch a workflow in code, but the team has to choose, build and run a workflow engine.",
  "Workflows and processes are designed visually in the platform's workflow engine."
 ],
 "Agent & AI Design": [
  "AI can help design agents, but the framework, patterns and guardrails are assembled by the team.",
  "Agent Workbench gives a governed way to design agents, tools and guardrails."
 ],
 "Security & Access Design": [
  "AI can recommend patterns, but the team designs and reviews roles, permissions and controls.",
  "Roles, permissions and secure patterns are built into the platform and its visual model."
 ],
 "UI Development": [
  "AI coding tools generate front-end code quickly.",
  "Screens are built visually, with AI assistance, on a shared design system."
 ],
 "Application Logic": [
  "AI writes the business logic in code.",
  "Logic is built visually and with AI help, on a governed runtime."
 ],
 "Data Layer": [
  "AI generates data access code and queries.",
  "The data layer is generated from the model (entities, queries, aggregates)."
 ],
 "Integrations & APIs": [
  "AI generates integration code and API clients.",
  "Connectors and generated APIs, with built-in consumption and exposure."
 ],
 "Workflow & Automation": [
  "AI writes workflow and automation code.",
  "Workflows and automation are built in the platform."
 ],
 "Agent Development": [
  "AI coding tools write agent code and prompts well.",
  "Agents are built in Agent Workbench on the platform."
 ],
 "Agent / Tool Orchestration": [
  "AI can write the orchestration code between agents and tools.",
  "Agents and tools are orchestrated in the platform, using MCP and agent-to-agent protocols."
 ],
 "Code Gen & Refactoring": [
  "This is what AI coding tools do best.",
  "Mentor and AI assistance generate and refactor code inside the governed model."
 ],
 "Cross-Toolchain Orchestration": [
  "AI coding agents can drive many tools through MCP, scripts and pipelines, so they can orchestrate a toolchain.",
  "OutSystems brings most of the toolchain into one platform, but still works alongside external tools and AI coding agents, so this is assisted."
 ],
 "Functional Testing": [
  "AI can generate and run test cases quickly.",
  "Assisted: the platform and AI help with tests, but the team still designs and runs the test strategy, often with external tools."
 ],
 "Integration Testing": [
  "AI can write integration tests.",
  "Assisted: the platform helps test integrations, but the approach and tooling are the team's."
 ],
 "Regression Testing": [
  "AI can add tests, but keeping a regression suite reliable and maintained needs the team.",
  "Assisted: automated testing helps, but the suite still has to be built and maintained."
 ],
 "Performance Testing": [
  "AI can write load-test scripts, but realistic load and tuning need infrastructure and specialists.",
  "Done with external tools and teams. The platform scales, but it does not replace load testing."
 ],
 "Security Review & Testing": [
  "AI-generated code has to be reviewed and tested for flaws by security tools and people (about 45% of AI code samples contained security flaws).",
  "Assisted: built-in secure patterns and platform scanning reduce what reviewers must find, but a security review is still needed."
 ],
 "SAST / DAST / Penetration Testing": [
  "Static and dynamic scanning and penetration testing are separate tools and specialist services.",
  "Also external: scanning and penetration testing of the customer's own applications are separate tools and services."
 ],
 "Code Quality": [
  "AI can review code, but a team must set and enforce standards across the whole estate.",
  "The platform and AI code reviews check quality against standards, and a visual model is easier to review than thousands of generated lines."
 ],
 "AI / Agent Evaluations": [
  "AI can write evaluations, but the evaluation framework and scoring are assembled by the team.",
  "Agent Workbench includes evaluating agents (production evaluations are on the roadmap)."
 ],
 "Guardrails & AI Safety": [
  "Guardrails are assembled from separate libraries and services.",
  "Platform guardrails, such as prompt-injection blocking and PII masking, are built in."
 ],
 "Source & Version Control": [
  "Code lives in a repository the team sets up and governs. AI assists with commits and reviews.",
  "Versioning of the application model is built in."
 ],
 "CI/CD": [
  "AI can write pipelines, but the team builds, secures and maintains them.",
  "Built-in one-click CI/CD with deployment gates."
 ],
 "Environment Management": [
  "Dev, test and production environments, clusters and networking are separate infrastructure work.",
  "Stages and environments are part of the platform."
 ],
 "Release Management": [
  "Release coordination, versioning and rollout are separate tooling and process.",
  "Releases are promoted through the stages in the platform."
 ],
 "Approvals & Promotion": [
  "Approvals and promotion between environments are separate tools and processes.",
  "Assisted: the platform supports promotion with approvals, but the approval process itself is the organisation's."
 ],
 "Configuration & Secrets": [
  "AI can wire up configuration, but the team chooses and runs a secrets store.",
  "Settings and secrets management are built in."
 ],
 "Dependency Management": [
  "AI and package tooling handle dependencies and upgrades.",
  "The platform manages its own dependencies and libraries."
 ],
 "Rollback & Recovery": [
  "Rollback depends on the pipeline and infrastructure the team built.",
  "Application versions can be redeployed or rolled back from the platform."
 ],
 "Application Runtime": [
  "Code needs a runtime: servers, containers and clusters provided and run separately.",
  "Apps run on the ODC runtime (managed on PaaS)."
 ],
 "Scaling & Availability": [
  "Scaling and high availability are infrastructure the team builds and operates.",
  "Scaling and availability (including optional high availability) are part of the platform."
 ],
 "Application Monitoring": [
  "Monitoring tools are bought and configured separately.",
  "Built-in application monitoring and health, with telemetry sent to the customer's APM tool."
 ],
 "Logs & Error Tracking": [
  "Logging and error tracking are separate services.",
  "Logs and errors are captured by the platform."
 ],
 "Performance Monitoring": [
  "Performance monitoring (APM) is a separate tool and skill.",
  "Performance metrics and traces are available in the platform."
 ],
 "Agent Observability": [
  "Observing agents needs extra tooling.",
  "Agent Workbench provides observability of agent runs."
 ],
 "Agent / Tool Tracing": [
  "Tracing calls across agents and tools is custom work (nine hops in the Microsoft eGov build).",
  "Traces across agents and tools are part of the platform."
 ],
 "Model Monitoring": [
  "Monitoring model quality, drift and usage needs separate tooling.",
  "Model behaviour and usage are monitored through the platform."
 ],
 "Runtime AI Token & Cost Monitoring": [
  "Token spend arrives as a bill from each model provider, with no per-agent view.",
  "Usage and cost per agent are visible (per-agent budgets are on the roadmap)."
 ],
 "Incident Management": [
  "Incident tooling and on-call are separate.",
  "Assisted: the platform provides alerts and diagnostics, but incident management is the organisation's process and tooling."
 ],
 "User Feedback & Analytics": [
  "AI can add analytics code, but feedback and product analytics tools are separate.",
  "Assisted: usage data is available, but feedback and product analytics tools are usually separate."
 ],
 "Change Impact Analysis": [
  "AI can reason about a change, but it sees the code in front of it, not the whole estate.",
  "The platform knows dependencies across the estate and shows what a change will affect."
 ],
 "Enhancement Development": [
  "AI is strong at extending existing code.",
  "Changes are made in the same model and redeployed."
 ],
 "Refactoring": [
  "AI is strong at refactoring code.",
  "The platform supports refactoring inside the model."
 ],
 "Technical Debt Management": [
  "AI can flag debt, but there is no estate-wide view or enforcement.",
  "A governed model and standard components keep drift and debt visible."
 ],
 "Dependency Upgrades": [
  "Upgrades are AI-assisted but still tested and rolled out by the team.",
  "Platform and library upgrades come from OutSystems (evergreen)."
 ],
 "Application Lifecycle": [
  "Ownership, versions and retirement of applications need a separate catalogue and process.",
  "Applications are inventoried and managed through their lifecycle in the portal."
 ],
 "Enterprise Context": [
  "AI tools see only the context they are given.",
  "The enterprise context graph gives every route the same view of apps, data, integrations and policies."
 ],
 "Architecture & Standards": [
  "Standards can be written as rules and enforced through prompts and lint rules.",
  "Standards are enforced by the platform and its governed model."
 ],
 "Security Controls": [
  "AI can add controls, but the team assembles and verifies them.",
  "Security controls are built into the platform."
 ],
 "Identity & Permissions": [
  "Identity and access management is a separate system.",
  "Built-in identity and role-based permissions, with enterprise single sign-on."
 ],
 "Governance & Policies": [
  "Governing many AI-built apps and agents needs a separate programme and tooling.",
  "Portfolio governance, policies and approvals are part of the platform."
 ],
 "Compliance & Audit": [
  "Audit evidence is collected from separate tools.",
  "An audit trail and compliance support are built in (SOC 2 Type II, HIPAA and PCI attestations need Sentry)."
 ],
 "Observability": [
  "Enterprise-wide observability is separate tooling.",
  "Apps and agents are observable together through the platform and the customer's tools."
 ]
};
  function why(name, col) { var w = WHY[name]; return w ? w[col === 'ai' ? 0 : 1] : ''; }

  var WEIGHT = { N: 0, A: 0.5, E: 1 };

  var COL = { ai: 1, os: 2 };
  function counts(phase, col) {
    var c = { N: 0, A: 0, E: 0 };
    phase.caps.forEach(function (cap) { c[cap[COL[col]]]++; });
    return c;
  }
  /* Share of a phase's capabilities that still needs extra tools or people (0 to 1). */
  function share(phase, col) {
    var t = 0;
    phase.caps.forEach(function (cap) { t += WEIGHT[cap[COL[col]]]; });
    return phase.caps.length ? t / phase.caps.length : 0;
  }
  /* The share of the alternative's tooling or people still needed with OutSystems in a phase: OutSystems' residual relative to the
   * alternative's (AI coding tools). Null when the alternative itself needs nothing extra there, so there is no evidence either way. */
  function impliedOsShare(phase) {
    var a = share(phase, 'ai'), o = share(phase, 'os');
    return a > 0 ? Math.min(1, o / a) : null;
  }
  function byKey(key) { for (var i = 0; i < PHASES.length; i++) if (PHASES[i].key === key) return PHASES[i]; return null; }

  /* A first-cut assignment of tooling layers and operating roles to SDLC phases. */
  function phaseOfLayer(name) {
    var n = String(name).toLowerCase();
    if (n.indexOf('security') >= 0 || n.indexOf('authentication') >= 0 || n.indexOf('governance') >= 0) return 'Enterprise trust & control';
    if (n.indexOf('ci/cd') >= 0) return 'Deploy';
    if (n.indexOf('observability') >= 0 || n.indexOf('hosting') >= 0 || n.indexOf('ai agents') >= 0) return 'Operate';
    if (n.indexOf('front end') >= 0 || n.indexOf('storage') >= 0 || n.indexOf('integration') >= 0 || n.indexOf('workflow') >= 0) return 'Build';
    return 'Other';
  }
  function phaseOfRole(role) {
    return { arch: 'Operate', ops: 'Operate', sre: 'Operate', dba: 'Operate', net: 'Operate', qa: 'Deploy', sec: 'Enterprise trust & control', soc: 'Enterprise trust & control', grc: 'Enterprise trust & control', pm: 'Deploy', coach: 'Deploy' }[role] || 'Other';
  }

  /* Which phase of the capability map a delivery stage or review gate belongs to: design, build and deploy are themselves; integration testing, the test gate and rework are
   * Validate; the architecture and security reviews are the enterprise's controls. A gate someone adds is a control unless it is called a test. */
  var STAGE_PHASE = { design: 'Design', build: 'Build', integration: 'Validate', deploy: 'Deploy', test: 'Validate', rework: 'Validate', arch: 'Enterprise trust & control', sec: 'Enterprise trust & control' };
  function phaseOfStage(key, isGate) { return STAGE_PHASE[key] || (isGate ? 'Enterprise trust & control' : 'Build'); }

  var api = { phaseOfStage: phaseOfStage, STAGE_PHASE: STAGE_PHASE, why: why, PHASES: PHASES, FOOTPRINT: FOOTPRINT, WEIGHT: WEIGHT, counts: counts, share: share, impliedOsShare: impliedOsShare, byKey: byKey, phaseOfLayer: phaseOfLayer, phaseOfRole: phaseOfRole };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVASdlc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
