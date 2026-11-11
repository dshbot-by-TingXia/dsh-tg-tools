// Telegram 工具配置：路径、默认值、读写，以及 chat 白名单。
//
// token 读取顺序：
//   1. tg-tools-config.json 的 botToken
//   2. 环境变量 TG_TOOLS_BOT_TOKEN
//   3. ~/.dsh/.env 里的 TG_TOOLS_BOT_TOKEN
//   4. 环境变量 / ~/.dsh/.env 里的 TELEGRAM_BOT_TOKEN（兼容按这个变量名配置的其他程序）
//
// 如果要开 pollEnabled，必须保证没有别的程序用同一个 bot token 轮询，
// 否则 Telegram 会对同一个 token 的两个 getUpdates 返回 409 Conflict。

import {
  existsSync, readFileSync, writeFileSync, mkdirSync, renameSync,
  openSync, closeSync, writeSync, fstatSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const CFG_PATH = join(DSH_HOME, 'tg-tools-config.json')
export const STATE_PATH = join(DSH_HOME, 'tg-tools-state.json')
const DIAG_PATH = join(DSH_HOME, 'tg-tools-diag.log')

const DEFAULT_CFG = {
  apiBase: 'https://api.telegram.org',
  botToken: '',
  targetSession: '',
  chats: [],
  historyLimit: 50,
  maxHistoryLimit: 200,
  pollEnabled: false,
  pollTimeout: 25,
  wakeOnPrivate: true,
  wakeOnMention: true,
  wakeAll: false,
  wakeChats: [],
  timeoutMs: 10000,
}

// 诊断日志：宿主 logger + 本地文件。
// 文件按 2MB × 3 轮转，创建时权限 600——日志里有 chat id、发送者和消息摘要，
// 不能让同机其他账号读到，也不能无限长。
const DIAG_MAX_BYTES = 2 * 1024 * 1024
const DIAG_KEEP = 3

let logger = null
let diagFd = null
let diagWrites = 0

// 宿主 cordis 的 logger；拿不到就只用文件。
export function bindLogger(ctx) {
  try {
    const candidate = (ctx && ctx.logger) || (ctx && typeof ctx.get === 'function' ? ctx.get('logger') : null)
    if (candidate && typeof candidate.info === 'function') logger = candidate
  } catch (error) {}
}

function openDiag() {
  if (diagFd !== null) return diagFd
  try {
    mkdirSync(DSH_HOME, { recursive: true })
    diagFd = openSync(DIAG_PATH, 'a', 0o600)
  } catch (error) {
    diagFd = null
  }
  return diagFd
}

function rotateDiag() {
  try {
    if (diagFd !== null) closeSync(diagFd)
  } catch (error) {}
  diagFd = null
  try {
    for (let i = DIAG_KEEP - 1; i >= 1; i--) {
      const from = i === 1 ? DIAG_PATH : DIAG_PATH + '.' + (i - 1)
      const to = DIAG_PATH + '.' + i
      if (existsSync(from)) renameSync(from, to)
    }
  } catch (error) {}
}

export function diag(message, level = 'info') {
  const text = String(message == null ? '' : message).slice(0, 2000)
  if (logger) {
    try {
      const fn = typeof logger[level] === 'function' ? logger[level] : logger.info
      if (typeof fn === 'function') fn.call(logger, 'tg-tools: ' + text)
    } catch (error) {}
  }
  try {
    let fd = openDiag()
    if (fd === null) return
    if (++diagWrites % 64 === 1) {
      try {
        if (fstatSync(fd).size > DIAG_MAX_BYTES) {
          rotateDiag()
          fd = openDiag()
          if (fd === null) return
        }
      } catch (error) {}
    }
    writeSync(fd, new Date().toISOString() + '  ' + text + '\n')
  } catch (error) {}
}

function readDotEnv() {
  const out = {}
  try {
    const text = readFileSync(join(DSH_HOME, '.env'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let value = m[2]
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      out[m[1]] = value
    }
  } catch (error) {}
  return out
}

function normalizeChatList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((x) => String(x == null ? '' : x).trim())
    .filter((x) => x.length > 0)
    .slice(0, 200)
}

export function ensureCfg() {
  try {
    if (existsSync(CFG_PATH)) return
    mkdirSync(DSH_HOME, { recursive: true })
    writeFileSync(CFG_PATH, JSON.stringify(DEFAULT_CFG, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    diag('已创建配置：' + CFG_PATH)
  } catch (error) {}
}

// 16 个工具组件每 3 秒各 tick 一次，每次都 readFileSync 配置和 .env 太浪费；
// 1 秒 TTL 让这些 tick 命中内存，saveCfg 立即失效。
const CFG_TTL_MS = 1000
let cfgCache = null
let cfgCacheAt = 0

export function loadCfgCached() {
  const now = Date.now()
  if (cfgCache !== null && now - cfgCacheAt < CFG_TTL_MS) return cfgCache
  cfgCache = loadCfg()
  cfgCacheAt = now
  return cfgCache
}

export function loadCfg() {
  let raw = {}
  try {
    const parsed = JSON.parse(readFileSync(CFG_PATH, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed
  } catch (error) {}

  const out = { ...DEFAULT_CFG, ...raw }
  const dotEnv = readDotEnv()
  out.botToken = String(
    out.botToken ||
    process.env.TG_TOOLS_BOT_TOKEN ||
    dotEnv.TG_TOOLS_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    dotEnv.TELEGRAM_BOT_TOKEN ||
    '',
  ).trim()
  out.apiBase = String(out.apiBase || DEFAULT_CFG.apiBase).replace(/\/+$/, '')
  out.chats = normalizeChatList(out.chats)
  out.wakeChats = normalizeChatList(out.wakeChats)
  out.historyLimit = Math.max(1, Math.min(Number(out.historyLimit) || 50, 200))
  out.maxHistoryLimit = Math.max(out.historyLimit, Math.min(Number(out.maxHistoryLimit) || 200, 200))
  out.pollTimeout = Math.max(1, Math.min(Number(out.pollTimeout) || 25, 50))
  out.timeoutMs = Math.max(3000, Math.min(Number(out.timeoutMs) || 10000, 30000))
  out.pollEnabled = out.pollEnabled === true
  out.wakeOnPrivate = out.wakeOnPrivate !== false
  out.wakeOnMention = out.wakeOnMention !== false
  out.wakeAll = out.wakeAll === true
  return out
}

// 只覆盖传进来的字段，其余原样保留；先写临时文件再换名，避免写坏 JSON。
export function saveCfg(patch) {
  ensureCfg()
  let current = {}
  try {
    const parsed = JSON.parse(readFileSync(CFG_PATH, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed
  } catch (error) {}
  const next = { ...current, ...(patch && typeof patch === 'object' ? patch : {}) }
  try {
    mkdirSync(DSH_HOME, { recursive: true })
    const tmp = CFG_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, CFG_PATH)
    cfgCache = null
    cfgCacheAt = 0
  } catch (error) {
    diag('保存配置失败：' + String((error && error.message) || error))
    throw error
  }
  return next
}

function sameChat(a, b) {
  const left = String(a == null ? '' : a).trim()
  const right = String(b == null ? '' : b).trim()
  if (!left || !right) return false
  if (left.startsWith('@') || right.startsWith('@')) return left.toLowerCase() === right.toLowerCase()
  return left === right
}

export function allowedChat(chatId, cfg) {
  if (!Array.isArray(cfg.chats) || cfg.chats.length === 0) return true
  return cfg.chats.some((one) => sameChat(one, chatId))
}

// 入站消息是否处理：只收白名单里的 chat。
// 名单 = chats ∪ wakeChats：用户显式写进唤醒名单的 chat 也应该被接收，
// 否则“只配了 wakeChats”会一条消息都收不到。两边都为空时一律不收。
// Bot API 没有历史接口，所以“加白名单之前的消息”本来就不存在；从加入那一刻开始积累。
export function inboundAllowlist(cfg) {
  const list = []
  for (const value of [cfg.chats, cfg.wakeChats]) {
    if (!Array.isArray(value)) continue
    for (const one of value) if (!list.some((existing) => sameChat(existing, one))) list.push(one)
  }
  return list.length ? list : null
}

export function inboundAllowed(chatId, cfg) {
  const list = inboundAllowlist(cfg)
  if (!list) return false
  return list.some((one) => sameChat(one, chatId))
}

// 入站唤醒的允许名单：wakeChats 优先，否则用 chats。
// 两者都为空时返回 null —— 表示没有配置任何唤醒名单，调用方必须拒绝唤醒。
// 这里刻意 fail-closed：bot 的 @username 公开可搜，任何人先给 bot 发消息都会
// 带着自己的文字唤醒目标会话、消耗模型额度；空名单不能等于“谁都可以”。
export function wakeAllowlist(cfg) {
  const list = Array.isArray(cfg.wakeChats) && cfg.wakeChats.length ? cfg.wakeChats : cfg.chats
  if (!Array.isArray(list) || list.length === 0) return null
  return list
}

export function allowedWake(chatId, cfg) {
  const list = wakeAllowlist(cfg)
  if (!list) return false
  return list.some((one) => sameChat(one, chatId))
}
