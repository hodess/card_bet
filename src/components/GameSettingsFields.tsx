import config from '../config.json'
import { useT } from '../hooks/useT'

export type GameSettings = {
  deckSize: number
  startBankroll: number
  minBid: number
  closeDelaySeconds: number
  maxPlayers: number
  pack: string
}

// Bornes et pas viennent de `config.game.limits` : les `check` SQL restent la
// vérité, la config ne fait que les refléter dans le formulaire.
// Le libellé vient de la clé `settings.<champ>` (cf. src/i18n/fr.ts).
const LIMITS = config.game.limits
// `pack` est traité à part : c'est le seul champ texte, et `LIMITS[key]` ne
// typerait pas une clé sans bornes numériques.
const FIELDS: (keyof typeof LIMITS)[] = [
  'deckSize', 'startBankroll', 'minBid', 'closeDelaySeconds', 'maxPlayers',
]

export default function GameSettingsFields({ value, onChange, packs, disabled = false }: {
  value: GameSettings
  onChange: (next: GameSettings) => void
  packs: string[]
  disabled?: boolean
}) {
  const { t } = useT()
  // Liste vide (chargement en cours ou échec) : on garde au moins le pack courant
  // comme option, sinon le <select> s'afficherait vide alors qu'un pack est choisi.
  const options = packs.length > 0 ? packs : [value.pack]
  return (
    <div className="settings-grid">
      {FIELDS.map(key => (
        <label key={key} className="settings-field">
          <span>{t(`settings.${key}`)}</span>
          <input
            type="number"
            value={value[key]}
            min={LIMITS[key].min} max={LIMITS[key].max} step={LIMITS[key].step}
            disabled={disabled}
            onChange={e => onChange({ ...value, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="settings-field">
        <span>{t('settings.pack')}</span>
        <select
          value={value.pack}
          disabled={disabled || options.length <= 1}
          onChange={e => onChange({ ...value, pack: e.target.value })}
        >
          {options.map(slug => (
            <option key={slug} value={slug}>{t(`packs.${slug}.name`)}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
