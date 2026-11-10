// 兼容入口：一个插件挂全部 Telegram 工具。

import { mountOneTool } from './session.js'
import { startInbox } from './watchers/inbox.js'
import { makeListChatsTool, makeGetChatTool, makeHistoryTool, makeMembersTool } from './tools/chats.js'
import { makeSendMessageTool, makeForwardMessageTool, makeEditMessageTool, makeDeleteMessageTool, makeSendTypingTool } from './tools/messages.js'
import { makeSendPhotoTool } from './tools/media.js'
import { makeSendStickerTool, makeSendAnimationTool, makeSendDiceTool, makeSetReactionTool, makeGetStickerSetTool } from './tools/expressions.js'

export function mountAll(ctx) {
  const list = mountOneTool(ctx, makeListChatsTool())
  const chat = mountOneTool(ctx, makeGetChatTool())
  const history = mountOneTool(ctx, makeHistoryTool())
  const members = mountOneTool(ctx, makeMembersTool())
  const send = mountOneTool(ctx, makeSendMessageTool())
  const photo = mountOneTool(ctx, makeSendPhotoTool())
  const sticker = mountOneTool(ctx, makeSendStickerTool())
  const animation = mountOneTool(ctx, makeSendAnimationTool())
  const dice = mountOneTool(ctx, makeSendDiceTool())
  const reaction = mountOneTool(ctx, makeSetReactionTool())
  const stickerSet = mountOneTool(ctx, makeGetStickerSetTool())
  const forward = mountOneTool(ctx, makeForwardMessageTool())
  const edit = mountOneTool(ctx, makeEditMessageTool())
  const remove = mountOneTool(ctx, makeDeleteMessageTool())
  const typing = mountOneTool(ctx, makeSendTypingTool())
  startInbox(ctx)
  return {
    tools: [list, chat, history, members, send, photo, sticker, animation, dice, reaction, stickerSet, forward, edit, remove, typing],
    startInbox,
  }
}
