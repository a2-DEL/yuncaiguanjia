import { useEffect, useMemo, useState } from 'react'
import {
  Card, Form, Input, DatePicker, Button, InputNumber, Upload, App as AntdApp, Space, Tag, Divider, Drawer, Popconfirm, Table, Modal, Select,
} from 'antd'
import { PlusOutlined, SaveOutlined, CheckCircleOutlined, ArrowLeftOutlined, PaperClipOutlined, HistoryOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { SubjectTreeSelect } from '@/components/SubjectTreeSelect'
import { getVoucher, saveVoucher, updateVoucher, isBalanced, getVoucherVersions, restoreVoucherVersion } from '@/services/voucherService'
import { listAccounts } from '@/services/accountService'
import { getRate, currencyLabel } from '@/services/exchangeRateService'
import { isPeriodClosed } from '@/services/closingService'
import { listEntities, DEFAULT_ENTITY_ID } from '@/services/consolidationService'
import { db } from '@/db/database'
import { useUserStore } from '@/store/userStore'
import { uid, currentPeriod } from '@/utils/format'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import type { UploadFile } from 'antd'
import type { Account, Voucher, VoucherEntry, VoucherVersion, Entity } from '@/types/models'

export function VoucherEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const currentUser = useUserStore((s) => s.currentUser)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [savedAttachmentIds, setSavedAttachmentIds] = useState<string[]>([])
  const [accountMap, setAccountMap] = useState<Map<string, Account>>(new Map())
  const [entities, setEntities] = useState<Entity[]>([])
  const [versionOpen, setVersionOpen] = useState(false)
  const [versions, setVersions] = useState<VoucherVersion[]>([])
  const [versionLoading, setVersionLoading] = useState(false)
  const [viewSnap, setViewSnap] = useState<VoucherVersion | null>(null)

  const entries = Form.useWatch('entries', form) as
    | Array<{ summary?: string; accountCode?: string; debit?: number; credit?: number; currency?: string; exchangeRate?: number; foreignAmount?: number }>
    | undefined

  // 本位币金额（外币分录按汇率折算后参与借贷平衡校验）
  const { sumDebit, sumCredit } = useMemo(() => {
    const list = entries ?? []
    let d = 0
    let c = 0
    for (const e of list) {
      const acc = e.accountCode ? accountMap.get(e.accountCode) : undefined
      const rate = Number(e.exchangeRate) || 0
      const toBase = (v: number) => (acc?.currency && rate ? Math.round(v * rate * 100) / 100 : v)
      d += toBase(Number(e.debit) || 0)
      c += toBase(Number(e.credit) || 0)
    }
    return { sumDebit: d, sumCredit: c }
  }, [entries, accountMap])

  const balanced = Math.abs(sumDebit - sumCredit) < 0.005

  useEffect(() => {
    listAccounts().then((list) => setAccountMap(new Map(list.map((a) => [a.code, a]))))
    listEntities().then(setEntities)
  }, [])

  // 将凭证数据回填到表单（新增/编辑加载与版本恢复复用）
  const applyVoucherToForm = (v: Voucher) => {
    form.setFieldsValue({
      date: dayjs(v.date),
      remark: v.remark,
      entityId: v.entityId ?? DEFAULT_ENTITY_ID,
      entries: v.entries.map((e) => ({
        summary: e.summary,
        accountCode: e.accountCode,
        debit: e.currency ? (e.debit > 0 ? (e.foreignAmount ?? 0) : 0) : e.debit,
        credit: e.currency ? (e.credit > 0 ? (e.foreignAmount ?? 0) : 0) : e.credit,
        currency: e.currency,
        exchangeRate: e.exchangeRate,
        foreignAmount: e.foreignAmount,
      })),
    })
    setSavedAttachmentIds(v.attachments ?? [])
  }

  useEffect(() => {
    if (id) {
      getVoucher(id).then(async (v) => {
        if (v) {
          // 已结账期间的凭证禁止编辑
          if (await isPeriodClosed(v.period)) {
            message.error(`期间 ${v.period} 已结账，凭证已锁定，无法编辑`)
            navigate('/voucher')
            return
          }
          applyVoucherToForm(v)
        }
      })
    } else {
      form.setFieldsValue({
        date: dayjs(),
        entityId: DEFAULT_ENTITY_ID,
        entries: [{ summary: '', accountCode: undefined, debit: 0, credit: 0 }],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 外币科目：借方/贷方列填写的是原币，按汇率折算为本位币后存储
  const buildEntries = (): VoucherEntry[] =>
    (entries ?? [])
      .filter((e) => e.accountCode && (Number(e.debit) || Number(e.credit)))
      .map((e) => {
        const acc = accountMap.get(e.accountCode!)
        const fa = Number(e.debit) || Number(e.credit) || 0
        const rate = Number(e.exchangeRate) || 0
        if (acc?.currency && fa > 0 && rate > 0) {
          const base = Math.round(fa * rate * 100) / 100
          return {
            id: uid('e_'),
            summary: e.summary || '',
            accountCode: e.accountCode!,
            accountName: acc.name,
            debit: Number(e.debit) ? base : 0,
            credit: Number(e.credit) ? base : 0,
            currency: acc.currency,
            exchangeRate: rate,
            foreignAmount: fa,
          }
        }
        return {
          id: uid('e_'),
          summary: e.summary || '',
          accountCode: e.accountCode!,
          accountName: acc?.name ?? e.accountCode!,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0,
        }
      })

  // 选择外币科目后，按凭证日期自动带出最新汇率（可手动修改）
  const handleValuesChange = async (_changed: Record<string, unknown>, all: { date?: dayjs.Dayjs; entries?: any[] }) => {
    if (!(_changed.entries || _changed.date)) return
    const dateVal = all.date ? dayjs(all.date).format('YYYY-MM-DD') : currentPeriod()
    const list = all.entries || []
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e?.accountCode) continue
      const acc = accountMap.get(e.accountCode)
      if (!acc?.currency) continue
      const er = e.exchangeRate
      if (er === undefined || er === null || er === '' || Number(er) === 0) {
        const rate = await getRate(acc.currency, dateVal)
        if (rate != null) form.setFieldValue(['entries', i, 'exchangeRate'], rate)
      }
    }
  }

  const persistAttachments = async (existing: string[] = []): Promise<string[]> => {
    const ids: string[] = [...existing]
    for (const f of fileList) {
      const file = f.originFileObj
      if (file) {
        const attId = uid('att_')
        await db.attachments.add({
          id: attId,
          name: f.name ?? file.name,
          type: file.type,
          size: file.size,
          blob: file,
          createdAt: Date.now(),
        })
        ids.push(attId)
      }
    }
    return ids
  }

  const onSave = async (audit: boolean) => {
    try {
      const vals = await form.validateFields()
      // 外币科目分录必须有有效汇率
      for (const e of (vals.entries as any[]) ?? []) {
        if (!e.accountCode) continue
        const acc = accountMap.get(e.accountCode)
        if (acc?.currency && (Number(e.debit) || Number(e.credit)) && !(Number(e.exchangeRate) > 0)) {
          setSaving(false)
          message.error(`外币科目 ${e.accountCode} 需填写有效汇率，请在「汇率表」维护或手动填写`)
          return
        }
      }
      const built = buildEntries()
      if (built.length === 0) {
        message.error('请至少录入一条有效分录')
        return
      }
      if (!isBalanced(built)) {
        message.error('借贷金额不平衡，请检查')
        return
      }
      setSaving(true)
      const dateStr = (vals.date as dayjs.Dayjs).format('YYYY-MM-DD')
      const targetPeriod = dateStr.slice(0, 7)
      if (await isPeriodClosed(targetPeriod)) {
        setSaving(false)
        message.error(`期间 ${targetPeriod} 已结账，不能新增或修改该期凭证`)
        return
      }
      const attachmentIds = await persistAttachments(id ? savedAttachmentIds : [])
      const creator = currentUser?.name ?? '未命名'
      if (id) {
        await updateVoucher(id, {
          date: dateStr,
          period: dateStr.slice(0, 7),
          entries: built,
          remark: vals.remark,
          attachments: attachmentIds,
          entityId: vals.entityId,
        })
        message.success('凭证已更新')
      } else {
        const v = await saveVoucher({ date: dateStr, entries: built, remark: vals.remark, attachments: attachmentIds, creator, entityId: vals.entityId })
        if (audit) await import('@/services/voucherService').then((m) => m.auditVoucher(v.id))
        message.success(audit ? '已保存并审核' : '已保存为草稿')
      }
      setSaving(false)
      navigate('/voucher')
    } catch (err) {
      setSaving(false)
      console.error(err)
    }
  }

  const openVersions = async () => {
    if (!id) return
    setVersionLoading(true)
    setVersions(await getVoucherVersions(id))
    setVersionLoading(false)
    setVersionOpen(true)
  }

  const onRestoreVersion = async (versionId: string) => {
    if (!id) return
    await restoreVoucherVersion(versionId)
    const v = await getVoucher(id)
    if (v) applyVoucherToForm(v)
    setVersionOpen(false)
    message.success('已恢复到所选历史版本')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/voucher')}>返回</Button>
          <h1 className="text-[22px] font-semibold text-ink-900 dark:text-white">
            {id ? '编辑凭证' : '新增凭证'}
          </h1>
        </Space>
        <Space>
          {id && (
            <Button icon={<HistoryOutlined />} onClick={openVersions}>历史版本</Button>
          )}
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => onSave(false)}>保存草稿</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} loading={saving} onClick={() => onSave(true)}>
            保存并审核
          </Button>
        </Space>
      </div>

      <Card className="shadow-card">
        <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Form.Item name="date" label="凭证日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="制单人">
              <Input value={currentUser?.name ?? '未命名'} disabled />
            </Form.Item>
            <Form.Item name="entityId" label="账套 / 主体" rules={[{ required: true, message: '选择所属账套' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择所属账套"
                options={entities.map((e) => ({ value: e.id, label: `${e.name}（${currencyLabel(e.currency)}）` }))}
              />
            </Form.Item>
            <Form.Item label="借贷平衡">
              {balanced ? (
                <Tag color="success">已平衡 ¥{Math.max(sumDebit, sumCredit).toFixed(2)}</Tag>
              ) : (
                <Tag color="error">不平衡 借{sumDebit.toFixed(2)} / 贷{sumCredit.toFixed(2)}</Tag>
              )}
            </Form.Item>
          </div>

          <Divider orientation="left" plain>分录明细</Divider>
          <div className="mb-2 text-[12px] text-ink-500 dark:text-white/50">
            外币核算科目：借方 / 贷方列填写<span className="font-medium text-ink-700 dark:text-white/80">原币金额</span>，本位币按汇率自动折算；汇率依据「汇率表」自动带出，亦可手动修改。
          </div>

          <div className="grid grid-cols-12 gap-2 px-1 pb-2 text-[12px] font-medium text-ink-500 dark:text-white/50">
            <div className="col-span-3">摘要</div>
            <div className="col-span-4">会计科目</div>
            <div className="col-span-2 text-right">借方金额</div>
            <div className="col-span-2 text-right">贷方金额</div>
            <div className="col-span-1 text-center">操作</div>
          </div>

          <Form.List name="entries">
            {(fields, { add, remove }) => (
              <div className="space-y-2">
                {fields.map((field) => {
                  const e = entries?.[field.name]
                  const acc = e?.accountCode ? accountMap.get(e.accountCode) : undefined
                  const isFC = !!acc?.currency
                  const fa = Number(e?.debit) || Number(e?.credit) || 0
                  const rate = Number(e?.exchangeRate) || 0
                  const baseAmount = isFC && rate ? Math.round(fa * rate * 100) / 100 : fa
                  return (
                    <div key={field.key} className="grid grid-cols-12 items-start gap-2">
                      <Form.Item name={[field.name, 'summary']} className="col-span-3 !mb-0">
                        <Input placeholder="摘要" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'accountCode']} className="col-span-4 !mb-0" rules={[{ required: true, message: '选择科目' }]}>
                        <SubjectTreeSelect />
                      </Form.Item>
                      <Form.Item name={[field.name, 'debit']} className="col-span-2 !mb-0">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder={isFC ? '原币借' : '0.00'} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'credit']} className="col-span-2 !mb-0">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder={isFC ? '原币贷' : '0.00'} />
                      </Form.Item>
                      <button
                        type="button"
                        onClick={() => remove(field.name)}
                        className="col-span-1 mt-2 text-center text-ink-500 transition-colors hover:text-[#FF4D4F]"
                      >
                        删除
                      </button>
                      {isFC && (
                        <div className="col-span-12 -mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-500 dark:text-white/50">
                          <Tag color="purple">{currencyLabel(acc!.currency)}</Tag>
                          <span>汇率</span>
                          <Form.Item name={[field.name, 'exchangeRate']} className="!mb-0">
                            <InputNumber min={0} style={{ width: 96 }} placeholder="汇率" />
                          </Form.Item>
                          <span>
                            本位币 <span className="tabular-nums font-medium text-ink-700 dark:text-white/80">¥{baseAmount.toFixed(2)}</span>（自动折算）
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ summary: '', accountCode: undefined, debit: 0, credit: 0 })}>
                  添加分录
                </Button>
              </div>
            )}
          </Form.List>

          <Divider orientation="left" plain>附件与备注</Divider>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Upload
            fileList={fileList}
            beforeUpload={(f) => {
              setFileList((prev) => [...prev, { uid: uid(), name: f.name, originFileObj: f as unknown as File } as UploadFile])
              return false
            }}
            onRemove={(f) => setFileList((prev) => prev.filter((x) => x.uid !== f.uid))}
          >
            <Button icon={<PaperClipOutlined />}>上传附件（图片 / PDF）</Button>
          </Upload>
          {savedAttachmentIds.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[12px] text-ink-500 dark:text-white/50">已保存附件</div>
              <AttachmentPreview attachmentIds={savedAttachmentIds} />
            </div>
          )}
        </Form>
      </Card>

      <Drawer title="历史版本" width={520} open={versionOpen} onClose={() => setVersionOpen(false)}>
        {versionLoading ? (
          <div className="py-8 text-center text-ink-500">加载中…</div>
        ) : versions.length === 0 ? (
          <div className="py-8 text-center text-ink-400">暂无历史版本（保存或审核后自动生成）</div>
        ) : (
          <div className="space-y-3">
            {versions.map((ver) => (
              <Card key={ver.id} size="small" className="shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <Tag color="blue">第 {ver.version} 版</Tag>
                    <span className="ml-1 text-[12px] text-ink-500">
                      {dayjs(ver.time).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  <Space>
                    <Button size="small" onClick={() => setViewSnap(ver)}>查看</Button>
                    <Popconfirm
                      title="恢复到该版本？"
                      description="当前内容将自动先存为历史版本"
                      onConfirm={() => onRestoreVersion(ver.id)}
                    >
                      <Button size="small" type="primary">恢复</Button>
                    </Popconfirm>
                  </Space>
                </div>
                <div className="mt-1 truncate text-[12px] text-ink-400">
                  {ver.snapshot.voucherNo} · {ver.snapshot.entries.length} 条分录 · {ver.snapshot.remark || '无备注'}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Drawer>

      <Modal title="版本明细" open={!!viewSnap} onCancel={() => setViewSnap(null)} footer={null} width={680}>
        {viewSnap && (
          <Table
            size="small"
            pagination={false}
            dataSource={viewSnap.snapshot.entries}
            columns={[
              { title: '摘要', dataIndex: 'summary' },
              { title: '科目', render: (_: unknown, e: VoucherEntry) => `${e.accountCode} ${e.accountName}` },
              { title: '借', dataIndex: 'debit', align: 'right', render: (v: number) => (v ? v.toFixed(2) : '') },
              { title: '贷', dataIndex: 'credit', align: 'right', render: (v: number) => (v ? v.toFixed(2) : '') },
              {
                title: '原币',
                align: 'right',
                render: (_: unknown, e: VoucherEntry) =>
                  e.currency && e.foreignAmount ? `${currencyLabel(e.currency)} ${e.foreignAmount.toFixed(2)}` : '',
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
