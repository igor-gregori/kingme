import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatCount, formatScore, formatSeconds, whiteShare } from '../format.ts'

export interface EvalPoint {
  /** Quantos lances a partida tinha: a avaliação é da posição antes do lance seguinte. */
  ply: number
  /** Pontuação do ponto de vista das brancas. */
  score: number
  depth: number
  nodes: number
  ms: number
  /** O lance jogado a partir dessa posição, se já foi jogado. */
  move: string | null
  byHuman: boolean
}

const HEIGHT = 184
// Em cima e embaixo sobra uma faixa para os rótulos, fora de onde a linha pode passar.
const MARGIN = { top: 26, right: 48, bottom: 42, left: 12 }

/** De quantos em quantos lances marcar o eixo, para caberem no máximo oito marcas. */
function tickStep(moves: number): number {
  return [1, 2, 5, 10, 20, 50].find((step) => moves / step <= 8) ?? 100
}

/**
 * A avaliação do motor ao longo da partida, na mesma escala da barra ao lado do tabuleiro:
 * acima do meio as brancas estão melhor, abaixo, as pretas.
 */
export function EvalChart({ points }: { points: EvalPoint[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const lastPly = Math.max(8, points.at(-1)?.ply ?? 0)
  const x = (ply: number) => MARGIN.left + (ply / lastPly) * (width - MARGIN.left - MARGIN.right)
  const y = (score: number) => MARGIN.top + (1 - whiteShare(score)) * (HEIGHT - MARGIN.top - MARGIN.bottom)
  const middle = y(0)

  const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.ply).toFixed(1)},${y(point.score).toFixed(1)}`).join(' ')
  const area = points.length > 1 ? `${line} L${x(points.at(-1)!.ply).toFixed(1)},${middle} L${x(points[0].ply).toFixed(1)},${middle} Z` : ''

  const moves = Math.ceil(lastPly / 2)
  const step = tickStep(moves)
  const ticks: number[] = []
  for (let move = step; move <= moves; move += step) ticks.push(move)

  // O ponteiro só precisa estar perto: vale o ponto mais próximo na horizontal.
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const left = event.clientX - event.currentTarget.getBoundingClientRect().left
    let nearest = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].ply) - left) < Math.abs(x(points[nearest].ply) - left)) nearest = i
    }
    setHover(nearest)
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const current = hover ?? points.length - 1
    setHover(Math.min(points.length - 1, Math.max(0, current + (event.key === 'ArrowLeft' ? -1 : 1))))
  }

  const end = points.at(-1)
  const shown = hover !== null && hover < points.length ? points[hover] : null

  return (
    <div className="chart" ref={ref}>
      {points.length === 0 ? (
        <p className="chart-empty">O gráfico começa quando a IA pensar no primeiro lance.</p>
      ) : (
        width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Avaliação do motor ao longo da partida. Use as setas para percorrer as buscas."
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(points.length - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={onKeyDown}
          >
            <line className="chart-rule" x1={MARGIN.left} x2={width - MARGIN.right} y1={middle} y2={middle} />
            <text className="chart-side" x={MARGIN.left} y={12}>
              ↑ brancas melhor
            </text>
            <text className="chart-side" x={MARGIN.left} y={HEIGHT - MARGIN.bottom + 16}>
              ↓ pretas melhor
            </text>
            {ticks.map((move) => (
              <text key={move} className="chart-tick" x={x((move - 1) * 2)} y={HEIGHT - 6}>
                {move}
              </text>
            ))}
            <text className="chart-tick chart-unit" x={width - MARGIN.right + 8} y={HEIGHT - 6}>
              lance
            </text>

            {area && <path className="chart-area" d={area} />}
            {points.length > 1 && <path className="chart-line" d={line} />}

            {shown && <line className="chart-cross" x1={x(shown.ply)} x2={x(shown.ply)} y1={MARGIN.top - 4} y2={HEIGHT - MARGIN.bottom + 4} />}
            {end && (
              <>
                <circle className="chart-dot" cx={x(end.ply)} cy={y(end.score)} r={4} />
                <text className="chart-end" x={x(end.ply) + 9} y={y(end.score) + 4}>
                  {formatScore(end.score)}
                </text>
              </>
            )}
            {shown && shown !== end && <circle className="chart-dot" cx={x(shown.ply)} cy={y(shown.score)} r={4} />}
          </svg>
        )
      )}
      {shown && (
        <div
          className="chart-tip"
          style={{ left: Math.min(width - 96, Math.max(96, x(shown.ply))), top: Math.max(0, y(shown.score) - 10) }}
        >
          <strong>{formatScore(shown.score)}</strong>
          <span>
            lance {Math.floor(shown.ply / 2) + 1} · {shown.ply % 2 === 0 ? 'brancas' : 'pretas'}
            {shown.move ? ` · ${shown.move}` : ''}
          </span>
          <span>
            profundidade {shown.depth} · {formatCount(shown.nodes)} posições · {formatSeconds(shown.ms)}
          </span>
        </div>
      )}
    </div>
  )
}
