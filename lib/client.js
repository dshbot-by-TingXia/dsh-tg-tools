// dsh-tg-tools 的浏览器半侧：左侧栏「Telegram 设置」入口 + 插件行配置页。
// 读写走宿主半侧的 /api/dsh-tg-tools/config，最终落在 ~/.dsh/tg-tools-config.json。
window.__ModuleLoader__.load({
  id: 'dsh-tg-tools',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const h = react.createElement

    const NS = 'tg-tools'
    const API = '/api/dsh-tg-tools/config'
    const SLOT_KEY = 'dsh-tg-tools#tg-tools-root'
    const PANEL_ID = 'tg-tools-settings'
    const PANEL_ORDER = 51
    const EMPTY_IDS = []

    const zh = {
      summary: 'Telegram 配置',
      sidebarLabel: 'Telegram',
      panelTitle: 'Telegram 配置',
      description: '配置 Telegram bot 的工具和收消息行为。保存后约 3 秒生效。',
      target: '挂载会话',
      targetHint: '只有选中的 DSH 会话会拿到 tg_* 工具并收到 Telegram 唤醒。',
      none: '不挂载（关闭 Telegram 唤醒）',
      untitled: '未命名会话',
      running: '（运行中）',
      missing: '当前目标（会话未运行）',
      archived: '当前目标（已归档）',
      apiBase: 'Bot API 地址',
      apiBaseHint: '默认 https://api.telegram.org；有自建反代时填自己的地址。',
      botToken: 'Bot token',
      tokenSet: '已配置；留空表示不修改',
      tokenEmpty: '从 @BotFather 拿到的 token',
      chats: '允许的 chat',
      chatsHint: '一行一个 chat id 或 @username；留空 = 发消息不限制目标，但不接收、不缓存任何入站消息（见下）。建议用数字 id。',
      wakeChats: '唤醒白名单',
      wakeChatsHint: '一行一个；留空 = 使用上面的允许 chat。两者都为空时不接收任何消息。加群 = 信任群内所有人。',
      pollEnabled: '开启收消息轮询（getUpdates）',
      pollHint: '同一个 bot token 不能同时被两个程序轮询，否则 Telegram 返回 409 Conflict。',
      wakeOnPrivate: '私聊消息唤醒',
      wakeOnMention: '群里 @/回复 bot 唤醒',
      wakeAll: '白名单群里所有消息都唤醒',
      historyLimit: '历史缓存条数',
      pollTimeout: '长轮询秒数',
      refresh: '刷新',
      save: '保存',
      saving: '保存中…',
      saved: '已保存，约 3 秒内生效',
      loading: '读取中…',
      failed: '操作失败：',
      current: '当前挂载：',
      empty: '当前没有挂载任何会话。',
      tokenOn: '已配置 token',
      tokenOff: '未配置 token',
      unavailable: '接口不可用。请先在插件页启用「Telegram 设置」组件。',
    }

    const en = {
      summary: 'Telegram settings',
      sidebarLabel: 'Telegram',
      panelTitle: 'Telegram settings',
      description: 'Configure the Telegram bot tools and inbound behavior. Changes apply within about 3 seconds.',
      target: 'Target session',
      targetHint: 'Only the selected DSH session gets the tg_* tools and Telegram wake-ups.',
      none: 'Do not mount (disable Telegram wake-ups)',
      untitled: 'Untitled session',
      running: ' (running)',
      missing: 'Current target (not running)',
      archived: 'Current target (archived)',
      apiBase: 'Bot API base',
      apiBaseHint: 'Default https://api.telegram.org; set your own reverse-proxy URL if you run one.',
      botToken: 'Bot token',
      tokenSet: 'Configured; leave blank to keep it',
      tokenEmpty: 'Token from @BotFather',
      chats: 'Allowed chats',
      chatsHint: 'One chat id or @username per line; empty means outbound tools are unrestricted, but no inbound message is received or cached (see below).',
      wakeChats: 'Wake-up chats',
      wakeChatsHint: 'One per line; empty means use the allowed chats. When both are empty nothing is received. Whitelisting a group trusts every member.',
      pollEnabled: 'Enable inbound polling (getUpdates)',
      pollHint: 'Only one program may poll a bot token at a time; otherwise Telegram returns 409 Conflict.',
      wakeOnPrivate: 'Wake on private messages',
      wakeOnMention: 'Wake on group mention/reply',
      wakeAll: 'Wake on every message in wake-up chats',
      historyLimit: 'Cached messages',
      pollTimeout: 'Long-poll seconds',
      refresh: 'Refresh',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved; applies within about 3 seconds',
      loading: 'Loading…',
      failed: 'Request failed: ',
      current: 'Mounted to: ',
      empty: 'No session is mounted.',
      tokenOn: 'token configured',
      tokenOff: 'no token',
      unavailable: 'Endpoint unavailable. Enable the "Telegram settings" component on the plugin page first.',
    }

    const inject = ['slots', 'locale']

    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      height: 36,
      padding: '0 10px',
      borderRadius: 8,
      border: '0.5px solid var(--dsw-alias-border-l4)',
      background: 'var(--dsw-alias-bg-layer-3)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: 13,
      outline: 'none',
    }
    const areaStyle = {
      ...inputStyle,
      height: 86,
      padding: '8px 10px',
      resize: 'vertical',
      lineHeight: '20px',
    }
    const labelStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontSize: 12,
      color: 'var(--dsw-alias-label-secondary)',
    }
    const hintStyle = {
      margin: 0,
      fontSize: 11,
      lineHeight: '17px',
      color: 'var(--dsw-alias-label-tertiary)',
    }
    const checkStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: 'var(--dsw-alias-label-primary)',
    }
    const buttonStyle = {
      height: 36,
      padding: '0 14px',
      borderRadius: 8,
      border: '0.5px solid var(--dsw-alias-border-l4)',
      background: 'var(--dsw-alias-bg-layer-3)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: 13,
      cursor: 'pointer',
    }

    function shortId(id) {
      const s = String(id || '')
      return s.length > 12 ? s.slice(0, 8) + '…' : s
    }

    function readJsonResponse(response) {
      return response.text().then((text) => {
        let body = {}
        try { body = text ? JSON.parse(text) : {} } catch (error) {}
        return { ok: response.ok, body }
      })
    }

    function Field(props) {
      return h('label', { style: labelStyle }, [
        h('span', { key: 'label' }, props.label),
        props.children,
        props.hint ? h('span', { key: 'hint', style: hintStyle }, props.hint) : null,
      ])
    }

    function ConfigCard(props) {
      const t = props.t
      const list = props.useSessions ? props.useSessions((state) => state) : {}
      const useWorkspaces = props.useWorkspaces || (() => EMPTY_IDS)
      const archivedSessionIds = useWorkspaces((state) => (state && state.archivedSessionIds) || EMPTY_IDS) || EMPTY_IDS
      const archived = react.useMemo(() => new Set(archivedSessionIds), [archivedSessionIds])
      const [config, setConfig] = react.useState(null)
      const [selected, setSelected] = react.useState('')
      const [token, setToken] = react.useState('')
      const [chatsText, setChatsText] = react.useState('')
      const [wakeChatsText, setWakeChatsText] = react.useState('')
      const [liveIds, setLiveIds] = react.useState([])
      const [phase, setPhase] = react.useState('loading')
      const [detail, setDetail] = react.useState('')

      const load = react.useCallback(() => {
        setPhase('loading')
        setDetail('')
        fetch(API, { headers: { accept: 'application/json' } })
          .then(readJsonResponse)
          .then(({ ok, body }) => {
            if (!ok || !body || body.ok !== true) throw new Error((body && body.error) || t('unavailable'))
            setConfig(body)
            setSelected(typeof body.targetSession === 'string' ? body.targetSession : '')
            setToken('')
            setChatsText(Array.isArray(body.chats) ? body.chats.join('\n') : '')
            setWakeChatsText(Array.isArray(body.wakeChats) ? body.wakeChats.join('\n') : '')
            setLiveIds(Array.isArray(body.liveSessionIds) ? body.liveSessionIds : [])
            setPhase('ready')
          })
          .catch((error) => {
            setDetail(String((error && error.message) || error))
            setPhase('error')
          })
      }, [t])

      react.useEffect(() => {
        load()
      }, [load])

      const update = react.useCallback((patch) => {
        setConfig((current) => ({ ...(current || {}), ...patch }))
      }, [])

      const save = react.useCallback(() => {
        if (!config) return
        setPhase('saving')
        setDetail('')
        const payload = {
          targetSession: selected,
          apiBase: config.apiBase,
          chats: chatsText,
          wakeChats: wakeChatsText,
          pollEnabled: config.pollEnabled === true,
          wakeOnPrivate: config.wakeOnPrivate !== false,
          wakeOnMention: config.wakeOnMention !== false,
          wakeAll: config.wakeAll === true,
          historyLimit: Number(config.historyLimit) || 50,
          pollTimeout: Number(config.pollTimeout) || 25,
        }
        if (token.trim()) payload.botToken = token.trim()
        fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(readJsonResponse)
          .then(({ ok, body }) => {
            if (!ok || !body || body.ok !== true) throw new Error((body && body.error) || 'save failed')
            setConfig(body)
            setSelected(typeof body.targetSession === 'string' ? body.targetSession : '')
            setToken('')
            setChatsText(Array.isArray(body.chats) ? body.chats.join('\n') : '')
            setWakeChatsText(Array.isArray(body.wakeChats) ? body.wakeChats.join('\n') : '')
            setLiveIds(Array.isArray(body.liveSessionIds) ? body.liveSessionIds : [])
            setPhase('saved')
          })
          .catch((error) => {
            setDetail(String((error && error.message) || error))
            setPhase('error')
          })
      }, [config, selected, token, chatsText, wakeChatsText])

      const sessions = react.useMemo(() => {
        const ids = Array.isArray(list && list.ids) ? list.ids : []
        const byId = (list && list.byId) || {}
        return ids.map((id) => byId[id]).filter(Boolean)
      }, [list])

      const options = [h('option', { key: '__none', value: '' }, t('none'))]
      let selectedInList = false
      for (const session of sessions) {
        if (!session || !session.id) continue
        if (session.origin === 'subagent') continue
        if (archived.has(session.id)) continue
        if (session.id === selected) selectedInList = true
        const title = String(session.title || '').trim() || t('untitled')
        const running = session.running === true || liveIds.indexOf(session.id) >= 0
        options.push(h(
          'option',
          { key: session.id, value: session.id },
          title + ' · ' + shortId(session.id) + (running ? t('running') : ''),
        ))
      }
      if (selected && !selectedInList) {
        options.push(h(
          'option',
          { key: '__current', value: selected },
          (archived.has(selected) ? t('archived') : t('missing')) + ' · ' + shortId(selected),
        ))
      }

      if (props.view === 'summary') {
        if (!config) return h('span', null, t('loading'))
        const target = config.targetSession ? t('current') + shortId(config.targetSession) : t('empty')
        return h('span', null, target + ' · ' + (config.hasToken ? t('tokenOn') : t('tokenOff')))
      }

      let statusText = ''
      let statusColor = 'var(--dsw-alias-label-tertiary)'
      if (phase === 'loading') statusText = t('loading')
      else if (phase === 'saving') statusText = t('saving')
      else if (phase === 'saved') {
        statusText = t('saved')
        statusColor = 'var(--dsw-alias-state-success-primary, #2f9e44)'
      } else if (phase === 'error') {
        statusText = t('failed') + (detail || t('unavailable'))
        statusColor = 'var(--dsw-alias-state-error-primary, #d64545)'
      } else if (config) {
        const target = config.targetSession ? t('current') + shortId(config.targetSession) : t('empty')
        statusText = target + ' · ' + (config.hasToken ? t('tokenOn') : t('tokenOff'))
      }

      const disabled = !config || phase === 'saving' || phase === 'loading'
      const checkbox = (key, label) => h('label', { key, style: checkStyle }, [
        h('input', {
          key: 'box',
          type: 'checkbox',
          checked: config ? config[key] === true : false,
          disabled,
          onChange: (event) => update({ [key]: event.target.checked }),
        }),
        h('span', { key: 'text' }, label),
      ])

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } }, [
        h('p', {
          key: 'desc',
          style: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' },
        }, t('description')),

        h(Field, { key: 'target', label: t('target'), hint: t('targetHint') },
          h('select', {
            value: selected,
            disabled,
            onChange: (event) => {
              setSelected(event.target.value)
              if (phase === 'saved' || phase === 'error') setPhase('ready')
            },
            style: inputStyle,
          }, options),
        ),

        h('div', {
          key: 'api-row',
          style: { display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr)', gap: 12 },
        }, [
          h(Field, { key: 'apiBase', label: t('apiBase'), hint: t('apiBaseHint') },
            h('input', {
              type: 'text',
              value: config ? config.apiBase || '' : '',
              disabled,
              placeholder: 'https://api.telegram.org',
              onChange: (event) => update({ apiBase: event.target.value }),
              style: inputStyle,
            }),
          ),
          h(Field, { key: 'token', label: t('botToken'), hint: config && config.hasToken ? t('tokenSet') : t('tokenEmpty') },
            h('input', {
              type: 'password',
              value: token,
              disabled,
              placeholder: config && config.hasToken ? '••••••••' : '',
              autoComplete: 'off',
              onChange: (event) => setToken(event.target.value),
              style: inputStyle,
            }),
          ),
        ]),

        h('div', {
          key: 'chat-row',
          style: { display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr)', gap: 12 },
        }, [
          h(Field, { key: 'chats', label: t('chats'), hint: t('chatsHint') },
            h('textarea', {
              value: chatsText,
              disabled,
              placeholder: '-1001234567890\n@somechannel',
              onChange: (event) => setChatsText(event.target.value),
              style: areaStyle,
            }),
          ),
          h(Field, { key: 'wakeChats', label: t('wakeChats'), hint: t('wakeChatsHint') },
            h('textarea', {
              value: wakeChatsText,
              disabled,
              placeholder: '-1001234567890',
              onChange: (event) => setWakeChatsText(event.target.value),
              style: areaStyle,
            }),
          ),
        ]),

        h('div', { key: 'poll', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
          checkbox('pollEnabled', t('pollEnabled')),
          h('p', { key: 'pollHint', style: hintStyle }, t('pollHint')),
        ]),

        h('div', { key: 'wake', style: { display: 'flex', gap: 18, flexWrap: 'wrap' } }, [
          checkbox('wakeOnPrivate', t('wakeOnPrivate')),
          checkbox('wakeOnMention', t('wakeOnMention')),
          checkbox('wakeAll', t('wakeAll')),
        ]),

        h('div', {
          key: 'num-row',
          style: { display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) minmax(160px, 220px)', gap: 12 },
        }, [
          h(Field, { key: 'historyLimit', label: t('historyLimit') },
            h('input', {
              type: 'number',
              min: 1,
              max: 200,
              value: config ? config.historyLimit || 50 : 50,
              disabled,
              onChange: (event) => update({ historyLimit: Number(event.target.value) || 50 }),
              style: inputStyle,
            }),
          ),
          h(Field, { key: 'pollTimeout', label: t('pollTimeout') },
            h('input', {
              type: 'number',
              min: 1,
              max: 50,
              value: config ? config.pollTimeout || 25 : 25,
              disabled,
              onChange: (event) => update({ pollTimeout: Number(event.target.value) || 25 }),
              style: inputStyle,
            }),
          ),
        ]),

        h('div', { key: 'actions', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }, [
          h('button', { key: 'refresh', type: 'button', disabled: phase === 'loading' || phase === 'saving', onClick: load, style: buttonStyle }, t('refresh')),
          h('button', {
            key: 'save',
            type: 'button',
            disabled,
            onClick: save,
            style: {
              ...buttonStyle,
              border: 'none',
              background: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
              color: '#fff',
              opacity: disabled ? 0.6 : 1,
            },
          }, phase === 'saving' ? t('saving') : t('save')),
        ]),
        h('p', { key: 'status', style: { margin: 0, fontSize: 12, lineHeight: '18px', color: statusColor } }, statusText),
      ])
    }

    function SettingsIcon(props) {
      const size = Number(props && props.size) || 16
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        'data-dsh-panel-entry': PANEL_ID,
      }, [
        h('circle', { key: 'c', cx: 8, cy: 8, r: 2.3 }),
        h('path', { key: 'p', d: 'M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1' }),
      ])
    }

    function SettingsPage(props) {
      const t = props.t
      return h('div', {
        style: {
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'auto',
          padding: '28px 36px 48px',
          color: 'var(--dsw-alias-label-primary)',
        },
      }, [
        h('h1', {
          key: 'title',
          style: { margin: '0 0 18px', fontSize: 20, fontWeight: 600, lineHeight: '28px' },
        }, t('panelTitle')),
        h(ConfigCard, { key: 'card', ...props, view: 'page' }),
      ])
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tg-tools: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => t('sidebarLabel'),
      }, SettingsIcon)), 'tg-tools: sidebar entry')
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, (props) => h(SettingsPage, { ...props, t }))), 'tg-tools: settings panel')
      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: SLOT_KEY,
        locale: NS,
      }, (props) => h(ConfigCard, { ...props, t }))), 'tg-tools: row config')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
