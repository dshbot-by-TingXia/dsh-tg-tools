// 工具结果的文本渲染。

export function fmtTime(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return ''
  try {
    return new Date(n * 1000).toLocaleString('zh-CN', { hour12: false })
  } catch (error) {
    return new Date(n * 1000).toISOString()
  }
}

export function renderTool(_args, value) {
  if (!value || !value.ok) {
    return [{ type: 'text', text: 'Telegram 工具失败：' + String((value && value.error) || '未知错误') }]
  }
  if (Array.isArray(value.chats)) {
    if (!value.chats.length) {
      return [{ type: 'text', text: '还没有已知的 Telegram chat。先把这个 bot 拉进群/私聊，或打开 pollEnabled。' }]
    }
    return [{
      type: 'text',
      text: '已知的 Telegram chat：\n' + value.chats.map((chat) => {
        const extra = [chat.type, chat.username ? '@' + chat.username : '', chat.unavailable ? '当前不可访问' : '']
          .filter(Boolean).join('，')
        return `- ${chat.title || chat.id}（chat_id ${chat.id}${extra ? '，' + extra : ''}）`
      }).join('\n'),
    }]
  }
  if (Array.isArray(value.messages)) {
    if (!value.messages.length) {
      return [{ type: 'text', text: `chat ${value.chat_id} 的本地缓存里还没有消息。` }]
    }
    const lines = value.messages.map((message) => {
      const from = message.from || {}
      const text = message.text || (message.type && message.type !== 'text' ? `（${message.type}）` : '（空）')
      return `${fmtTime(message.date)} [#${message.message_id || '?'}] ${from.name || from.id || '?'}(${from.id || '?'})：${text}`
    })
    return [{ type: 'text', text: `chat ${value.chat_id} 最近 ${value.count} 条（本地缓存）：\n` + lines.join('\n') }]
  }
  if (Array.isArray(value.members)) {
    const lines = value.members.map((member) => {
      const user = member.user || member
      return `- ${user.name || user.username || user.id}（id ${user.id}，${member.status || member.role || 'member'}）`
    })
    return [{ type: 'text', text: `chat ${value.chat_id} 的成员（Bot API 只能列管理员）：\n` + (lines.join('\n') || '（空）') }]
  }
  if (value.deleted === true) {
    return [{ type: 'text', text: `已删除 chat ${value.chat_id} 的消息 ${value.message_id}。` }]
  }
  if (value.edited === true) {
    return [{ type: 'text', text: `已编辑 chat ${value.chat_id} 的消息 ${value.message_id}。` }]
  }
  if (value.message_id != null) {
    return [{ type: 'text', text: `已发送到 chat ${value.chat_id}（message_id ${value.message_id}）。` }]
  }
  return [{ type: 'text', text: JSON.stringify(value).slice(0, 2000) }]
}
