import Tree from './Tree'
import { useStore, personFolderId, folderItems } from '../lib/store'

export default function FamilyTree({ onOpenPerson }) {
  const s = useStore()
  if (!s.people.length) return null

  const openGoals = (personId) => {
    const fid = personFolderId(s, personId)
    if (!fid) return 0
    return folderItems(s, fid).filter((i) => !i.done).length
  }

  const node = (p) => ({
    id: p.id,
    label: `${p.emoji}  ${p.name}`,
    sub: p.role,
    kind: 'person',
    color: p.color,
    count: openGoals(p.id),
    children: s.people
      .filter((c) => c.parent_person_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(node),
  })

  const root = s.people.find((p) => !p.parent_person_id)
  if (!root) return null

  return (
    <div className="tree-wrap">
      <div className="sl" style={{ marginBottom: '.75rem' }}>
        Family&nbsp;
        <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--dim)' }}>
          click a person to open
        </span>
      </div>
      <Tree root={node(root)} maxDepth={3} onSelect={(n) => onOpenPerson(n.id)} />
    </div>
  )
}
