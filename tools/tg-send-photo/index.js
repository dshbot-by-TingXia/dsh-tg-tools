import { makeSendPhotoTool } from '../../lib/tools/media.js'
import { mountOneTool } from '../../lib/session.js'

export const name = 'tg-tools-send-photo'
export const inject = ['agents', 'timer', 'tools']

export function apply(ctx) {
  return mountOneTool(ctx, makeSendPhotoTool())
}
