/* global window, document, fetch, localStorage, setInterval, clearInterval */
/**
 * Browser half of the todo table.
 *
 * Two right-sidebar tab types:
 *   - `todo-picker` (a page): the entry card opens it, and it lists every table
 *     plus a form that creates a new one. Picking a table opens that table's tab.
 *   - `todo-table` (a resource type): one tab per table, addressed by
 *     `dsh-resource://todo-table/<id>`, so several tables can be open at once and
 *     each chip is titled with the table's own name.
 *
 * Rows are filled from the conversation, not typed here: every table body polls
 * the Host route over `data/tables/<id>.json`, and a status chip click writes back.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo-table',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    /** Copy namespace, tab identities, and the Host route this plugin owns. */
    const NS = 'dsh-todo-table'
    const PICKER_ID = 'dsh-todo-table/picker'
    const TABLE_ID = 'dsh-todo-table/table'
    const PICKER_KIND = 'todo-picker'
    const TABLE_KIND = 'todo-table'
    const BASE = '/api/dsh-todo-table'
    const ADDRESS_PREFIX = 'dsh-resource://todo-table/'
    const NAMES_KEY = 'dsh-todo-table.names.v1'
    const POLL_MS = 5000
    const LIST_POLL_MS = 8000
    const STATUS_ORDER = ['pending', 'doing', 'done']

    const ZH = {
      'guide.title': '待办清单',
      'guide.description': '选择一张表，或新建一张',
      'picker.tabTitle': '待办',
      'picker.meta': '共 {n} 张表',
      'picker.existing': '打开已有表',
      'picker.new': '新开表',
      'picker.empty': '还没有表',
      'picker.emptyHint': '在下面起个名字，新建第一张。',
      'picker.placeholder': '表名，例如「项目待办」',
      'picker.create': '新建并打开',
      'picker.bind': '标记为本对话的表',
      'picker.needName': '先写个表名',
      'picker.createFailed': '新建表失败，请重试',
      'picker.rowMeta': '{total} 项 · 已完成 {done} 项 · {age}',
      'picker.sessionTag': '会话表',
      'picker.listFailed': '读取表清单失败，稍后再试',
      'table.untitled': '待办表',
      'table.switch': '切换或新建表',
      'table.rename': '重命名',
      'table.renameHint': '回车保存 · Esc 取消',
      'table.renameFailed': '改名失败，请重试',
      'table.missing': '这张表不存在了',
      'column.todo': '待办事项',
      'column.status': '办理状态',
      'status.pending': '待办理',
      'status.doing': '办理中',
      'status.done': '已完成',
      'summary': '共 {total} 项 · 已完成 {done} 项',
      'loading': '正在读取…',
      'empty.title': '这张表还是空的',
      'empty.hint': '在对话里告诉我待办内容，我填进这张表。',
      'error.title': '读取待办数据失败',
      'error.hint': '宿主接口没有响应，稍后再试一次。',
      'retry': '重试',
      'refresh': '刷新',
      'cycle': '切换办理状态',
      'saveFailed': '状态没有保存成功，请再试一次。',
      'age.now': '刚刚',
      'age.minutes': '{n} 分钟前',
      'age.hours': '{n} 小时前',
      'age.days': '{n} 天前',
    }

    const EN = {
      'guide.title': 'Todo tables',
      'guide.description': 'Pick a table, or start a new one',
      'picker.tabTitle': 'Todos',
      'picker.meta': '{n} tables',
      'picker.existing': 'Open an existing table',
      'picker.new': 'New table',
      'picker.empty': 'No tables yet',
      'picker.emptyHint': 'Name one below to create the first table.',
      'picker.placeholder': 'Table name, e.g. "Project todos"',
      'picker.create': 'Create and open',
      'picker.bind': 'Mark as this conversation’s table',
      'picker.needName': 'Give the table a name first',
      'picker.createFailed': 'Could not create the table. Try again.',
      'picker.rowMeta': '{total} rows · {done} done · {age}',
      'picker.sessionTag': 'Session table',
      'picker.listFailed': 'Could not read the table list. Try again in a moment.',
      'table.untitled': 'Todo table',
      'table.switch': 'Switch or create a table',
      'table.rename': 'Rename',
      'table.renameHint': 'Enter to save · Esc to cancel',
      'table.renameFailed': 'Could not rename the table. Try again.',
      'table.missing': 'This table no longer exists',
      'column.todo': 'Todo',
      'column.status': 'Status',
      'status.pending': 'Pending',
      'status.doing': 'In progress',
      'status.done': 'Done',
      'summary': '{done} of {total} done',
      'loading': 'Loading…',
      'empty.title': 'This table is empty',
      'empty.hint': 'Tell me the items in the conversation and I will fill the table in.',
      'error.title': 'Could not read the todo data',
      'error.hint': 'The host route did not answer. Try again in a moment.',
      'retry': 'Retry',
      'refresh': 'Refresh',
      'cycle': 'Advance status',
      'saveFailed': 'The status was not saved. Try again.',
      'age.now': 'just now',
      'age.minutes': '{n} min ago',
      'age.hours': '{n} h ago',
      'age.days': '{n} d ago',
    }

    const CSS = `
.dsh-todo-root{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font:inherit}
.dsh-todo-bar{display:flex;align-items:center;gap:6px;flex:none;padding:10px 14px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsh-todo-heading{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.dsh-todo-title{overflow:hidden;font-size:14px;font-weight:500;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.dsh-todo-title-button{display:block;max-width:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:500;line-height:1.35;text-align:left;cursor:text;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-todo-title-input{box-sizing:border-box;width:100%;padding:1px 6px;border:.5px solid var(--dsw-alias-brand-primary);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:500;line-height:1.35}
.dsh-todo-title-input:focus{outline:none}
.dsh-todo-meta{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-todo-icon-button{display:inline-flex;flex:none;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-todo-icon-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-todo-icon-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-todo-scroll{flex:1;min-height:0;overflow:auto}
.dsh-todo-table{width:100%;border-collapse:collapse;table-layout:fixed}
.dsh-todo-table th{position:sticky;top:0;z-index:1;padding:7px 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;text-align:left;letter-spacing:.02em}
.dsh-todo-table th:nth-child(2){width:96px}
.dsh-todo-table td{padding:9px 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:13px;line-height:1.55;vertical-align:top;overflow-wrap:anywhere}
.dsh-todo-table tr:last-child td{border-bottom:0}
.dsh-todo-text{display:block}
.dsh-todo-row[data-status="done"] .dsh-todo-text{color:var(--dsw-alias-label-secondary)}
.dsh-todo-note{display:block;margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}
.dsh-todo-chip{display:inline-flex;align-items:center;gap:5px;padding:1px 8px;border:.5px solid transparent;border-radius:999px;background:transparent;font:inherit;font-size:11px;line-height:1.75;cursor:pointer;white-space:nowrap}
.dsh-todo-chip::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.85}
.dsh-todo-chip[data-status="pending"]{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent);color:var(--dsw-alias-label-secondary)}
.dsh-todo-chip[data-status="doing"]{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);color:var(--dsw-alias-state-warn-primary)}
.dsh-todo-chip[data-status="done"]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}
.dsh-todo-chip:hover{filter:brightness(.96)}
.dsh-todo-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-todo-empty,.dsh-todo-error{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:56px 24px;text-align:center}
.dsh-todo-glyph{color:var(--dsw-alias-label-secondary);opacity:.55}
.dsh-todo-empty-title{font-size:13px;line-height:1.4}
.dsh-todo-empty-hint{max-width:250px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.65}
.dsh-todo-error-title{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:1.4}
.dsh-todo-text-button{margin-top:2px;padding:3px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-todo-text-button:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-todo-notice{flex:none;padding:6px 14px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.5;border-top:.5px solid var(--dsw-alias-border-l1)}
.dsh-todo-section{flex:none;padding:12px 14px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.02em}
.dsh-todo-picks{display:flex;flex-direction:column;gap:6px;padding:0 10px 4px}
.dsh-todo-pick{display:flex;flex-direction:column;gap:3px;box-sizing:border-box;width:100%;padding:9px 11px;border:.5px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-todo-pick:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-todo-pick:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-todo-pick-name{font-size:13px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-todo-pick-meta{display:flex;flex-wrap:wrap;gap:6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4}
.dsh-todo-tag{padding:0 6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-todo-form{display:flex;gap:6px;padding:0 10px 6px}
.dsh-todo-input{box-sizing:border-box;flex:1;min-width:0;padding:6px 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dsh-todo-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dsh-todo-primary{flex:none;padding:6px 12px;border:0;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:12px;line-height:1.4;cursor:pointer;white-space:nowrap}
.dsh-todo-primary:disabled{opacity:.55;cursor:default}
.dsh-todo-check{display:flex;align-items:center;gap:6px;padding:0 14px 10px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5;cursor:pointer}
.dsh-todo-hint{padding:0 14px 10px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}
`

    /**
     * Fill `{name}` holes of one copy string.
     * @param template - the translated template.
     * @param values - hole values.
     * @returns the formatted string.
     */
    function format(template, values) {
      return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) =>
        values !== undefined && key in values ? String(values[key]) : match,
      )
    }

    /** A table id from a tab address, or `''`. */
    function tableIdOf(address) {
      return typeof address === 'string' && address.startsWith(ADDRESS_PREFIX)
        ? address.slice(ADDRESS_PREFIX.length)
        : ''
    }

    /** The tab address one table opens under. */
    function addressOf(id) {
      return ADDRESS_PREFIX + id
    }

    // ---- table names, shared by the tab chips and every body ------------------

    const names = new Map()
    const nameListeners = new Set()
    let nameVersion = 0

    /** Seed the cache from the last page load, so restored tabs keep their chips. */
    function primeNames() {
      try {
        const raw = window.localStorage.getItem(NAMES_KEY)
        if (raw === null) return
        const parsed = JSON.parse(raw)
        for (const [id, name] of Object.entries(parsed ?? {})) {
          if (typeof name === 'string' && name !== '') names.set(id, name)
        }
      } catch {
        // A broken cache only costs the chip text until the next fetch.
      }
    }

    function rememberNames(tables) {
      let changed = false
      for (const table of tables) {
        if (typeof table?.id !== 'string' || typeof table?.name !== 'string') continue
        if (names.get(table.id) === table.name) continue
        names.set(table.id, table.name)
        changed = true
      }
      if (!changed) return
      nameVersion += 1
      try {
        window.localStorage.setItem(NAMES_KEY, JSON.stringify(Object.fromEntries(names)))
      } catch {
        // Persisting the chip text is a convenience, not a requirement.
      }
      for (const listener of nameListeners) listener()
    }

    function subscribeNames(listener) {
      nameListeners.add(listener)
      return () => {
        nameListeners.delete(listener)
      }
    }

    /** Re-render the caller whenever a table is created or renamed. */
    function useNames() {
      const [, force] = React.useState(0)
      React.useEffect(() => subscribeNames(() => force((value) => value + 1)), [])
      return nameVersion
    }

    function nameOf(id, fallback) {
      return names.get(id) ?? fallback
    }

    // ---- small shared pieces ------------------------------------------------

    function formatAge(iso, t) {
      const time = Date.parse(typeof iso === 'string' ? iso : '')
      if (!Number.isFinite(time)) return ''
      const minutes = Math.max(0, Math.round((Date.now() - time) / 60000))
      if (minutes < 1) return t('age.now')
      if (minutes < 60) return format(t('age.minutes'), { n: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return format(t('age.hours'), { n: hours })
      return format(t('age.days'), { n: Math.round(hours / 24) })
    }

    async function getJson(url) {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}at=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      return payload
    }

    /** Show a short-lived error line under a panel. */
    function useNotice() {
      const [notice, setNotice] = React.useState('')
      const timer = React.useRef(0)
      const show = React.useCallback((message) => {
        setNotice(message)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setNotice(''), 3200)
      }, [])
      React.useEffect(() => () => window.clearTimeout(timer.current), [])
      return [notice, show]
    }

    /** The tab type's glyph: a checklist. */
    function TodoGlyph(props) {
      const size = typeof props?.size === 'number' ? props.size : 22
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className: props?.className,
          'aria-hidden': 'true',
        },
        h('rect', { key: 'frame', x: 3.2, y: 3.6, width: 17.6, height: 16.8, rx: 3 }),
        h('path', { key: 'row1', d: 'M7.4 9.2l1.5 1.5 2.4-2.6' }),
        h('path', { key: 'row2', d: 'M7.4 15.2l1.5 1.5 2.4-2.6' }),
        h('path', { key: 'line1', d: 'M13.8 9.4h3.2' }),
        h('path', { key: 'line2', d: 'M13.8 15.4h3.2' }),
      )
    }

    function RefreshGlyph() {
      return h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { key: 'arc', d: 'M13.2 8a5.2 5.2 0 1 1-1.62-3.76' }),
        h('path', { key: 'head', d: 'M13.4 2.4v2.9h-2.9' }),
      )
    }

    function ListGlyph() {
      return h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          'aria-hidden': 'true',
        },
        h('path', { key: 'a', d: 'M2.5 4.2h11' }),
        h('path', { key: 'b', d: 'M2.5 8h11' }),
        h('path', { key: 'c', d: 'M2.5 11.8h7' }),
      )
    }

    function PencilGlyph() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { key: 'body', d: 'M11.1 2.4l2.5 2.5-8 8-3.3.8.8-3.3z' }),
      )
    }

    // ---- the picker: choose an existing table, or start a new one ------------

    function PickerPanel(props) {
      const t = typeof props?.t === 'function' ? props.t : (key) => key
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : ''
      const info =
        typeof props?.useTabInfo === 'function'
          ? (() => {
              try {
                return props.useTabInfo()
              } catch {
                return undefined
              }
            })()
          : undefined
      const tab = info?.tab
      const [list, setList] = React.useState({ phase: 'loading', tables: [] })
      const [draft, setDraft] = React.useState('')
      const [bind, setBind] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [notice, showNotice] = useNotice()

      const load = React.useCallback(async () => {
        try {
          const body = await getJson(`${BASE}/tables`)
          const tables = Array.isArray(body?.tables) ? body.tables : []
          rememberNames(tables)
          setList({ phase: 'ready', tables })
        } catch {
          setList((previous) => (previous.phase === 'ready' ? previous : { phase: 'error', tables: [] }))
        }
      }, [])

      React.useEffect(() => {
        void load()
        const timer = setInterval(() => {
          if (document.hidden !== true) void load()
        }, LIST_POLL_MS)
        return () => clearInterval(timer)
      }, [load])

      /** Open one table in its own tab, then hand the pane over to it. */
      const openTable = React.useCallback(
        (id) => {
          if (tab === undefined) {
            showNotice(t('picker.listFailed'))
            return
          }
          tab.actions.openResource(addressOf(id), { kind: TABLE_KIND })
          tab.actions.close()
        },
        [showNotice, t, tab],
      )

      const create = React.useCallback(async () => {
        const name = draft.trim()
        if (name === '') {
          showNotice(t('picker.needName'))
          return
        }
        setBusy(true)
        try {
          const body = await postJson(`${BASE}/tables`, {
            name,
            sessionId: bind && sessionId !== '' ? sessionId : undefined,
          })
          const table = body?.table
          if (table?.id === undefined) throw new Error('no table in response')
          rememberNames([table])
          setDraft('')
          openTable(table.id)
        } catch {
          showNotice(t('picker.createFailed'))
        } finally {
          setBusy(false)
        }
      }, [bind, draft, openTable, sessionId, showNotice, t])

      const rows =
        list.tables.length === 0
          ? h(
              'div',
              { className: 'dsh-todo-empty', key: 'empty' },
              h(TodoGlyph, { key: 'glyph', size: 28, className: 'dsh-todo-glyph' }),
              h('span', { className: 'dsh-todo-empty-title', key: 'title' }, list.phase === 'loading' ? t('loading') : t('picker.empty')),
              list.phase === 'loading' ? null : h('span', { className: 'dsh-todo-empty-hint', key: 'hint' }, t('picker.emptyHint')),
            )
          : h(
              'div',
              { className: 'dsh-todo-picks', key: 'list' },
              list.tables.map((table) =>
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-todo-pick',
                    key: table.id,
                    onClick: () => openTable(table.id),
                  },
                  h('span', { className: 'dsh-todo-pick-name' }, table.name),
                  h(
                    'span',
                    { className: 'dsh-todo-pick-meta' },
                    format(t('picker.rowMeta'), {
                      total: table.count ?? 0,
                      done: table.done ?? 0,
                      age: formatAge(table.updatedAt, t),
                    }),
                    table.sessionId === null || table.sessionId === undefined
                      ? null
                      : h('span', { className: 'dsh-todo-tag', key: 'tag' }, t('picker.sessionTag')),
                  ),
                ),
              ),
            )

      return h(
        'div',
        { className: 'dsh-todo-root' },
        h('style', { key: 'style' }, CSS),
        h(
          'div',
          { className: 'dsh-todo-bar', key: 'bar' },
          h(
            'div',
            { className: 'dsh-todo-heading' },
            h('span', { className: 'dsh-todo-title' }, t('picker.tabTitle')),
            h('span', { className: 'dsh-todo-meta' }, format(t('picker.meta'), { n: list.tables.length })),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-todo-icon-button',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: () => {
                void load()
              },
            },
            h(RefreshGlyph, { key: 'glyph' }),
          ),
        ),
        h(
          'div',
          { className: 'dsh-todo-scroll', key: 'scroll' },
          h('div', { className: 'dsh-todo-section', key: 'sec1' }, t('picker.existing')),
          list.phase === 'error'
            ? h(
                'div',
                { className: 'dsh-todo-hint', key: 'listerr' },
                t('picker.listFailed'),
              )
            : rows,
          h('div', { className: 'dsh-todo-section', key: 'sec2' }, t('picker.new')),
          h(
            'div',
            { className: 'dsh-todo-form', key: 'form' },
            h('input', {
              className: 'dsh-todo-input',
              value: draft,
              placeholder: t('picker.placeholder'),
              'aria-label': t('picker.new'),
              maxLength: 80,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void create()
                }
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-todo-primary',
                disabled: busy,
                onClick: () => {
                  void create()
                },
              },
              t('picker.create'),
            ),
          ),
          sessionId === ''
            ? null
            : h(
                'label',
                { className: 'dsh-todo-check', key: 'bind' },
                h('input', {
                  type: 'checkbox',
                  checked: bind,
                  onChange: (event) => setBind(event.target.checked),
                }),
                t('picker.bind'),
              ),
        ),
        notice === '' ? null : h('div', { className: 'dsh-todo-notice', key: 'notice' }, notice),
      )
    }

    // ---- one table: header with a live name, then the two-column table ------

    function TablePanel(props) {
      const t = typeof props?.t === 'function' ? props.t : (key) => key
      const info =
        typeof props?.useTabInfo === 'function'
          ? (() => {
              try {
                return props.useTabInfo()
              } catch {
                return undefined
              }
            })()
          : undefined
      const tab = info?.tab
      const tableId = tableIdOf(tab?.contentId)
      useNames()

      // A tab restored from the single-table version has no table id in its
      // address; hand that tab over to the picker instead of showing an error.
      React.useEffect(() => {
        if (tableId !== '' || tab === undefined) return
        tab.actions.openTab(PICKER_KIND, { replaceTab: true })
        // Runs once: the replacement tab takes this one's place.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const [doc, setDoc] = React.useState({ phase: 'loading', table: undefined, items: [] })
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState('')
      const [busyId, setBusyId] = React.useState(null)
      const [notice, showNotice] = useNotice()

      const load = React.useCallback(async () => {
        if (tableId === '') {
          setDoc({ phase: 'missing', table: undefined, items: [] })
          return
        }
        try {
          const body = await getJson(`${BASE}/rows?id=${encodeURIComponent(tableId)}`)
          const table = body?.table
          if (table === undefined) {
            setDoc({ phase: 'missing', table: undefined, items: [] })
            return
          }
          rememberNames([table])
          setDoc({ phase: 'ready', table, items: Array.isArray(table.items) ? table.items : [] })
        } catch (error) {
          if (String(error?.message ?? '').includes('404')) {
            setDoc({ phase: 'missing', table: undefined, items: [] })
            return
          }
          setDoc((previous) =>
            previous.phase === 'ready' ? previous : { phase: 'error', table: undefined, items: [] },
          )
        }
      }, [tableId])

      React.useEffect(() => {
        void load()
        const timer = setInterval(() => {
          if (document.hidden !== true) void load()
        }, POLL_MS)
        const onFocus = () => {
          void load()
        }
        window.addEventListener('focus', onFocus)
        return () => {
          clearInterval(timer)
          window.removeEventListener('focus', onFocus)
        }
      }, [load])

      const name = doc.table?.name ?? nameOf(tableId, t('table.untitled'))
      const items = doc.items
      const done = items.filter((item) => item.status === 'done').length

      const startRename = () => {
        setDraft(name)
        setEditing(true)
      }

      const commitRename = React.useCallback(async () => {
        const next = draft.trim()
        setEditing(false)
        if (next === '' || next === name || tableId === '') return
        try {
          const body = await postJson(`${BASE}/rename`, { id: tableId, name: next })
          if (body?.table !== undefined) {
            rememberNames([body.table])
            setDoc((previous) => ({ ...previous, table: { ...previous.table, ...body.table } }))
          }
        } catch {
          showNotice(t('table.renameFailed'))
        }
      }, [draft, name, showNotice, t, tableId])

      const advance = React.useCallback(
        async (item) => {
          const next = STATUS_ORDER[(STATUS_ORDER.indexOf(item.status) + 1) % STATUS_ORDER.length]
          setBusyId(item.id)
          try {
            const body = await postJson(`${BASE}/status`, { tableId, itemId: item.id, status: next })
            const table = body?.table
            if (table !== undefined) {
              setDoc({ phase: 'ready', table, items: Array.isArray(table.items) ? table.items : items })
            }
          } catch {
            showNotice(t('saveFailed'))
            void load()
          } finally {
            setBusyId(null)
          }
        },
        [items, load, showNotice, t, tableId],
      )

      const summaryText =
        doc.phase === 'loading'
          ? t('loading')
          : format(t('summary'), { total: items.length, done })

      const bar = h(
        'div',
        { className: 'dsh-todo-bar', key: 'bar' },
        h(
          'div',
          { className: 'dsh-todo-heading' },
          editing
            ? h('input', {
                key: 'input',
                className: 'dsh-todo-title-input',
                value: draft,
                autoFocus: true,
                maxLength: 80,
                'aria-label': t('table.rename'),
                onChange: (event) => setDraft(event.target.value),
                onBlur: () => {
                  void commitRename()
                },
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commitRename()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditing(false)
                  }
                },
              })
            : h(
                'button',
                {
                  key: 'title',
                  type: 'button',
                  className: 'dsh-todo-title-button',
                  title: t('table.rename'),
                  onClick: startRename,
                },
                name,
              ),
          h('span', { className: 'dsh-todo-meta' }, editing ? t('table.renameHint') : summaryText),
        ),
        editing
          ? null
          : h(
              'button',
              {
                type: 'button',
                className: 'dsh-todo-icon-button',
                title: t('table.rename'),
                'aria-label': t('table.rename'),
                onClick: startRename,
              },
              h(PencilGlyph, { key: 'glyph' }),
            ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-todo-icon-button',
            title: t('table.switch'),
            'aria-label': t('table.switch'),
            onClick: () => {
              if (tab !== undefined) tab.actions.openTab(PICKER_KIND)
            },
          },
          h(ListGlyph, { key: 'glyph' }),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-todo-icon-button',
            title: t('refresh'),
            'aria-label': t('refresh'),
            onClick: () => {
              void load()
            },
          },
          h(RefreshGlyph, { key: 'glyph' }),
        ),
      )

      let body
      if (doc.phase === 'missing' && tableId === '') {
        body = h('div', { className: 'dsh-todo-empty', key: 'legacy' }, h('span', { className: 'dsh-todo-empty-title' }, t('loading')))
      } else if (doc.phase === 'missing') {
        body = h('div', { className: 'dsh-todo-empty', key: 'missing' }, h('span', { className: 'dsh-todo-empty-title' }, t('table.missing')))
      } else if (doc.phase === 'error') {
        body = h(
          'div',
          { className: 'dsh-todo-error', key: 'error' },
          h(TodoGlyph, { key: 'glyph', size: 30, className: 'dsh-todo-glyph' }),
          h('span', { className: 'dsh-todo-error-title', key: 'title' }, t('error.title')),
          h('span', { className: 'dsh-todo-empty-hint', key: 'hint' }, t('error.hint')),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-todo-text-button',
              key: 'retry',
              onClick: () => {
                void load()
              },
            },
            t('retry'),
          ),
        )
      } else if (items.length === 0) {
        body = h(
          'div',
          { className: 'dsh-todo-empty', key: 'empty' },
          h(TodoGlyph, { key: 'glyph', size: 30, className: 'dsh-todo-glyph' }),
          h('span', { className: 'dsh-todo-empty-title', key: 'title' }, doc.phase === 'loading' ? t('loading') : t('empty.title')),
          doc.phase === 'loading' ? null : h('span', { className: 'dsh-todo-empty-hint', key: 'hint' }, t('empty.hint')),
        )
      } else {
        body = h(
          'table',
          { className: 'dsh-todo-table', key: 'table' },
          h(
            'thead',
            { key: 'head' },
            h(
              'tr',
              null,
              h('th', { key: 'todo', scope: 'col' }, t('column.todo')),
              h('th', { key: 'status', scope: 'col' }, t('column.status')),
            ),
          ),
          h(
            'tbody',
            { key: 'body' },
            items.map((item) =>
              h(
                'tr',
                { className: 'dsh-todo-row', key: item.id, 'data-status': item.status },
                h(
                  'td',
                  null,
                  h('span', { className: 'dsh-todo-text' }, item.text),
                  item.note === undefined ? null : h('span', { className: 'dsh-todo-note' }, item.note),
                ),
                h(
                  'td',
                  null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-todo-chip',
                      'data-status': item.status,
                      title: t('cycle'),
                      'aria-label': `${item.text} · ${t(`status.${item.status}`)}`,
                      'aria-busy': busyId === item.id ? 'true' : undefined,
                      onClick: () => {
                        void advance(item)
                      },
                    },
                    t(`status.${item.status}`),
                  ),
                ),
              ),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: 'dsh-todo-root' },
        h('style', { key: 'style' }, CSS),
        bar,
        h('div', { className: 'dsh-todo-scroll', key: 'scroll' }, body),
        notice === '' ? null : h('div', { className: 'dsh-todo-notice', key: 'notice' }, notice),
      )
    }

    /** One table tab's chip: the table's live name. */
    function TableTabTitle(props) {
      useNames()
      const t = typeof props?.t === 'function' ? props.t : (key) => key
      const info =
        typeof props?.useTabInfo === 'function'
          ? (() => {
              try {
                return props.useTabInfo()
              } catch {
                return undefined
              }
            })()
          : undefined
      return nameOf(tableIdOf(info?.tab?.contentId), t('table.untitled'))
    }

    /**
     * Client plugin body: declare both tab types, the guide entry, and the bodies.
     * @param ctx - Client context carrying the slot registry and the right sidebar.
     */
    function apply(ctx) {
      const slots = ctx.get('slots')
      const tabs = ctx.get('sidebarRightTabs')
      const locale = ctx.get('locale')
      if (slots === undefined || tabs === undefined) {
        console.error('[dsh-todo-table] the right sidebar is not available in this profile')
        return
      }

      primeNames()

      if (locale !== undefined) {
        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'todo-table: copy')
      }
      const t = locale !== undefined ? locale.bind(NS) : (key) => ZH[key] ?? key

      // The picker: a page type, the only entry in the guide.
      ctx.effect(
        () =>
          tabs.register({
            id: PICKER_ID,
            kind: PICKER_KIND,
            title: () => t('picker.tabTitle'),
            guide: [
              {
                id: 'todo-tables',
                order: 20,
                title: () => t('guide.title'),
                description: () => t('guide.description'),
                icon: TodoGlyph,
              },
            ],
          }),
        'todo-table: picker type',
      )

      // One table per address, so each has its own tab and its own chip.
      ctx.effect(
        () =>
          tabs.register({
            id: TABLE_ID,
            kind: TABLE_KIND,
            patterns: [`${ADDRESS_PREFIX}*`],
            title: (address) => nameOf(tableIdOf(address), t('table.untitled')),
          }),
        'todo-table: table type',
      )

      ctx.effect(
        () =>
          slots.inject('sidebar.right.pane.tab', () =>
            slots.register(
              { name: 'sidebar.right.pane.tab', key: PICKER_ID, locale: NS },
              (props) => h(PickerPanel, { ...props, t }),
            ),
          ),
        'todo-table: picker body',
      )

      ctx.effect(
        () =>
          slots.inject('sidebar.right.pane.tab', () =>
            slots.register(
              { name: 'sidebar.right.pane.tab', key: TABLE_ID, locale: NS },
              (props) => h(TablePanel, { ...props, t }),
            ),
          ),
        'todo-table: table body',
      )

      ctx.effect(
        () =>
          slots.inject('sidebar.right.pane.tab.title', () =>
            slots.register(
              { name: 'sidebar.right.pane.tab.title', key: TABLE_ID, locale: NS },
              (props) => h(TableTabTitle, { ...props, t }),
            ),
          ),
        'todo-table: table chip',
      )

      console.log('[dsh-todo-table] client ready (multi-table)')
    }

    module.exports = { name: 'dsh-todo-table', inject: ['slots', 'locale', 'sidebarRightTabs'], apply }
    return module.exports
  },
})
