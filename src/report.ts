import type { SearchStats } from './engine/search.ts'

/** Uma profundidade concluída dentro de uma busca. */
export interface Iteration {
  depth: number
  best: string
  /** Pontuação do ponto de vista das brancas. */
  score: number
  nodes: number
  ms: number
}

/** Uma busca do motor, com os números prontos para mostrar. */
export interface EngineReport extends SearchStats {
  /** Quantos lances a partida tinha quando a busca começou. */
  ply: number
  /** Busca feita na vez do jogador (análise), e não para a IA escolher o lance. */
  byHuman: boolean
  done: boolean
  depth: number
  /** Pontuação do ponto de vista das brancas. */
  score: number
  best: string
  /** As casas do melhor lance, origem primeiro, para desenhar a seta. */
  bestPath: number[]
  /** O lance que a IA jogou, quando escolheu de propósito um que não era o melhor. */
  played: string | null
  /** Linha principal, em notação: o melhor lance e as respostas esperadas dos dois lados. */
  line: string[]
  iterations: Iteration[]
  /** Os limites que a busca tinha. */
  timeMs: number
  maxDepth: number
}

/** A busca é limitada pelo relógio, e não por uma profundidade fixa? */
export function isTimed(budget: { maxDepth: number }): boolean {
  return budget.maxDepth >= 99
}

const LOG_KEY = 'kingme:stats'

const NUMBERS = [
  'ply', 'depth', 'score', 'nodes', 'ms', 'reach', 'extensions', 'evaluations', 'tableProbes', 'tableHits',
  'tableCuts', 'tableFill', 'cutoffs', 'firstCutoffs', 'timeMs', 'maxDepth',
] as const // prettier-ignore

function isReport(value: unknown): value is EngineReport {
  if (typeof value !== 'object' || value === null) return false
  const report = value as Record<string, unknown>
  return (
    NUMBERS.every((key) => typeof report[key] === 'number' && Number.isFinite(report[key])) &&
    typeof report.best === 'string' &&
    typeof report.byHuman === 'boolean' &&
    Array.isArray(report.line) &&
    Array.isArray(report.bestPath) &&
    Array.isArray(report.iterations)
  )
}

/** As buscas já feitas na partida salva. Se algo não bater, começa do zero. */
export function loadLog(): EngineReport[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]')
    return Array.isArray(saved) && saved.every(isReport) ? saved : []
  } catch {
    return []
  }
}

export function saveLog(log: EngineReport[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {
    // Armazenamento indisponível (ex.: aba anônima); segue só em memória.
  }
}
