// 本地消息缓存。
//
// Bot API 没有“拉取历史消息”接口。只有在 getUpdates 轮询开启时，机器人收到的
// 消息才会进这里；tg_get_history 读的是这份缓存，不是 Telegram 服务端的完整历史。

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { STATE_PATH, diag } from './config.js'

const MAX_MESSAGES_PER_CHAT = 300

let cache = null

function emptyState() {
  return { version: 1, offset: 0, chats: {}, messages: {} }
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState()
  return {
    version: 1,
    offset: Number.isFinite(Number(value.offset)) ? Number(value.offset) : 0,
    chats: value.chats && typeof value.chats === 'object' ? value.chats : {},
    messages: value.messages && typeof value.messages === 'object' ? value.messages : {},
  }
}

function getState() {
  if (cache) return cache
  try {
    cache = normalizeState(JSON.parse(readFileSync(STATE_PATH, 'utf8')))
  } catch (error) {
    cache = emptyState()
  }
  return cache
}

function persist() {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    const state = getState()
    const tmp = STATE_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, STATE_PATH)
  } catch (error) {
    diag('保存消息缓存失败：' + String((error && error.message) || error))
  }
}

export function getOffset() {
  return Number(getState().offset) || 0
}

export function setOffset(offset) {
  const state = getState()
  const next = Math.max(0, Number(offset) || 0)
  if (next === state.offset) return
  state.offset = next
  persist()
}

export function listChats() {
  const state = getState()
  return Object.values(state.chats)
    .filter((chat) => chat && chat.id != null)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
}

export function getHistory(chatId, count) {
  const state = getState()
  const key = String(chatId == null ? '' : chatId)
  const list = Array.isArray(state.messages[key]) ? state.messages[key] : []
  const limit = Math.max(1, Math.min(Number(count) || 50, 200))
  return list
    .slice()
    .sort((a, b) => (Number(a.date) || 0) - (Number(b.date) || 0) || (Number(a.message_id) || 0) - (Number(b.message_id) || 0))
    .slice(-limit)
}

function messageType(message) {
  if (!message || typeof message !== 'object') return 'unknown'
  if (Array.isArray(message.photo) && message.photo.length) return 'photo'
  if (message.video) return 'video'
  if (message.document) return 'document'
  if (message.audio) return 'audio'
  if (message.voice) return 'voice'
  if (message.sticker) return 'sticker'
  if (message.animation) return 'animation'
  if (message.location) return 'location'
  if (message.contact) return 'contact'
  if (message.poll) return 'poll'
  return 'text'
}

function textOf(message) {
  if (!message || typeof message !== 'object') return ''
  if (typeof message.text === 'string' && message.text) return message.text
  if (typeof message.caption === 'string' && message.caption) return message.caption
  return ''
}

function chatInfo(chat) {
  if (!chat || typeof chat !== 'object') return { id: '', type: 'unknown', title: '' }
  return {
    id: String(chat.id == null ? '' : chat.id),
    type: String(chat.type || 'unknown'),
    title: String(chat.title || chat.username || chat.first_name || chat.id || ''),
    username: String(chat.username || ''),
    updatedAt: Date.now(),
  }
}

function messageInfo(message) {
  const from = message && message.from && typeof message.from === 'object' ? message.from : {}
  const reply = message && message.reply_to_message && typeof message.reply_to_message === 'object'
    ? message.reply_to_message
    : null
  return {
    message_id: Number(message.message_id) || 0,
    date: Number(message.date) || 0,
    chat_id: String((message.chat && message.chat.id) || ''),
    from: {
      id: String(from.id == null ? '' : from.id),
      username: String(from.username || ''),
      name: [from.first_name, from.last_name].filter(Boolean).join(' ') || String(from.username || from.id || ''),
      is_bot: from.is_bot === true,
    },
    text: textOf(message),
    caption: typeof message.caption === 'string' ? message.caption : '',
    type: messageType(message),
    reply_to_message_id: reply ? Number(reply.message_id) || 0 : 0,
  }
}

// 把一条 getUpdates 更新写进缓存。edited_message 会按 message_id 覆盖原消息。
export function recordUpdate(update) {
  if (!update || typeof update !== 'object') return null
  const message = update.message || update.edited_message || update.channel_post
  if (!message || typeof message !== 'object') return null
  if (message.from && message.from.is_bot === true) return null
  const chat = message.chat
  if (!chat || chat.id == null) return null
  const state = getState()
  const key = String(chat.id)
  state.chats[key] = { ...(state.chats[key] || {}), ...chatInfo(chat) }
  const list = Array.isArray(state.messages[key]) ? state.messages[key] : []
  const info = messageInfo(message)
  const index = list.findIndex((one) => Number(one.message_id) === info.message_id)
  if (index >= 0) list[index] = { ...list[index], ...info }
  else list.push(info)
  state.messages[key] = list.slice(-MAX_MESSAGES_PER_CHAT)
  persist()
  return info
}

export function reloadState() {
  cache = null
}
