import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { seedIfEmpty } from '@/db/seed'
import { db } from '@/db/database'
import './index.css'

async function registerApiSwIfEnabled() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  try {
    const rec = await db.settings.get('apiEnabled')
    if ((rec?.value as unknown as boolean) === true) {
      await navigator.serviceWorker.register('/finance-api-sw.js', { type: 'module' })
    }
  } catch (e) {
    console.warn('[api-sw] 注册失败', e)
  }
}

seedIfEmpty().then(() => {
  registerApiSwIfEnabled()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  )
})
