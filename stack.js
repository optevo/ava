/* AVA stack map (prototype v0.5): what is in the box with OutSystems ODC, and what you would need from Microsoft Azure, AWS or Google Cloud for an equivalent build.
 *
 * Sources: OutSystems material on the Azure equivalents (the "closest OutSystems equivalent" column), ODC security by design and the Sentry offering
 * (what is built in), and the ODC self-hosted requirements (what the client provides when self-managed). The AWS and Google Cloud names are the usual equivalent
 * services, written from general knowledge: indicative, and to be checked by a specialist for any real design.
 *
 * status: 'box'  = in the box (included in the OutSystems licence)
 *         'host' = in the box on PaaS; the organisation provides it when ODC is self-managed
 *         'byo'  = ODC has something, but most organisations bring their own, funded outside OutSystems
 *         'out'  = not provided by OutSystems: always funded outside it
 * infra: which line of the infrastructure table (matched by words in its name) pays for it, so this table agrees with the infrastructure cost.
 */
(function (root) {
  'use strict';

  var PROVIDERS = [
    { key: 'azure', label: 'Microsoft Azure' },
    { key: 'aws', label: 'AWS' },
    { key: 'gcp', label: 'Google Cloud' }
  ];
  var STATUS = {
    box: { label: 'In the box', help: 'Included in the OutSystems licence.' },
    host: { label: 'In the box (PaaS)', help: 'Included with ODC PaaS. When ODC is self-managed, the organisation provides and pays for it.' },
    provide: { label: 'You provide', help: 'With ODC self-managed the organisation provides and pays for this from its cloud provider, as in a cloud-native build. With ODC PaaS it is in the box.' },
    byo: { label: 'Bring your own', help: 'ODC has something built in, but most organisations connect their own, which they already fund outside OutSystems.' },
    out: { label: 'Not provided', help: 'OutSystems does not provide this. It is always funded outside OutSystems, whichever option is chosen.' }
  };

  function b(group, name, status, odc, azure, aws, gcp, infra) {
    return { group: group, name: name, status: status, odc: odc, svc: { azure: azure, aws: aws, gcp: gcp }, infra: infra || null };
  }
  var BLOCKS = [
    b('Run and host', 'Application runtime and hosting', 'host', 'ODC application runtime on managed Kubernetes', 'App Service or AKS', 'App Runner, ECS or EKS', 'Cloud Run or GKE', 'worker nodes'),
    b('Run and host', 'Kubernetes control plane', 'host', 'Not needed on PaaS. Self-managed ODC runs on your own conformant cluster', 'AKS', 'EKS', 'GKE', 'control plane'),
    b('Run and host', 'Edge: CDN, web firewall, load balancing, DNS', 'host', 'CDN, web application firewall and DDoS protection built in (PaaS). Self-managed: your load balancer and DNS', 'Front Door, Application Gateway, Azure DNS', 'CloudFront, AWS WAF, Elastic Load Balancing, Route 53', 'Cloud CDN, Cloud Armor, Cloud Load Balancing, Cloud DNS', 'load balancer'),
    b('Run and host', 'Container registry', 'host', 'Built in (PaaS). Self-managed: an OCI registry you provide', 'Azure Container Registry', 'Amazon ECR', 'Artifact Registry', 'registry'),
    b('Run and host', 'Storage, backup and network egress', 'host', 'File storage and 30-day backups built in (PaaS)', 'Blob Storage, Azure Backup', 'S3, AWS Backup', 'Cloud Storage, Backup and DR', 'storage'),
    b('Run and host', 'Landing zone: network, policy and security baseline', 'host', 'Not needed on PaaS (ODC is SaaS). Relevant when self-managed', 'Azure landing zone', 'AWS Control Tower landing zone', 'Google Cloud landing zone', null),
    b('Data', 'Relational database', 'host', 'PostgreSQL for each stage (managed on PaaS; self-managed: your PostgreSQL 16)', 'Azure Database for PostgreSQL or SQL Database', 'RDS or Aurora PostgreSQL', 'Cloud SQL or AlloyDB for PostgreSQL', 'postgresql'),
    b('Data', 'Specialised databases (NoSQL, graph, time series, search)', 'out', 'Not provided. ODC data (PostgreSQL, with vector support) covers most needs, including high-volume case state. Add a specialised database only if the use case needs one', 'Cosmos DB, Azure AI Search', 'DynamoDB, Neptune, OpenSearch', 'Firestore, Bigtable, Spanner, Vertex AI Search', null),
    b('Data', 'Analytics and data platform', 'out', 'None. Connect the customer\'s own analytics stack', 'Microsoft Fabric, Synapse', 'Redshift, Athena, QuickSight', 'BigQuery, Looker', null),
    b('Integrate and automate', 'APIs and API gateway', 'box', 'API exposure and consumption built in', 'API Management', 'API Gateway', 'Apigee or API Gateway', null),
    b('Integrate and automate', 'Serverless code and workflow', 'box', 'Server actions, services and the ODC workflow engine', 'Functions, Durable Functions, Logic Apps, Power Automate', 'Lambda, Step Functions', 'Cloud Run functions, Workflows', null),
    b('Integrate and automate', 'Events and messaging', 'box', 'Platform event bus built in', 'Event Grid, Service Bus', 'EventBridge, SNS, SQS', 'Pub/Sub, Eventarc', null),
    b('Integrate and automate', 'CI/CD, source control and environments', 'box', 'Versioning and one-click promotion from Dev to QA to Prod, built in', 'GitHub Actions, Azure DevOps', 'CodePipeline, CodeBuild', 'Cloud Build, Cloud Deploy', null),
    b('Identity and security', 'Staff identity and single sign-on', 'byo', 'A built-in identity service exists, but most organisations connect their own OIDC provider (required when self-managed)', 'Microsoft Entra ID', 'IAM Identity Center, or Okta and others', 'Cloud Identity, Google Workspace', 'identity'),
    b('Identity and security', 'Customer and citizen identity', 'byo', 'An external identity provider connects over OIDC', 'Entra External ID', 'Amazon Cognito', 'Identity Platform', null),
    b('Identity and security', 'Secrets and keys', 'box', 'Secrets management built in', 'Key Vault', 'Secrets Manager, KMS', 'Secret Manager, Cloud KMS', null),
    b('Identity and security', 'Threat detection and compliance attestation', 'box', 'Base security is built in. Intrusion detection, runtime monitoring, malware scanning and SOC 2, HIPAA and PCI attestation need Sentry (PaaS only)', 'Defender for Cloud', 'GuardDuty, Inspector, Security Hub', 'Security Command Center', 'assure'),
    b('Observe and govern', 'Application monitoring and tracing (APM)', 'byo', 'Telemetry is streamed to the customer\'s APM tool (OpenTelemetry), which the customer funds', 'Azure Monitor, Application Insights', 'CloudWatch, X-Ray', 'Cloud Monitoring, Cloud Trace', 'apm'),
    b('Observe and govern', 'SIEM, audit logs and retention', 'byo', 'The audit trail can be streamed to the customer\'s SIEM (Sentry), which the customer funds', 'Microsoft Sentinel, Purview', 'Security Lake, OpenSearch, or a third-party SIEM', 'Chronicle, Cloud Logging', null),
    b('Observe and govern', 'Governance and application inventory', 'box', 'ODC Portal: applications, environments, roles, deployments and audit trail', 'Purview, Power Platform admin centre', 'Control Tower, Config', 'Dataplex, organisation policies', null),
    b('AI', 'Agent runtime and orchestration', 'box', 'Agent Workbench', 'Foundry Agent Service', 'Bedrock Agents or AgentCore', 'Vertex AI Agent Builder', null),
    b('AI', 'Search and retrieval for agents', 'box', 'Knowledge in Agent Workbench', 'Foundry IQ, Azure AI Search', 'Amazon Kendra, OpenSearch', 'Vertex AI Search', null),
    b('AI', 'AI models (LLMs)', 'out', 'Not provided. The customer connects its own model provider and pays it. OutSystems does not sell tokens (it aims to reduce how many are used)', 'Foundry Models (Azure OpenAI, Claude)', 'Amazon Bedrock', 'Vertex AI (Gemini, Claude)', 'tokens')
  ];

  /* What the organisation has to fund outside OutSystems whichever option it chooses. cost: how this tool accounts for it. */
  var OUTSIDE = [
    { name: 'AI models (LLMs)', why: 'OutSystems does not provide or resell models. The customer connects its own provider and pays per token. The platform aims to reduce token use, which the model treats as a saving on AI build tokens.', cost: 'tokens' },
    { name: 'Specialised databases', why: 'ODC includes PostgreSQL (with vector support) only. A document, graph, time-series or search database, if the use case needs one, is bought separately.', cost: 'none' },
    { name: 'Enterprise identity provider', why: 'ODC has a built-in identity service, but most organisations already run their own (Entra ID, Okta, Ping) and connect it over OIDC. Self-managed ODC requires one.', cost: 'identity' },
    { name: 'Application monitoring (APM) and SIEM', why: 'Platform telemetry and, with Sentry, the audit trail are streamed to the customer\'s own monitoring and security tools, which the customer funds and staffs.', cost: 'apm' },
    { name: 'Analytics and data platform', why: 'No equivalent in the box. The customer\'s own analytics stack is used.', cost: 'none' },
    { name: 'Private connectivity and enterprise networking', why: 'Reaching on-premises or private systems (VPN, express routes, DNS, firewalls) is the customer\'s network, even when ODC offers a private gateway.', cost: 'none' }
  ];

  /* The status that applies for a hosting choice: a block marked 'host' is in the box with PaaS and is yours to provide when ODC is self-managed. */
  function effective(block, hosting) { return block.status === 'host' ? (hosting === 'self' ? 'provide' : 'box') : block.status; }
  function counts(hosting) {
    var c = { box: 0, provide: 0, byo: 0, out: 0, host: 0 };
    BLOCKS.forEach(function (x) { c[hosting === undefined ? x.status : effective(x, hosting)]++; });
    return c;
  }
  /* The capability matrix on Infrastructure > Compare: one row per capability, one mark for each OutSystems configuration.
   * in = included in the licence; add = available as an extra OutSystems licence; you = the organisation provides and pays; no = not provided by OutSystems.
   * Marks come from the building blocks above (matched by the start of the name) so the matrix and the stack map cannot disagree.
   * Sentry is PaaS only (ODC Sentry Offering), so self-managed ODC has no Sentry: the organisation brings its own security tooling. */
  var MARKS = { in: { sym: '\u2713', label: 'Included' }, add: { sym: '+', label: 'Extra licence' }, you: { sym: '$', label: 'You provide and pay' }, no: { sym: '\u2717', label: 'Not provided' } };
  /* Rows with a ref take their marks from the building block of that name; rows with their own marks are the high-assurance features, which are what Sentry adds
   * (OutSystems' description of the Sentry offering, June 2025, and of ODC security by design). On PaaS they need the Sentry licence; self-managed ODC has no Sentry, so the organisation
   * provides each one itself. */
  var BASE = 'Platform and operations', HA = 'High assurance: what Sentry adds (self-managed: you do it yourself)';
  var HAM = { paas: 'add', sentry: 'in', self: 'you' };
  var MATRIX_ROWS = [
    { group: BASE, label: 'Application runtime and hosting', ref: 'Application runtime' },
    { group: BASE, label: 'Database', ref: 'Relational database' },
    { group: BASE, label: 'CDN, web firewall and DDoS protection', ref: 'Edge:' },
    { group: BASE, label: 'Storage and backups', ref: 'Storage, backup' },
    { group: BASE, label: 'APIs, workflow and events', ref: 'APIs and API' },
    { group: BASE, label: 'CI/CD and environments', ref: 'CI/CD' },
    { group: BASE, label: 'Secrets and keys', ref: 'Secrets and keys' },
    { group: BASE, label: 'Staff identity and single sign-on', ref: 'Staff identity' },
    { group: BASE, label: 'Application monitoring (APM)', ref: 'Application monitoring' },
    { group: BASE, label: 'AI agents (Agent Workbench)', ref: 'Agent runtime' },
    { group: BASE, label: 'AI models (LLMs)', ref: 'AI models' },
    { group: HA, label: 'Network intrusion detection', marks: HAM, note: 'Detects hostile traffic and lateral movement on the platform network, with internal monitoring for access-control problems and advanced persistent threats.' },
    { group: HA, label: 'Runtime and platform integrity monitoring', marks: HAM, note: 'Watches containers and hosts at run time for unexpected change, so tampering is caught while the workload is running.' },
    { group: HA, label: 'Malware scanning of containers and hosts', marks: HAM, note: 'Real-time scanning for malware, viruses, ransomware and crypto-mining in containers and hosts, kept up to date by OutSystems.' },
    { group: HA, label: '24x7 monitoring of network and shared infrastructure', marks: HAM, note: 'Round-the-clock monitoring of the network and shared infrastructure by the OutSystems security team. Self-managed: your own security operations, or a managed detection and response service.' },
    { group: HA, label: 'Inbound IP filtering (no VPN needed)', marks: HAM, note: 'Restrict who can reach your applications by IP address, without setting up a VPN.' },
    { group: HA, label: 'Audit-trail streaming to your SIEM, with chosen retention', marks: HAM, note: 'The platform audit trail is streamed to your own security information and event management tool and kept for as long as you choose. The SIEM itself is always funded by the customer.' },
    { group: HA, label: 'SOC 2 Type II attestation', marks: HAM, note: 'Contractually valid SOC 2 Type II coverage applies only to tenants with Sentry enabled (the audit scope wrapper). Self-managed: your own readiness work and annual audit.' },
    { group: HA, label: 'HIPAA and PCI-DSS compliance support', marks: HAM, note: 'Controls and attestation support for HIPAA and PCI-DSS. You must still develop applications according to each framework. Self-managed: your own assessment and attestation.' },
    { group: HA, label: 'SOC 1, ENS (Spain), ACN (Italy), DESC (UAE)', marks: HAM, note: 'Further compliance frameworks covered with Sentry. Self-managed: your own assessment for each one you need.' }
  ];
  function blockFor(prefix) { return BLOCKS.filter(function (x) { return x.name.indexOf(prefix) === 0; })[0]; }
  function markOf(block, hosting) { var e = effective(block, hosting); return e === 'box' ? 'in' : e === 'out' ? 'no' : 'you'; }   // provide and bring-your-own are both at the organisation's expense
  function matrix() {
    return MATRIX_ROWS.map(function (r) {
      var b = blockFor(r.ref);
      return { group: r.group, label: r.label, note: r.note || (b ? b.odc : ''), marks: r.marks || { paas: markOf(b, 'paas'), sentry: markOf(b, 'paas-sentry'), self: markOf(b, 'self') } };
    });
  }
  var api = { MARKS: MARKS, MATRIX_ROWS: MATRIX_ROWS, matrix: matrix, PROVIDERS: PROVIDERS, STATUS: STATUS, BLOCKS: BLOCKS, OUTSIDE: OUTSIDE, counts: counts, effective: effective };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVAStack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
