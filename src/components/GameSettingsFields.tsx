export type GameSettings = {
  deckSize: number
  startBankroll: number
  minBid: number
  closeDelaySeconds: number
}

const FIELDS: { key: keyof GameSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'deckSize', label: 'Cartes par deck', min: 1, max: 10, step: 1 },
  { key: 'startBankroll', label: 'Bankroll de départ', min: 100, max: 100000, step: 100 },
  { key: 'minBid', label: 'Mise minimale', min: 1, max: 1000, step: 5 },
  { key: 'closeDelaySeconds', label: 'Délai d’adjudication (s)', min: 1, max: 60, step: 1 },
]

export default function GameSettingsFields({ value, onChange, disabled = false }: {
  value: GameSettings
  onChange: (next: GameSettings) => void
  disabled?: boolean
}) {
  return (
    <div className="settings-grid">
      {FIELDS.map(f => (
        <label key={f.key} className="settings-field">
          <span>{f.label}</span>
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
