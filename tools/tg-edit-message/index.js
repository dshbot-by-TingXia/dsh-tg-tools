import { makeEditMessageTool } from '../../lib/tools/messages.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-edit-message'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeEditMessageTool())
}
