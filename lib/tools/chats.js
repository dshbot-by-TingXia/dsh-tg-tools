// chat 相关工具：列 chat、查 chat、看本地缓存历史、看管理员。

import { loadCfg, allowedChat } from '../config.js'
import { getChat, getChatMemberCount, getChatAdministrators, getChatMember, shapeChat, shapeUser } from '../api.js'
import { listChats, getHistory } from '../store.js'
import { renderTool } from '../render.js'

function chatKey(value) {
  return String(value == null ? '' : value).trim()
}

export function makeListChatsTool() {
  return {
    name: 'tg_list_chats',
    description:
      '看看当前熟悉的 Telegram chat。返回 config.chats 里配置的 chat，以及机器人收到过消息的 chat（本地缓存）。' +
      'Bot API 不能枚举机器人加入的所有 chat；新 chat 需要先把 bot 拉进去或给它发一条消息。' +
      'chat_id 可以直接传给 tg_get_chat / tg_get_history / tg_send_message。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute() {
      const cfg = loadCfg()
      const known = new Map()
      for (const id of cfg.chats) known.set(chatKey(id), { id: chatKey(id) })
      for (const chat of listChats()) known.set(chatKey(chat.id), chat)
      const chats = []
      for (const [id, cached] of known) {
        if (chats.length >= 30) break
        try {
          const info = shapeChat(await getChat(cached.id || id, cfg))
          chats.push({ ...info, updatedAt: cached.updatedAt || 0 })
        } catch (error) {
          chats.push({
            id: cached.id || id,
            title: cached.title || id,
            type: cached.type || 'unknown',
            username: cached.username || '',
            unavailable: true,
          })
        }
      }
      return { ok: true, chats }
    },
  }
}

export function makeGetChatTool() {
  return {
    name: 'tg_get_chat',
    description: '查一个 Telegram chat 的类型、标题、用户名、简介和成员数。chat_id 可以是数字 id 或 @username。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id（如 -1001234567890）或 @username' },
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      const cfg = loadCfg()
      const chatId = chatKey(args && args.chat_id)
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      try {
        const info = shapeChat(await getChat(chatId, cfg))
        let memberCount = 0
        try {
          memberCount = Number(await getChatMemberCount(chatId, cfg)) || 0
        } catch (error) {}
        return { ok: true, ...info, member_count: memberCount }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeHistoryTool() {
  return {
    name: 'tg_get_history',
    description:
      '看某个 chat 最近的本地消息缓存（只读）。注意：Telegram Bot API 没有历史消息接口，' +
      '这里只能看到 pollEnabled 开启后机器人实际收到并缓存的消息；机器人加入前的历史看不到。' +
      '需要完整历史只能改用 MTProto/用户账号方案。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        count: { type: 'number', description: '看最近多少条，默认 50，最多 200' },
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      const cfg = loadCfg()
      const chatId = chatKey(args && args.chat_id)
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      const count = Math.max(1, Math.min(Number(args && args.count) || cfg.historyLimit, cfg.maxHistoryLimit))
      const messages = getHistory(chatId, count)
      if (!messages.length) {
        return {
          ok: false,
          error: cfg.pollEnabled
            ? '本地缓存为空：机器人还没收到这个 chat 的消息。确认 bot 在群里，且 BotFather 的 privacy mode 已关闭（或消息里 @ 了 bot）。'
            : '本地缓存为空，且 pollEnabled=false。Bot API 不能回填历史；要缓存消息请开 pollEnabled（使用独立 bot token）并让 bot 收到消息。',
        }
      }
      return { ok: true, chat_id: chatId, count: messages.length, messages }
    },
  }
}

export function makeMembersTool() {
  return {
    name: 'tg_get_chat_members',
    description:
      '查 Telegram chat 的管理员和成员数；传 user_id 时查单个成员。' +
      'Bot API 不能列出群里的全部成员，只能列管理员（getChatAdministrators）。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        user_id: { type: 'number', description: '可选：查单个用户在该 chat 的身份' },
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      const cfg = loadCfg()
      const chatId = chatKey(args && args.chat_id)
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      try {
        const members = []
        const admins = await getChatAdministrators(chatId, cfg)
        for (const admin of Array.isArray(admins) ? admins : []) {
          const user = shapeUser(admin && admin.user)
          members.push({ user, status: String((admin && admin.status) || 'administrator') })
        }
        let memberCount = 0
        try {
          memberCount = Number(await getChatMemberCount(chatId, cfg)) || 0
        } catch (error) {}
        let one
        if (args && args.user_id != null && args.user_id !== '') {
          try {
            const member = await getChatMember(chatId, Number(args.user_id), cfg)
            one = { user: shapeUser(member && member.user), status: String((member && member.status) || '') }
          } catch (error) {
            one = { user: { id: String(args.user_id), name: '' }, status: 'unknown', error: String((error && error.message) || error) }
          }
        }
        return { ok: true, chat_id: chatId, member_count: memberCount, members, user: one }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}
