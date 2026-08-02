import config from '../config.json'
import { useT } from '../hooks/useT'
import type { PackSummary } from '../lib/packsApi'

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
  packs: PackSummary[]
  disabled?: boolean
}) {
  const { t } = useT()
  // Le pack courant reste toujours parmi les options, même absent de la
  // liste : liste vide (chargement en cours ou échec), mais aussi pack qui a
  // disparu de list_packs (supprimé ou privatisé) pendant que l'hôte est sur
  // l'écran de réglages. Sans ça le <select> retomberait silencieusement sur
  // la première option alors que value.pack, lui, n'a pas changé. Son nom est
  // inconnu dans ce cas : on retombe sur le slug, faute de mieux.
  const connu = packs.some(p => p.slug === value.pack)
  const options = [
    ...packs.map(p => ({ slug: p.slug, label: `${p.emoji} ${p.name}`.trim() })),
    ...(connu ? [] : [{ slug: value.pack, label: value.pack }]),
  ]
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
          {options.map(o => (
            <option key={o.slug} value={o.slug}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
