/* global window, document, fetch, setInterval, clearInterval */
/**
 * Browser half of the todo table: one right-sidebar tab type.
 *
 * The entry is the guide card it registers (right sidebar → add / start page), and
 * the body is a two-column table — 待办事项 / 办理状态 — read from the Host route the
 * package's `index.mjs` serves over `data/todos.json`. Rows are filled from the
 * conversation rather than typed here, so the tab only reads, plus a click on a
 * status chip to advance it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo-table',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    /** This plugin's copy namespace and the identity of its tab type. */
    const NS = 'dsh-todo-table'
    const TAB_ID = 'dsh-todo-table'
    const KIND = 'todo-table'
    const ENDPOINT = '/api/dsh-todo-table'
    const POLL_MS = 5000
    const STATUS_ORDER = ['pending', 'doing', 'done']

    const ZH = {
      'tab.title': '待办清单',
      'tab.description': '待办事项与办理状态',
      'column.todo': '待办事项',
      'column.status': '办理状态',
      'status.pending': '待办理',
      'status.doing': '办理中',
      'status.done': '已完成',
      'summary': '共 {total} 项 · 已完成 {done} 项',
      'summary.empty': '还没有数据',
      'loading': '正在读取…',
      'empty.title': '还没有待办事项',
      'empty.hint': '在对话里告诉我待办内容，我填进这张表。',
      'error.title': '读取待办数据失败',
      'error.hint': '负责数据的宿主接口没有响应，稍后再试一次。',
      'retry': '重试',
      'refresh': '刷新',
      'cycle': '切换办理状态',
      'saveFailed': '状态没有保存成功，请再试一次。',
    }

    const EN = {
      'tab.title': 'Todo list',
      'tab.description': 'Todo items and how far along they are',
      'column.todo': 'Todo',
      'column.status': 'Status',
      'status.pending': 'Pending',
      'status.doing': 'In progress',
      'status.done': 'Done',
      'summary': '{done} of {total} done',
      'summary.empty': 'No rows yet',
      'loading': 'Loading…',
      'empty.title': 'No todo items yet',
      'empty.hint': 'Tell me the items in the conversation and I will fill the table in.',
      'error.title': 'Could not read the todo data',
      'error.hint': 'The host route that serves the table did not answer. Try again in a moment.',
      'retry': 'Retry',
      'refresh': 'Refresh',
      'cycle': 'Advance status',
      'saveFailed': 'The status was not saved. Try again.',
    }

    const CSS = `
.dsh-todo-root{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font:inherit}
.dsh-todo-bar{display:flex;align-items:center;gap:8px;flex:none;padding:10px 14px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsh-todo-heading{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.dsh-todo-title{overflow:hidden;font-size:14px;font-weight:500;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.dsh-todo-meta{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.3}
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

    /** The refresh control's glyph. */
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

    /**
     * Read the table from the Host route: on mount, on window focus, and on a short
     * timer while the page is visible, so a conversation-side edit shows up on its own.
     * @returns the document snapshot, its setter, and a manual reload.
     */
    function useTodoDocument() {
      const [doc, setDoc] = React.useState({ phase: 'loading', title: '', items: [], updatedAt: null })
      const load = React.useCallback(async () => {
        try {
          const response = await fetch(`${ENDPOINT}?at=${Date.now()}`, {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const body = await response.json()
          setDoc({
            phase: 'ready',
            title: typeof body?.title === 'string' ? body.title : '',
            items: Array.isArray(body?.items) ? body.items : [],
            updatedAt: typeof body?.updatedAt === 'string' ? body.updatedAt : null,
          })
        } catch {
          setDoc((previous) =>
            previous.phase === 'ready' ? previous : { phase: 'error', title: '', items: [], updatedAt: null },
          )
        }
      }, [])
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
      return [doc, setDoc, load]
    }

    /**
     * The tab body: a header row with the table's own summary, then the table.
     * @param props - slot props plus this plugin's copy lookup.
     */
    function TodoPanel(props) {
      const t = typeof props?.t === 'function' ? props.t : (key) => key
      const [doc, setDoc, reload] = useTodoDocument()
      const [notice, setNotice] = React.useState('')
      const [busyId, setBusyId] = React.useState(null)
      const items = doc.items
      const done = items.filter((item) => item.status === 'done').length

      const noticeTimer = React.useRef(0)
      const showNotice = React.useCallback((message) => {
        setNotice(message)
        window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(''), 3200)
      }, [])
      React.useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

      const advance = React.useCallback(
        async (item) => {
          const next = STATUS_ORDER[(STATUS_ORDER.indexOf(item.status) + 1) % STATUS_ORDER.length]
          setBusyId(item.id)
          try {
            const response = await fetch(ENDPOINT, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: item.id, status: next }),
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const body = await response.json()
            setDoc({
              phase: 'ready',
              title: typeof body?.document?.title === 'string' ? body.document.title : doc.title,
              items: Array.isArray(body?.document?.items) ? body.document.items : items,
              updatedAt: typeof body?.document?.updatedAt === 'string' ? body.document.updatedAt : doc.updatedAt,
            })
          } catch {
            showNotice(t('saveFailed'))
            void reload()
          } finally {
            setBusyId(null)
          }
        },
        [doc, items, reload, setDoc, showNotice, t],
      )

      const summaryText =
        doc.phase === 'loading'
          ? t('loading')
          : doc.phase === 'error'
            ? t('summary.empty')
            : format(t('summary'), { total: items.length, done })

      const heading = doc.title !== '' ? doc.title : t('tab.title')

      const toolbar = h(
        'div',
        { className: 'dsh-todo-bar', key: 'bar' },
        h(
          'div',
          { className: 'dsh-todo-heading' },
          h('span', { className: 'dsh-todo-title' }, heading),
          h('span', { className: 'dsh-todo-meta' }, summaryText),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-todo-icon-button',
            title: t('refresh'),
            'aria-label': t('refresh'),
            onClick: () => {
              void reload()
            },
          },
          h(RefreshGlyph, { key: 'glyph' }),
        ),
      )

      let body
      if (doc.phase === 'error') {
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
                void reload()
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
        toolbar,
        h('div', { className: 'dsh-todo-scroll', key: 'scroll' }, body),
        notice === '' ? null : h('div', { className: 'dsh-todo-notice', key: 'notice' }, notice),
      )
    }

    /**
     * Client plugin body: declare the tab type, its guide entry, and its body seat.
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

      if (locale !== undefined) {
        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'todo-table: copy')
      }
      const t = locale !== undefined ? locale.bind(NS) : (key) => ZH[key] ?? key

      ctx.effect(
        () =>
          tabs.register({
            id: TAB_ID,
            kind: KIND,
            title: () => t('tab.title'),
            guide: [
              {
                id: TAB_ID,
                order: 20,
                title: () => t('tab.title'),
                description: () => t('tab.description'),
                icon: TodoGlyph,
              },
            ],
          }),
        'todo-table: tab type',
      )

      ctx.effect(
        () =>
          slots.inject('sidebar.right.pane.tab', () =>
            slots.register(
              { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
              (props) => h(TodoPanel, { ...props, t }),
            ),
          ),
        'todo-table: tab body',
      )

      console.log('[dsh-todo-table] client ready')
    }

    module.exports = { name: 'dsh-todo-table', inject: ['slots', 'locale', 'sidebarRightTabs'], apply }
    return module.exports
  },
})
