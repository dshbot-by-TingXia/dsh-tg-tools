// 可选的 Telegram 收消息轮询。
//
// 只有 config.pollEnabled=true 才会启动。它做两件事：
//   1. 把白名单 chat 里机器人收到的消息写进本地缓存（tg_get_history 用）；
//   2. 私聊 / @ 提醒 / wakeAll 的群消息唤醒 targetSession。
//
// 入站是 fail-closed 的：chats 与 wakeChats 都为空时什么消息都不收。
// Bot API 没有历史接口，缓存从“加进白名单那一刻”开始积累，之前的不存在。
//
// 编辑消息（edited_message）只更新缓存，不唤醒：否则反复编辑同一条消息
// 就能反复叫醒会话、重复消耗模型额度。
//
// ⚠️ 同一个 bot token 不能同时跑两个 getUpdates；如果已有别的程序在轮询同一个 bot，
// 请给本插件换一个独立 bot token，否则 Telegram 返回 409 Conflict。

import { randomUUID } from 'node:crypto'
import { loadCfg, allowedWake, inboundAllowed, bindLogger, diag } from '../config.js'
import { getMe, getUpdates } from '../api.js'
import { getOffset, setOffset, recordUpdate, flushState } from '../store.js'
import { findAgent, targetSessionId } from '../session.js'
import { bindCredentials } from '../runtime.js'

const MAX_LOG_TEXT = 80

let started = false

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function messageText(message) {
  if (!message) return ''
  return String(message.text || message.caption || '')
}

function isMention(message, me) {
  if (!message || !me) return false
  const reply = message.reply_to_message
  if (reply && reply.from && me.id && String(reply.from.id) === String(me.id)) return true
  const text = messageText(message)
  if (me.username && text.toLowerCase().includes('@' + String(me.username).toLowerCase())) return true
  const entities = Array.isArray(message.entities) ? message.entities : []
  return entities.some((entity) => {
    if (!entity) return false
    if (entity.type === 'text_mention' && entity.user && me.id) return String(entity.user.id) === String(me.id)
    return false
  })
}

function senderOf(message) {
  const from = (message && message.from) || {}
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id || '?')
  const username = from.username ? '@' + from.username : ''
  return { name, username, id: String(from.id == null ? '' : from.id) }
}

// 哪些 update 可以唤醒会话：新消息和频道帖子可以，编辑只更新缓存。
export function wakeEligible(update) {
  if (!update || typeof update !== 'object') return false
  if (update.edited_message) return false
  return Boolean(update.message || update.channel_post)
}

async function wake(ctx, message, chat, cfg, me, reason) {
  const chatId = String(chat.id)
  const sender = senderOf(message)
  const text = messageText(message) || (message.photo ? '（图片）' : message.document ? '（文件）' : '（没有文字）')
  const mid = message.message_id != null ? message.message_id : ''
  const where = chat.type === 'private'
    ? '私聊'
    : `群「${chat.title || chat.username || chatId}」`
  const lines = [
    `【Telegram ${where}】${reason ? reason + '：' : ''}${sender.name}${sender.username ? '（' + sender.username + '，id ' + sender.id + '）' : '（id ' + sender.id + '）'}：${text}`,
  ]
  const tools = []
  tools.push(`想回就用 tg_send_message(chat_id=${JSON.stringify(chatId)}${mid ? ', reply_to_message_id=' + mid : ''})`)
  tools.push(`发图用 tg_send_photo(chat_id=${JSON.stringify(chatId)})`)
  lines.push(tools.join('；') + '。')
  lines.push('不想回就安静待着；不要提工具。')

  const agent = findAgent(ctx.agents, targetSessionId())
  if (!agent) {
    diag('收消息：目标会话没有活着', 'warn')
    return
  }
  try {
    await agent.followup({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: lines.join('\n') }],
      source: { kind: 'telegram' },
    })
    diag(`消息 → 会话：chat ${chatId} ${sender.name} ${text.slice(0, MAX_LOG_TEXT)}`)
  } catch (error) {
    diag('唤醒会话失败：' + String((error && error.message) || error), 'warn')
  }
}

async function handleUpdate(ctx, update, cfg, me) {
  try {
    const message = update.message || update.channel_post || update.edited_message
    if (!message || !message.chat || message.chat.id == null) return
    if (message.from && message.from.is_bot === true) return
    const chat = message.chat
    const chatId = String(chat.id)
    // 只处理白名单 chat：不在名单里的消息连缓存都不写。
    if (!inboundAllowed(chatId, cfg)) return
    recordUpdate(update)
    if (!wakeEligible(update)) return
    if (!allowedWake(chatId, cfg)) return
    if (chat.type === 'private') {
      if (cfg.wakeOnPrivate) await wake(ctx, message, chat, cfg, me, '私聊消息')
      return
    }
    if (cfg.wakeAll) {
      await wake(ctx, message, chat, cfg, me, '群消息')
      return
    }
    if (cfg.wakeOnMention && isMention(message, me)) {
      await wake(ctx, message, chat, cfg, me, '@提醒')
    }
  } catch (error) {
    diag('处理更新失败：' + String((error && error.message) || error), 'warn')
  }
}

export function startInbox(ctx) {
  if (started) return
  started = true
  bindLogger(ctx)
  bindCredentials(ctx)
  let stopped = false
  let currentAbort = null
  let me
  let warnedConflict = false
  let warnedNoToken = false

  const loop = async () => {
    while (!stopped) {
      const cfg = loadCfg()
      if (!cfg.pollEnabled) {
        await sleep(3000)
        continue
      }
      if (!cfg.botToken) {
        if (!warnedNoToken) {
          warnedNoToken = true
          diag('pollEnabled=true 但没有 bot token', 'warn')
        }
        await sleep(5000)
        continue
      }
      try {
        if (!me) {
          me = await getMe(cfg)
          diag('已连接 Telegram bot @' + (me.username || me.id || '?'))
        }
        currentAbort = new AbortController()
        const updates = await getUpdates(getOffset(), cfg, currentAbort.signal)
        currentAbort = null
        if (Array.isArray(updates) && updates.length) {
          let nextOffset = getOffset()
          for (const update of updates) {
            if (stopped) break
            const id = Number(update && update.update_id)
            if (Number.isFinite(id)) nextOffset = Math.max(nextOffset, id + 1)
            await handleUpdate(ctx, update, cfg, me)
          }
          setOffset(nextOffset)
          flushState()
        }
      } catch (error) {
        currentAbort = null
        // 插件卸载触发的中断是正常退出，不记错误。
        if (stopped) break
        const text = String((error && error.message) || error)
        if (text.includes('409') || text.toLowerCase().includes('conflict')) {
          if (!warnedConflict) {
            warnedConflict = true
            diag('getUpdates 409 Conflict：同一个 bot token 已有其他轮询者。请换独立 bot token，或关闭 pollEnabled。', 'warn')
          }
        } else {
          diag('收消息轮询失败：' + text, 'warn')
        }
        await sleep(5000)
      }
    }
  }

  ctx.effect(() => {
    stopped = false
    void loop()
    return () => {
      stopped = true
      started = false
      try {
        currentAbort?.abort()
      } catch (error) {}
      flushState()
    }
  }, 'tg-tools: inbox')
}
