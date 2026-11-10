// 运行时 token 解析。
//
// 复用 DSH credential store 里已有的 TELEGRAM_BOT_TOKEN，
// 避免把 token 再复制进插件自己的配置文件。botToken 配置优先；没有时才走这里。

let credentialsService
let cachedToken = ''

export function bindCredentials(ctx) {
  try {
    const service = ctx.get('credentials')
    if (service && typeof service.resolve === 'function') credentialsService = service
  } catch (error) {}
}

export async function hydrateToken(cfg) {
  if (!cfg || cfg.botToken) return cfg
  if (cachedToken) {
    cfg.botToken = cachedToken
    return cfg
  }
  if (!credentialsService) return cfg
  try {
    const resolved = await credentialsService.resolve('TELEGRAM_BOT_TOKEN')
    if (resolved && resolved.value && resolved.value.length > 0) {
      cachedToken = resolved.value
      cfg.botToken = cachedToken
    }
  } catch (error) {}
  return cfg
}
