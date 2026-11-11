/**
 * Host half of the todo table.
 *
 * Tables are independent entities: `data/index.json` holds the list (id, name,
 * optional session binding), and each table's rows live in `data/tables/<id>.json`.
 * The browser half opens one tab per table, so several tables can be open at once.
 *
 * Routes (registered as one prefix route):
 *   GET  /api/dsh-todo-table             list of tables with counts (also a probe)
 *   GET  /api/dsh-todo-table/tables      same list
 *   POST /api/dsh-todo-table/tables      { name, sessionId? } -> create
 *   POST /api/dsh-todo-table/rename      { id, name } -> rename
 *   GET  /api/dsh-todo-table/rows?id=    one table's rows
 *   POST /api/dsh-todo-table/status      { tableId, itemId, status } -> flip a row
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(packageDir, 'data')
const indexFile = path.join(dataDir, 'index.json')
const tablesDir = path.join(dataDir, 'tables')
const routePath = '/api/dsh-todo-table'
const buildMarker = 'multi-table-v2'
const statuses = ['pending', 'doing', 'done']
const maxBodyBytes = 64 * 1024
const maxNameLength = 80

/** Required Host service: the HTTP carrier the browser tab reads through. */
export const inject = ['webServer']

const stamp = () => new Date().toISOString()

/** Keep only well-formed rows, so a hand-edited JSON file cannot break the table. */
function normalizeItems(value) {
  if (!Array.isArray(value)) return []
  const items = []
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object') continue
    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (text === '') continue
    const status = statuses.includes(raw.status) ? raw.status : 'pending'
    const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : `item-${items.length + 1}`
    const item = { id, text, status }
    if (typeof raw.note === 'string' && raw.note.trim() !== '') item.note = raw.note.trim()
    items.push(item)
  }
  return items
}

/** A display name never ends up empty or oversized. */
function normalizeName(value, fallback) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return (text === '' ? fallback : text).slice(0, maxNameLength)
}

/** One table entry from the index file, or `undefined` when it is malformed. */
function normalizeTable(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  if (typeof raw.id !== 'string' || raw.id === '') return undefined
  return {
    id: raw.id,
    name: normalizeName(raw.name, '未命名表'),
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId !== '' ? raw.sessionId : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : stamp(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : stamp(),
  }
}

async function readIndex() {
  let parsed
  try {
    parsed = JSON.parse(await readFile(indexFile, 'utf8'))
  } catch {
    return { version: 2, tables: [] }
  }
  const tables = Array.isArray(parsed?.tables) ? parsed.tables.map(normalizeTable).filter(Boolean) : []
  return { version: 2, tables }
}

async function writeIndex(index) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

/** One table's rows file. Ids are generated here, so they are safe path segments. */
const rowsFile = (id) => path.join(tablesDir, `${id}.json`)

async function readRows(id) {
  try {
    const parsed = JSON.parse(await readFile(rowsFile(id), 'utf8'))
    return normalizeItems(parsed?.items)
  } catch {
    return []
  }
}

async function writeRows(id, items) {
  await mkdir(tablesDir, { recursive: true })
  await writeFile(rowsFile(id), `${JSON.stringify({ updatedAt: stamp(), items }, null, 2)}\n`, 'utf8')
}

/** A short, URL-safe, address-safe id. */
function newTableId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** The list the browser renders: every table plus its counts. */
async function listTables() {
  const index = await readIndex()
  const tables = []
  for (const table of index.tables) {
    const items = await readRows(table.id)
    tables.push({
      ...table,
      count: items.length,
      done: items.filter((item) => item.status === 'done').length,
    })
  }
  return tables
}

async function oneTable(id) {
  const index = await readIndex()
  const table = index.tables.find((candidate) => candidate.id === id)
  if (table === undefined) return undefined
  return { ...table, items: await readRows(id) }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return undefined
  return JSON.parse(text)
}

/** Create a table (optionally bound to one Session) and start it empty. */
async function createTable(body, res) {
  const index = await readIndex()
  const name = normalizeName(body?.name, `表 ${index.tables.length + 1}`)
  const sessionId = typeof body?.sessionId === 'string' && body.sessionId !== '' ? body.sessionId : null
  const table = { id: newTableId(), name, sessionId, createdAt: stamp(), updatedAt: stamp() }
  index.tables.push(table)
  await writeIndex(index)
  await writeRows(table.id, [])
  sendJson(res, 200, { ok: true, table: { ...table, count: 0, done: 0 } })
}

async function renameTable(body, res) {
  const id = typeof body?.id === 'string' ? body.id : ''
  const name = normalizeName(body?.name, '')
  if (id === '' || name === '') {
    sendJson(res, 400, { ok: false, error: 'expected { id, name }' })
    return
  }
  const index = await readIndex()
  const table = index.tables.find((candidate) => candidate.id === id)
  if (table === undefined) {
    sendJson(res, 404, { ok: false, error: `unknown table "${id}"` })
    return
  }
  table.name = name
  await writeIndex(index)
  sendJson(res, 200, { ok: true, table })
}

/** Move one row to another status. */
async function setStatus(body, res) {
  const tableId = typeof body?.tableId === 'string' ? body.tableId : ''
  const itemId = typeof body?.itemId === 'string' ? body.itemId : ''
  const status = statuses.includes(body?.status) ? body.status : ''
  if (tableId === '' || itemId === '' || status === '') {
    sendJson(res, 400, { ok: false, error: 'expected { tableId, itemId, status }' })
    return
  }
  const table = await oneTable(tableId)
  if (table === undefined) {
    sendJson(res, 404, { ok: false, error: `unknown table "${tableId}"` })
    return
  }
  const item = table.items.find((candidate) => candidate.id === itemId)
  if (item === undefined) {
    sendJson(res, 404, { ok: false, error: `unknown todo item "${itemId}"` })
    return
  }
  item.status = status
  await writeRows(tableId, table.items)
  const index = await readIndex()
  const entry = index.tables.find((candidate) => candidate.id === tableId)
  if (entry !== undefined) {
    entry.updatedAt = stamp()
    await writeIndex(index)
  }
  sendJson(res, 200, { ok: true, table: { ...table, items: table.items } })
}

async function handleRequest(req, res) {
  const url = new URL(req.url ?? routePath, 'http://localhost')
  const route = url.pathname.slice(routePath.length).replace(/\/+$/, '') || '/'
  const method = (req.method ?? 'GET').toUpperCase()
  const readOnly = method === 'GET' || method === 'HEAD'

  if (route === '/' || route === '/tables') {
    if (!readOnly) {
      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      await createTable(await readJsonBody(req), res)
      return
    }
    const tables = await listTables()
    sendJson(res, 200, { build: buildMarker, ok: true, tables })
    return
  }

  if (route === '/rename') {
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    await renameTable(await readJsonBody(req), res)
    return
  }

  if (route === '/rows') {
    const id = url.searchParams.get('id') ?? ''
    const table = await oneTable(id)
    if (table === undefined) {
      sendJson(res, 404, { ok: false, error: `unknown table "${id}"` })
      return
    }
    sendJson(res, 200, { ok: true, table })
    return
  }

  if (route === '/status') {
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    await setStatus(await readJsonBody(req), res)
    return
  }

  sendJson(res, 404, { ok: false, error: `unknown route "${route}"` })
}

/**
 * Host plugin body: register the data routes for this plugin's lifetime.
 * @param ctx - Host context carrying the HTTP carrier.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: routePath,
        handler: async (req, res) => {
          try {
            await handleRequest(req, res)
          } catch (error) {
            if (res.headersSent) {
              res.destroy()
              return
            }
            const message = String(error?.message ?? error)
            sendJson(res, message.includes('body') || message.includes('JSON') ? 400 : 500, {
              ok: false,
              error: message,
            })
          }
        },
      }),
    'todo-table: data routes',
  )
}
