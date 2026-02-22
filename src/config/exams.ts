// =============================================================================
// EdTechia — Exams Configuration
// Central registry for all supported certifications.
// Each exam defines its persona, technical rules, and official topic list.
// Consumed by: /api/generate-question, ExamArena UI, InsightsPanel.
// =============================================================================

export type ExamTopic = {
  id: string;
  name: string;
};

export type ExamConfig = {
  id: string;
  title: string;
  /** Full system persona injected into the Gemini system prompt */
  persona: string;
  /** Technical rules (exam-specific) appended after the base rules */
  technicalRules: string;
  topics: ExamTopic[];
};

// ---------------------------------------------------------------------------
// Registered Exams
// ---------------------------------------------------------------------------

export const EXAMS_CONFIG: Record<string, ExamConfig> = {
  // ── GCP Professional Cloud Security Engineer ────────────────────────────
  "gcp-security-engineer": {
    id: "gcp-security-engineer",
    title: "Professional Cloud Security Engineer",
    persona:
      "Atue como um Arquiteto de Segurança Sênior do Google Cloud e Examinador Nível 5 (Expert). " +
      "O meu objetivo é passar na certificação GCP Professional Cloud Security Engineer. " +
      "Eu já domino a teoria básica, então NÃO me faça perguntas de definição.",
    technicalRules: `
1. CENÁRIOS FORENSES: A questão deve apresentar um problema real de produção.
   Use arquiteturas híbridas, Shared VPCs e múltiplos projetos.

2. CÓDIGO E LOGS OBRIGATÓRIOS: Inclua trechos de código na pergunta.
   O candidato deve analisar o código para achar a resposta. Use:
   - Apólices JSON de IAM avançadas (com IAM Conditions).
   - Regras de Google Workspace (Context-Aware Access, regras de DLP no Drive/Gmail).
   - Logs de VPC Service Controls (analisar um dry-run log para descobrir por que um IP tomou DENY).
   - YAML de Kubernetes (Pod Security Admission, RBAC, Network Policies).

3. CONFLITO DE REQUISITOS: As opções devem ser viáveis tecnicamente, mas apenas UMA
   atende a todas as restrições de COMPLIANCE, CUSTO ou ESCALA.

4. FOCO NOS PONTOS FRACOS:
   - Diferença exata de IPs do Private Google Access vs Restricted VIP vs Private Service Connect.
   - Cloud KMS (Rotação, CMEK vs CSEK, External Key Manager).
   - Cloud Armor (onde visualizar os logs exatos de bloqueio no Cloud Logging, não no fluxo da VPC).
   - Hierarquia de Org Policies e Firewall Hierárquico.
`,
    topics: [
      { id: "sec-1", name: "Section 1: Configuring access (IAM, Cloud Identity)" },
      { id: "sec-2", name: "Section 2: Securing communications and boundary protection (VPC, Firewalls)" },
      { id: "sec-3", name: "Section 3: Ensuring data protection (KMS, DLP, Encryption)" },
      { id: "sec-4", name: "Section 4: Managing operations (Logging, Monitoring, SCC)" },
      { id: "sec-5", name: "Section 5: Supporting compliance requirements" },
    ],
  },

  // ── GCP Professional Cloud Network Engineer ─────────────────────────────
  "gcp-network-engineer": {
    id: "gcp-network-engineer",
    title: "Professional Cloud Network Engineer",
    persona:
      "Atue como um Arquiteto de Redes Sênior do Google Cloud e Examinador Nível 5 (Expert). " +
      "O meu objetivo é passar na certificação GCP Professional Cloud Network Engineer. " +
      "Quero um simulado de altíssima dificuldade, espelhando a brutalidade do exame real.",
    technicalRules: `
1. APROFUNDAMENTO EM CDN E BGP: Crie questões envolvendo cabeçalhos reais
   (Cache-Control: public, max-age=3600, s-maxage=600), uso de Cache Tags para
   invalidação rápida, Vary headers, e limites de rotas BGP.

2. O LABIRINTO DE APIS: Exija escolhas entre IPs literais
   (199.36.153.8 vs 199.36.153.4) e Endpoints do Private Service Connect (PSC).

3. YAML E SRE: Coloque arquivos YAML de configuração de Load Balancers testando
   Canary Releases (Weighted Backend Services) e roteamento de tráfego.

4. FIREWALL NEXT-GEN: Teste a diferença entre Firewall de VPC vs Políticas
   Hierárquicas (com conflito de priorities) e os Tiers do Cloud NGFW
   (Essentials vs Standard com FQDN vs Enterprise com L7/IPS).

5. GKE E IPV6: Cenários de migração ou coexistência de clusters legados com
   novos clusters exigindo IPv6 (Dual-Stack, VPC-native, terminação no LB).

6. LIMITES: Inclua pegadinhas com limites de VPC Peering e limites de rotas BGP.
`,
    topics: [
      { id: "net-1", name: "Section 1: Designing and planning a GCP VPC network" },
      { id: "net-2", name: "Section 2: Implementing VPC networks (Subnets, Peering, IAM)" },
      { id: "net-3", name: "Section 3: Configuring managed network services (Cloud DNS, Load Balancing, Cloud NAT)" },
      { id: "net-4", name: "Section 4: Implementing hybrid network interconnectivity (Cloud VPN, Interconnect)" },
      { id: "net-5", name: "Section 5: Managing, monitoring, and troubleshooting network operations" },
      { id: "net-6", name: "Section 6: Configuring cloud network security (Firewalls, NGFW, IDS, Proxy)" },
    ],
  },

  // ── Associate Google Workspace Administrator ─────────────────────────────
  "workspace-admin": {
    id: "workspace-admin",
    title: "Associate Google Workspace Administrator",
    persona:
      "Atue como um Google Workspace Admin Lead (Enterprise) e Examinador Nível 5 (Expert). " +
      "O meu objetivo é passar na certificação Associate Google Workspace Administrator. " +
      "Eu NÃO quero perguntas de definição. Quero QUESTÕES FORENSES com evidências.",
    technicalRules: `
1. CENÁRIOS DE PRODUÇÃO: incidentes reais (migração, vazamento, phishing,
   retenção, offboarding, auditoria, governança).
   Use múltiplas OUs, grupos (dynamic/security), e delegação de admin roles.

2. EVIDÊNCIA OBRIGATÓRIA EM TODA QUESTÃO (inclua pelo menos 2 tipos):
   - Trechos de Email headers (SPF/DKIM/DMARC/Received) e/ou saída do Admin Toolbox.
   - Logs/entradas de auditoria e Investigation Tool (com campos e timestamps).
   - Pseudo-config de Admin Console (Gmail routing/compliance rules, Drive trust rules,
     DLP rule, Vault retention/holds).
   - Prints "textuais" de telas (descreva exatamente as opções marcadas, como se fosse um diff).

3. CONFLITO DE REQUISITOS: As 4 opções devem ser tecnicamente plausíveis, mas só 1
   atende simultaneamente: compliance + impacto em usuários + menor risco operacional
   + menor blast radius.

4. PEGADINHAS OBRIGATÓRIAS (rotacionar):
   - OU vs Group (e quando cada um governa políticas).
   - Vault retention vs Hold vs "Archive user license".
   - Drive sharing vs Shared Drives vs Trust Rules vs Target audiences.
   - DLP em Gmail/Drive/Chat (diferenças de capacidade e escopo).
   - Context-Aware Access vs Session Control vs 2SV enforcement.
   - Troubleshooting: Email Log Search, headers, Gmail routing, Drive for desktop, Meet quality tool.
   - Gemini for Workspace: enable/disable por OU + extensões + relatórios de uso.
`,
    topics: [
      { id: "ws-1", name: "Section 1: Managing user accounts, domains, and Directory" },
      { id: "ws-2", name: "Section 2: Configuring core services (Gmail, Calendar, Drive, Meet)" },
      { id: "ws-3", name: "Section 3: Configuring security and compliance (Vault, DLP, Access)" },
      { id: "ws-4", name: "Section 4: Troubleshooting and reporting (Audit logs, Email Search)" },
    ],
  },

  // ── Professional Cloud Developer ─────────────────────────────────────────
  "cloud-developer": {
    id: "cloud-developer",
    title: "Professional Cloud Developer",
    persona:
      "Atue como um Staff Software Engineer (Google Cloud) e Examinador Nível 5 (Expert). " +
      "Meu objetivo é passar na certificação Professional Cloud Developer. " +
      "Foque em decisões de engenharia de aplicação, integração, runtime, segurança aplicada, " +
      "observabilidade e debugging.",
    technicalRules: `
1. CENÁRIOS DE PRODUÇÃO (sempre): microserviços, eventos, APIs, deploy multi-ambiente
   (dev/stg/prod), incidentes.
   Misture Cloud Run, GKE, Apigee X, Pub/Sub, Cloud Tasks, Cloud SQL, Secret Manager,
   Artifact Registry, Cloud Build, Logging/Trace.

2. CÓDIGO/CONFIG/LOGS OBRIGATÓRIOS EM TODA QUESTÃO (inclua pelo menos 2):
   - Snippet de código (Python/Node/Java/Go) com bug sutil (auth, retries, idempotency, timeouts).
   - YAML (Cloud Build / Kubernetes / OpenAPI / Terraform snippet).
   - Log do Cloud Logging (com severity, traceId, httpRequest, status).
   - Config textual (Cloud Run concurrency, min/max instances, VPC connector, egress, service account).

3. CONFLITO DE REQUISITOS: 4 opções plausíveis; apenas 1 otimiza simultaneamente:
   confiabilidade + custo + segurança + simplicidade operacional.

4. ARMADILHAS QUE DEVEM APARECER (rotacionar):
   - Cloud Run: concurrency, CPU allocation, timeouts, retries, instance lifecycle, VPC egress.
   - Auth: service account vs user creds, ID token vs access token, audience, Apigee auth chain.
   - Eventing: Pub/Sub vs Tasks (ordering, retries, idempotency, DLQ).
   - GKE: readiness/liveness, HPA, RBAC, workload identity, network policies.
   - Observabilidade: Trace/Logs correlation, Error Reporting, SLO thinking.
`,
    topics: [
      { id: "dev-1", name: "Section 1: Designing highly scalable, available, reliable cloud-native apps" },
      { id: "dev-2", name: "Section 2: Building and testing applications (CI/CD, Cloud Build, Artifact Registry)" },
      { id: "dev-3", name: "Section 3: Deploying applications (Cloud Run, GKE, Serverless)" },
      { id: "dev-4", name: "Section 4: Integrating Google Cloud services (Pub/Sub, Cloud SQL, APIs)" },
      { id: "dev-5", name: "Section 5: Managing application performance monitoring (Trace, Profiler, Error Reporting)" },
    ],
  },

  // ── Google Certified Educator Level 1 ───────────────────────────────────
  "educator-level-1": {
    id: "educator-level-1",
    title: "Google Certified Educator Level 1",
    persona:
      "Atue como Google for Education Coach e Examinador Nível 5 (Expert), " +
      "focado no Google Certified Educator Level 1. " +
      "Eu NÃO quero teoria. Quero QUESTÕES PRÁTICAS com passos e pegadinhas de " +
      "permissão/compartilhamento/fluxo.",
    technicalRules: `
1. CENÁRIOS DE SALA DE AULA REAIS: professor, alunos, pais, coordenação,
   acessibilidade, avaliações, organização do Drive/Classroom.

2. "EVIDÊNCIA" OBRIGATÓRIA EM TODA QUESTÃO (mínimo 1, ideal 2):
   - Passos de UI (descritos) com 1–2 passos ERRADOS no meio (para o candidato detectar).
   - Estado de permissões (Viewer/Commenter/Editor, link sharing, ownership, Shared drives vs My Drive).
   - Trecho de configuração (Classroom assignment settings, Meet settings, Forms quiz settings).
   - Um objetivo pedagógico + restrição (tempo, privacidade, inclusão).

3. PEGADINHAS OBRIGATÓRIAS (rotacionar):
   - Qual ferramenta correta para a tarefa (Docs/Slides/Sheets/Forms/Sites/Classroom/Meet/Gmail/Calendar).
   - Sharing "link vs people", domínio vs externo, comentários vs edição.
   - Acessibilidade (captions, readable formatting, alt text / recursos equivalentes).
   - Organização: Drive estrutura, search no Gmail, naming e versioning.
`,
    topics: [
      { id: "edu1-1", name: "Create: Identify tools and create/format within them (Docs, Slides, Sites)" },
      { id: "edu1-2", name: "Share: Determine correct method and access for sharing" },
      { id: "edu1-3", name: "Communicate: Ongoing communication with stakeholders (Gmail, Meet, Chat)" },
      { id: "edu1-4", name: "Collaborate: Help students reflect and provide feedback (Classroom)" },
      { id: "edu1-5", name: "Organize: Manage, gather, and analyze (Drive, Sheets, Forms)" },
    ],
  },

  // ── Google Certified Educator Level 2 ───────────────────────────────────
  "educator-level-2": {
    id: "educator-level-2",
    title: "Google Certified Educator Level 2",
    persona:
      "Atue como Google for Education Trainer e Examinador Nível 5 (Expert), " +
      "focado no Google Certified Educator Level 2. " +
      "Quero cenários avançados de desenho instrucional, dados, diferenciação e escala " +
      "(várias turmas / escola inteira).",
    technicalRules: `
1. CENÁRIOS AVANÇADOS:
   - Diferenciação de atividades (grupos, ritmos, trilhas).
   - Avaliação formativa e análise de dados (Forms + Sheets, filtros, pivôs, tendências).
   - Projetos multimodais (Sites/Slides/Docs + rubricas).
   - Comunicação com stakeholders e governança de compartilhamento.

2. "EVIDÊNCIA" OBRIGATÓRIA EM TODA QUESTÃO (mínimo 2):
   - Pseudo-dados em Sheets (tabela pequena) + pergunta de análise/decisão.
   - Config de Forms (quiz, branching, feedback).
   - Config de Classroom (rubrics, originality reports, scheduling, student grouping).
   - Estado de permissões (incluindo risco de exposição).

3. CONFLITO DE REQUISITOS: 4 opções plausíveis; só 1 atende simultaneamente:
   impacto pedagógico + inclusão + privacidade + baixa fricção operacional.
`,
    topics: [
      { id: "edu2-1", name: "Promote Digital Citizenship and Safe Online Behavior" },
      { id: "edu2-2", name: "Analyze and Interpret Student Data (Sheets pivot tables, Forms analysis)" },
      { id: "edu2-3", name: "Personalize Learning and Differentiate Instruction" },
      { id: "edu2-4", name: "Design Interactive Curricula (Advanced Sites, multimedia)" },
      { id: "edu2-5", name: "Optimize Communication (Groups, Advanced Calendar booking)" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns all exam IDs and titles — used to populate navigation & dropdowns. */
export const EXAM_LIST = Object.values(EXAMS_CONFIG).map(({ id, title }) => ({
  id,
  title,
}));

/** Safe getter — throws if exam ID is unknown. */
export function getExamConfig(examId: string): ExamConfig {
  const config = EXAMS_CONFIG[examId];
  if (!config) {
    throw new Error(`Unknown exam ID: "${examId}". Register it in src/config/exams.ts`);
  }
  return config;
}
