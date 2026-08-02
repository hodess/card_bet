import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PackSummary } from '../lib/packsApi'
import PackTile from './PackTile'

// Props → rendu. `actions` est un rendu délégué : la page garde les handlers,
// la section ne connaît que la mise en page.
export default function PackSection({ title, packs, empty, actions }: {
  title: string
  packs: PackSummary[]
  empty?: string
  actions?: (pack: PackSummary) => ReactNode
}) {
  return (
    <section className="pack-section">
      <h2>{title}</h2>
      {packs.length === 0 && empty && <p className="hint">{empty}</p>}
      <div className="pack-grid">
        {packs.map(p => (
          <div key={p.slug} className="pack-cell">
            <Link className="pack-link" to={`/packs/${encodeURIComponent(p.slug)}`}>
              <PackTile pack={p} />
            </Link>
            {actions && <div className="pack-actions">{actions(p)}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}
