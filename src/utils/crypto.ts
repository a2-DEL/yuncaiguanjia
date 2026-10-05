/**
 * 本地加密工具：基于浏览器原生 Web Crypto（AES-GCM + PBKDF2），不引入第三方加密库。
 * 用于备份文件加密，密码仅在本地派生密钥，绝不持久化。
 */

async function getSubtle(): Promise<SubtleCrypto> {
  const g = globalThis as any
  if (g.crypto?.subtle) return g.crypto.subtle
  if (typeof window === 'undefined') {
    const { webcrypto } = await import('node:crypto')
    return webcrypto.subtle as any
  }
  throw new Error('当前环境不支持 Web Crypto')
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function bytesToStr(b: ArrayBuffer): string {
  return new TextDecoder().decode(b)
}

export interface EncryptedBlob {
  salt: string
  iv: string
  data: string // base64 密文
}

/** 由密码与随机盐派生 AES-GCM 密钥 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = await getSubtle()
  const baseKey = await subtle.importKey('raw', strToBytes(password) as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 加密明文，返回 salt/iv/密文（base64） */
export async function encryptText(plain: string, password: string): Promise<EncryptedBlob> {
  const subtle = await getSubtle()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, strToBytes(plain) as BufferSource)
  return { salt: bufToBase64(salt.buffer), iv: bufToBase64(iv.buffer), data: bufToBase64(ct) }
}

/** 解密，密码错误会抛异常（GCM 认证失败） */
export async function decryptText(blob: EncryptedBlob, password: string): Promise<string> {
  const subtle = await getSubtle()
  const salt = new Uint8Array(base64ToBuf(blob.salt))
  const iv = new Uint8Array(base64ToBuf(blob.iv))
  const key = await deriveKey(password, salt)
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, base64ToBuf(blob.data) as BufferSource)
  return bytesToStr(pt)
}

/** 对消息做 HMAC-SHA256 签名，返回十六进制摘要（用于 Webhook 验签） */
export async function hmacSha256(message: string, secret: string): Promise<string> {
  const subtle = await getSubtle()
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(message) as BufferSource)
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 对消息做 SHA-256 摘要，返回十六进制字符串（用于审计日志哈希链） */
export async function sha256Hex(message: string): Promise<string> {
  const subtle = await getSubtle()
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(message) as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
