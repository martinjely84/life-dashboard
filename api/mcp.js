import { createClient } from '@supabase/supabase-js'

// ── Supabase ─────────────────────────────────────────────────────────
function makeSb() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')
  return createClient(url, key, { auth: { persistSession: false } })
}

const uid = () => crypto.randomUUID()

// ── Tool definitions ─────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'read_dashboard',
    description: "Read the full state of Martin's life dashboard: domains, folders, open goals, actions, todos, and habits.",
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'add_domain',
    description: 'Create a new life domain on the dashboard.',
    inputSchema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Domain name, e.g. "Side Projects"' },
        emoji: { type: 'string', description: 'Single emoji' },
        color: { type: 'string', description: 'Hex colour, e.g. "#a78bfa"' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_folder',
    description: 'Add a folder or section inside a domain (or nested inside another folder).',
    inputSchema: {
      type: 'object',
      properties: {
        domain_id:        { type: 'string', description: 'Domain id from read_dashboard, e.g. "health"' },
        parent_folder_id: { type: 'string', description: 'Parent folder id — omit for a top-level folder' },
        name:             { type: 'string', description: 'Folder name' },
      },
      required: ['domain_id', 'name'],
    },
  },
  {
    name: 'add_goal',
    description: 'Add a goal, note, or link inside a specific folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Folder id from read_dashboard' },
        text:      { type: 'string', description: 'Goal text' },
        type:      { type: 'string', enum: ['goal', 'note', 'link'], description: 'Item type (default: goal)' },
      },
      required: ['folder_id', 'text'],
    },
  },
  {
    name: 'add_action',
    description: 'Add a next-step action under an existing goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id:   { type: 'string', description: 'Parent goal id' },
        folder_id: { type: 'string', description: 'Folder the goal lives in' },
        text:      { type: 'string', description: 'Action text' },
      },
      required: ['goal_id', 'folder_id', 'text'],
    },
  },
  {
    name: 'add_todo',
    description: 'Add an item to the global to-do list.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'add_habit',
    description: 'Add a new habit to track.',
    inputSchema: {
      type: 'object',
      properties: {
        text:    { type: 'string', description: 'Habit description' },
        cadence: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Frequency (default: daily)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'update_item',
    description: 'Update a goal or action — change its text and/or mark it done/undone.',
    inputSchema: {
      type: 'object',
      properties: {
        id:   { type: 'string', description: 'Item id' },
        text: { type: 'string', description: 'New text (omit to keep current)' },
        done: { type: 'boolean', description: 'Done state (omit to keep current)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_todo',
    description: 'Update a to-do — change its text and/or mark it done/undone.',
    inputSchema: {
      type: 'object',
      properties: {
        id:   { type: 'string', description: 'Todo id' },
        text: { type: 'string', description: 'New text (omit to keep current)' },
        done: { type: 'boolean', description: 'Done state (omit to keep current)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_item',
    description: 'Permanently delete a goal or action by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Item id to delete' } },
      required: ['id'],
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────────
async function executeTool(name, input) {
  const sb = makeSb()

  switch (name) {
    case 'read_dashboard': {
      const [d, f, i, t, h] = await Promise.all([
        sb.from('domains').select('*').order('sort_order'),
        sb.from('folders').select('*').order('sort_order'),
        sb.from('items').select('*').order('sort_order'),
        sb.from('todos').select('*').order('sort_order'),
        sb.from('habits').select('*').order('sort_order'),
      ])
      const folders = f.data || []
      const items = i.data || []

      const tree = (d.data || []).map((dom) => {
        const domFolders = folders.filter(
          (fo) => fo.domain_id === dom.id && !fo.parent_folder_id && !fo.name?.startsWith('__person__'),
        )
        return {
          id: dom.id, name: dom.name, emoji: dom.emoji, color: dom.color, score: dom.score,
          folders: domFolders.map((fo) => ({
            id: fo.id, name: fo.name,
            goals: items
              .filter((it) => it.folder_id === fo.id && it.type !== 'action' && !it.done)
              .map((g) => ({
                id: g.id, text: g.text, type: g.type,
                actions: items
                  .filter((a) => a.parent_item_id === g.id && !a.done)
                  .map((a) => ({ id: a.id, text: a.text })),
              })),
          })),
        }
      })

      return {
        domains: tree,
        todos: (t.data || []).filter((x) => !x.done).map((x) => ({ id: x.id, text: x.text })),
        habits: (h.data || []).map((x) => ({
          id: x.id, text: x.text, cadence: x.cadence,
          streak: x.streak || 0, done_today: !!x.last_done,
        })),
      }
    }

    case 'add_domain': {
      const base = (input.name || 'domain')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'domain'
      const { data: ex } = await sb.from('domains').select('id').eq('id', base)
      const id = ex?.length ? `${base}-${Date.now()}` : base
      const row = {
        id, name: input.name, emoji: input.emoji || '📂',
        color: input.color || '#7a7a8a', score: 5, sort_order: 99,
      }
      const { error } = await sb.from('domains').insert(row)
      if (error) throw new Error(error.message)
      return { created: row }
    }

    case 'add_folder': {
      const row = {
        id: uid(), domain_id: input.domain_id,
        parent_folder_id: input.parent_folder_id || null,
        name: input.name, sort_order: 99,
        created_at: new Date().toISOString(),
      }
      const { error } = await sb.from('folders').insert(row)
      if (error) throw new Error(error.message)
      return { created: row }
    }

    case 'add_goal': {
      const row = {
        id: uid(), folder_id: input.folder_id, type: input.type || 'goal',
        text: input.text, done: false, parent_item_id: null, sort_order: 99,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      const { error } = await sb.from('items').insert(row)
      if (error) throw new Error(error.message)
      return { created: row }
    }

    case 'add_action': {
      const row = {
        id: uid(), folder_id: input.folder_id, type: 'action',
        text: input.text, done: false, parent_item_id: input.goal_id, sort_order: 99,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      const { error } = await sb.from('items').insert(row)
      if (error) throw new Error(error.message)
      return { created: row }
    }

    case 'add_todo': {
      const row = {
        id: uid(), text: input.text, done: false, sort_order: 99,
        created_at: new Date().toISOString(),
      }
      const { error } = await sb.from('todos').insert(row)
      if (error) throw new Error(error.message)
      return { created: row }
    }

    case 'add_habit': {
      const row = {
        id: uid(), text: input.text, cadence: input.cadence || 'daily',
        last_done: null, streak: 0, sort_order: 99,
        created_at: new Date().toISOString(),
      }
      const { error } = await sb.from('habits').insert(row)
      if (error) throw new Error(error.message)
      return { created: row }
    }

    case 'update_item': {
      const patch = { updated_at: new Date().toISOString() }
      if (input.text !== undefined) patch.text = input.text
      if (input.done !== undefined) patch.done = input.done
      const { error } = await sb.from('items').update(patch).eq('id', input.id)
      if (error) throw new Error(error.message)
      return { updated: input.id }
    }

    case 'update_todo': {
      const patch = {}
      if (input.text !== undefined) patch.text = input.text
      if (input.done !== undefined) patch.done = input.done
      const { error } = await sb.from('todos').update(patch).eq('id', input.id)
      if (error) throw new Error(error.message)
      return { updated: input.id }
    }

    case 'delete_item': {
      const { error } = await sb.from('items').delete().eq('id', input.id)
      if (error) throw new Error(error.message)
      return { deleted: input.id }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── JSON-RPC message handler ──────────────────────────────────────────
async function handleMsg(m) {
  if (!m.id) return null  // notification — no response

  if (m.method === 'initialize') {
    return {
      jsonrpc: '2.0', id: m.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'life-dashboard', version: '1.0.0' },
      },
    }
  }

  if (m.method === 'ping') {
    return { jsonrpc: '2.0', id: m.id, result: {} }
  }

  if (m.method === 'tools/list') {
    return { jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } }
  }

  if (m.method === 'tools/call') {
    try {
      const result = await executeTool(m.params.name, m.params.arguments || {})
      return {
        jsonrpc: '2.0', id: m.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      }
    } catch (e) {
      return {
        jsonrpc: '2.0', id: m.id,
        result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true },
      }
    }
  }

  return {
    jsonrpc: '2.0', id: m.id,
    error: { code: -32601, message: `Method not found: ${m.method}` },
  }
}

// ── Vercel handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Bearer-token auth (skip if DASHBOARD_MCP_KEY is not set — useful for testing)
  const key = process.env.DASHBOARD_MCP_KEY
  if (key) {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${key}`) {
      return res.status(401).json({ error: 'Unauthorized — set Authorization: Bearer <DASHBOARD_MCP_KEY>' })
    }
  }

  // Health-check
  if (req.method === 'GET') {
    return res.status(200).json({ name: 'life-dashboard-mcp', version: '1.0.0', status: 'ok' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body
  if (!body) return res.status(400).json({ error: 'JSON body required' })

  const msgs = Array.isArray(body) ? body : [body]
  const responses = (await Promise.all(msgs.map(handleMsg))).filter(Boolean)

  res.setHeader('Content-Type', 'application/json')
  if (responses.length === 0) return res.status(202).end()
  return res.status(200).json(Array.isArray(body) ? responses : responses[0])
}
