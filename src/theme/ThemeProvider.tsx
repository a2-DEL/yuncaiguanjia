import { useEffect, type ReactNode } from 'react'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useAppStore } from '@/store/appStore'
import { buildTheme } from './themeConfig'

dayjs.locale('zh-cn')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeMode, primaryColor } = useAppStore()

  useEffect(() => {
    const root = document.documentElement
    if (themeMode === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    root.style.setProperty('--brand-primary', primaryColor)
  }, [themeMode, primaryColor])

  return (
    <ConfigProvider locale={zhCN} theme={buildTheme(themeMode, primaryColor)}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
