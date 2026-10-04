interface Props {
  /** Fração da barra que fica com as brancas, de 0 a 1. */
  white: number
  /** A pontuação já formatada, do ponto de vista das brancas. */
  label: string
  /** Pretas embaixo, acompanhando o tabuleiro. */
  flipped: boolean
}

/** Barra de avaliação: quanto mais branca, melhor para as brancas, segundo a IA. */
export function EvalBar({ white, label, flipped }: Props) {
  const ahead = white >= 0.5 ? 'white' : 'black'
  return (
    <div
      className={`gauge${flipped ? ' flipped' : ''}`}
      role="img"
      aria-label={`Avaliação da IA: ${label} (positivo é bom para as brancas)`}
      title="Avaliação da IA, do ponto de vista das brancas"
    >
      <div className="gauge-white" style={{ height: `${white * 100}%` }} />
      <span className={`gauge-label on-${ahead}`}>{label.replace(/^[+−]/, '')}</span>
    </div>
  )
}
