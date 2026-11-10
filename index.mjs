/**
 * Host half of the todo table.
 *
 * The table itself is browser UI (see `client.js`), so the only thing that has to
 * live in the Host process is the data: one exact HTTP route over the plugin's own
 * `data/todos.json`. The Agent (or the user) edits that file during a conversation
 * and the open tab picks the change up; flipping a status in the tab posts back here.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const dataFile = path.join(packageDir, 'data', 'todos.json')
const routePath = '/api/dsh-todo-table'
const statuses = ['pending', 'doing', 'done']
const maxBodyBytes = 64 * 1024

/** Required Host service: the HTTP carrier the browser tab reads through. */
export const inject = ['webServer']

/** The document an absent or unreadable data file degrades to. */
function emptyDocument() {
  return { title: '', updatedAt: null, items: [] }
}

/**
 * Keep only well-formed rows, so a hand-edited JSON file cannot break the table.
 * @param value - the file's `items` field.
 * @returns the rows the browser renders.
 */
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

/** Read the table document, degrading to an empty table instead of failing the route. */
async function readDocument() {
  let parsed
  try {
    parsed = JSON.parse(await readFile(dataFile, 'utf8'))
  } catch {
    return emptyDocument()
  }
  const document = emptyDocument()
  if (parsed !== null && typeof parsed === 'object') {
    if (typeof parsed.title === 'string') document.title = parsed.title
    if (typeof parsed.updatedAt === 'string') document.updatedAt = parsed.updatedAt
    document.items = normalizeItems(parsed.items)
  }
  return document
}

/** Write the table document back, creating `data/` when the checkout lost it. */
async function writeDocument(document) {
  await mkdir(path.dirname(dataFile), { recursive: true })
  await writeFile(dataFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
}

/** Answer one JSON response. */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read a small JSON request body. */
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

/** GET reads the table; POST flips one row's status. */
async function handleRequest(req, res) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') {
    sendJson(res, 200, await readDocument())
    return
  }
  if (method !== 'POST') {
    res.writeHead(405, { allow: 'GET, HEAD, POST', 'cache-control': 'no-store' })
    res.end()
    return
  }
  let body
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { ok: false, error: 'body must be JSON' })
    return
  }
  const id = typeof body?.id === 'string' ? body.id : ''
  const status = statuses.includes(body?.status) ? body.status : ''
  if (id === '' || status === '') {
    sendJson(res, 400, { ok: false, error: 'expected { id, status }' })
    return
  }
  const document = await readDocument()
  const item = document.items.find((candidate) => candidate.id === id)
  if (item === undefined) {
    sendJson(res, 404, { ok: false, error: `unknown todo item "${id}"` })
    return
  }
  item.status = status
  document.updatedAt = new Date().toISOString()
  await writeDocument(document)
  sendJson(res, 200, { ok: true, document })
}

/**
 * Host plugin body: register the data route for this plugin's lifetime.
 * @param ctx - Host context carrying the HTTP carrier.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: routePath,
        handler: async (req, res) => {
          try {
            await handleRequest(req, res)
          } catch (error) {
            if (res.headersSent) {
              res.destroy()
              return
            }
            sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      }),
    'todo-table: data route',
  )
}
