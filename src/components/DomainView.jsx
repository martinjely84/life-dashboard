import { useState } from 'react'
import Tree from './Tree'
import ItemList from './ItemList'
import FamilyTree from './FamilyTree'
import { PromptModal, ConfirmModal, DomainModal } from './Modal'
import { ITEM_TYPES, SCORE_LABELS } from '../lib/seed'
import {
  useStore, childFolders, folderById, folderItems, folderPath, folderCounts,
  adjustScore, addFolder, renameFolder, deleteFolder,
  updateDomain, deleteDomain, domainDeleteImpact,
} from '../lib/store'

// The tree shown for wherever we are: current node on top, its children below.
// A folder with no sub-folders shows its items as the leaf row instead.
function buildRoot(s, domain, folderId) {
  const itemNode = (i) => ({
    id: i.id,
    label: i.text,
    kind: 'item',
    done: i.done,
    color: (ITEM_TYPES[i.type] || ITEM_TYPES.goal).color,
    badge: (ITEM_TYPES[i.type] || ITEM_TYPES.goal).short,
    children: [],
  })

  const folderNode = (f) => {
    const kids = childFolders(s, domain.id, f.id)
    const items = folderItems(s, f.id)
    const { open } = folderCounts(s, f.id)
    return {
      id: f.id,
      label: f.name,
      kind: 'folder',
      color: domain.color,
      sub: kids.length ? `${kids.length} folder${kids.length > 1 ? 's' : ''}`
        : `${items.length} item${items.length === 1 ? '' : 's'}`,
      count: open,
      children: kids.length ? kids.map(folderNode) : items.map(itemNode),
    }
  }

  if (!folderId) {
    const roots = childFolders(s, domain.id, null)
    return {
      id: `domain-${domain.id}`,
      label: domain.name,
      kind: 'domain',
      color: domain.color,
      sub: `${roots.length} folder${roots.length === 1 ? '' : 's'}`,
      children: roots.map(folderNode),
    }
  }

  const f = folderById(s, folderId)
  return f ? folderNode(f) : null
}

export default function DomainView({ domainId, onBack, onOpenPerson, initialFolderId = null, focusItemId = null }) {
  const s = useStore()
  const [folderId, setFolderId] = useState(initialFolderId)
  const [modal, setModal] = useState(null) // new | rename | delete | editDomain | deleteDomain

  const domain = s.domains.find((d) => d.id === domainId)
  if (!domain) return <div className="center">Domain not found.</div>

  const path = folderId ? folderPath(s, folderId) : []
  const kids = childFolders(s, domainId, folderId)
  const items = folderId ? folderItems(s, folderId) : []
  const current = folderId ? folderById(s, folderId) : null
  const root = buildRoot(s, domain, folderId)

  const go = (node) => {
    if (node.kind === 'folder' && node.id !== folderId) setFolderId(node.id)
  }

  const removeFolder = () => {
    if (!current) return
    const parent = current.parent_folder_id
    deleteFolder(folderId)
    setFolderId(parent)
  }

  return (
    <>
      <div className="crumbs">
        <button onClick={onBack}>← All domains</button>
        <span className="sep">›</span>
        <button className={folderId ? '' : 'cur'} onClick={() => setFolderId(null)}>
          {domain.emoji} {domain.name}
        </button>
        {path.map((f, i) => (
          <span key={f.id} style={{ display: 'contents' }}>
            <span className="sep">›</span>
            <button className={i === path.length - 1 ? 'cur' : ''} onClick={() => setFolderId(f.id)}>
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {!folderId && (
        <div className="panel">
          <div className="ph">
            <span className="ph-em">{domain.emoji}</span>
            <div className="ph-ti">{domain.name}</div>
          </div>
          <div className="sc-row">
            <div className="sc-track">
              <div className="sc-fill" style={{ width: `${domain.score * 10}%`, background: domain.color }} />
            </div>
            <button className="sc-btn" onClick={() => adjustScore(domain.id, -1)}>−</button>
            <div className="sc-num">{domain.score}</div>
            <button className="sc-btn" onClick={() => adjustScore(domain.id, 1)}>＋</button>
            <div className="sc-lbl">{SCORE_LABELS[domain.score]}</div>
          </div>
          <div className="filters" style={{ marginBottom: 0 }}>
            <button className="btn-newsf" onClick={() => setModal('editDomain')}>
              rename / recolour domain
            </button>
            <button className="btn-newsf" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={() => setModal('deleteDomain')}>
              delete domain
            </button>
          </div>
        </div>
      )}

      {domainId === 'family' && !folderId && <FamilyTree onOpenPerson={onOpenPerson} />}

      <div className="tree-wrap">
        <div className="sl" style={{ marginBottom: '.75rem' }}>
          {current ? current.name : 'Structure'}&nbsp;
          <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--dim)' }}>
            click a folder to drill in
          </span>
          <button className="btn-newsf" onClick={() => setModal('new')}>
            ＋ sub-folder{current ? ` in ${current.name}` : ''}
          </button>
        </div>
        {root && (kids.length || items.length)
          ? <Tree root={root} onSelect={go} />
          : <div className="tree-empty">Empty — add a sub-folder or an item below.</div>}
      </div>

      <div className="panel">
            <div className="sl">Sub-folders</div>
            <div className="filters" style={{ marginBottom: '1.25rem' }}>
              {kids.map((f) => (
                <button key={f.id} className="btn-newsf" style={{ borderStyle: 'solid' }}
                  onClick={() => setFolderId(f.id)}>
                  {f.name} · {folderCounts(s, f.id).open} open
                </button>
              ))}
              <button className="btn-newsf" onClick={() => setModal('new')}>＋ new sub-folder</button>
              {current && (
                <>
                  <button className="btn-newsf" onClick={() => setModal('rename')}>rename</button>
                  <button className="btn-newsf" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => setModal('delete')}>delete folder</button>
                </>
              )}
            </div>

            <div className="sl">Items</div>
            {folderId ? (
              <ItemList items={items} folderId={folderId} accent={domain.color}
                focusItemId={folderId === initialFolderId ? focusItemId : null}
                emptyText="No items in this folder yet" />
            ) : (
              <div className="empty">
                Items live inside folders — open one above, or create a sub-folder.
              </div>
            )}
      </div>

      {modal === 'new' && (
        <PromptModal
          title="New sub-folder"
          label="Name"
          placeholder="e.g. Training, Projects, Admin…"
          onClose={() => setModal(null)}
          onSubmit={(name) => addFolder(domainId, folderId, name)}
        />
      )}
      {modal === 'delete' && current && (() => {
        const { total } = folderCounts(s, folderId)
        const subs = childFolders(s, domainId, folderId).length
        const bits = [
          subs && `${subs} sub-folder${subs === 1 ? '' : 's'}`,
          total && `${total} item${total === 1 ? '' : 's'}`,
        ].filter(Boolean)
        return (
          <ConfirmModal
            title="Delete folder?"
            body={`"${current.name}" and everything inside it will be removed.`}
            detail={bits.length ? `Deletes ${bits.join(' and ')}.` : 'This folder is empty.'}
            confirmLabel="Delete folder"
            onClose={() => setModal(null)}
            onConfirm={removeFolder}
          />
        )
      })()}

      {modal === 'editDomain' && (
        <DomainModal
          title="Edit domain"
          confirm="Save"
          initial={domain}
          onClose={() => setModal(null)}
          onSubmit={(patch) => updateDomain(domain.id, patch)}
        />
      )}

      {modal === 'deleteDomain' && (() => {
        const im = domainDeleteImpact(s, domainId)
        const bits = [
          im.folders && `${im.folders} folder${im.folders === 1 ? '' : 's'}`,
          im.items && `${im.items} item${im.items === 1 ? '' : 's'}`,
          im.actions && `${im.actions} action${im.actions === 1 ? '' : 's'}`,
        ].filter(Boolean)
        return (
          <ConfirmModal
            title={`Delete ${domain.name}?`}
            body={`The whole ${domain.name} domain and everything filed under it will be removed.`}
            detail={bits.length ? `Deletes ${bits.join(', ')}.` : 'This domain is empty.'}
            confirmLabel="Delete domain"
            onClose={() => setModal(null)}
            onConfirm={() => { deleteDomain(domainId); onBack() }}
          />
        )
      })()}

      {modal === 'rename' && current && (
        <PromptModal
          title="Rename folder"
          label="Name"
          initial={current.name}
          confirm="Save"
          onClose={() => setModal(null)}
          onSubmit={(name) => renameFolder(current.id, name)}
        />
      )}
    </>
  )
}
