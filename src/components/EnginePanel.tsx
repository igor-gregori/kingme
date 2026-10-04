import type { CSSProperties } from 'react'
import { formatCount, formatPercent, formatScore, formatSeconds, isDecided, movesToWin } from '../format.ts'
import { isTimed, type EngineReport } from '../report.ts'

interface Props {
  report: EngineReport | null
  thinking: boolean
  /** Os limites da busca em andamento; null se o motor está parado. */
  budget: { timeMs: number; maxDepth: number } | null
  /** Muda a cada busca nova, para a barra de tempo recomeçar. */
  searchKey: string
  analysis: boolean
  onToggleAnalysis: () => void
}

function describe(score: number): string {
  if (isDecided(score)) return `${score > 0 ? 'brancas' : 'pretas'} vencem em ${movesToWin(score)}`
  const text = formatScore(score)
  if (text === '0,0') return '0,0 · equilíbrio'
  return `${text} · ${score > 0 ? 'brancas' : 'pretas'} melhor`
}

function limitText(budget: { timeMs: number; maxDepth: number }): string {
  return isTimed(budget) ? `até ${formatSeconds(budget.timeMs)}` : `até ${budget.maxDepth} lances à frente`
}

/** O que o motor está fazendo agora, ou fez na última busca. */
export function EnginePanel({ report, thinking, budget, searchKey, analysis, onToggleAnalysis }: Props) {
  const speed = report && report.ms >= 1 ? `${formatCount((report.nodes / report.ms) * 1000)}/s` : '—'
  const limits = budget ?? report
  const timed = limits !== null && isTimed(limits)

  // A barra mostra quanto do limite já foi gasto: do tempo, nos níveis com relógio, ou da
  // profundidade, nos níveis de profundidade fixa.
  let used = 0
  let meter = 'aguardando a primeira busca'
  if (limits && report) {
    used = timed ? Math.min(1, report.ms / limits.timeMs) : Math.min(1, report.depth / limits.maxDepth)
    meter = timed
      ? `${formatSeconds(report.ms)} de ${formatSeconds(limits.timeMs)}`
      : `profundidade ${report.depth} de ${limits.maxDepth} · ${formatSeconds(report.ms)}`
    if (report.done && isDecided(report.score) && used < 1) meter += ' · resultado provado'
  }
  // Com relógio, a barra corre sozinha enquanto o motor pensa, sem esperar a próxima profundidade.
  const running = thinking && timed && budget !== null
  const fill: CSSProperties = running ? { animationDuration: `${budget.timeMs}ms` } : { width: `${used * 100}%` }

  return (
    <section className="engine" aria-label="Painel do motor">
      <div className="engine-head">
        <h2>
          Motor
          {thinking && <span className="pulse" aria-label="pensando" />}
        </h2>
        <label className="toggle">
          <span>Analisar minha vez</span>
          <button className="switch" role="switch" aria-checked={analysis} onClick={onToggleAnalysis} />
        </label>
      </div>

      <p className="engine-caption">
        {report ? (
          <>
            {report.byHuman ? 'Análise da sua vez' : thinking ? 'A IA está buscando' : 'Última busca da IA'}
            {limits && ` · ${limitText(limits)}`}
          </>
        ) : thinking ? (
          'Buscando…'
        ) : (
          'Os números aparecem quando a IA pensar no primeiro lance.'
        )}
      </p>

      <dl className="tiles">
        <div>
          <dt>profundidade</dt>
          <dd>{report ? report.depth : '—'}</dd>
        </div>
        <div>
          <dt>posições</dt>
          <dd>{report ? formatCount(report.nodes) : '—'}</dd>
        </div>
        <div>
          <dt>velocidade</dt>
          <dd>{speed}</dd>
        </div>
      </dl>

      <div className="meter" role="img" aria-label={`Limite da busca: ${meter}`}>
        <span className="meter-track">
          <span key={running ? searchKey : 'parado'} className={`meter-fill${running ? ' running' : ''}`} style={fill} />
        </span>
        <span className="meter-text">
          {running ? `${report && !report.done ? formatSeconds(report.ms) : '0 s'} de ${formatSeconds(budget.timeMs)}` : meter}
        </span>
      </div>

      <dl className="stats" aria-live="off">
        <div>
          <dt>{report?.byHuman ? 'melhor lance para você' : 'melhor lance'}</dt>
          <dd>
            {report ? report.best : '—'}
            {report?.played && <small> · jogou {report.played} de propósito</small>}
          </dd>
        </div>
        <div>
          <dt>avaliação</dt>
          <dd>{report ? describe(report.score) : '—'}</dd>
        </div>
      </dl>

      <div className="line">
        <span className="line-label" title="O melhor lance e as respostas que o motor espera dos dois lados.">
          linha principal
        </span>
        {report && report.line.length > 0 ? (
          <ol>
            {report.line.map((name, i) => (
              <li key={i} className={(report.ply + i) % 2 === 0 ? 'by-white' : 'by-black'}>
                {name}
              </li>
            ))}
          </ol>
        ) : (
          <span className="line-empty">—</span>
        )}
      </div>

      <dl className="internals">
        <div title="O lance mais distante que a busca alcançou, contando as capturas que ela segue além da profundidade pedida.">
          <dt>alcance</dt>
          <dd>{report ? `${report.reach} lances` : '—'}</dd>
        </div>
        <div title="Posições que receberam uma nota da função de avaliação.">
          <dt>avaliações</dt>
          <dd>{report ? formatCount(report.evaluations) : '—'}</dd>
        </div>
        <div title="De cada 100 consultas à tabela de transposição, quantas encontraram a posição já guardada.">
          <dt>acertos na tabela</dt>
          <dd>{report && report.tableProbes > 0 ? formatPercent(report.tableHits / report.tableProbes) : '—'}</dd>
        </div>
        <div title="Quanto da tabela de transposição (1 milhão de posições) esta busca ocupou.">
          <dt>tabela ocupada</dt>
          <dd>{report ? formatPercent(report.tableFill) : '—'}</dd>
        </div>
        <div title="De cada 100 cortes da poda alfa-beta, quantos aconteceram logo na primeira jogada testada. Quanto mais perto de 100%, melhor a ordenação.">
          <dt>cortes na 1ª jogada</dt>
          <dd>{report && report.cutoffs > 0 ? formatPercent(report.firstCutoffs / report.cutoffs) : '—'}</dd>
        </div>
        <div title="Posições visitadas além da profundidade pedida, para não avaliar no meio de uma troca (quiescência).">
          <dt>além do limite</dt>
          <dd>{report && report.nodes > 0 ? formatPercent(report.extensions / report.nodes) : '—'}</dd>
        </div>
      </dl>
    </section>
  )
}
