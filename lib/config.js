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

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, renameSync } from 'node:fs'
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

export function diag(msg) {
  try {
    appendFileSync(DIAG_PATH, new Date().toISOString() + '  ' + msg + '\n', 'utf8')
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

export function allowedWake(chatId, cfg) {
  const list = Array.isArray(cfg.wakeChats) && cfg.wakeChats.length ? cfg.wakeChats : cfg.chats
  if (!Array.isArray(list) || list.length === 0) return true
  return list.some((one) => sameChat(one, chatId))
}
