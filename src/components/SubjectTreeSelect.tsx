import { useEffect, useState } from 'react'
import { TreeSelect } from 'antd'
import { buildAccountTree, type TreeNode } from '@/services/accountService'

interface Props {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

/** 科目树选择，支持搜索（科目智能匹配），仅末级可选 */
export function SubjectTreeSelect({ value, onChange, placeholder = '选择会计科目', disabled }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    buildAccountTree().then((t) => {
      setTree(t)
      setLoading(false)
    })
  }, [])

  return (
    <TreeSelect
      treeData={tree}
      value={value}
      onChange={(v) => onChange?.(v as string)}
      showSearch
      treeNodeFilterProp="title"
      treeDefaultExpandAll
      placeholder={placeholder}
      loading={loading}
      disabled={disabled}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
    />
  )
}
