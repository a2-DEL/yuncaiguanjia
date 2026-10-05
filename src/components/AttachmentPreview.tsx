import { useEffect, useState } from 'react'
import { Image, Button, Space, Empty } from 'antd'
import { DownloadOutlined, FileOutlined } from '@ant-design/icons'
import { db } from '@/db/database'
import type { Attachment } from '@/types/models'

interface ViewItem {
  id: string
  name: string
  size: number
  url: string
  isImage: boolean
}

/** 凭证附件列表/预览：图片内联预览，其他类型提供下载；自动释放 ObjectURL 避免内存泄漏 */
export function AttachmentPreview({ attachmentIds }: { attachmentIds: string[] }) {
  const [view, setView] = useState<ViewItem[]>([])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!attachmentIds.length) {
        if (active) setView([])
        return
      }
      const list = await db.attachments.bulkGet(attachmentIds)
      const valid = list.filter((x): x is Attachment => !!x)
      const items = valid.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        url: URL.createObjectURL(a.blob),
        isImage: a.type.startsWith('image/'),
      }))
      if (!active) {
        items.forEach((i) => URL.revokeObjectURL(i.url))
        return
      }
      setView(items)
    }
    run()
    return () => {
      active = false
      setView((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url))
        return []
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentIds.join(',')])

  if (!view.length) return <Empty description="无附件" image={Empty.PRESENTED_IMAGE_SIMPLE} />

  return (
    <Space wrap size={8}>
      {view.map((it) => (
        <div
          key={it.id}
          className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#16181d]"
        >
          {it.isImage ? (
            <Image src={it.url} width={40} height={40} className="rounded object-cover" />
          ) : (
            <FileOutlined className="text-[20px] text-ink-500 dark:text-white/60" />
          )}
          <div className="leading-tight">
            <div className="max-w-[160px] truncate text-[13px] text-ink-900 dark:text-white">{it.name}</div>
            <div className="text-[11px] text-ink-400">{it.size ? `${(it.size / 1024).toFixed(0)} KB` : ''}</div>
          </div>
          <Button size="small" type="link" icon={<DownloadOutlined />} href={it.url} download={it.name}>
            下载
          </Button>
        </div>
      ))}
    </Space>
  )
}
