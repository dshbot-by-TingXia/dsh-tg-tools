import { makeGetStickerSetTool } from '../../lib/tools/expressions.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-get-sticker-set'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeGetStickerSetTool())
}
