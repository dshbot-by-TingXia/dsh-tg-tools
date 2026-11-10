import { makeGetChatTool } from '../../lib/tools/chats.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-get-chat'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeGetChatTool())
}
