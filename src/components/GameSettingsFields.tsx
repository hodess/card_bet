import { useT } from '../hooks/useT'

export type GameSettings = {
  deckSize: number
  startBankroll: number
  minBid: number
  closeDelaySeconds: number
}

// Le libellé vient de la clé `settings.<champ>` (cf. src/i18n/fr.ts).
const FIELDS: { key: keyof GameSettings; min: number; max: number; step: number }[] = [
  { key: 'deckSize', min: 1, max: 10, step: 1 },
  { key: 'startBankroll', min: 100, max: 100000, step: 100 },
  { key: 'minBid', min: 1, max: 1000, step: 5 },
  { key: 'closeDelaySeconds', min: 1, max: 60, step: 1 },
]

export default function GameSettingsFields({ value, onChange, disabled = false }: {
  value: GameSettings
  onChange: (next: GameSettings) => void
  disabled?: boolean
}) {
  const { t } = useT()
  return (
    <div className="settings-grid">
      {FIELDS.map(f => (
        <label key={f.key} className="settings-field">
          <span>{t(`settings.${f.key}`)}</span>
          <input
            type="number"
            value={value[f.key]}
            min={f.min} max={f.max} step={f.step}
            disabled={disabled}
            onChange={e => onChange({ ...value, [f.key]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  )
}
