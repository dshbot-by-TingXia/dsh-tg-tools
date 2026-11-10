// 消息相关工具：发送、转发、编辑、删除、typing。

import { loadCfg, allowedChat } from '../config.js'
import { sendMessage, forwardMessage, editMessageText, deleteMessage, sendChatAction } from '../api.js'
import { renderTool } from '../render.js'

function chatKey(value) {
  return String(value == null ? '' : value).trim()
}

function intOrUndefined(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined
}

export function makeSendMessageTool() {
  return {
    name: 'tg_send_message',
    description:
      '在 Telegram chat 里发一条文字消息。chat_id 可以是数字 id 或 @username；' +
      'reply_to_message_id 可以引用某条消息；message_thread_id 用于 Topics 群的话题。' +
      '默认纯文本，parse_mode 可传 HTML 或 MarkdownV2（MarkdownV2 需要正确转义）。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        text: { type: 'string', description: '消息正文，最多 4096 字符' },
        reply_to_message_id: { type: 'number', description: '可选：引用的消息 id' },
        message_thread_id: { type: 'number', description: '可选：Topics 群的话题 id' },
        parse_mode: { type: 'string', enum: ['HTML', 'MarkdownV2'], description: '可选：解析模式' },
        disable_notification: { type: 'boolean', description: '可选：静音发送' },
      },
      required: ['chat_id', 'text'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const text = String(args.text || '')
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!text.trim()) return { ok: false, error: 'text 不能为空' }
      if (text.length > 4096) return { ok: false, error: 'text 超过 Telegram 的 4096 字符限制' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      const body = { chat_id: chatId, text }
      if (args.parse_mode) body.parse_mode = args.parse_mode
      if (intOrUndefined(args.reply_to_message_id)) body.reply_to_message_id = intOrUndefined(args.reply_to_message_id)
      if (intOrUndefined(args.message_thread_id)) body.message_thread_id = intOrUndefined(args.message_thread_id)
      if (args.disable_notification === true) body.disable_notification = true
      try {
        const message = await sendMessage(body, cfg)
        return {
          ok: true,
          chat_id: String((message && message.chat && message.chat.id) || chatId),
          message_id: message && message.message_id,
          date: message && message.date,
          text: message && message.text,
        }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeForwardMessageTool() {
  return {
    name: 'tg_forward_message',
    description: '把一条 Telegram 消息转发到另一个 chat。from_chat_id 和 message_id 定位原消息，to_chat_id 是目标。',
    parameters: {
      type: 'object',
      properties: {
        from_chat_id: { type: 'string', description: '原消息所在 chat' },
        message_id: { type: 'number', description: '原消息 id' },
        to_chat_id: { type: 'string', description: '目标 chat' },
        message_thread_id: { type: 'number', description: '可选：目标 Topics 话题 id' },
      },
      required: ['from_chat_id', 'message_id', 'to_chat_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const from = chatKey(args.from_chat_id)
      const to = chatKey(args.to_chat_id)
      const messageId = intOrUndefined(args.message_id)
      if (!from || !to || !messageId) return { ok: false, error: 'from_chat_id / message_id / to_chat_id 都不能为空' }
      if (!allowedChat(to, cfg)) return { ok: false, error: '目标 chat 不在允许列表里' }
      const body = { from_chat_id: from, message_id: messageId, chat_id: to }
      if (intOrUndefined(args.message_thread_id)) body.message_thread_id = intOrUndefined(args.message_thread_id)
      try {
        const message = await forwardMessage(body, cfg)
        return {
          ok: true,
          chat_id: String((message && message.chat && message.chat.id) || to),
          message_id: message && message.message_id,
          date: message && message.date,
        }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeEditMessageTool() {
  return {
    name: 'tg_edit_message',
    description: '编辑机器人自己发过的一条 Telegram 消息。只能改机器人自己的消息。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        message_id: { type: 'number', description: '要编辑的消息 id' },
        text: { type: 'string', description: '新正文，最多 4096 字符' },
        parse_mode: { type: 'string', enum: ['HTML', 'MarkdownV2'], description: '可选：解析模式' },
      },
      required: ['chat_id', 'message_id', 'text'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const messageId = intOrUndefined(args.message_id)
      const text = String(args.text || '')
      if (!chatId || !messageId) return { ok: false, error: 'chat_id / message_id 不能为空' }
      if (!text.trim()) return { ok: false, error: 'text 不能为空' }
      if (text.length > 4096) return { ok: false, error: 'text 超过 Telegram 的 4096 字符限制' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      const body = { chat_id: chatId, message_id: messageId, text }
      if (args.parse_mode) body.parse_mode = args.parse_mode
      try {
        const result = await editMessageText(body, cfg)
        return {
          ok: true,
          edited: true,
          chat_id: String((result && result.chat && result.chat.id) || chatId),
          message_id: (result && result.message_id) || messageId,
        }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeDeleteMessageTool() {
  return {
    name: 'tg_delete_message',
    description: '删除一条 Telegram 消息。机器人需要是管理员，且只能删允许范围内的 chat。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        message_id: { type: 'number', description: '要删除的消息 id' },
      },
      required: ['chat_id', 'message_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const messageId = intOrUndefined(args.message_id)
      if (!chatId || !messageId) return { ok: false, error: 'chat_id / message_id 不能为空' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      try {
        await deleteMessage(chatId, messageId, cfg)
        return { ok: true, deleted: true, chat_id: chatId, message_id: messageId }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}

export function makeSendTypingTool() {
  return {
    name: 'tg_send_typing',
    description: '在 Telegram chat 里显示“正在输入/正在上传”等状态，持续约 5 秒。action 默认 typing。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        action: {
          type: 'string',
          enum: ['typing', 'upload_photo', 'record_video', 'upload_video', 'record_voice', 'upload_voice', 'upload_document', 'choose_sticker', 'find_location', 'record_video_note', 'upload_video_note'],
          description: '可选：动作类型，默认 typing',
        },
        message_thread_id: { type: 'number', description: '可选：Topics 话题 id' },
      },
      required: ['chat_id'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      try {
        await sendChatAction(chatId, args.action || 'typing', cfg, args.message_thread_id)
        return { ok: true, chat_id: chatId, action: args.action || 'typing' }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
    render(_args, value) {
      if (!value || !value.ok) return [{ type: 'text', text: '发送 typing 失败：' + String((value && value.error) || '未知错误') }]
      return [{ type: 'text', text: `已在 chat ${value.chat_id} 显示 ${value.action}。` }]
    },
  }
}
