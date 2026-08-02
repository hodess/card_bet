import { useT } from '../hooks/useT'
import type { PackError } from '../lib/packs'

// Props → rendu. Pas de bibliothèque d'édition : un textarea monospace habillé
// au thème. Les erreurs arrivent structurées et sont traduites ici.
export default function PackJsonEditor({ text, onChange, errors, disabled = false }: {
  text: string
  onChange: (text: string) => void
  errors: PackError[]
  disabled?: boolean
}) {
  const { t } = useT()
  return (
    <div className="pack-editor-pane">
      <label className="hint" htmlFor="pack-json">{t('editor.jsonLabel')}</label>
      <textarea
        id="pack-json"
        className="pack-json"
        spellCheck={false}
        value={text}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      {errors.length > 0 && (
        <div className="pack-errors">
          <p className="hint">{t('editor.errorsTitle')}</p>
          <ul>
            {errors.map((e, i) => <li key={i} className="error">{t(e.key, e.params)}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
