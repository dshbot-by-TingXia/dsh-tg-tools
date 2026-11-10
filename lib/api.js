// Telegram Bot API 的最小封装。
//
// 只使用 Bot API，不引入 MTProto/Telethon。Bot API 的能力边界：
//   · 可以发消息、发图、转发、编辑、删除、pin、查 chat/成员；
//   · 不能拉取机器人加入前的历史消息，也不能列出群里的全部成员。

import { hydrateToken } from './runtime.js'

// 有些运行环境默认带 HTTP(S)_PROXY，Node fetch 走代理访问 Bot API 可能超时。
// 这里把当前配置的 Bot API 主机临时加进 NO_PROXY（只对当前进程生效）。
function ensureNoProxy(base) {
  const hosts = []
  try {
    const host = new URL(base).hostname
    if (host) hosts.push(host)
  } catch (error) {}
  if (!hosts.length) return
  for (const key of ['NO_PROXY', 'no_proxy']) {
    const current = String(process.env[key] || '')
      .split(',')
      .map((one) => one.trim())
      .filter(Boolean)
    for (const host of hosts) {
      if (host && !current.includes(host)) current.push(host)
    }
    process.env[key] = current.join(',')
  }
}

function tokenOf(cfg) {
  const token = String((cfg && cfg.botToken) || '').trim()
  if (!token) throw new Error('没有配置 Telegram bot token（tg-tools-config.json 的 botToken 或 TG_TOOLS_BOT_TOKEN）')
  return token
}

export async function tg(method, body, cfg) {
  await hydrateToken(cfg)
  const base = String((cfg && cfg.apiBase) || 'https://api.telegram.org').replace(/\/+$/, '')
  ensureNoProxy(base)
  const token = tokenOf(cfg)
  const polling = method === 'getUpdates'
  const waitMs = polling ? Math.max(1000, Number(cfg.pollTimeout) || 25) * 1000 : 0
  const timeoutMs = Math.max(3000, Number(cfg.timeoutMs) || 10000) + waitMs
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('Telegram 请求超时')), timeoutMs)
  try {
    const response = await fetch(`${base}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body && typeof body === 'object' ? body : {}),
      signal: ctrl.signal,
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('Telegram 返回不是 JSON：' + text.slice(0, 200))
    }
    if (!response.ok || !data || data.ok !== true) {
      const description = (data && data.description) || text.slice(0, 200)
      const error = new Error(`Telegram ${method} 失败（HTTP ${response.status}）：${description}`)
      error.code = data && data.error_code
      error.retryAfter = data && data.parameters && data.parameters.retry_after
      throw error
    }
    return data.result
  } finally {
    clearTimeout(timer)
  }
}

export const getMe = (cfg) => tg('getMe', {}, cfg)

export const getChat = (chatId, cfg) => tg('getChat', { chat_id: chatId }, cfg)

export const getChatMemberCount = (chatId, cfg) => tg('getChatMemberCount', { chat_id: chatId }, cfg)

export const getChatAdministrators = (chatId, cfg) => tg('getChatAdministrators', { chat_id: chatId }, cfg)

export const getChatMember = (chatId, userId, cfg) =>
  tg('getChatMember', { chat_id: chatId, user_id: userId }, cfg)

export const getUpdates = (offset, cfg) =>
  tg('getUpdates', {
    offset,
    timeout: Number(cfg.pollTimeout) || 25,
    allowed_updates: ['message', 'edited_message', 'channel_post'],
  }, cfg)

export function sendMessage(body, cfg) {
  return tg('sendMessage', body, cfg)
}

export function sendPhoto(body, cfg) {
  return tg('sendPhoto', body, cfg)
}

export function sendSticker(body, cfg) {
  return tg('sendSticker', body, cfg)
}

export function sendAnimation(body, cfg) {
  return tg('sendAnimation', body, cfg)
}

export function sendDice(body, cfg) {
  return tg('sendDice', body, cfg)
}

export function setMessageReaction(body, cfg) {
  return tg('setMessageReaction', body, cfg)
}

export function getStickerSet(name, cfg) {
  return tg('getStickerSet', { name }, cfg)
}

export function forwardMessage(body, cfg) {
  return tg('forwardMessage', body, cfg)
}

export function editMessageText(body, cfg) {
  return tg('editMessageText', body, cfg)
}

export function deleteMessage(chatId, messageId, cfg) {
  return tg('deleteMessage', { chat_id: chatId, message_id: messageId }, cfg)
}

export function sendChatAction(chatId, action, cfg, threadId) {
  const body = { chat_id: chatId, action }
  if (threadId != null && threadId !== '') body.message_thread_id = threadId
  return tg('sendChatAction', body, cfg)
}

export function pinChatMessage(chatId, messageId, cfg) {
  return tg('pinChatMessage', { chat_id: chatId, message_id: messageId }, cfg)
}

export function unpinChatMessage(chatId, messageId, cfg) {
  return tg('unpinChatMessage', { chat_id: chatId, message_id: messageId }, cfg)
}

export function shapeChat(chat) {
  if (!chat || typeof chat !== 'object') return { id: '', type: 'unknown', title: '' }
  return {
    id: String(chat.id == null ? '' : chat.id),
    type: String(chat.type || 'unknown'),
    title: String(chat.title || chat.username || chat.first_name || chat.id || ''),
    username: String(chat.username || ''),
    first_name: String(chat.first_name || ''),
    last_name: String(chat.last_name || ''),
    description: String(chat.description || ''),
  }
}

export function shapeUser(user) {
  if (!user || typeof user !== 'object') return { id: '', name: '' }
  return {
    id: String(user.id == null ? '' : user.id),
    username: String(user.username || ''),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || String(user.username || user.id || ''),
    is_bot: user.is_bot === true,
  }
}
