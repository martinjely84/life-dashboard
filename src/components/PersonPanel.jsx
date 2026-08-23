import { useEffect } from 'react'
import ItemList from './ItemList'
import ChatList from './ChatList'
import {
  useStore, personFolderId, folderItems, chatsFor, ensurePersonFolder, moveChat,
} from '../lib/store'

export default function PersonPanel({ personId, onClose }) {
  const s = useStore()
  const person = s.people.find((p) => p.id === personId)
  const folderId = personFolderId(s, personId)

  // Person goals reuse the item model. Someone with no goals yet has no
  // folder, so create one on open — in an effect, never during render.
  useEffect(() => {
    if (!folderId) ensurePersonFolder(personId)
  }, [personId, folderId])

  if (!person) return null
  const items = folderId ? folderItems(s, folderId) : []
  const chats = chatsFor(s, { personId })

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="person-panel">
        <button className="px" onClick={onClose} aria-label="Close">✕</button>

        <div className="ph">
          <div
            className="ph-av"
            style={{ background: `${person.color}22`, border: `2px solid ${person.color}88` }}
          >
            {person.emoji}
          </div>
          <div className="ph-ti">{person.name}</div>
        </div>

        <div className="sl" style={{ marginBottom: '.75rem' }}>{person.rel || person.role}</div>

        <div className="sl" style={{ marginTop: '1.25rem', marginBottom: '.75rem' }}>Goals</div>
        <ItemList
          items={items}
          folderId={folderId}
          accent={person.color}
          emptyText="No goals yet"
        />

        <div className="sl" style={{ marginTop: '1.25rem', marginBottom: '.75rem' }}>Chats</div>
        <ChatList
          chats={chats}
          color={person.color}
          onDropChat={(id) => moveChat(id, { personId })}
          dropLabel={`Drop a pending chat onto ${person.name}`}
        />
      </div>
    </div>
  )
}

export { personFolderId }
