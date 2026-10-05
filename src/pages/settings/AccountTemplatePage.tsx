import { useState } from 'react'
import { Card, Button, Tag, App as AntdApp, Typography, Row, Col } from 'antd'
import { applyTemplate, ACCOUNT_TEMPLATES } from '@/services/accountTemplateService'

const { Title, Paragraph, Text } = Typography

export function AccountTemplatePage() {
  const { message } = AntdApp.useApp()
  const [busyId, setBusyId] = useState<string | null>(null)

  const apply = async (id: string, name: string) => {
    setBusyId(id)
    try {
      const n = await applyTemplate(id)
      message.success(n > 0 ? `已为「${name}」新增 ${n} 个科目` : `「${name}」科目已存在，无需新增`)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <Title level={3}>科目模板市场</Title>
      <Paragraph type="secondary">一键套用行业预设科目表，快速搭建账套。仅新增当前缺失的科目，不会覆盖已有科目。</Paragraph>

      <Row gutter={[16, 16]}>
        {ACCOUNT_TEMPLATES.map((t) => (
          <Col xs={24} md={12} lg={8} key={t.id}>
            <Card size="small" title={t.name}>
              <Paragraph type="secondary" style={{ minHeight: 44 }}>{t.description}</Paragraph>
              <div style={{ marginBottom: 12 }}>
                {t.accounts.slice(0, 6).map((a) => <Tag key={a.code}>{a.code} {a.name}</Tag>)}
                {t.accounts.length > 6 && <Tag>+{t.accounts.length - 6}</Tag>}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>共 {t.accounts.length} 个科目</Text>
              <div style={{ marginTop: 12 }}>
                <Button type="primary" loading={busyId === t.id} onClick={() => apply(t.id, t.name)}>应用模板</Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
