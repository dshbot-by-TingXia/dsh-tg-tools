# dsh-tg-tools

给 DSH（DeepSeek Harness）会话用的 Telegram 工具集，仿照 [`dsh-qq-tools`](https://github.com/cyhddyx/dsh-qq-tools) 的“每个工具一个组件”结构。

只走 **Telegram Bot API**，不引入 MTProto / Telethon，所以不需要手机号登录，也不需要常驻的客户端进程：一个 bot token 就能让会话收发 Telegram 消息。代价是 Bot API 本身的能力边界（见 [已知限制](#已知限制)）。

每个工具都是独立的 cordis 组件，可以在插件页的「包含的组件」里逐个开关；另有一个设置组件负责选择挂载到哪个 DSH 会话。

## 工具一览

| 组件 | 工具 | 说明 |
| --- | --- | --- |
| 列出 chat | `tg_list_chats` | 配置里声明的 chat + bot 收到过消息的 chat |
| 查 chat | `tg_get_chat` | 类型、标题、用户名、简介、成员数 |
| 看消息 | `tg_get_history` | 读本地缓存的消息（不是服务端历史） |
| 查成员 | `tg_get_chat_members` | 管理员列表 + 成员数；可按 user_id 查单个成员 |
| 发消息 | `tg_send_message` | 发文字，可引用、可进 Topics 话题，支持 HTML/MarkdownV2 |
| 发图片 | `tg_send_photo` | 图片 URL 或 Telegram `file_id`，可带 caption |
| 发贴纸 | `tg_send_sticker` | 贴纸 `file_id` 或 `.webp` URL |
| 发动画 | `tg_send_animation` | GIF/MP4 URL 或 `file_id` |
| 发骰子 | `tg_send_dice` | 🎲 / 🎯 / 🏀 / ⚽ / 🎰 |
| 加 reaction | `tg_set_reaction` | 给消息加/换一个 emoji reaction |
| 查贴纸包 | `tg_get_sticker_set` | 拿贴纸的 `file_id` |
| 转发 | `tg_forward_message` | 跨 chat 转发消息 |
| 编辑 | `tg_edit_message` | 只能改 bot 自己发的消息 |
| 删除 | `tg_delete_message` | 需要管理员权限 |
| typing | `tg_send_typing` | 显示 typing / upload 等状态 |
| 收消息 | `tg_inbox` | 可选轮询 `getUpdates`：缓存消息并唤醒目标会话 |
| 设置 | — | 插件页里的配置页 + 左侧栏入口 |

关掉「收消息」只影响轮询和缓存，其他工具照常可用；工具本身只读不写时（列 chat、查 chat、看缓存、查成员、查贴纸包）不产生任何平台副作用。

## 安装

```sh
# 从 GitHub 安装
dsh plugin --profile <profile> add github:dshbot-by-TingXia/dsh-tg-tools

# 本地开发（改代码即时生效）
dsh plugin --profile <profile> add link:/path/to/dsh-tg-tools

# 离线 tarball
pnpm pack
dsh plugin --profile <profile> add ./dsh-tg-tools-1.0.0.tgz
```

`dsh plugin` 会把包追加进 profile 的 `dsh.profile.bundles`，并合并包自带的 `cordis.patch.yml`。安装或升级后重启 DSH 生效。卸载：

```sh
dsh plugin --profile <profile> remove dsh-tg-tools
```

## 配置

首次启动会生成 `~/.dsh/tg-tools-config.json`（权限 600）：

```json
{
  "apiBase": "https://api.telegram.org",
  "botToken": "",
  "targetSession": "",
  "chats": [],
  "historyLimit": 50,
  "maxHistoryLimit": 200,
  "pollEnabled": false,
  "pollTimeout": 25,
  "wakeOnPrivate": true,
  "wakeOnMention": true,
  "wakeAll": false,
  "wakeChats": [],
  "timeoutMs": 10000
}
```

| 字段 | 说明 |
| --- | --- |
| `apiBase` | Bot API 根地址，默认 `https://api.telegram.org`；如果你自己搭了反代，填自己的地址 |
| `botToken` | BotFather 给的 token；也可以不填，回退到 `TG_TOOLS_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` 环境变量或 `~/.dsh/.env` |
| `targetSession` | 工具挂到哪个 DSH 会话；设置页里改，也可以 POST `/api/dsh-tg-tools/target-session` |
| `chats` | 允许操作的 chat id 或 `@username`；空 = 不限制。**建议写死要操作的 chat** |
| `historyLimit` / `maxHistoryLimit` | `tg_get_history` 的默认/最大条数 |
| `pollEnabled` | 是否启动 `getUpdates`；默认关闭 |
| `pollTimeout` | 长轮询秒数，1–50 |
| `wakeOnPrivate` / `wakeOnMention` | 私聊 / 群里 @ 或回复 bot 时唤醒会话 |
| `wakeAll` | true = `wakeChats` 里的群所有消息都唤醒（可能很吵） |
| `wakeChats` | 唤醒白名单；空则复用 `chats` |
| `timeoutMs` | 单次 API 请求超时 |

### token 与 409 冲突

**同一个 bot token 同一时间只能有一个 `getUpdates` 轮询者**，否则 Telegram 返回：

```
409 Conflict: terminated by other getUpdates request
```

所以开 `pollEnabled` 前，确认没有别的程序（另一个 bot 框架、另一个 DSH、脚本）也在用这个 token 收消息。只发不收时（`pollEnabled=false`）没有这个限制。

群里要让 bot 收到消息，还需要在 **@BotFather → /setprivacy → Disable**，或者让消息 @ bot / 回复 bot。

## 设置界面

插件页的「Telegram 设置」和左侧栏入口提供配置页，可以直接改：挂载会话、Bot API 地址、bot token（已配置时留空表示不修改）、允许的 chat、唤醒白名单、收消息轮询、唤醒开关、缓存条数、长轮询秒数。

读写接口是 `/api/dsh-tg-tools/config`，只接受同源请求；保存后约 3 秒生效，不需要重启。

## 收消息与唤醒

`pollEnabled=true` 时插件会：

1. 把 bot 收到的消息写进 `~/.dsh/tg-tools-state.json`（每个 chat 最多 300 条），供 `tg_get_history` 读取；
2. 私聊消息、群里 @/回复 bot（或 `wakeAll`）时，把一条摘要投递给目标会话，并在摘要里提示可用的回复工具。

bot 自己的消息不入缓存；`edited_message` 按 `message_id` 覆盖原条。bot 离线期间的消息不会补，重启后缓存仍在。

## 安全与隐私

- bot token 只存在 `~/.dsh/tg-tools-config.json`（600）或环境变量/credential store 里，不写进代码、不进日志；
- 诊断日志 `~/.dsh/tg-tools-diag.log` 只记 chat id、发送者昵称和消息前 160 字，不含 token；
- `chats` 白名单为空时插件不限制目标 chat，正式使用建议写死；
- 只把 bot 拉进你允许它操作的 chat；被拉进不该进的群等于把这些群的读写能力交给它；
- 自动发消息有平台风控风险，低频、必要时人工确认更稳。

更多数据流与权限说明见 [SECURITY.md](SECURITY.md)。

## 已知限制

- `tg_get_history` 读的是**本地缓存**，不是 Telegram 服务端历史：bot 加入前的消息、离线期间的消息都看不到；
- Bot API 的 `getChatAdministrators` 只能列管理员，不能列出群里的全部成员；
- 图片/贴纸/GIF 只支持 URL 或 `file_id`，当前不直接上传本地文件（需要 multipart，后续可加）；本地文件可以先传到公开 URL 再发；
- 普通 Unicode emoji 不需要单独工具，直接写进 `tg_send_message` 的 `text`；
- Telegram 贴纸不是 QQ 收藏表情：bot 不能浏览你的贴纸收藏夹，只能按 `file_id`/URL 发已知贴纸，或先 `tg_get_sticker_set` 查公开包；
- reaction 需要 chat 允许 bot 加，部分群/频道会拒绝；
- 同一 token 同时被两个 `getUpdates` 轮询会 409。

## 目录结构

```
cordis.patch.yml            17 个组件行（16 个工具 + 包根 carrier）
lib/index.js                包根：carrier 模式挂配置接口，否则挂全部工具
lib/config.js               配置读写、chat/唤醒白名单
lib/api.js                  Bot API 最小封装
lib/client.js               浏览器半侧：左侧栏入口 + 插件行配置页
lib/session.js              目标会话解析、工具挂载、配置/targetSession 接口
lib/store.js                消息缓存
lib/render.js               工具结果渲染
lib/runtime.js              credential store 里的 token 回退
lib/mount-all.js            旧的全量入口
lib/tools/                  按域拆开的工具工厂（chats/messages/media/expressions）
lib/watchers/inbox.js       getUpdates 轮询与唤醒
tools/tg-*/                 组件入口（每个只做一件事：把自己挂到目标会话）
locale/                     包根行在插件页显示的标题和说明
test/smoke.mjs              离线冒烟测试：假 Bot API + 临时 DSH_HOME
```

## 开发与测试

```sh
npm test
```

`test/smoke.mjs` 会起一个本地假 Bot API 服务、把 `DSH_HOME` 指到临时目录，检查各工具发出的请求体、白名单拦截、缓存写入和配置权限，不连真实 Telegram，也不碰你的 `~/.dsh/tg-tools-config.json`。

## 兼容性

- Node.js `>=22`（使用内置 `fetch`）；
- DSH `0.2.x`，机器可读版本范围在 `package.json` 的 `dsh.compatibility`；
- 浏览器半侧需要 DSH Web 的 `locale` / `slots` / `plugins.row.config` 能力。

## License

MIT
