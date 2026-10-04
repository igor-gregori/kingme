import { usePath } from './hooks/usePath.ts'
import { useTheme } from './hooks/useTheme.ts'
import { HowItWorks } from './pages/HowItWorks.tsx'
import { Play } from './pages/Play.tsx'

export default function App() {
  const theme = useTheme()
  const path = usePath()
  // A partida fica salva no navegador, então ir e voltar da explicação não perde o jogo.
  return path.startsWith('/como-funciona') ? <HowItWorks theme={theme} /> : <Play theme={theme} />
}
