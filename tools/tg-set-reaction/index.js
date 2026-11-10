import { makeSetReactionTool } from '../../lib/tools/expressions.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-set-reaction'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeSetReactionTool())
}
