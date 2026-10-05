/**
 * Agent 岗位注册中心：定义数字员工的"岗位说明书"。
 *
 * 核心原则：每个 Agent 只精通一件事，权限严格对应岗位职责。
 * 这是把财务内控的"不相容职务分离"翻译成 Agent 工具权限——
 * 出纳 Agent 永远不能生成收入成本凭证，审核 Agent 永远只能读不能写。
 */
import type { AgentMode, AgentRoleKey } from '@/types/models'

export interface AgentRoleMeta {
  key: AgentRoleKey
  title: string          // 岗位名
  oneliner: string       // 一句话职责
  canWrite: boolean      // 是否有写权限（审核 Agent 永远 false）
  defaultMode: AgentMode // 默认介入强度
  /** 它不应该做的事（边界），给 system prompt 用 */
  boundary: string
}

export const AGENT_ROLES: AgentRoleMeta[] = [
  {
    key: 'bookkeeper',
    title: '记账专员',
    oneliner: '把口语描述转成借贷平衡的凭证草稿',
    canWrite: true,
    defaultMode: 'review',
    boundary: '你只生成凭证草稿，绝不审核、绝不修改已审核凭证。拿不准科目就标 warning。',
  },
  {
    key: 'auditor',
    title: '审核主管',
    oneliner: '扫描凭证找问题，只能提意见，不能改账',
    canWrite: false,
    defaultMode: 'suggest',
    boundary: '你只有只读权限。发现问题只能列出 issue 和建议，绝不能直接修改或删除任何凭证。',
  },
  {
    key: 'cashier',
    title: '出纳专员',
    oneliner: '登记银行/现金流水，自动联动生成资金凭证',
    canWrite: true,
    defaultMode: 'review',
    boundary: '你只处理资金类科目（1001 库存现金 / 1002 银行存款），绝不碰收入、成本、费用类科目。',
  },
  {
    key: 'taxer',
    title: '税务专员',
    oneliner: '算税、盯申报期、提醒免税临界点',
    canWrite: false,
    defaultMode: 'suggest',
    boundary: '你只算税和提醒，绝不替用户点"申报"——那是法律责任，必须人自己去税务局系统操作。',
  },
  {
    key: 'watcher',
    title: '经营参谋',
    oneliner: '看全局数据，给老板提经营建议和风险预警',
    canWrite: false,
    defaultMode: 'suggest',
    boundary: '你给老板看未来和风险，不做账、不录凭证。你的建议必须基于具体数字，不要空泛。',
  },
  {
    key: 'reporter',
    title: '报表参谋',
    oneliner: '把会计报表翻译成老板看得懂的大白话',
    canWrite: false,
    defaultMode: 'suggest',
    boundary: '你只解释数字，不做经营决策建议。不确定就说"需要财务复核"。',
  },
]

export function getAgentRole(key: AgentRoleKey): AgentRoleMeta {
  return AGENT_ROLES.find((r) => r.key === key) ?? AGENT_ROLES[0]
}

/** 各档位的中文标签 */
export const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  auto: '全自动（干完直接生效，事后留痕）',
  review: '待批（推荐：先出草稿，人确认才落库）',
  suggest: '仅建议（只给意见，不生成数据）',
}
