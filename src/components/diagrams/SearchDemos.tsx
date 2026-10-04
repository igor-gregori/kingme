import { useEffect, useRef, useState } from 'react'
import { INITIAL } from '../../engine/board.ts'
import { startSearch, stopSearch } from '../../engine/client.ts'
import { legalMoves, moveName } from '../../engine/movegen.ts'
import type { SearchOptions } from '../../engine/search.ts'
import { formatInteger, formatScore } from '../../format.ts'

// As duas demonstrações usam o mesmo worker do jogo, que só faz uma busca por vez:
// enquanto uma roda, os botões das duas ficam desligados.

interface DemoProps {
  busy: boolean
  setBusy: (busy: boolean) => void
}

const DEPTH = 8

const CONFIGS: { name: string; text: string; options: Partial<SearchOptions> }[] = [
  { name: 'Minimax puro', text: 'visita tudo', options: { alphaBeta: false, ordering: false, table: false } },
  { name: '+ poda alfa-beta', text: 'corta ramos inúteis', options: { ordering: false, table: false } },
  { name: '+ ordenação', text: 'corta mais cedo', options: { table: false } },
  { name: '+ tabela de transposição', text: 'não repete posição', options: {} },
]

interface Run {
  nodes: number
  ms: number
  score: number
}

/** A mesma busca, na mesma profundidade, ligando uma técnica por vez. */
export function PruningChart({ busy, setBusy }: DemoProps) {
  const [runs, setRuns] = useState<(Run | null)[]>(CONFIGS.map(() => null))
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopSearch()
    }
  }, [])

  async function run() {
    setBusy(true)
    setRuns(CONFIGS.map(() => null))
    for (let i = 0; i < CONFIGS.length; i++) {
      const result = await startSearch(INITIAL, [], { maxDepth: DEPTH, timeMs: 120_000, ...CONFIGS[i].options }, () => {})
      if (!alive.current) return
      setRuns((current) => current.map((value, k) => (k === i ? { nodes: result.nodes, ms: result.ms, score: result.score } : value)))
    }
    setBusy(false)
  }

  const baseline = runs[0]
  const done = runs.every((value) => value !== null)
  return (
    <figure className="figure">
      <div className="figure-head">
        <div>
          <h3>Posições visitadas para enxergar {DEPTH} lances à frente</h3>
          <p>A partir da posição inicial. Menos é melhor.</p>
        </div>
        <button className="run" onClick={run} disabled={busy}>
          {done ? 'Rodar de novo' : 'Rodar no meu navegador'}
        </button>
      </div>
      <table className="bars">
        <thead>
          <tr>
            <th scope="col">Busca</th>
            <th scope="col">Posições</th>
            <th scope="col">Tempo</th>
          </tr>
        </thead>
        <tbody>
          {CONFIGS.map((config, i) => {
            const value = runs[i]
            const share = value && baseline ? value.nodes / baseline.nodes : 0
            return (
              <tr key={config.name}>
                <th scope="row">
                  {config.name}
                  <small>{config.text}</small>
                </th>
                <td>
                  {/* A barra cresce até onde ainda sobra lugar para o valor na ponta dela. */}
                  <div className="bar-line" title={value ? `${config.name}: ${formatInteger(value.nodes)} posições` : undefined}>
                    {value ? (
                      <>
                        <span className="bar" style={{ width: `max(2px, calc((100% - 11rem) * ${share}))` }} />
                        <span className="bar-value">
                          {formatInteger(value.nodes)}
                          {i > 0 && baseline && <small> · {formatInteger(Math.round(baseline.nodes / value.nodes))}× menos</small>}
                        </span>
                      </>
                    ) : (
                      <span className="bar-value pending">{busy && runs.findIndex((v) => v === null) === i ? 'buscando…' : '—'}</span>
                    )}
                  </div>
                </td>
                <td className="time">{value ? `${formatInteger(Math.max(1, Math.round(value.ms)))} ms` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <figcaption>
        {done && baseline
          ? `As quatro buscas chegam à mesma avaliação (${formatScore(baseline.score)} para as brancas): as técnicas não mudam a resposta, só o trabalho. As barras estão em escala linear, por isso as três últimas quase somem.`
          : 'As quatro buscas chegam à mesma avaliação: as técnicas não mudam a resposta, só o trabalho.'}
      </figcaption>
    </figure>
  )
}

interface Step {
  depth: number
  best: string
  score: number
  nodes: number
  ms: number
}

/** Uma busca de 1 segundo, mostrando cada profundidade que ela conclui. */
export function DeepeningTable({ busy, setBusy }: DemoProps) {
  const [steps, setSteps] = useState<Step[]>([])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function run() {
    setBusy(true)
    setSteps([])
    const legal = legalMoves(INITIAL)
    await startSearch(INITIAL, [], { maxDepth: 99, timeMs: 1000 }, (info) => {
      if (!alive.current) return
      const best = legal.find((move) => move.from === info.best!.from && move.to === info.best!.to)!
      setSteps((current) => [...current, { depth: info.depth, best: moveName(best), score: info.score, nodes: info.nodes, ms: info.ms }])
    })
    if (alive.current) setBusy(false)
  }

  return (
    <figure className="figure">
      <div className="figure-head">
        <div>
          <h3>Uma busca de 1 segundo, profundidade por profundidade</h3>
          <p>A partir da posição inicial. Posições e tempo são acumulados.</p>
        </div>
        <button className="run" onClick={run} disabled={busy}>
          {steps.length > 0 ? 'Buscar de novo' : 'Buscar por 1 segundo'}
        </button>
      </div>
      <div className="scroll">
        <table className="steps">
          <thead>
            <tr>
              <th scope="col">Profundidade</th>
              <th scope="col">Melhor lance</th>
              <th scope="col">Avaliação</th>
              <th scope="col">Posições</th>
              <th scope="col">Tempo</th>
            </tr>
          </thead>
          <tbody>
            {steps.length === 0 ? (
              <tr>
                <td colSpan={5} className="pending">
                  {busy ? 'Buscando…' : 'Rode a busca para ver as iterações.'}
                </td>
              </tr>
            ) : (
              steps.map((step) => (
                <tr key={step.depth}>
                  <td>{step.depth}</td>
                  <td>{step.best}</td>
                  <td>{formatScore(step.score)}</td>
                  <td>{formatInteger(step.nodes)}</td>
                  <td>{formatInteger(Math.round(step.ms))} ms</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <figcaption>
        Cada profundidade custa algumas vezes mais que a anterior, então refazer as rasas sai quase de graça. Em troca,
        a busca pode parar a qualquer momento com a melhor jogada da última iteração completa.
      </figcaption>
    </figure>
  )
}
