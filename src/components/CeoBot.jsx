import { useState, useRef, useEffect, useCallback } from 'react'
import {
  useStore,
  addDomain, addFolder, addItem, addAction,
  addTodo, addHabit,
} from '../lib/store'

const API = 'https://financecore-umber.vercel.app/api/life-ceo'

const SESSIONS = [
  { title: 'PT Coach Next.js app', date: '2026-08-23' },
  { title: 'Ely Family app', date: '2026-08-23' },
  { title: 'FinanceCore family dashboard', date: '2026-08-23' },
  { title: "Martin's life dashboard rebuild", date: '2026-08-23' },
  { title: 'Trading agent codebase', date: '2026-08-19' },
  { title: "Sophia's British Pantry app", date: '2026-08-08' },
  { title: 'StarVault interview story bank', date: '2026-08-03' },
  { title: 'Create Exit Britain MVP project specification', date: '2026-07-31' },
  { title: 'Crypto momentum trading bot', date: '2026-07-20' },
  { title: 'World Cup predictor app', date: '2026-07-20' },
  { title: 'Buck the Unicorn helper', date: '2026-06-25' },
  { title: 'AI Forex Trading Bot', date: '2026-06-11' },
  { title: 'TicketCore resale dashboard', date: '2026-06-08' },
  { title: 'Fix duplicate pre-market scan', date: '2026-06-04' },
  { title: 'Options trading bot', date: '2026-05-24' },
  { title: 'Build WhatsApp bot for family organization', date: '2026-05-01' },
  { title: 'Explore crypto arbitrage profit potential', date: '2026-04-28' },
  { title: 'Evaluate migrating to OpenRouter', date: '2026-04-18' },
]

/* ── Tiny markdown renderer ── */
function md(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-*•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/(?<![="'])(https?:\/\/[^\s<>&"]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}

function ActionBadge({ text }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 11px',
      background: 'rgba(45,212,191,.09)',
      border: '1px solid rgba(45,212,191,.22)',
      borderRadius: 7, fontSize: 12,
      color: '#2dd4bf', fontFamily: 'monospace',
      animation: 'ceo-fadein .2s ease',
    }}>
      ✓&nbsp;&nbsp;{text}
    </div>
  )
}

export default function CeoBot() {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])   // {role, content}
  const [msgs, setMsgs] = useState([])          // display messages: {type, html, id}
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const msgsRef = useRef(null)
  const inputRef = useRef(null)
  const streamingBotId = useRef(null)

  const scroll = () => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }
  useEffect(scroll, [msgs])

  const addMsg = useCallback((msg) => {
    setMsgs((prev) => [...prev, { id: Date.now() + Math.random(), ...msg }])
  }, [])

  const updateBotMsg = useCallback((id, html) => {
    setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, html } : m))
  }, [])

  // Welcome message on first open
  useEffect(() => {
    if (open && msgs.length === 0) {
      addMsg({
        type: 'bot',
        html: md(
          "Hi Martin. I'm your Chief of Staff.\n\n" +
          "**I can:**\n" +
          "- Answer questions across all your life areas\n" +
          "- Add goals, folders, habits, to-dos directly to your dashboard\n" +
          "- File your Claude Code sessions into the right domains\n" +
          "- Route finance questions to **FinanceCore**\n\n" +
          "What do you need?"
        ),
      })
    }
  }, [open])

  /* ── Execute dashboard actions ── */
  const execAction = useCallback(async (action) => {
    const { name, input: inp } = action
    try {
      if (name === 'add_domain') {
        addDomain({ name: inp.name, emoji: inp.emoji || '📁', color: inp.color || '#a78bfa' })
        addMsg({ type: 'action', html: `Created domain "${inp.name}"` })
      } else if (name === 'add_folder') {
        addFolder(inp.domain_id, inp.parent_folder_id || null, inp.name)
        addMsg({ type: 'action', html: `Added folder "${inp.name}"` })
      } else if (name === 'add_goal') {
        addItem(inp.folder_id, inp.type || 'goal', inp.text)
        addMsg({ type: 'action', html: `Added goal: "${inp.text}"` })
      } else if (name === 'add_action') {
        addAction(inp.goal_id, inp.text)
        addMsg({ type: 'action', html: `Added action: "${inp.text}"` })
      } else if (name === 'add_todo') {
        addTodo(inp.text)
        addMsg({ type: 'action', html: `To-do added: "${inp.text}"` })
      } else if (name === 'add_habit') {
        addHabit(inp.text, inp.cadence || 'daily')
        addMsg({ type: 'action', html: `Habit added: "${inp.text}" (${inp.cadence || 'daily'})` })
      }
    } catch (e) {
      console.error('[ceo-exec]', name, e)
    }
  }, [addMsg])

  /* ── Send ── */
  const send = useCallback(async () => {
    if (streaming) return
    const text = input.trim()
    if (!text) return

    setInput('')
    const newHistory = [...history, { role: 'user', content: text }]
    setHistory(newHistory)
    addMsg({ type: 'user', html: text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') })
    setStreaming(true)

    let botId = null
    let botText = ''
    let gotFirst = false

    // Add typing indicator
    const typingId = Date.now() + Math.random()
    setMsgs((prev) => [...prev, { id: typingId, type: 'typing' }])

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          domains: s.domains,
          folders: s.folders,
          items: s.items.filter((i) => !i.done),
          sessions: SESSIONS,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`HTTP ${res.status} — ${errText.slice(0, 200)}`)
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop()
        for (const part of parts) {
          if (!part.startsWith('data:')) continue
          const raw = part.slice(5).trim()
          if (raw === '[DONE]') break
          if (!gotFirst) {
            gotFirst = true
            setMsgs((prev) => prev.filter((m) => m.id !== typingId))
          }
          try {
            const ev = JSON.parse(raw)
            if (ev.text) {
              if (!botId) {
                botId = Date.now() + Math.random()
                streamingBotId.current = botId
                setMsgs((prev) => [...prev, { id: botId, type: 'bot', html: '' }])
              }
              botText += ev.text
              updateBotMsg(botId, md(botText))
            } else if (ev.action) {
              execAction(ev.action)
            } else if (ev.error) {
              addMsg({ type: 'bot', html: `<em style="color:#fb7185">${ev.error}</em>` })
            }
          } catch (_) {}
        }
      }

      if (botText) setHistory((h) => [...h, { role: 'assistant', content: botText }])
    } catch (e) {
      setMsgs((prev) => prev.filter((m) => m.id !== typingId))
      addMsg({ type: 'bot', html: `<em style="color:#fb7185">Error: ${e.message}</em>` })
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }, [streaming, input, history, s.domains, s.folders, s.items, addMsg, updateBotMsg, execAction])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      <style>{`
        @keyframes ceo-fadein { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
        @keyframes ceo-dots { 0%,70%,100%{opacity:.25;transform:translateY(0)} 35%{opacity:1;transform:translateY(-3px)} }
        .ceo-dot { width:6px;height:6px;border-radius:50%;background:var(--mut,#7a7a8a);
          animation:ceo-dots 1.3s infinite ease-in-out; display:inline-block; }
        .ceo-dot:nth-child(2){animation-delay:.18s}
        .ceo-dot:nth-child(3){animation-delay:.36s}
        .ceo-bubble a{color:inherit;text-decoration:underline;text-underline-offset:2px;word-break:break-all}
        .ceo-bubble code{font-family:monospace;font-size:12px;background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px}
        .ceo-bubble ul{padding-left:15px;margin-top:5px}
        .ceo-bubble li{margin-bottom:2px}
        .ceo-bubble strong{font-weight:700}
      `}</style>

      {/* Floating button */}
      <button
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 130) }}
        title="Chief of Staff"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 600,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--acc, #c8a96e)', border: 'none', cursor: 'pointer',
          fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(200,169,110,.45)',
          transform: open ? 'scale(.93)' : 'scale(1)',
          transition: 'transform .15s, box-shadow .15s',
        }}
      >⚡</button>

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 88, right: 24, zIndex: 600,
        width: 'min(390px, calc(100vw - 32px))',
        height: 'min(580px, calc(100vh - 120px))',
        background: 'var(--surface, #141720)',
        border: '1.5px solid var(--border, #1c2030)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 56px rgba(0,0,0,.55)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'all' : 'none',
        transform: open ? 'none' : 'translateY(14px) scale(.97)',
        transition: 'opacity .2s, transform .2s',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 15px 11px',
          borderBottom: '1px solid var(--border, #1c2030)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 19 }}>⚡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text, #e8e4d9)' }}>
              Chief of Staff
            </div>
            <div style={{ fontSize: 10, color: 'var(--mut, #7a7a8a)', fontFamily: 'monospace', letterSpacing: '.04em', marginTop: 1 }}>
              LIFE COACH · DASHBOARD MANAGER
            </div>
          </div>
          <button
            onClick={() => { setHistory([]); setMsgs([]) }}
            style={{ background: 'none', border: 'none', color: 'var(--mut, #7a7a8a)', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', padding: '3px 7px', borderRadius: 4, letterSpacing: '.05em' }}
          >CLEAR</button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--mut, #7a7a8a)', cursor: 'pointer', fontSize: 16, padding: '4px 7px', borderRadius: 5, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Messages */}
        <div ref={msgsRef} style={{
          flex: 1, overflowY: 'auto', padding: '14px 13px 6px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {msgs.map((m) => {
            if (m.type === 'typing') return (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ padding: '10px 14px', background: 'var(--s2, #1c2030)', borderRadius: 12, borderBottomLeftRadius: 4, display: 'flex', gap: 5, alignItems: 'center' }}>
                  <div className="ceo-dot" />
                  <div className="ceo-dot" />
                  <div className="ceo-dot" />
                </div>
              </div>
            )
            if (m.type === 'action') return <ActionBadge key={m.id} text={m.html} />
            if (m.type === 'user') return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'row-reverse', gap: 8 }}>
                <div className="ceo-bubble" style={{
                  padding: '10px 13px', borderRadius: 12, borderBottomRightRadius: 4,
                  background: 'var(--acc, #c8a96e)', color: '#0d0f14',
                  fontSize: 13, lineHeight: 1.55, maxWidth: '86%',
                  wordBreak: 'break-word', fontWeight: 500,
                }} dangerouslySetInnerHTML={{ __html: m.html }} />
              </div>
            )
            return (
              <div key={m.id} style={{ display: 'flex', gap: 8 }}>
                <div className="ceo-bubble" style={{
                  padding: '10px 13px', borderRadius: 12, borderBottomLeftRadius: 4,
                  background: 'var(--s2, #1c2030)', color: 'var(--text, #e8e4d9)',
                  fontSize: 13, lineHeight: 1.55, maxWidth: '86%', wordBreak: 'break-word',
                }} dangerouslySetInnerHTML={{ __html: m.html }} />
              </div>
            )
          })}
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 12px 14px',
          borderTop: '1px solid var(--border, #1c2030)',
          display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKey}
            placeholder="Ask anything, or say 'add X to Y'…"
            rows={1}
            style={{
              flex: 1, background: 'var(--s2, #1c2030)',
              border: '1.5px solid var(--border, #1c2030)',
              borderRadius: 8, color: 'var(--text, #e8e4d9)',
              fontFamily: 'inherit', fontSize: 13,
              padding: '9px 12px', outline: 'none', resize: 'none',
              maxHeight: 120, lineHeight: 1.45,
              transition: 'border-color .15s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--acc, #c8a96e)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border, #1c2030)'}
          />
          <button
            onClick={send}
            disabled={streaming}
            style={{
              background: 'var(--acc, #c8a96e)', border: 'none',
              borderRadius: 8, color: '#0d0f14',
              fontSize: 16, fontWeight: 700, cursor: streaming ? 'default' : 'pointer',
              padding: '9px 13px', lineHeight: 1, flexShrink: 0,
              opacity: streaming ? .3 : 1, transition: 'opacity .15s',
              height: 38, display: 'flex', alignItems: 'center',
            }}
          >↑</button>
        </div>
      </div>
    </>
  )
}
