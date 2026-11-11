// 目标会话解析、工具挂载，以及一个最小的 targetSession HTTP 接口。
//
// 每个工具组件自己调用 mountOneTool：它每 3 秒读一次配置，找到 targetSession
// 对应的活 Agent，把工具注册到该 Agent 的 ctx.tools 上；目标会话变化/消失时自动卸下。

import { loadCfg, saveCfg, ensureCfg, diag } from './config.js'
import { bindCredentials } from './runtime.js'

export function targetSessionId() {
  return String(loadCfg().targetSession || '')
}

function sessionIdOf(agent) {
  try {
    const session = agent && agent.session
    return String((session && (session.id || session.sessionId)) || (agent && agent.id) || '')
  } catch (error) {
    return ''
  }
}

export function findAgent(agents, id) {
  const raw = String(id || '').trim()
  if (!raw) return undefined
  const candidates = [raw]
  if (raw.startsWith('session-')) candidates.push(raw.slice('session-'.length))
  else candidates.push('session-' + raw)
  for (const one of candidates) {
    try {
      const agent = agents.get(one)
      if (agent !== undefined) return agent
    } catch (error) {}
  }
  try {
    for (const agent of agents.list() || []) {
      const sid = sessionIdOf(agent)
      if (sid === raw || 'session-' + sid === raw || sid === raw.replace(/^session-/, '')) return agent
    }
  } catch (error) {}
  return undefined
}

function replyJson(res, status, body) {
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
  } catch (error) {}
}

async function readRequestJson(req, max = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > max) throw new Error('body too large')
    chunks.push(buf)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// 配置接口的准入。优先交给 DSH Connection：它做 Host/Origin 围栏（Host 必须是
// 回环/受信地址、拒绝 cross-site、Origin 必须与 Host 同权威）并校验浏览器会话，
// 这样 DNS 重绑定拿不到回环 Host，也就过不去。
//
// 没有 connection 服务时退回本地围栏：只接受回环 Host，Origin 存在时必须与 Host
// 一致，并拒绝 sec-fetch-site: cross-site。返回值是 403/401，或 undefined 表示放行。
export function fallbackTrust(req) {
  const headers = (req && req.headers) || {}
  const host = String(headers.host || '')
  if (!host) return 403
  let authority
  try {
    authority = new URL('http://' + host)
  } catch (error) {
    return 403
  }
  const hostname = authority.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') return 403
  if (String(headers['sec-fetch-site'] || '') === 'cross-site') return 403
  const origin = String(headers.origin || '')
  if (origin) {
    try {
      if (new URL(origin).host !== host) return 403
    } catch (error) {
      return 403
    }
  }
  return undefined
}

export function requestGate(ctx, req) {
  try {
    const connection = ctx.get('connection')
    if (connection && typeof connection.requestRejection === 'function') {
      return connection.requestRejection(req)
    }
  } catch (error) {}
  return fallbackTrust(req)
}

const TARGET_SESSION_ROUTE = '/api/dsh-tg-tools/target-session'
const CONFIG_ROUTE = '/api/dsh-tg-tools/config'

function liveSessionIds(ctx) {
  const ids = []
  try {
    const agents = ctx.get('agents') || ctx.agents
    for (const agent of (agents && agents.list()) || []) {
      const sid = sessionIdOf(agent)
      if (sid) ids.push(sid)
    }
  } catch (error) {}
  return ids
}

function publicConfig(cfg, ctx) {
  return {
    ok: true,
    targetSession: String(cfg.targetSession || ''),
    apiBase: String(cfg.apiBase || ''),
    hasToken: Boolean(cfg.botToken),
    chats: Array.isArray(cfg.chats) ? cfg.chats : [],
    pollEnabled: cfg.pollEnabled === true,
    wakeOnPrivate: cfg.wakeOnPrivate !== false,
    wakeOnMention: cfg.wakeOnMention !== false,
    wakeAll: cfg.wakeAll === true,
    wakeChats: Array.isArray(cfg.wakeChats) ? cfg.wakeChats : [],
    historyLimit: Number(cfg.historyLimit) || 50,
    pollTimeout: Number(cfg.pollTimeout) || 25,
    liveSessionIds: liveSessionIds(ctx),
  }
}

function chatList(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[\n,，]+/)
  return raw.map((one) => String(one == null ? '' : one).trim()).filter(Boolean).slice(0, 200)
}

export function mountConfigRoute(ctx) {
  const webServer = ctx.get('webServer')
  if (!webServer || typeof webServer.register !== 'function') {
    diag('设置页：宿主没有 webServer，配置接口不可用')
    return
  }
  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: CONFIG_ROUTE,
      handler: async (req, res) => {
        const rejection = requestGate(ctx, req)
        if (rejection !== undefined) {
          replyJson(res, rejection, { ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden' })
          return
        }
        const method = String(req.method || 'GET').toUpperCase()
        if (method === 'GET') {
          replyJson(res, 200, publicConfig(loadCfg(), ctx))
          return
        }
        if (method !== 'POST') {
          replyJson(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        let body
        try {
          body = await readRequestJson(req)
        } catch (error) {
          replyJson(res, 400, { ok: false, error: 'invalid body' })
          return
        }
        const patch = {}
        if (Object.prototype.hasOwnProperty.call(body, 'targetSession')) {
          patch.targetSession = String(body.targetSession || '').trim().slice(0, 200)
        }
        if (Object.prototype.hasOwnProperty.call(body, 'apiBase')) {
          const value = String(body.apiBase || '').trim().replace(/\/+$/, '')
          try {
            const url = new URL(value)
            if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol')
          } catch (error) {
            replyJson(res, 400, { ok: false, error: 'apiBase 必须是 http(s) URL' })
            return
          }
          patch.apiBase = value
        }
        if (body.clearToken === true) patch.botToken = ''
        else if (typeof body.botToken === 'string' && body.botToken.trim()) patch.botToken = body.botToken.trim()
        if (Object.prototype.hasOwnProperty.call(body, 'chats')) patch.chats = chatList(body.chats)
        if (Object.prototype.hasOwnProperty.call(body, 'wakeChats')) patch.wakeChats = chatList(body.wakeChats)
        if (Object.prototype.hasOwnProperty.call(body, 'pollEnabled')) patch.pollEnabled = body.pollEnabled === true
        if (Object.prototype.hasOwnProperty.call(body, 'wakeOnPrivate')) patch.wakeOnPrivate = body.wakeOnPrivate === true
        if (Object.prototype.hasOwnProperty.call(body, 'wakeOnMention')) patch.wakeOnMention = body.wakeOnMention === true
        if (Object.prototype.hasOwnProperty.call(body, 'wakeAll')) patch.wakeAll = body.wakeAll === true
        if (Object.prototype.hasOwnProperty.call(body, 'historyLimit')) {
          patch.historyLimit = Math.max(1, Math.min(Number(body.historyLimit) || 50, 200))
        }
        if (Object.prototype.hasOwnProperty.call(body, 'pollTimeout')) {
          patch.pollTimeout = Math.max(1, Math.min(Number(body.pollTimeout) || 25, 50))
        }
        try {
          saveCfg(patch)
        } catch (error) {
          replyJson(res, 500, { ok: false, error: 'save failed' })
          return
        }
        diag('配置已更新：' + Object.keys(patch).join(', '))
        replyJson(res, 200, publicConfig(loadCfg(), ctx))
      },
    })
    return () => {
      try { dispose() } catch (error) {}
    }
  }, 'tg-tools: config route')
}

export function mountTargetSessionRoute(ctx) {
  const webServer = ctx.get('webServer')
  if (!webServer || typeof webServer.register !== 'function') {
    diag('挂载会话：宿主没有 webServer，targetSession 接口不可用')
    return
  }
  ctx.effect(() => {
    const dispose = webServer.register({
      kind: 'exact',
      path: TARGET_SESSION_ROUTE,
      handler: async (req, res) => {
        const rejection = requestGate(ctx, req)
        if (rejection !== undefined) {
          replyJson(res, rejection, { ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden' })
          return
        }
        const method = String(req.method || 'GET').toUpperCase()
        if (method === 'GET') {
          const liveSessionIds = []
          try {
            const agents = ctx.get('agents') || ctx.agents
            for (const agent of (agents && agents.list()) || []) {
              const sid = sessionIdOf(agent)
              if (sid) liveSessionIds.push(sid)
            }
          } catch (error) {}
          replyJson(res, 200, { ok: true, targetSession: targetSessionId(), liveSessionIds })
          return
        }
        if (method !== 'POST') {
          replyJson(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        let body
        try {
          body = await readRequestJson(req)
        } catch (error) {
          replyJson(res, 400, { ok: false, error: 'invalid body' })
          return
        }
        const targetSession = String((body && body.targetSession) || '').trim().slice(0, 200)
        try {
          saveCfg({ targetSession })
        } catch (error) {
          replyJson(res, 500, { ok: false, error: 'save failed' })
          return
        }
        diag('目标会话已更新：' + (targetSession || '（不挂载）'))
        replyJson(res, 200, { ok: true, targetSession })
      },
    })
    return () => {
      try { dispose() } catch (error) {}
    }
  }, 'tg-tools: target session route')
}

const activeCounts = new Map()

function markActive(name, delta) {
  const next = Math.max(0, (activeCounts.get(name) || 0) + delta)
  if (next === 0) activeCounts.delete(name)
  else activeCounts.set(name, next)
}

export function hasActiveTool(name) {
  return (activeCounts.get(name) || 0) > 0
}

export function mountOneTool(ctx, tool) {
  ensureCfg()
  bindCredentials(ctx)
  markActive(tool.name, 1)
  const mounted = new Map()

  function unmountAll(reason) {
    for (const [sid, value] of mounted) {
      try {
        if (typeof value.off === 'function') value.off()
      } catch (error) {}
      diag('工具 ' + tool.name + ' 已从会话 ' + sid + ' 卸下：' + reason)
    }
    mounted.clear()
  }

  function tick() {
    const target = targetSessionId()
    if (!target) {
      if (mounted.size) unmountAll('没有目标会话')
      return
    }
    const agent = findAgent(ctx.agents, target)
    if (!agent) {
      if (mounted.size) unmountAll('目标会话没有活着')
      return
    }
    const sid = sessionIdOf(agent)
    if (mounted.has(sid)) return
    unmountAll('目标会话变了')
    try {
      const off = agent.ctx.tools.register(tool)
      mounted.set(sid, { agent, off })
      diag('工具 ' + tool.name + ' 已挂到会话 ' + sid)
    } catch (error) {
      diag('工具挂载失败 ' + tool.name + '：' + String((error && error.message) || error))
    }
  }

  tick()
  ctx.effect(() => ctx.interval(tick, 3000))
  ctx.effect(() => () => {
    markActive(tool.name, -1)
    unmountAll('插件卸载')
  })
  return { tool, tick, unmountAll, mounted }
}
