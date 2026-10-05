/**
 * 人话记账：把员工/业务说的大白话，翻译成会计凭证草稿。
 *
 * 本地规则引擎优先（零 token）：
 *   "昨天打车花了86，微信付的" → 借 6602 交通费 86 / 贷 1002 银行存款-微信 86
 *   "买了2箱打印纸320，现金" → 借 6602 办公费 320 / 贷 1001 库存现金 320
 *
 * 识别不了的再调 LLM。这样 90% 常见业务不花钱。
 */
import { chat, extractJson, AiNotConfiguredError } from '../aiClient'

export type EntryDirection = 'expense' | 'purchase' | 'income' | 'credit_sale'

export interface ParsedPlainEntry {
  amount: number
  direction: EntryDirection   // 花钱(费用) / 进货未付款 / 客户打款
  categoryCode: string       // 对应科目
  categoryName: string
  payMethod: string          // 现金/微信/支付宝/银行/应付
  summary: string
  raw: string
  source: 'rule' | 'llm'
}

interface CategoryRule {
  keywords: string[]
  code: string
  name: string
}

/** 常用费用类别映射（覆盖 90% 小生意场景） */
const CATEGORY_RULES: CategoryRule[] = [
  { keywords: ['打车', '出租', '滴滴', '地铁', '公交', '高铁', '火车票', '机票', '飞机'], code: '6602.01', name: '交通费' },
  { keywords: ['吃饭', '餐费', '请客', '招待', '酒席', '聚餐'], code: '6602.02', name: '业务招待费' },
  { keywords: ['住宿', '酒店', '宾馆'], code: '6602.03', name: '差旅费-住宿' },
  { keywords: ['打印', '文具', '办公', '纸张', '墨盒', '耗材'], code: '6602.04', name: '办公费' },
  { keywords: ['房租', '租金', '摊位费', '物业'], code: '6602.05', name: '房租物业费' },
  { keywords: ['水电', '电费', '水费', '燃气'], code: '6602.06', name: '水电费' },
  { keywords: ['工资', '薪资', '发钱'], code: '2211.01', name: '应付职工薪酬' },
  { keywords: ['进货', '采购', '材料', '商品', '库存'], code: '1405', name: '库存商品' },
  { keywords: ['推广', '广告', '营销', '抖音', '百度推广'], code: '6601.01', name: '销售费用-广告费' },
]

/** 付款方式识别 */
function detectPayMethod(text: string): string {
  if (/微信/.test(text)) return '其他货币资金-微信'
  if (/支付宝/.test(text)) return '其他货币资金-支付宝'
  if (/现金/.test(text)) return '1001 库存现金'
  if (/银行卡|刷卡|银行转账|对公/.test(text)) return '1002 银行存款'
  return '1001 库存现金' // 默认现金
}

/** 抽金额：支持 86 / 86块 / 86元 / 1万2 / 3200 */
function detectAmount(text: string): number {
  // "1万2" → 12000
  const wan = text.match(/(\d+(?:\.\d+)?)\s*万\s*(\d+(?:\.\d+)?)?/)
  if (wan) {
    const head = parseFloat(wan[1]) * 10000
    const tail = wan[2] ? parseFloat(wan[2]) * 1000 : 0
    if (head + tail > 0) return head + tail
  }
  // 优先抓带金额单位的（元/块/圆/块钱），避免把"2箱"的 2 当成钱
  const withUnit = text.match(/(\d+(?:\.\d+)?)\s*(元|块钱|块|圆)/)
  if (withUnit) return parseFloat(withUnit[1])
  // 否则取最后一个数字（"320，现金"）
  const allNums = text.match(/\d+(?:\.\d+)?/g)
  if (allNums && allNums.length > 0) return parseFloat(allNums[allNums.length - 1])
  return 0
}

function detectCategory(text: string): CategoryRule | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule
  }
  return null
}

/** 纯规则版：不调 LLM */
export function parsePlainEntryRule(text: string): ParsedPlainEntry | null {
  const amount = detectAmount(text)
  if (amount <= 0) return null
  const cat = detectCategory(text)

  // 方向二：客户打款/收入
  if (/客户|收到|到账|打款|回款|卖|销售额/.test(text) && !/退|花|买/.test(text)) {
    // 但如果说"没付款/赊账/还没给"，是赊销不是收款
    if (/没付|未付|欠|还没给|赊账|挂账/.test(text)) {
      return {
        amount,
        direction: 'credit_sale',
        categoryCode: '6001',
        categoryName: '主营业务收入',
        payMethod: '1122 应收账款',
        summary: text.slice(0, 40),
        raw: text,
        source: 'rule',
      }
    }
    return {
      amount,
      direction: 'income',
      categoryCode: '6001',
      categoryName: '主营业务收入',
      payMethod: detectPayMethod(text),
      summary: text.slice(0, 40),
      raw: text,
      source: 'rule',
    }
  }

  if (!cat) return null

  // 方向二：进货未付款 → 贷应付账款
  const onCredit = /未付|没付|欠|还没给|挂账|下月付/.test(text)
  if (cat.code === '1405' && onCredit) {
    return {
      amount,
      direction: 'purchase',
      categoryCode: cat.code,
      categoryName: cat.name,
      payMethod: '2202 应付账款',
      summary: text.slice(0, 40),
      raw: text,
      source: 'rule',
    }
  }

  // 方向三：普通费用/采购已付款
  return {
    amount,
    direction: 'expense',
    categoryCode: cat.code,
    categoryName: cat.name,
    payMethod: detectPayMethod(text),
    summary: text.slice(0, 40),
    raw: text,
    source: 'rule',
  }
}

/** LLM 兜底：规则识别不了才调 */
async function parseByLlm(text: string): Promise<ParsedPlainEntry | null> {
  try {
    const raw = await chat(
      [
        {
          role: 'system',
          content: `你是小企业的记账员。把用户说的口语翻译成凭证字段。
仅输出 JSON：{"amount":数字,"categoryName":"简短类别","summary":"一句话摘要","payMethod":"现金/微信/支付宝/银行"}。
判断不了就返回空 amount。`,
        },
        { role: 'user', content: text },
      ],
      { json: true, temperature: 0.1 },
    )
    const obj = extractJson(raw) as { amount?: number; categoryName?: string; summary?: string; payMethod?: string }
    if (!obj.amount || obj.amount <= 0) return null
    return {
      amount: obj.amount,
      direction: 'expense',
      categoryCode: '6602.99',
      categoryName: obj.categoryName ?? '其他费用',
      payMethod: obj.payMethod === '微信' ? '其他货币资金-微信' : obj.payMethod === '支付宝' ? '其他货币资金-支付宝' : obj.payMethod === '银行' ? '1002 银行存款' : '1001 库存现金',
      summary: obj.summary ?? text.slice(0, 40),
      raw: text,
      source: 'llm',
    }
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return null
    return null
  }
}

/** 入口：先本地规则，识别不了再调 LLM，再不行返回 null */
export async function parsePlainEntry(text: string): Promise<ParsedPlainEntry | null> {
  const rule = parsePlainEntryRule(text)
  if (rule) return rule
  return parseByLlm(text)
}
