// 表情/贴纸/骰子/reaction 工具。

import { loadCfg, allowedChat } from '../config.js'
import { sendSticker, sendAnimation, sendDice, setMessageReaction, getStickerSet } from '../api.js'

function chatKey(value) {
  return String(value == null ? '' : value).trim()
}

function positiveInt(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined
}

function chatAllowed(chatId, cfg) {
  if (!allowedChat(chatId, cfg)) return '这个 chat 不在允许列表里'
  return ''
}

export function makeSendStickerTool() {
  return {
    name: 'tg_send_sticker',
    description:
      '发一个 Telegram 贴纸/表情。sticker 传 file_id，或 .webp 贴纸的公网 URL。' +
      '不知道 file_id 时先用 tg_get_sticker_set 查贴纸包（name 来自 t.me/addstickers/<name>）。' +
      '普通 Unicode emoji 不需要这个工具，直接写在 tg_send_message 的 text 里即可。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        sticker: { type: 'string', description: '贴纸 file_id，或 .webp 公网 URL' },
        emoji: { type: 'string', description: '可选：关联的 emoji' },
        reply_to_message_id: { type: 'number', description: '可选：引用的消息 id' },
        message_thread_id: { type: 'number', description: '可选：Topics 话题 id' },
      },
      required: ['chat_id', 'sticker'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderSticker },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const sticker = String(args.sticker || '').trim()
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!sticker) return { ok: false, error: 'sticker 不能为空' }
      const denied = chatAllowed(chatId, cfg)
      if (denied) return { ok: false, error: denied }
      const body = { chat_id: chatId, sticker }
      if (args.emoji) body.emoji = String(args.emoji)
      if (positiveInt(args.reply_to_message_id)) body.reply_to_message_id = positiveInt(args.reply_to_message_id)
      if (positiveInt(args.message_thread_id)) body.message_thread_id = positiveInt(args.message_thread_id)
      try {
        const message = await sendSticker(body, cfg)
        return { ok: true, chat_id: chatId, message_id: message && message.message_id, sticker: true }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeSendAnimationTool() {
  return {
    name: 'tg_send_animation',
    description: '发 GIF/无声 MP4 动画。animation 传公网 URL 或 Telegram file_id；caption 可选。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        animation: { type: 'string', description: 'GIF/MP4 的 URL 或 file_id' },
        caption: { type: 'string', description: '可选：说明，最多 1024 字符' },
        parse_mode: { type: 'string', enum: ['HTML', 'MarkdownV2'], description: '可选：caption 解析模式' },
        reply_to_message_id: { type: 'number', description: '可选：引用的消息 id' },
        message_thread_id: { type: 'number', description: '可选：Topics 话题 id' },
      },
      required: ['chat_id', 'animation'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderSticker },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const animation = String(args.animation || '').trim()
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!animation) return { ok: false, error: 'animation 不能为空' }
      const denied = chatAllowed(chatId, cfg)
      if (denied) return { ok: false, error: denied }
      const caption = String(args.caption || '')
      if (caption.length > 1024) return { ok: false, error: 'caption 超过 1024 字符限制' }
      const body = { chat_id: chatId, animation }
      if (caption) body.caption = caption
      if (args.parse_mode) body.parse_mode = args.parse_mode
      if (positiveInt(args.reply_to_message_id)) body.reply_to_message_id = positiveInt(args.reply_to_message_id)
      if (positiveInt(args.message_thread_id)) body.message_thread_id = positiveInt(args.message_thread_id)
      try {
        const message = await sendAnimation(body, cfg)
        return { ok: true, chat_id: chatId, message_id: message && message.message_id, animation: true }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeSendDiceTool() {
  return {
    name: 'tg_send_dice',
    description:
      '发 Telegram 的骰子/飞镖/篮球/足球/老虎机动画。emoji 只能是 Telegram 支持的类型，默认 🎲；结果由 Telegram 随机生成。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        emoji: { type: 'string', description: '🎲 / 🎯 / 🏀 / ⚽ / 🎰，默认 🎲' },
        reply_to_message_id: { type: 'number', description: '可选：引用的消息 id' },
        message_thread_id: { type: 'number', description: '可选：Topics 话题 id' },
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderDice },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      const denied = chatAllowed(chatId, cfg)
      if (denied) return { ok: false, error: denied }
      const body = { chat_id: chatId, emoji: String(args.emoji || '🎲') }
      if (positiveInt(args.reply_to_message_id)) body.reply_to_message_id = positiveInt(args.reply_to_message_id)
      if (positiveInt(args.message_thread_id)) body.message_thread_id = positiveInt(args.message_thread_id)
      try {
        const message = await sendDice(body, cfg)
        return {
          ok: true,
          chat_id: chatId,
          message_id: message && message.message_id,
          emoji: body.emoji,
          value: message && message.dice && message.dice.value,
        }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeSetReactionTool() {
  return {
    name: 'tg_set_reaction',
    description:
      '给 Telegram 消息加/换一个 emoji reaction。emoji 传单个 emoji（如 👍、❤️、😂、🔥）。' +
      '机器人需要在 chat 里有相应权限；部分 chat 不允许 bot 加 reaction。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        message_id: { type: 'number', description: '目标消息 id' },
        emoji: { type: 'string', description: '单个 emoji' },
        is_big: { type: 'boolean', description: '可选：大号 reaction 动画' },
      },
      required: ['chat_id', 'message_id', 'emoji'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderReaction },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const messageId = positiveInt(args.message_id)
      const emoji = String(args.emoji || '').trim()
      if (!chatId || !messageId) return { ok: false, error: 'chat_id / message_id 不能为空' }
      if (!emoji) return { ok: false, error: 'emoji 不能为空' }
      const denied = chatAllowed(chatId, cfg)
      if (denied) return { ok: false, error: denied }
      const body = { chat_id: chatId, message_id: messageId, reaction: [{ type: 'emoji', emoji }] }
      if (args.is_big === true) body.is_big = true
      try {
        await setMessageReaction(body, cfg)
        return { ok: true, chat_id: chatId, message_id: messageId, emoji }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeGetStickerSetTool() {
  return {
    name: 'tg_get_sticker_set',
    description:
      '查一个 Telegram 贴纸包，返回包名、标题和每个贴纸的 file_id/emoji。' +
      'name 是 t.me/addstickers/<name> 里的名字；拿到 file_id 后传给 tg_send_sticker。' +
      '只能查公开贴纸包，且 bot 需要能访问该包。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '贴纸包名，如 "UtyaDuck"' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderStickerSet },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const name = String(args.name || '').trim()
      if (!name) return { ok: false, error: 'name 不能为空' }
      try {
        const set = await getStickerSet(name, cfg)
        const stickers = (Array.isArray(set && set.stickers) ? set.stickers : []).slice(0, 50).map((sticker) => ({
          file_id: String((sticker && sticker.file_id) || ''),
          file_unique_id: String((sticker && sticker.file_unique_id) || ''),
          type: String((sticker && sticker.type) || 'regular'),
          emoji: String((sticker && sticker.emoji) || ''),
          width: Number((sticker && sticker.width) || 0),
          height: Number((sticker && sticker.height) || 0),
          is_animated: sticker && sticker.is_animated === true,
          is_video: sticker && sticker.is_video === true,
        }))
        return {
          ok: true,
          name: String((set && set.name) || name),
          title: String((set && set.title) || ''),
          sticker_type: String((set && set.sticker_type) || ''),
          count: stickers.length,
          stickers,
        }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

function renderSticker(_args, value) {
  if (!value || !value.ok) return [{ type: 'text', text: '发表情失败：' + String((value && value.error) || '未知错误') }]
  return [{ type: 'text', text: `已发到 chat ${value.chat_id}（message_id ${value.message_id || '?'}）。` }]
}

function renderDice(_args, value) {
  if (!value || !value.ok) return [{ type: 'text', text: '发骰子失败：' + String((value && value.error) || '未知错误') }]
  return [{ type: 'text', text: `已发 ${value.emoji} 到 chat ${value.chat_id}，结果 ${value.value == null ? '?' : value.value}。` }]
}

function renderReaction(_args, value) {
  if (!value || !value.ok) return [{ type: 'text', text: '加 reaction 失败：' + String((value && value.error) || '未知错误') }]
  return [{ type: 'text', text: `已给 chat ${value.chat_id} 的消息 ${value.message_id} 加上 ${value.emoji}。` }]
}

function renderStickerSet(_args, value) {
  if (!value || !value.ok) return [{ type: 'text', text: '查贴纸包失败：' + String((value && value.error) || '未知错误') }]
  const lines = value.stickers.map((sticker) => {
    const kind = sticker.is_video ? 'video' : sticker.is_animated ? 'animated' : 'static'
    return `- ${sticker.emoji || '?'} ${kind} ${sticker.width}x${sticker.height} file_id=${sticker.file_id}`
  })
  return [{
    type: 'text',
    text: `贴纸包「${value.title || value.name}」（${value.sticker_type || 'regular'}，${value.count} 个）：\n` + (lines.join('\n') || '（空）'),
  }]
}
