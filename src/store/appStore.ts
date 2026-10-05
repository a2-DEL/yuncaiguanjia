import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

interface AppState {
  collapsed: boolean
  themeMode: ThemeMode
  primaryColor: string
  setCollapsed: (v: boolean) => void
  toggleCollapsed: () => void
  setThemeMode: (m: ThemeMode) => void
  toggleThemeMode: () => void
  setPrimaryColor: (c: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      collapsed: false,
      themeMode: 'light',
      primaryColor: '#1B5FE3',
      setCollapsed: (v) => set({ collapsed: v }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setThemeMode: (m) => set({ themeMode: m }),
      toggleThemeMode: () =>
        set((s) => ({ themeMode: s.themeMode === 'light' ? 'dark' : 'light' })),
      setPrimaryColor: (c) => set({ primaryColor: c }),
    }),
    { name: 'finance-app-store' },
  ),
)
