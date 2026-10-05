import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/models'

interface UserState {
  currentUser: User | null
  setCurrentUser: (u: User) => void
  logout: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (u) => set({ currentUser: u }),
      logout: () => set({ currentUser: null }),
    }),
    { name: 'finance-user-store' },
  ),
)
