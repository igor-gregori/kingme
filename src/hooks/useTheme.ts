import { useCallback, useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage.ts'

export type ThemePref = 'system' | 'light' | 'dark'

const ORDER: ThemePref[] = ['system', 'light', 'dark']

export const THEME_LABELS: Record<ThemePref, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
}

// A mesma chave é lida pelo script em index.html, para aplicar o tema antes do React carregar.
export function useTheme() {
  const [pref, setPref] = useLocalStorage<ThemePref>('kingme:theme', 'system')

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])

  const cycle = useCallback(() => {
    setPref((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length])
  }, [setPref])

  return { pref, cycle }
}
