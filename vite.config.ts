import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    // Un worktree d'une autre session peut vivre sous `.claude/` avec une copie
    // complète du dépôt, tests compris. Sans cette exclusion, vitest compte les
    // tests deux fois et les totaux annoncés ne veulent plus rien dire.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
