import { useT } from '../hooks/useT'
import config from '../config.json'

const NIVEAUX = Object.keys(config.bot.levels)

// Badge « bot » ou « bot • Difficile ». Deux replis nécessaires :
// les matchs enregistrés AVANT ce chantier ont is_bot vrai et bot_level nul
// (match_players n'a pas été backfillée), et ils affichaient déjà un badge « bot »
// nu — le faire disparaître serait une régression. Et comme match_players ne porte
// aucune contrainte sur cette colonne, une valeur imprévue ne doit jamais laisser
// s'afficher une clé de traduction brute à l'écran.
export default function BotBadge({ isBot, level }: { isBot: boolean; level: string | null }) {
  const { t } = useT()
  if (!isBot) return null
  const connu = level !== null && NIVEAUX.includes(level)
  return (
    <span className="badge">
      {' '}{t('common.bot')}{connu && ` • ${t(`bot.level.${level}`)}`}
    </span>
  )
}
