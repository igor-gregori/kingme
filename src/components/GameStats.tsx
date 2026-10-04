import type { CSSProperties } from 'react'
import { formatCount, formatScore, formatSeconds } from '../format.ts'
import type { PlayedMove } from '../game.ts'
import type { EngineReport } from '../report.ts'
import { EvalChart, type EvalPoint } from './EvalChart.tsx'

interface Props {
  /** As buscas concluídas da partida, em ordem. */
  log: EngineReport[]
  /** A busca em andamento ou a última: é dela a tabela de profundidades. */
  current: EngineReport | null
  moves: PlayedMove[]
}

const ONE_DECIMAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** As estatísticas da partida: o gráfico da avaliação, os totais e a última busca por dentro. */
export function GameStats({ log, current, moves }: Props) {
  // A busca em andamento entra no gráfico como o último ponto, que se mexe enquanto o motor pensa.
  const live = current && !current.done && !log.some((report) => report.ply === current.ply) ? [current] : []
  const points: EvalPoint[] = [...log, ...live].map((report) => ({
    ply: report.ply,
    score: report.score,
    depth: report.depth,
    nodes: report.nodes,
    ms: report.ms,
    move: moves[report.ply]?.name ?? null,
    byHuman: report.byHuman,
  }))

  const nodes = log.reduce((sum, report) => sum + report.nodes, 0)
  const ms = log.reduce((sum, report) => sum + report.ms, 0)
  const depth = log.reduce((sum, report) => sum + report.depth, 0)
  const searches = log.length === 1 ? '1 busca' : `${log.length} buscas`

  const iterations = current ? [...current.iterations].reverse() : []
  const most = iterations[0]?.nodes ?? 0

  return (
    <>
      <section className="numbers" aria-label="Estatísticas da partida">
        <div className="panel-head">
          <h2>Partida em números</h2>
          <p>{log.length === 0 ? 'Nenhuma busca ainda.' : `Somando ${searches} do motor nesta partida.`}</p>
        </div>
        <dl className="tiles wide">
          <div>
            <dt>posições analisadas</dt>
            <dd>{log.length ? formatCount(nodes) : '—'}</dd>
          </div>
          <div>
            <dt>tempo de busca</dt>
            <dd>{log.length ? formatSeconds(ms) : '—'}</dd>
          </div>
          <div>
            <dt>profundidade média</dt>
            <dd>{log.length ? ONE_DECIMAL.format(depth / log.length) : '—'}</dd>
          </div>
          <div>
            <dt>velocidade média</dt>
            <dd>{ms >= 1 ? `${formatCount((nodes / ms) * 1000)}/s` : '—'}</dd>
          </div>
        </dl>

        <h3 className="chart-title">Avaliação ao longo da partida</h3>
        <EvalChart points={points} />

        {log.length > 0 && (
          <details className="searches">
            <summary>Ver as buscas em tabela</summary>
            <div className="scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th scope="col">Lance</th>
                    <th scope="col">Busca</th>
                    <th scope="col">Jogada</th>
                    <th scope="col">Avaliação</th>
                    <th scope="col">Prof.</th>
                    <th scope="col">Posições</th>
                    <th scope="col">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((report) => (
                    <tr key={report.ply}>
                      <td>
                        {Math.floor(report.ply / 2) + 1} · {report.ply % 2 === 0 ? 'brancas' : 'pretas'}
                      </td>
                      <td>{report.byHuman ? 'análise' : 'IA'}</td>
                      <td>{moves[report.ply]?.name ?? '—'}</td>
                      <td>{formatScore(report.score)}</td>
                      <td>{report.depth}</td>
                      <td>{formatCount(report.nodes)}</td>
                      <td>{formatSeconds(report.ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="depths" aria-label="A última busca, profundidade por profundidade">
        <div className="panel-head">
          <h2>Profundidade por profundidade</h2>
          <p>
            {current
              ? `${current.byHuman ? 'Análise' : 'Busca da IA'} no lance ${Math.floor(current.ply / 2) + 1}. Posições e tempo são acumulados.`
              : 'Cada linha é uma volta do aprofundamento iterativo.'}
          </p>
        </div>
        <div className="depths-scroll" tabIndex={0}>
          <table className="grid-table">
            <thead>
              <tr>
                <th scope="col">Prof.</th>
                <th scope="col">Lance</th>
                <th scope="col">Aval.</th>
                <th scope="col">Posições</th>
                <th scope="col">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {iterations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="pending">
                    Sem busca ainda.
                  </td>
                </tr>
              ) : (
                iterations.map((step) => (
                  <tr key={step.depth}>
                    <td>{step.depth}</td>
                    <td>{step.best}</td>
                    <td>{formatScore(step.score)}</td>
                    <td>
                      {formatCount(step.nodes)}
                      {/* Quanto desta busca já tinha sido gasto até aqui: o custo cresce depressa. */}
                      <span className="share" style={{ '--share': most > 0 ? step.nodes / most : 0 } as CSSProperties} />
                    </td>
                    <td>{formatSeconds(step.ms)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
