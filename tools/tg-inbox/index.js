import { startInbox } from '../../lib/watchers/inbox.js'

export const name = 'tg-tools-inbox'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  startInbox(ctx)
  return {}
}
