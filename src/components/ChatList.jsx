import { useState } from 'react'
import { deleteChat } from '../lib/store'

export default function ChatList({ chats, color = '#c8a96e', onDropChat, dropLabel }) {
  const [over, setOver] = useState(false)

  return (
    <>
      <div className="clist">
        {chats.length ? chats.map((c) => (
          <div className="ci" key={c.id}>
            <span className="cdot" style={{ background: color }} />
            <div className="cbody">
              {c.url
                ? <a className="ctitle" href={c.url} target="_blank" rel="noreferrer"
                     style={{ color: 'inherit', textDecoration: 'none' }}>{c.title}</a>
                : <div className="ctitle">{c.title}</div>}
              {c.meta && <div className="cmeta">{c.meta}</div>}
            </div>
            {c.url && <span className="carr">↗</span>}
            <button className="cdel" onClick={() => deleteChat(c.id)} aria-label="Delete chat">✕</button>
          </div>
        )) : <div className="empty">No chats here yet</div>}
      </div>

      {onDropChat && (
        <div
          className={`pdz${over ? ' dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const id = e.dataTransfer.getData('text/chat-id')
            if (id) onDropChat(id)
          }}
        >
          {dropLabel || 'Drop a pending chat here'}
        </div>
      )}
    </>
  )
}
