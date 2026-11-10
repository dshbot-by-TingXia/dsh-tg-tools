// dsh-tg-tools —— 包根入口。
//
// carrier=true 时只承载 targetSession 的 HTTP 接口；各工具由 cordis.patch.yml
// 里的子路径行分别挂载，插件页可以逐个开关。
import { mountAll } from './mount-all.js'
import { mountConfigRoute, mountTargetSessionRoute } from './session.js'

export * from './config.js'
export * from './runtime.js'
export * from './api.js'
export * from './store.js'
export * from './render.js'
export * from './session.js'
export * from './watchers/inbox.js'
export * from './tools/chats.js'
export * from './tools/messages.js'
export * from './tools/media.js'
export * from './tools/expressions.js'
export * from './mount-all.js'

export const name = 'tg-tools'
export const inject = ['agents', 'timer', 'tools', 'webServer']

export function apply(ctx, config) {
  if (config && config.carrier === true) {
    mountTargetSessionRoute(ctx)
    mountConfigRoute(ctx)
    return {}
  }
  return mountAll(ctx)
}
