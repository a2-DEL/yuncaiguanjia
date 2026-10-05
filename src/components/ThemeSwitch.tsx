import { useState } from 'react'
import { Button, Popover, Tooltip, theme as antdTheme } from 'antd'
import { SunOutlined, MoonOutlined, BgColorsOutlined } from '@ant-design/icons'
import { useAppStore } from '@/store/appStore'
import { THEME_PRESETS } from '@/theme/themeConfig'

export function ThemeSwitch() {
  const { themeMode, toggleThemeMode, primaryColor, setPrimaryColor } = useAppStore()
  const { token } = antdTheme.useToken()
  const [open, setOpen] = useState(false)

  const palette = (
    <div className="grid grid-cols-5 gap-2 p-1">
      {THEME_PRESETS.map((p) => (
        <Tooltip key={p.key} title={p.name}>
          <button
            onClick={() => {
              setPrimaryColor(p.color)
              setOpen(false)
            }}
            className="h-7 w-7 rounded-full transition-transform hover:scale-110 cursor-pointer"
            style={{
              background: p.color,
              outline: primaryColor === p.color ? `2px solid ${token.colorText}` : 'none',
              outlineOffset: 2,
            }}
          />
        </Tooltip>
      ))}
    </div>
  )

  return (
    <div className="flex items-center gap-1">
      <Tooltip title={themeMode === 'light' ? '切换深色' : '切换浅色'}>
        <Button
          type="text"
          shape="circle"
          icon={themeMode === 'light' ? <MoonOutlined /> : <SunOutlined />}
          onClick={toggleThemeMode}
        />
      </Tooltip>
      <Popover content={palette} trigger="click" open={open} onOpenChange={setOpen} title="主题色">
        <Tooltip title="主题色">
          <Button type="text" shape="circle" icon={<BgColorsOutlined />} />
        </Tooltip>
      </Popover>
    </div>
  )
}
