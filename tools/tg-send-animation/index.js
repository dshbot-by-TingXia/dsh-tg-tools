import { makeSendAnimationTool } from '../../lib/tools/expressions.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-send-animation'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeSendAnimationTool())
}
