import config from '../config.json'
import { useT } from '../hooks/useT'

export type GameSettings = {
  deckSize: number
  startBankroll: number
  minBid: number
  closeDelaySeconds: number
  maxPlayers: number
}

// Bornes et pas viennent de `config.game.limits` : les `check` SQL restent la
// vérité, la config ne fait que les refléter dans le formulaire.
// Le libellé vient de la clé `settings.<champ>` (cf. src/i18n/fr.ts).
const LIMITS = config.game.limits
const FIELDS: (keyof GameSettings)[] = [
  'deckSize', 'startBankroll', 'minBid', 'closeDelaySeconds', 'maxPlayers',
]

export default function GameSettingsFields({ value, onChange, disabled = false }: {
  value: GameSettings
  onChange: (next: GameSettings) => void
  disabled?: boolean
}) {
  const { t } = useT()
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
    </div>
  )
}
