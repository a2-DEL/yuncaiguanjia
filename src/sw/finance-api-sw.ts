/// <reference lib="webworker" />
import { resolveReadonly } from './apiRoutes'

const sw = self as unknown as ServiceWorkerGlobalScope

sw.addEventListener('install', () => {
  sw.skipWaiting()
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim())
})

sw.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  // 仅拦截同源的 /api/v1/* 只读请求，其余放行（页面/静态资源不受影响）
  if (url.origin === sw.location.origin && url.pathname.startsWith('/api/v1/')) {
    event.respondWith(handle(event.request))
  }
})

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const result = await resolveReadonly({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}
