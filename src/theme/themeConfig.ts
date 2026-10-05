import { theme, type ThemeConfig } from 'antd'
import type { ThemeMode } from '@/store/appStore'

export interface ThemePreset {
  key: string
  name: string
  color: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'blue', name: '商务蓝', color: '#1B5FE3' },
  { key: 'green', name: '墨绿', color: '#0E9F6E' },
  { key: 'indigo', name: '靛紫', color: '#5B5BD6' },
  { key: 'cyan', name: '湖青', color: '#0EA5E9' },
  { key: 'amber', name: '暖金', color: '#D97706' },
]

export function buildTheme(mode: ThemeMode, primaryColor: string): ThemeConfig {
  const isDark = mode === 'dark'
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: primaryColor,
      colorInfo: primaryColor,
      borderRadius: 8,
      fontSize: 14,
      fontFamily: 'PingFang SC, Microsoft YaHei, system-ui, sans-serif',
      colorBgLayout: isDark ? '#0f1115' : '#f4f6fa',
      colorSuccess: '#52C41A',
      colorWarning: '#FAAD14',
      colorError: '#FF4D4F',
      wireframe: false,
    },
    components: {
      Card: { borderRadiusLG: 14, boxShadowTertiary: '0 2px 12px 0 rgba(20,30,60,0.06)' },
      Layout: { headerBg: isDark ? '#16181d' : '#ffffff', siderBg: isDark ? '#111318' : '#0e1b33' },
      Menu: { darkItemBg: 'transparent', darkSubMenuItemBg: 'transparent' },
      Button: { borderRadius: 8, controlHeight: 36 },
      Table: { headerBg: isDark ? '#1b1e24' : '#f7f9fc', rowHoverBg: isDark ? '#1a1d23' : '#f0f6ff' },
      Modal: { borderRadiusLG: 14 },
    },
  }
}
