// 单元测试全局初始化：注入 fake-indexeddb，使 Dexie 在 Node 环境下可运行
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

// happy-dom 不实现 SubtleCrypto，补充 Web Crypto 以保证加密相关单测可运行
if (!(globalThis as any).crypto?.subtle) {
  ;(globalThis as any).crypto = webcrypto
}
