// 图片工具：发图片（URL 或 Telegram file_id）。

import { loadCfg, allowedChat } from '../config.js'
import { sendPhoto } from '../api.js'
import { renderTool } from '../render.js'

function chatKey(value) {
  return String(value == null ? '' : value).trim()
}

export function makeSendPhotoTool() {
  return {
    name: 'tg_send_photo',
    description:
      '在 Telegram chat 里发一张图片。photo 可以是公网 URL 或 Telegram file_id；' +
      '本版本不直接上传本地文件（需要 multipart 上传，后续可加）。caption 最多 1024 字符。',
    parameters: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat id 或 @username' },
        photo: { type: 'string', description: '图片 URL 或 Telegram file_id' },
        caption: { type: 'string', description: '可选：图片说明，最多 1024 字符' },
        reply_to_message_id: { type: 'number', description: '可选：引用的消息 id' },
        message_thread_id: { type: 'number', description: '可选：Topics 话题 id' },
        parse_mode: { type: 'string', enum: ['HTML', 'MarkdownV2'], description: '可选：caption 解析模式' },
      },
      required: ['chat_id', 'photo'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTool },
    async execute(args) {
      args = args && typeof args === 'object' ? args : {}
      const cfg = loadCfg()
      const chatId = chatKey(args.chat_id)
      const photo = String(args.photo || '').trim()
      if (!chatId) return { ok: false, error: 'chat_id 不能为空' }
      if (!photo) return { ok: false, error: 'photo 不能为空' }
      if (!allowedChat(chatId, cfg)) return { ok: false, error: '这个 chat 不在允许列表里' }
      const caption = String((args && args.caption) || '')
      if (caption.length > 1024) return { ok: false, error: 'caption 超过 Telegram 的 1024 字符限制' }
      const body = { chat_id: chatId, photo }
      if (caption) body.caption = caption
      if (args.parse_mode) body.parse_mode = args.parse_mode
      if (Number.isFinite(Number(args.reply_to_message_id)) && Number(args.reply_to_message_id) > 0) {
        body.reply_to_message_id = Math.trunc(Number(args.reply_to_message_id))
      }
      if (Number.isFinite(Number(args.message_thread_id)) && Number(args.message_thread_id) > 0) {
        body.message_thread_id = Math.trunc(Number(args.message_thread_id))
      }
      try {
        const message = await sendPhoto(body, cfg)
        return {
          ok: true,
          chat_id: String((message && message.chat && message.chat.id) || chatId),
          message_id: message && message.message_id,
          date: message && message.date,
          caption: message && message.caption,
        }
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    },
  }
}
