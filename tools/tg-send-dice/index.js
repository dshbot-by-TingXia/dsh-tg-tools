import { makeSendDiceTool } from '../../lib/tools/expressions.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-send-dice'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeSendDiceTool())
}
