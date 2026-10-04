import type { ReactNode } from 'react'
import { followLink } from '../hooks/usePath.ts'
import { THEME_LABELS, type ThemePref } from '../hooks/useTheme.ts'
import { Crown, MonitorIcon, MoonIcon, SunIcon } from './icons.tsx'

interface Props {
  themePref: ThemePref
  onCycleTheme: () => void
  /** Os controles da página: ficam entre a marca e o botão de tema. */
  children: ReactNode
}

const THEME_ICONS = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
}

export function Header({ themePref, onCycleTheme, children }: Props) {
  const ThemeIcon = THEME_ICONS[themePref]
  const themeLabel = `Tema: ${THEME_LABELS[themePref]} (clique para trocar)`

  return (
    <header className="top">
      <a className="brand" href="/" onClick={followLink}>
        <Crown />
        kingme
      </a>
      <nav className="tools">{children}</nav>
      <button className="icon-btn" onClick={onCycleTheme} aria-label={themeLabel} title={themeLabel}>
        <ThemeIcon />
      </button>
    </header>
  )
}
