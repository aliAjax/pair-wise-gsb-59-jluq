import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AuditLog,
  Clarification,
  Clause,
  ComplianceStatus,
  ReviewDatabase,
  ReviewRole,
  ReviewerOpinion,
  SupplierResponse,
} from "./types";

const clauses: Clause[] = [
  {
    id: "C001",
    code: "A.1",
    title: "实施组织与项目计划",
    category: "实施能力",
    requirement:
      "投标人应明确项目组织、职责界面、实施方法、进度控制和风险应对机制。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 1,
  },
  {
    id: "C002",
    code: "A.1.1",
    title: "项目经理及关键人员",
    category: "实施能力",
    requirement:
      "项目经理应具备五年以上同类项目经验，关键人员配置应覆盖架构、开发、测试与安全。",
    type: "mandatory",
    weight: 0,
    parentId: "C001",
    evidenceRequired: true,
    order: 2,
  },
  {
    id: "C003",
    code: "A.1.2",
    title: "实施进度与里程碑",
    category: "实施能力",
    requirement:
      "提供可核验的里程碑、交付物、验收条件和资源投入计划。",
    type: "scoring",
    weight: 15,
    parentId: "C001",
    evidenceRequired: false,
    order: 3,
  },
  {
    id: "C004",
    code: "B.1",
    title: "技术架构与互操作性",
    category: "技术方案",
    requirement:
      "系统架构应支持模块化部署、横向扩展，并与采购人现有平台实现稳定互操作。",
    type: "scoring",
    weight: 25,
    evidenceRequired: true,
    order: 4,
  },
  {
    id: "C005",
    code: "B.1.1",
    title: "接口开放与标准协议",
    category: "技术方案",
    requirement:
      "对外接口应遵循 HTTPS、OAuth 2.0 和 OpenAPI 3.x，提供版本兼容与错误码说明。",
    type: "mandatory",
    weight: 0,
    parentId: "C004",
    evidenceRequired: true,
    order: 5,
  },
  {
    id: "C006",
    code: "B.1.2",
    title: "国产化兼容性",
    category: "技术方案",
    requirement:
      "提供操作系统、数据库、中间件及浏览器兼容性矩阵，并说明适配边界。",
    type: "scoring",
    weight: 15,
    parentId: "C004",
    evidenceRequired: true,
    order: 6,
  },
  {
    id: "C007",
    code: "C.1",
    title: "安全保障",
    category: "安全与合规",
    requirement:
      "技术方案应覆盖身份鉴别、访问控制、审计、数据保护和安全运维。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 7,
  },
  {
    id: "C008",
    code: "C.1.1",
    title: "等级保护三级证明材料",
    category: "安全与合规",
    requirement:
      "提供有效的网络安全等级保护三级备案证明或第三方测评结论。",
    type: "evidence",
    weight: 0,
    parentId: "C007",
    evidenceRequired: true,
    order: 8,
  },
  {
    id: "C009",
    code: "C.1.2",
    title: "漏洞响应机制",
    category: "安全与合规",
    requirement:
      "说明漏洞发现、分级、修复、复测和重大事件通报时限。",
    type: "scoring",
    weight: 15,
    parentId: "C007",
    evidenceRequired: false,
    order: 9,
  },
  {
    id: "C010",
    code: "D.1",
    title: "服务与培训",
    category: "服务保障",
    requirement:
      "提供驻场、巡检、培训、知识转移和故障升级的服务方案及量化响应指标。",
    type: "scoring",
    weight: 20,
    evidenceRequired: false,
    order: 10,
  },
  {
    id: "C011",
    code: "D.2",
    title: "验收指标",
    category: "服务保障",
    requirement:
      "验收指标应可测量、可复现，并与采购需求中的服务水平保持一致。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 11,
  },
];

const suppliers = [
  { id: "SUP-A", name: "华云数科" },
  { id: "SUP-B", name: "北辰信息" },
  { id: "SUP-C", name: "南岭科技" },
];

const responseOverrides: Record<
  string,
  Partial<
    Pick<
      SupplierResponse,
      "status" | "claimedScore" | "attachmentName" | "proofFingerprint"
    >
  >
> = {
  "C001-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "项目组织方案.pdf",
    proofFingerprint: "PROOF-PLAN-A",
  },
  "C001-SUP-B": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "实施组织与计划.pdf",
    proofFingerprint: "PROOF-PLAN-B",
  },
  "C001-SUP-C": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "项目管理说明.pdf",
    proofFingerprint: "PROOF-PLAN-C",
  },
  "C002-SUP-A": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "关键人员履历与社保材料.pdf",
    proofFingerprint: "PROOF-STAFF-A",
  },
  "C005-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "安全测评报告.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  "C005-SUP-B": {
    status: "deviation",
    claimedScore: 0,
    attachmentName: "接口兼容说明.pdf",
    proofFingerprint: "PROOF-API-B",
  },
  "C008-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "等保三级备案证明.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  "C008-SUP-B": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "等保材料说明.pdf",
    proofFingerprint: "PROOF-SEC-B",
  },
  "C010-SUP-B": {
    status: "compliant",
    claimedScore: 16,
    attachmentName: "服务方案.pdf",
    proofFingerprint: "PROOF-SERVICE-B",
  },
};

const reviewFactories: Array<{
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
}> = [
  {
    responseId: "C003-SUP-A",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 18,
    comment: "里程碑和交付物完整，风险缓冲充分，人员投入计划可核验。",
    createdAt: "2026-09-28T11:10:00+08:00",
  },
  {
    responseId: "C003-SUP-A",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "compliant",
    score: 10,
    comment: "计划完整，但关键人员投入比例未量化，按较低档计分。",
    createdAt: "2026-09-28T11:40:00+08:00",
  },
  {
    responseId: "C004-SUP-B",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 21,
    comment: "架构分层清晰，现有系统适配路径可验证。",
    createdAt: "2026-09-28T13:15:00+08:00",
  },
  {
    responseId: "C004-SUP-B",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "deviation",
    score: 15,
    comment: "高可用部署缺少跨机房切换演练记录。",
    createdAt: "2026-09-28T14:02:00+08:00",
  },
];

const clarifications: Clarification[] = [
  {
    id: "CL-001",
    responseId: "C002-SUP-A",
    clauseId: "C002",
    round: 1,
    requestText: "补充安全负责人近五年的同类项目合同页或验收证明。",
    requestedAt: "2026-09-27T09:00:00+08:00",
    dueAt: "2026-09-28T18:00:00+08:00",
    status: "overdue",
  },
  {
    id: "CL-002",
    responseId: "C008-SUP-B",
    clauseId: "C008",
    round: 1,
    requestText: "提供等保测评结论页及有效期说明。",
    requestedAt: "2026-09-28T14:30:00+08:00",
    dueAt: "2026-10-02T18:00:00+08:00",
    status: "open",
  },
  {
    id: "CL-003",
    responseId: "C009-SUP-C",
    clauseId: "C009",
    round: 2,
    requestText: "补充重大漏洞四小时通报的流程截图。",
    supplierResponse: "已补充值班表、升级路径和平台告警截图。",
    requestedAt: "2026-09-26T15:00:00+08:00",
    dueAt: "2026-09-28T18:00:00+08:00",
    respondedAt: "2026-09-27T14:20:00+08:00",
    status: "responded",
  },
];

const makeResponse = (
  clause: Clause,
  supplierIndex: number,
  clauseIndex: number,
): SupplierResponse => {
  const supplier = suppliers[supplierIndex];
  const id = `${clause.id}-${supplier.id}`;
  const defaultStatus: ComplianceStatus = clause.type === "mandatory" ? "compliant" : "pending";
  const maxScore = clause.weight;
  const scorePattern = [
    Math.round(maxScore * 0.8),
    Math.round(maxScore * 0.72),
    Math.round(maxScore * 0.64),
  ];
  const override = responseOverrides[id] ?? {};
  const responseClarifications = clarifications.filter(
    (item) => item.responseId === id,
  );
  // 每回复一轮澄清即开启新的评审批次，原批次意见失效、响应回到待复核。
  const reviewRound =
    1 +
    responseClarifications.filter(
      (item) => item.status === "responded",
    ).length;
  const base: SupplierResponse = {
    id,
    clauseId: clause.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    status: override.status ?? defaultStatus,
    responseText:
      clause.type === "mandatory"
        ? `${supplier.name}已按采购要求提交说明与支持材料。`
        : `${supplier.name}提交响应正文，并声明可满足条款要求，分值依据需评审员复核。`,
    claimedScore: override.claimedScore ?? scorePattern[supplierIndex] ?? 0,
    attachmentName:
      override.attachmentName ?? `${supplier.name}-${clause.code}-证明材料.pdf`,
    proofFingerprint:
      override.proofFingerprint ?? `PROOF-${clause.id}-${supplier.id}`,
    submittedBy: `${supplier.name}投标专员`,
    submittedAt: `2026-09-${String(22 + ((clauseIndex + supplierIndex) % 4)).padStart(2, "0")}T16:20:00+08:00`,
    reviewRound,
    reviews: [],
    clarifications: [],
  };
  base.reviews = reviewFactories
    .filter((item) => item.responseId === id)
    .map((item, index) => ({
      id: `OP-${id}-${index + 1}`,
      ...item,
      reviewRound: 1,
    }));
  base.clarifications = responseClarifications;
  return base;
};

const responses: SupplierResponse[] = clauses.flatMap((clause, clauseIndex) =>
  suppliers.map((_supplier, supplierIndex) =>
    makeResponse(clause, supplierIndex, clauseIndex),
  ),
);

const versions = [
  {
    id: "VER-001",
    version: "V1",
    label: "初审问题定位版本",
    status: "finalized" as const,
    createdAt: "2026-09-25T17:30:00+08:00",
    createdBy: "采购工作组",
    signedBy: ["采购负责人", "技术评审组长"],
    clauseCount: clauses.length,
    responseCount: responses.length,
    contentHash: "a84f2d17",
  },
  {
    id: "VER-002",
    version: "V2",
    label: "澄清与评分复核工作版",
    status: "draft" as const,
    createdAt: "2026-09-29T08:10:00+08:00",
    createdBy: "采购工作组",
    signedBy: [],
    clauseCount: clauses.length,
    responseCount: responses.length,
    contentHash: "d91c6b42",
  },
];

const auditLogs: AuditLog[] = [
  {
    id: "AUD-001",
    at: "2026-09-25T17:30:00+08:00",
    actor: "采购负责人",
    action: "版本定稿",
    entity: "VER-001",
    detail: "初审问题定位版本签署锁定，共覆盖 11 条技术条款。",
  },
  {
    id: "AUD-002",
    at: "2026-09-27T09:00:00+08:00",
    actor: "采购专员",
    action: "发起澄清",
    entity: "CL-001",
    detail: "要求华云数科补充关键人员项目经历证明。",
  },
  {
    id: "AUD-003",
    at: "2026-09-28T10:25:00+08:00",
    actor: "李评审",
    action: "提交独立意见",
    entity: "C002-SUP-A",
    detail: "建议待澄清，与陈评审的符合结论形成分歧。",
  },
  {
    id: "AUD-004",
    at: "2026-09-29T08:10:00+08:00",
    actor: "采购工作组",
    action: "创建工作版本",
    entity: "VER-002",
    detail: "创建 V2 工作版本，保留 V1 定稿快照。",
  },
];

const buildSeed = (): ReviewDatabase => ({
  clauses: structuredClone(clauses),
  responses: structuredClone(responses),
  versions: structuredClone(versions),
  auditLogs: structuredClone(auditLogs),
  suppliers: structuredClone(suppliers),
});

class ReviewDataStore {
  private readonly runtimePath = join(process.cwd(), "server", "runtime-data.json");
  private data: ReviewDatabase;
  private lastGoodSnapshot: ReviewDatabase;

  constructor() {
    if (existsSync(this.runtimePath)) {
      try {
        this.data = JSON.parse(
          readFileSync(this.runtimePath, "utf8"),
        ) as ReviewDatabase;
      } catch {
        this.data = buildSeed();
      }
    } else {
      this.data = buildSeed();
    }
    this.lastGoodSnapshot = this.data;
  }

  snapshot(): ReviewDatabase {
    return structuredClone(this.lastGoodSnapshot);
  }

  /**
   * 在完整快照副本上执行变更；只有持久化成功后才提交新快照。
   * 写入失败时回滚到上一完整快照，并重新落盘，保证下次启动一致。
   */
  mutate<T>(work: (database: ReviewDatabase) => T): T {
    const draft = structuredClone(this.lastGoodSnapshot);
    const result = work(draft);
    const serialized = JSON.stringify(draft, null, 2);
    try {
      writeFileSync(this.runtimePath, serialized, "utf8");
    } catch (error) {
      try {
        writeFileSync(
          this.runtimePath,
          JSON.stringify(this.lastGoodSnapshot, null, 2),
          "utf8",
        );
      } catch {
        // 回滚落盘同样失败时仍保留内存中的上一完整快照。
      }
      this.data = this.lastGoodSnapshot;
      throw new Error(
        `评审数据写入失败，已恢复上一完整快照：${
          error instanceof Error ? error.message : "未知错误"
        }`,
      );
    }
    this.data = draft;
    this.lastGoodSnapshot = draft;
    return result;
  }

  reset(): ReviewDatabase {
    this.data = buildSeed();
    this.lastGoodSnapshot = this.data;
    writeFileSync(this.runtimePath, JSON.stringify(this.data, null, 2), "utf8");
    return this.snapshot();
  }
}

export const reviewDataStore = new ReviewDataStore();

export const createAudit = (
  database: ReviewDatabase,
  actor: string,
  action: string,
  entity: string,
  detail: string,
): void => {
  database.auditLogs.unshift({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor,
    action,
    entity,
    detail,
  });
};

export const createOpinionId = (): string =>
  `OP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createClarificationId = (): string =>
  `CL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
