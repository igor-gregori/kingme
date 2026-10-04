import { useEffect, useRef } from 'react'
import type { PlayedMove } from '../game.ts'

interface Props {
  moves: PlayedMove[]
  /** Linha final: o resultado da partida, se ela acabou. */
  result: string | null
}

/** Lista de lances em notação algébrica, um par brancas/pretas por linha. */
export function MoveList({ moves, result }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Acompanha a partida: o último lance fica sempre à vista.
  useEffect(() => {
    const list = ref.current
    if (list) list.scrollTop = list.scrollHeight
  }, [moves.length, result])

  const rows = []
  for (let i = 0; i < moves.length; i += 2) {
    rows.push(
      <li key={i}>
        <span className="num">{i / 2 + 1}</span>
        <span className={`move${i === moves.length - 1 ? ' current' : ''}`}>{moves[i].name}</span>
        {moves[i + 1] ? (
          <span className={`move${i + 1 === moves.length - 1 ? ' current' : ''}`}>{moves[i + 1].name}</span>
        ) : (
          <span className="move pending">{result ? '' : '…'}</span>
        )}
      </li>,
    )
  }

  return (
    <div className="moves" ref={ref} tabIndex={0} aria-label="Lances da partida">
      {moves.length === 0 ? (
        <p className="moves-empty">Os lances aparecem aqui.</p>
      ) : (
        <ol>{rows}</ol>
      )}
      {result && <p className="moves-result">{result}</p>}
    </div>
  )
}
