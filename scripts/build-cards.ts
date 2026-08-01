// Générateur des artefacts SQL depuis data/packs/*.json.
// Ce fichier ne contient QUE des I/O et du CLI : toute la logique — parsing,
// validation, génération SQL — vit dans src/lib/packs.ts, où elle est testée.
// Extension .ts obligatoire dans l'import : tsconfig.node.json est en nodenext.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePackJson, seedSql, upsertSql, validatePacks, type Pack } from '../src/lib/packs.ts'

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const DOSSIER_PACKS = join(RACINE, 'data/packs')
const SEED = join(RACINE, 'supabase/seed.sql')
const MIGRATIONS = join(RACINE, 'supabase/migrations')

function charger(): Pack[] {
  const fichiers = readdirSync(DOSSIER_PACKS).filter(f => f.endsWith('.json')).sort()
  if (fichiers.length === 0) {
    console.error(`Aucun fichier de pack dans ${DOSSIER_PACKS}`)
    process.exit(1)
  }
  const packs: Pack[] = []
  const errors: string[] = []
  for (const f of fichiers) {
    const { pack, errors: errs } = parsePackJson(readFileSync(join(DOSSIER_PACKS, f), 'utf8'), basename(f, '.json'))
    errors.push(...errs)
    if (pack) packs.push(pack)
  }
  errors.push(...validatePacks(packs))
  if (errors.length > 0) {
    console.error('Packs invalides :')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  return packs
}

// Même format que `supabase migration new` : YYYYMMDDHHMMSS en UTC.
function horodatage(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

const [commande, nom] = process.argv.slice(2)
const packs = charger()

if (commande === 'seed') {
  writeFileSync(SEED, seedSql(packs))
  const total = packs.reduce((n, p) => n + p.cards.length, 0)
  console.log(`seed.sql régénéré : ${packs.length} pack(s), ${total} carte(s).`)
} else if (commande === 'migration') {
  if (!nom || !/^[a-z0-9_]+$/.test(nom)) {
    console.error('Usage : npm run cards:migration -- <nom_en_minuscules_et_underscores>')
    process.exit(1)
  }
  const chemin = join(MIGRATIONS, `${horodatage()}_${nom}.sql`)
  writeFileSync(chemin, `-- Généré par \`npm run cards:migration -- ${nom}\` depuis data/packs/*.json.\n-- Additif : rien n'est jamais supprimé.\n\n${upsertSql(packs)}`)
  console.log(`Migration écrite : ${chemin}`)
} else {
  console.error('Usage : tsx scripts/build-cards.ts seed | migration <nom>')
  process.exit(1)
}
