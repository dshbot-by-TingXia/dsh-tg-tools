// 离线冒烟测试：起一个假的 Bot API 服务 + 临时 DSH_HOME，
// 验证各工具发出的请求体、chat 白名单、消息缓存和配置文件权限。
//
// 不连真实 Telegram，也不读写 ~/.dsh 里的真实配置。
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const home = mkdtempSync(join(tmpdir(), 'tg-tools-smoke-'))
process.env.DSH_HOME = home
delete process.env.TG_TOOLS_BOT_TOKEN
delete process.env.TELEGRAM_BOT_TOKEN

const calls = []
let nextMessageId = 100

const server = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => { raw += chunk })
  req.on('end', () => {
    const method = String(req.url || '').split('/').pop()
    let body = {}
    try { body = raw ? JSON.parse(raw) : {} } catch (error) {}
    calls.push({ method, body })
    res.setHeader('content-type', 'application/json')
    const ok = (result) => res.end(JSON.stringify({ ok: true, result }))
    switch (method) {
      case 'getMe':
        return ok({ id: 1, is_bot: true, username: 'smoke_bot', first_name: 'Smoke' })
      case 'getChat':
        return ok({ id: body.chat_id, type: 'supergroup', title: 'Smoke Group', username: 'smoke_group' })
      case 'getChatMemberCount':
        return ok(42)
      case 'getChatAdministrators':
        return ok([{ status: 'administrator', user: { id: 7, first_name: 'Ada', username: 'ada' } }])
      case 'getChatMember':
        return ok({ status: 'member', user: { id: Number(body.user_id), first_name: 'Bob' } })
      case 'sendMessage':
      case 'sendPhoto':
      case 'sendSticker':
      case 'sendAnimation':
        return ok({ message_id: ++nextMessageId, chat: { id: body.chat_id }, text: body.text, caption: body.caption })
      case 'sendDice':
        return ok({ message_id: ++nextMessageId, chat: { id: body.chat_id }, dice: { emoji: body.emoji, value: 4 } })
      case 'setMessageReaction':
        return ok(true)
      case 'getStickerSet':
        return ok({
          name: body.name,
          title: 'Smoke Pack',
          sticker_type: 'regular',
          stickers: [{ file_id: 'FILE1', file_unique_id: 'u1', type: 'regular', emoji: '😀', width: 512, height: 512 }],
        })
      case 'forwardMessage':
        return ok({ message_id: ++nextMessageId, chat: { id: body.chat_id } })
      case 'editMessageText':
        return ok({ message_id: body.message_id, chat: { id: body.chat_id } })
      case 'deleteMessage':
        return ok(true)
      case 'sendChatAction':
        return ok(true)
      default:
        res.statusCode = 404
        return res.end(JSON.stringify({ ok: false, description: 'unknown method: ' + method }))
    }
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const apiBase = `http://127.0.0.1:${server.address().port}`

const {
  loadCfg, loadCfgCached, saveCfg, CFG_PATH, STATE_PATH,
  allowedWake, wakeAllowlist, inboundAllowed, inboundAllowlist, diag,
} = await import('../lib/config.js')
const { makeSendMessageTool, makeForwardMessageTool, makeEditMessageTool, makeDeleteMessageTool, makeSendTypingTool } =
  await import('../lib/tools/messages.js')
const { makeListChatsTool, makeGetChatTool, makeHistoryTool, makeMembersTool } = await import('../lib/tools/chats.js')
const { makeSendPhotoTool } = await import('../lib/tools/media.js')
const {
  makeSendStickerTool, makeSendAnimationTool, makeSendDiceTool, makeSetReactionTool, makeGetStickerSetTool,
} = await import('../lib/tools/expressions.js')
const { getHistory, recordUpdate, flushState } = await import('../lib/store.js')
const { renderTool } = await import('../lib/render.js')

const CHAT = '-100111'
const OTHER = '-100999'
saveCfg({ apiBase, botToken: 'smoke-token', chats: [CHAT], wakeChats: [], pollEnabled: false })

let count = 0
function lastCall(method) {
  const found = [...calls].reverse().find((one) => one.method === method)
  assert.ok(found, `没有发出 ${method} 请求`)
  return found.body
}

// 1. 发消息：请求体正确，返回 message_id
{
  const result = await makeSendMessageTool().execute({ chat_id: CHAT, text: 'hello' })
  assert.equal(result.ok, true)
  assert.ok(result.message_id > 0)
  const body = lastCall('sendMessage')
  assert.deepEqual(body, { chat_id: CHAT, text: 'hello' })
  count++
}

// 1b. 引用、话题、parse_mode 透传
{
  const result = await makeSendMessageTool().execute({
    chat_id: CHAT, text: '<b>hi</b>', parse_mode: 'HTML', reply_to_message_id: 12, message_thread_id: 5, disable_notification: true,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(lastCall('sendMessage'), {
    chat_id: CHAT, text: '<b>hi</b>', parse_mode: 'HTML', reply_to_message_id: 12, message_thread_id: 5, disable_notification: true,
  })
  count++
}

// 2. 白名单拦截，且不产生请求
{
  const before = calls.length
  const result = await makeSendMessageTool().execute({ chat_id: OTHER, text: 'nope' })
  assert.equal(result.ok, false)
  assert.match(result.error, /允许列表/)
  assert.equal(calls.length, before, '白名单拦截时不应发出请求')
  count++
}

// 3. 长度校验在发请求前完成
{
  const before = calls.length
  const result = await makeSendMessageTool().execute({ chat_id: CHAT, text: 'x'.repeat(4097) })
  assert.equal(result.ok, false)
  assert.match(result.error, /4096/)
  assert.equal(calls.length, before)
  count++
}

// 4. 发图：URL + caption
{
  const result = await makeSendPhotoTool().execute({ chat_id: CHAT, photo: 'https://example.com/a.jpg', caption: 'pic' })
  assert.equal(result.ok, true)
  assert.deepEqual(lastCall('sendPhoto'), { chat_id: CHAT, photo: 'https://example.com/a.jpg', caption: 'pic' })
  count++
}

// 4b. caption 超长
{
  const result = await makeSendPhotoTool().execute({ chat_id: CHAT, photo: 'https://example.com/a.jpg', caption: 'x'.repeat(1025) })
  assert.equal(result.ok, false)
  assert.match(result.error, /1024/)
  count++
}

// 5. 贴纸 / 动画 / 骰子
{
  assert.equal((await makeSendStickerTool().execute({ chat_id: CHAT, sticker: 'FILE1', emoji: '😀' })).ok, true)
  assert.deepEqual(lastCall('sendSticker'), { chat_id: CHAT, sticker: 'FILE1', emoji: '😀' })
  assert.equal((await makeSendAnimationTool().execute({ chat_id: CHAT, animation: 'https://example.com/a.gif' })).ok, true)
  assert.equal((await makeSendDiceTool().execute({ chat_id: CHAT })).value, 4)
  assert.deepEqual(lastCall('sendDice'), { chat_id: CHAT, emoji: '🎲' })
  count += 3
}

// 6. reaction 请求体形状
{
  const result = await makeSetReactionTool().execute({ chat_id: CHAT, message_id: 11, emoji: '🔥' })
  assert.equal(result.ok, true)
  assert.deepEqual(lastCall('setMessageReaction'), {
    chat_id: CHAT, message_id: 11, reaction: [{ type: 'emoji', emoji: '🔥' }],
  })
  count++
}

// 7. 编辑 / 删除：渲染文案不能被“已发送”分支抢走
{
  const edited = await makeEditMessageTool().execute({ chat_id: CHAT, message_id: 11, text: 'new' })
  assert.equal(edited.edited, true)
  assert.match(renderTool({}, edited)[0].text, /已编辑/)
  const deleted = await makeDeleteMessageTool().execute({ chat_id: CHAT, message_id: 11 })
  assert.equal(deleted.deleted, true)
  assert.match(renderTool({}, deleted)[0].text, /已删除/)
  count += 2
}

// 8. typing
{
  const result = await makeSendTypingTool().execute({ chat_id: CHAT })
  assert.equal(result.ok, true)
  assert.deepEqual(lastCall('sendChatAction'), { chat_id: CHAT, action: 'typing' })
  count++
}

// 9. 转发
{
  const result = await makeForwardMessageTool().execute({ from_chat_id: CHAT, message_id: 11, to_chat_id: CHAT })
  assert.equal(result.ok, true)
  assert.deepEqual(lastCall('forwardMessage'), { from_chat_id: CHAT, message_id: 11, chat_id: CHAT })
  count++
}

// 10. 查 chat / 成员
{
  const chat = await makeGetChatTool().execute({ chat_id: CHAT })
  assert.equal(chat.ok, true)
  assert.equal(chat.title, 'Smoke Group')
  assert.equal(chat.member_count, 42)

  const members = await makeMembersTool().execute({ chat_id: CHAT, user_id: 9 })
  assert.equal(members.ok, true)
  assert.equal(members.member_count, 42)
  assert.equal(members.members[0].status, 'administrator')
  assert.equal(members.members[0].user.name, 'Ada')
  assert.equal(members.user.status, 'member')
  count += 2
}

// 11. 贴纸包
{
  const set = await makeGetStickerSetTool().execute({ name: 'SmokePack' })
  assert.equal(set.ok, true)
  assert.equal(set.count, 1)
  assert.equal(set.stickers[0].file_id, 'FILE1')
  count++
}

// 12. 消息缓存：bot 自己的消息不入缓存，edited_message 覆盖原条
{
  recordUpdate({
    update_id: 1,
    message: {
      message_id: 21, date: 1700000000, text: 'hi',
      chat: { id: Number(CHAT), type: 'supergroup', title: 'Smoke Group' },
      from: { id: 9, first_name: 'Bob', username: 'bob' },
    },
  })
  recordUpdate({
    update_id: 2,
    message: {
      message_id: 22, date: 1700000001, text: 'from bot',
      chat: { id: Number(CHAT), type: 'supergroup', title: 'Smoke Group' },
      from: { id: 1, first_name: 'Smoke', is_bot: true },
    },
  })
  recordUpdate({
    update_id: 3,
    edited_message: {
      message_id: 21, date: 1700000002, text: 'hi (edited)',
      chat: { id: Number(CHAT), type: 'supergroup', title: 'Smoke Group' },
      from: { id: 9, first_name: 'Bob', username: 'bob' },
    },
  })
  const messages = getHistory(CHAT, 10)
  assert.equal(messages.length, 1, 'bot 自己的消息不应进缓存')
  assert.equal(messages[0].text, 'hi (edited)')

  const history = await makeHistoryTool().execute({ chat_id: CHAT })
  assert.equal(history.ok, true)
  assert.equal(history.count, 1)
  assert.match(renderTool({}, history)[0].text, /hi \(edited\)/)
  count += 3
}

// 13. 列 chat：配置里的 chat 能查到
{
  const list = await makeListChatsTool().execute({})
  assert.equal(list.ok, true)
  assert.ok(list.chats.some((one) => one.id === CHAT && one.title === 'Smoke Group'))
  count++
}

// 14. 配置文件与状态文件都是 600，token 不出现在诊断日志里
{
  flushState()
  diag('smoke：诊断日志权限测试')
  assert.equal(statSync(CFG_PATH).mode & 0o777, 0o600, '配置文件权限应为 600')
  assert.ok(existsSync(STATE_PATH), '消息缓存应落盘')
  assert.equal(statSync(STATE_PATH).mode & 0o777, 0o600, '状态文件权限应为 600')
  const cfgText = readFileSync(CFG_PATH, 'utf8')
  assert.match(cfgText, /smoke-token/)
  const diagPath = join(home, 'tg-tools-diag.log')
  assert.ok(existsSync(diagPath), '诊断日志应落盘')
  assert.equal(statSync(diagPath).mode & 0o777, 0o600, '诊断日志权限应为 600')
  assert.doesNotMatch(readFileSync(diagPath, 'utf8'), /smoke-token/, '诊断日志不应包含 token')
  count++
}

// 15. 配置接口准入：DNS 重绑定过不去，同源放行
{
  const { fallbackTrust, requestGate } = await import('../lib/session.js')
  const base = { headers: { host: '127.0.0.1:3079' } }
  assert.equal(fallbackTrust(base), undefined, '回环 Host、无 Origin 应放行')
  assert.equal(fallbackTrust({ headers: { host: 'evil.example:3079' } }), 403, '非回环 Host 应拒绝（DNS 重绑定）')
  assert.equal(fallbackTrust({ headers: { host: '127.0.0.1:3079', origin: 'http://evil.example:3079' } }), 403, 'Origin 与 Host 不同应拒绝')
  assert.equal(fallbackTrust({ headers: { host: '127.0.0.1:3079', 'sec-fetch-site': 'cross-site' } }), 403, 'cross-site 应拒绝')
  assert.equal(fallbackTrust({ headers: { host: '127.0.0.1:3079', origin: 'http://127.0.0.1:3079' } }), undefined, '同源 Origin 应放行')

  const fakeCtx = { get: (name) => name === 'connection' ? { requestRejection: () => 401 } : undefined }
  assert.equal(requestGate(fakeCtx, base), 401, '有 Connection 时以它的结论为准')
  const noConnection = { get: () => undefined }
  assert.equal(requestGate(noConnection, base), undefined, '没有 Connection 时退回回环围栏')
  count++
}

// 16. 入站唤醒 fail-closed：空名单不能等于“谁都能唤醒”
{
  assert.equal(wakeAllowlist({ chats: [CHAT], wakeChats: [] }).length, 1)
  assert.equal(allowedWake(CHAT, { chats: [CHAT], wakeChats: [] }), true)
  assert.equal(allowedWake(OTHER, { chats: [CHAT], wakeChats: [] }), false)

  saveCfg({ chats: [], wakeChats: [] })
  assert.equal(wakeAllowlist(loadCfg()), null, '空名单应返回 null')
  assert.equal(allowedWake(CHAT, loadCfg()), false, '空名单下任何 chat 都不能唤醒')

  saveCfg({ chats: [], wakeChats: [OTHER] })
  assert.equal(allowedWake(OTHER, loadCfg()), true, 'wakeChats 优先于 chats')
  assert.equal(allowedWake(CHAT, loadCfg()), false, '不在 wakeChats 里的 chat 不能唤醒')

  saveCfg({ chats: [CHAT], wakeChats: [] })
  assert.equal(allowedWake(CHAT, loadCfg()), true)
  count++
}

// 17. 入站门禁：只收白名单 chat；chats ∪ wakeChats 都为空时什么都不收
{
  saveCfg({ chats: [], wakeChats: [] })
  assert.equal(inboundAllowlist(loadCfg()), null, '空名单应返回 null')
  assert.equal(inboundAllowed(CHAT, loadCfg()), false, '空名单下任何入站消息都不处理')

  saveCfg({ chats: [CHAT], wakeChats: [] })
  assert.equal(inboundAllowed(CHAT, loadCfg()), true)
  assert.equal(inboundAllowed(OTHER, loadCfg()), false, '非白名单 chat 的入站消息不处理')

  saveCfg({ chats: [CHAT], wakeChats: [OTHER] })
  assert.equal(inboundAllowed(OTHER, loadCfg()), true, '只写进 wakeChats 的 chat 也应接收')
  assert.equal(inboundAllowed('-100222', loadCfg()), false)

  saveCfg({ chats: [CHAT], wakeChats: [] })
  count++
}

// 18. 编辑消息不唤醒
{
  const { wakeEligible } = await import('../lib/watchers/inbox.js')
  assert.equal(wakeEligible({ message: { message_id: 1 } }), true, '新消息可唤醒')
  assert.equal(wakeEligible({ edited_message: { message_id: 1 } }), false, '编辑只更新缓存，不唤醒')
  assert.equal(wakeEligible({ channel_post: { message_id: 1 } }), true, '频道帖子可唤醒')
  assert.equal(wakeEligible({}), false)
  count++
}

// 19. 配置 TTL 缓存：命中缓存，保存后立即失效
{
  const first = loadCfgCached()
  assert.equal(loadCfgCached(), first, '1 秒内应返回同一个对象')
  saveCfg({ historyLimit: 77 })
  assert.notEqual(loadCfgCached(), first, 'saveCfg 后缓存应失效')
  assert.equal(loadCfgCached().historyLimit, 77)
  saveCfg({ historyLimit: 50 })
  count++
}

server.close()
rmSync(home, { recursive: true, force: true })
console.log(`✓ smoke: ${count} 组断言通过（${calls.length} 次假 API 调用）`)
