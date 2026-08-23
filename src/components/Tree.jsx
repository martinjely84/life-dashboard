import { useEffect, useRef, useState } from 'react'

// Generalised version of the old renderFamilyTree() / buildNode() pair:
// same box-and-line look, but for an arbitrary-depth tree of any domain.
//
// Takes a nested { id, label, sub, color, kind, count, children } root and
// lays it out top-down. Leaves get slots left-to-right; parents centre over
// their children — the classic tidy-tree layout.

// Below this the labels stop being readable, so a very wide tree keeps its
// horizontal scrollbar rather than shrinking into illegibility.
const MIN_SCALE = 0.6

const NW = 152   // node width
const NH = 58    // node height
const HGAP = 18
const VGAP = 62
const PAD = 20

function truncate(s, max) {
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function layout(root, maxDepth) {
  const nodes = []
  const edges = []
  let slot = 0

  function walk(node, depth, parent) {
    const kids = depth < maxDepth ? node.children || [] : []
    const hidden = (node.children || []).length - kids.length
    let x

    if (!kids.length) {
      x = slot * (NW + HGAP)
      slot += 1
    } else {
      const placed = kids.map((k) => walk(k, depth + 1, null))
      x = (placed[0].x + placed[placed.length - 1].x) / 2
      placed.forEach((p) => edges.push({ from: { x, y: depth * (NH + VGAP) }, to: p }))
    }

    const placedNode = { ...node, x, y: depth * (NH + VGAP), depth, hidden }
    nodes.push(placedNode)
    return placedNode
  }

  walk(root, 0, null)
  const width = Math.max(slot * (NW + HGAP) - HGAP, NW)
  const depth = Math.max(...nodes.map((n) => n.depth))
  return { nodes, edges, width, height: (depth + 1) * NH + depth * VGAP }
}

function Node({ n, onSelect }) {
  const color = n.color || '#7a7a8a'
  const isRoot = n.depth === 0
  const isItem = n.kind === 'item'

  return (
    <g
      className="tnode"
      onClick={() => onSelect?.(n)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(n) } }}
    >
      <rect
        className="tbox"
        x={n.x} y={n.y} width={NW} height={NH} rx="10" ry="10"
        fill={isRoot ? `${color}33` : isItem ? '#141720' : '#1c2030'}
        stroke={color}
        strokeWidth={isRoot ? 2 : 1.5}
        strokeOpacity={isItem && n.done ? 0.3 : 0.7}
        strokeDasharray={isItem ? '0' : '0'}
      />

      <text
        x={n.x + 13} y={n.y + (n.sub ? 23 : 32)}
        fill={n.done ? '#4a4a5a' : '#e8e4d9'}
        fontSize="13" fontWeight="600"
        fontFamily="Instrument Sans, sans-serif"
        textDecoration={n.done ? 'line-through' : 'none'}
      >
        {truncate(n.label, 19)}
      </text>

      {n.sub && (
        <text x={n.x + 13} y={n.y + 39} fill="#7a7a8a" fontSize="10" fontFamily="DM Mono, monospace">
          {truncate(n.sub, 22)}
        </text>
      )}

      {n.badge && (
        <>
          <rect x={n.x + NW - 46} y={n.y + 9} width="36" height="14" rx="4" fill={`${color}22`} />
          <text x={n.x + NW - 28} y={n.y + 19} fill={color} fontSize="8"
            fontFamily="DM Mono, monospace" textAnchor="middle" letterSpacing="0.5">
            {n.badge}
          </text>
        </>
      )}

      {n.count > 0 && (
        <>
          <rect x={n.x + NW - 42} y={n.y + NH - 21} width="32" height="14" rx="7" fill={`${color}22`} />
          <text x={n.x + NW - 26} y={n.y + NH - 11} fill={color} fontSize="9"
            fontFamily="DM Mono, monospace" textAnchor="middle">
            {n.count} open
          </text>
        </>
      )}

      {n.hidden > 0 && (
        <text x={n.x + NW / 2} y={n.y + NH + 15} fill="#4a4a5a" fontSize="9"
          fontFamily="DM Mono, monospace" textAnchor="middle">
          +{n.hidden} more ↓
        </text>
      )}
    </g>
  )
}

export default function Tree({ root, onSelect, maxDepth = 2 }) {
  const wrapRef = useRef(null)
  const [avail, setAvail] = useState(0)

  // Watch the panel width so the tree can shrink to fit inside it.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    setAvail(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setAvail(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!root) return null
  const { nodes, edges, width, height } = layout(root, maxDepth)
  const svgW = width + PAD * 2
  const svgH = height + PAD * 2 + 14

  // Scale down to fit, but never past the point of being readable.
  const scale = avail && svgW > avail ? Math.max(avail / svgW, MIN_SCALE) : 1
  const dispW = Math.round(svgW * scale)
  const dispH = Math.round(svgH * scale)

  return (
    <div className="tree-scroll" ref={wrapRef}>
      <svg
        width={dispW}
        height={dispH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ minWidth: dispW }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {edges.map((e, i) => {
            const midY = e.from.y + NH + VGAP / 2
            const fx = e.from.x + NW / 2
            const tx = e.to.x + NW / 2
            return (
              <g key={i} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" fill="none">
                <line x1={fx} y1={e.from.y + NH} x2={fx} y2={midY} />
                <line x1={fx} y1={midY} x2={tx} y2={midY} />
                <line x1={tx} y1={midY} x2={tx} y2={e.to.y} />
              </g>
            )
          })}
          {nodes.map((n) => <Node key={n.id} n={n} onSelect={onSelect} />)}
        </g>
      </svg>
    </div>
  )
}
