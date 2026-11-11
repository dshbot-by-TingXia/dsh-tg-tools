# 安全说明

## 插件能做什么

`dsh-tg-tools` 通过 Telegram Bot API 以 bot 身份操作 chat，能力边界完全由 bot token 对应的 bot 权限决定：

- 读取：`getChat`、`getChatAdministrators`、`getChatMemberCount`、`getChatMember`、`getStickerSet`、`getUpdates`；
- 写入：发文字/图片/贴纸/动画/骰子、加 reaction、转发、编辑、删除消息、发送 chat action；
- 本地：读写 `~/.dsh/tg-tools-config.json`、`~/.dsh/tg-tools-state.json`，追加 `~/.dsh/tg-tools-diag.log`；
- 可选：从 DSH credential store 读取 `TELEGRAM_BOT_TOKEN`（仅当配置文件里没有 `botToken` 时）。

插件不发起除 `apiBase` 之外的外网请求，不执行子进程，不读取工作目录以外的文件（配置与缓存都在 `~/.dsh`）。

## 凭证

- bot token 存放在 `~/.dsh/tg-tools-config.json`，写入时权限为 `600`；
- token 不写入代码、不写入 `cordis.patch.yml`、不写入诊断日志，也不会通过配置接口回传（接口只返回 `hasToken: true/false`）；
- 如果 token 曾经出现在聊天记录、日志或公开仓库里，请到 @BotFather 用 `/revoke` 重新生成；
- 配置接口 `/api/dsh-tg-tools/config` 的准入交给 DSH Connection（Host/Origin 围栏 + 浏览器会话鉴权）；没有 Connection 时退回回环 Host 校验，避免其他网页或 DNS 重绑定改配置。

## 数据

- `tg-tools-state.json` 保存 bot 收到的消息摘要：chat id、chat 标题、发送者 id/昵称、消息正文、类型、时间；每个 chat 最多 300 条，文件权限 `600`；
- `tg-tools-diag.log` 记录运行事件：轮询错误、工具挂载/卸下、唤醒投递，以及消息正文前 80 字，用于排障；文件权限 `600`，按 2MB × 3 轮转；不记录 token；
- 这些文件都在 DSH 的 `~/.dsh` 目录下，不会上传到任何第三方；删除它们不影响 bot 继续工作，只会丢掉本地缓存。

## 权限建议

- 入站消息只处理白名单 chat（`chats` ∪ `wakeChats`），名单为空时什么都不接收：bot 的 `@username` 公开可搜，空名单放行等于让任何人往宿主里塞消息；
- 白名单是 **chat 级**：私聊名单等于信任那个人，群名单等于信任群里所有成员。加公开群前先确认这个边界；
- 出站工具在 `chats` 为空时不限制目标 chat。正式使用时建议写死要操作的群/频道 id；
- 不要把 bot 拉进不打算让它读写的群：群消息、成员信息都会对它可见；
- 删除消息、pin 等操作需要 bot 是管理员，按最小权限给管理员；
- 自动回复/自动发消息属于平台风控关注的行为，建议低频、可控，必要时人工确认后再发。


## 报告问题

发现安全问题请开 issue：<https://github.com/dshbot-by-TingXia/dsh-tg-tools/issues>。请勿在 issue 里粘贴真实 bot token、chat id 或消息内容；用占位符描述即可。
