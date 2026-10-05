import { useState } from 'react'
import { Card, Button, Input, Space, Typography, App as AntdApp, Divider, Alert, Switch } from 'antd'
import { DownloadOutlined, UploadOutlined, SafetyCertificateOutlined, DatabaseOutlined } from '@ant-design/icons'
import {
  exportBackup, importBackup, downloadBackupFile, readBackupFile,
} from '@/services/backupService'

const { Title, Paragraph, Text } = Typography

export function BackupSettingsPage() {
  const { message, modal } = AntdApp.useApp()
  const [pwd, setPwd] = useState('')
  const [importPwd, setImportPwd] = useState('')
  const [encryptExport, setEncryptExport] = useState(true)
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    if (encryptExport && pwd.length < 6) {
      message.warning('加密密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const file = await exportBackup(encryptExport ? pwd : undefined)
      downloadBackupFile(file)
      message.success(encryptExport ? '已导出加密备份' : '已导出明文备份')
    } catch (e) {
      message.error((e as Error).message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (f: File) => {
    try {
      const file = await readBackupFile(f)
      modal.confirm({
        title: '确认恢复备份？',
        content: file.encrypted
          ? '该操作将清空并覆盖当前全部数据，且加密备份需输入正确密码。是否继续？'
          : '该操作将清空并覆盖当前全部数据，是否继续？',
        okText: '确认恢复',
        okButtonProps: { danger: true },
        onOk: async () => {
          setBusy(true)
          try {
            await importBackup(file, file.encrypted ? importPwd : undefined)
            message.success('备份已恢复，数据已覆盖')
          } catch (e) {
            message.error((e as Error).message || '恢复失败（密码错误或文件损坏）')
          } finally {
            setBusy(false)
          }
        },
      })
    } catch (e) {
      message.error('读取备份文件失败：' + (e as Error).message)
    }
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <SafetyCertificateOutlined style={{ fontSize: 22, color: '#1B5FE3' }} />
        <Title level={3} style={{ margin: 0 }}>数据备份与恢复</Title>
      </div>
      <Paragraph type="secondary">
        本系统数据完全保存在你本地浏览器（IndexedDB），不上传任何云端。建议定期导出备份，防止误删或换设备丢失。
      </Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="数据主权提示"
        description="加密备份的密码仅用于本地密钥派生，系统绝不存储你的密码；忘记密码将无法解密备份，请妥善保存。"
      />

      <Card size="small" title="导出备份" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Space>
              <Switch checked={encryptExport} onChange={setEncryptExport} />
              <Text>导出时加密（推荐）</Text>
            </Space>
            <div style={{ color: '#8a8f99', fontSize: 12, marginTop: 4 }}>
              开启后备份文件以 AES-GCM 加密，他人无法读取；关闭则为明文 JSON。
            </div>
          </div>
          {encryptExport && (
            <Input.Password
              placeholder="设置加密密码（至少 6 位）"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          )}
          <Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={handleExport}>
            导出备份文件
          </Button>
        </Space>
      </Card>

      <Card size="small" title="恢复备份">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ color: '#8a8f99', fontSize: 12 }}>
            选择此前导出的备份文件。若文件已加密，请在下方输入密码。恢复将覆盖当前全部数据。
          </div>
          <Input.Password
            placeholder="备份密码（若加密）"
            value={importPwd}
            onChange={(e) => setImportPwd(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <div>
            <Button icon={<UploadOutlined />} loading={busy} onClick={() => document.getElementById('backup-file-input')?.click()}>
              选择备份文件并恢复
            </Button>
            <input
              id="backup-file-input"
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImport(f)
                e.target.value = ''
              }}
            />
          </div>
        </Space>
      </Card>

      <Divider />
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        <DatabaseOutlined /> 备份包含全部账套数据：科目、凭证、往来、资产、报表设置等。
      </Paragraph>
    </div>
  )
}
