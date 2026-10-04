import { useState } from 'react'
import { BitboardDiagram } from '../components/diagrams/BitboardDiagram.tsx'
import { CaptureDiagram } from '../components/diagrams/CaptureDiagram.tsx'
import { EvaluationDiagram } from '../components/diagrams/EvaluationDiagram.tsx'
import { DeepeningTable, PruningChart } from '../components/diagrams/SearchDemos.tsx'
import { ShiftDiagram } from '../components/diagrams/ShiftDiagram.tsx'
import { MIDGAME, cycleSquare } from '../components/diagrams/study.ts'
import { Header } from '../components/Header.tsx'
import { ArrowLeftIcon } from '../components/icons.tsx'
import { INITIAL } from '../engine/board.ts'
import { formatInteger } from '../format.ts'
import { followLink } from '../hooks/usePath.ts'
import type { useTheme } from '../hooks/useTheme.ts'

const SECTIONS = [
  ['bits', 'O tabuleiro em 32 bits'],
  ['deslocamentos', 'Andar é deslocar bits'],
  ['jogadas', 'Gerador de jogadas'],
  ['busca', 'A busca'],
  ['painel', 'O painel do motor'],
  ['avaliacao', 'Função de avaliação'],
  ['testes', 'Testes'],
]

// Posições a 1, 2, 3… lances da posição inicial. `npm test` confere cada número.
const PERFT = [7, 49, 302, 1469, 7473, 37628, 187302, 907836, 4431847, 21566606]

export function HowItWorks({ theme }: { theme: ReturnType<typeof useTheme> }) {
  // Os diagramas de bits e de deslocamento mostram a mesma posição; o de avaliação tem a sua.
  const [board, setBoard] = useState(INITIAL)
  const [evaluated, setEvaluated] = useState(MIDGAME)
  const [busy, setBusy] = useState(false)

  return (
    <div className="app">
      <Header themePref={theme.pref} onCycleTheme={theme.cycle}>
        <a className="tool keep" href="/" onClick={followLink}>
          <ArrowLeftIcon />
          <span>Voltar ao jogo</span>
        </a>
      </Header>

      <main className="article">
        <header className="article-head">
          <h1>Como funciona</h1>
          <p className="lead">
            O kingme é um motor de damas brasileiras que roda inteiro no seu navegador: não há servidor pensando por
            ele. Esta página abre o motor e mostra as peças. Os diagramas usam o mesmo código do jogo, então tudo aqui
            é calculado na hora, na sua máquina.
          </p>
          <nav className="contents" aria-label="Nesta página">
            {SECTIONS.map(([id, title]) => (
              <a key={id} href={`#${id}`}>
                {title}
              </a>
            ))}
          </nav>
        </header>

        <section id="bits">
          <h2>O tabuleiro em 32 bits</h2>
          <p>
            Damas só usa as 32 casas escuras. Com um bit por casa, o tabuleiro inteiro cabe em um inteiro de 32 bits,
            que é exatamente o tamanho que os operadores de bits do JavaScript enxergam. Cada tabuleiro desses, um{' '}
            <em>bitboard</em>, é um <code>number</code> comum, e a posição toda são três deles: onde estão as peças
            brancas, onde estão as pretas e quais peças são damas.
          </p>
          <p>
            A casa a1 é o bit 0 e a h8 é o bit 31. Cada linha do tabuleiro ocupa quatro bits, ou seja, um dígito
            hexadecimal: as doze pedras brancas da posição inicial são <code>0x00000fff</code>, três linhas cheias.
          </p>
          <BitboardDiagram position={board} onEdit={(square) => setBoard(cycleSquare(board, square))} onPreset={setBoard} />
          <p>
            A vantagem é tratar o tabuleiro inteiro de uma vez. A pergunta “quais casas estão vazias?” é uma operação
            só: <code>~(brancas | pretas)</code>.
          </p>
        </section>

        <section id="deslocamentos">
          <h2>Andar na diagonal é deslocar bits</h2>
          <p>
            Com essa numeração, a casa vizinha na diagonal fica sempre a 3, 4 ou 5 bits de distância. Para cada pedra,
            uma das diagonais está a 4 bits e a outra a 3 ou a 5, conforme a linha em que ela está seja par ou ímpar,
            porque as casas escuras ficam deslocadas de uma linha para a outra.
          </p>
          <p>
            Para andar com todas as pedras de uma vez, o motor separa as das linhas pares das das ímpares, desloca cada
            grupo pelo seu tanto e junta o resultado. Um <code>&amp;</code> com as casas vazias deixa só os destinos
            livres. Nenhum laço percorre o tabuleiro.
          </p>
          <ShiftDiagram position={board} onEdit={(square) => setBoard(cycleSquare(board, square))} />
          <p>
            O mesmo truque responde se existe captura: deslocando as casas vazias para trás, cruzando com as peças
            adversárias e deslocando de novo, sobram as pedras que têm uma peça adversária ao lado e uma casa livre
            logo depois.
          </p>
        </section>

        <section id="jogadas">
          <h2>Gerador de jogadas</h2>
          <p>
            As <strong>pedras</strong> andam com os deslocamentos acima. As <strong>damas</strong> andam quantas casas
            quiserem, então o motor guarda uma tabela pré-calculada com o caminho de cada casa em cada direção, e
            segue o caminho até encontrar uma peça.
          </p>
          <p>
            As <strong>capturas</strong> são a parte delicada das damas brasileiras. A captura é obrigatória e, havendo
            mais de uma, vale a que captura mais peças. As peças capturadas só saem do tabuleiro no fim da jogada e,
            até lá, bloqueiam a passagem. E nenhuma peça pode ser pulada duas vezes.
          </p>
          <p>
            O gerador resolve tudo isso com uma busca em profundidade: a partir de cada peça ele tenta todos os saltos,
            depois todos os saltos seguintes, anotando em um bitboard as peças já puladas. No fim, guarda só as
            sequências mais longas.
          </p>
          <CaptureDiagram />
        </section>

        <section id="busca">
          <h2>A busca</h2>
          <p>
            Para escolher um lance, a IA simula as jogadas possíveis, as respostas do adversário, as respostas a essas
            respostas, e fica com o lance que leva ao melhor resultado supondo que os dois lados jogam o melhor que
            podem. Olhar tudo é impossível: a 10 lances da posição inicial já existem {formatInteger(PERFT[9])}{' '}
            posições. Seis técnicas fazem a busca caber no tempo.
          </p>
          <div className="scroll">
            <table className="plain">
              <thead>
                <tr>
                  <th scope="col">Técnica</th>
                  <th scope="col">Para que serve</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Negamax com poda alfa-beta</th>
                  <td>Descarta ramos que não podem mudar o resultado.</td>
                </tr>
                <tr>
                  <th scope="row">Aprofundamento iterativo</th>
                  <td>Busca 1 lance à frente, depois 2, 3… até acabar o tempo do nível.</td>
                </tr>
                <tr>
                  <th scope="row">Tabela de transposição</th>
                  <td>Lembra posições já avaliadas, porque ordens de lances diferentes chegam à mesma posição.</td>
                </tr>
                <tr>
                  <th scope="row">Ordenação de jogadas</th>
                  <td>Testa primeiro as jogadas mais promissoras, para a poda cortar mais.</td>
                </tr>
                <tr>
                  <th scope="row">Busca de quiescência</th>
                  <td>Não avalia uma posição no meio de uma troca: segue até as capturas acabarem.</td>
                </tr>
                <tr>
                  <th scope="row">Função de avaliação</th>
                  <td>Dá uma nota à posição quando a busca chega ao limite.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Quanto cada uma economiza? O gráfico abaixo faz a mesma busca quatro vezes, ligando uma técnica de cada
            vez.
          </p>
          <PruningChart busy={busy} setBusy={setBusy} />
          <p>
            O aprofundamento iterativo parece desperdício, porque refaz a busca do zero a cada profundidade. Não é: a
            iteração anterior deixa na tabela a melhor jogada de cada posição, que é a primeira a ser testada na
            seguinte, e isso faz a poda cortar muito mais.
          </p>
          <DeepeningTable busy={busy} setBusy={setBusy} />
          <p>Os níveis de dificuldade são limites diferentes para essa mesma busca.</p>
          <div className="scroll">
            <table className="plain">
              <thead>
                <tr>
                  <th scope="col">Nível</th>
                  <th scope="col">Como a IA joga</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Fácil</th>
                  <td>Enxerga 2 lances à frente e, uma vez em cada quatro, joga de propósito um lance que não é o melhor.</td>
                </tr>
                <tr>
                  <th scope="row">Médio</th>
                  <td>Enxerga 6 lances à frente.</td>
                </tr>
                <tr>
                  <th scope="row">Difícil</th>
                  <td>Pensa por até 1 segundo, indo o mais fundo que o tempo permitir.</td>
                </tr>
                <tr>
                  <th scope="row">Mestre</th>
                  <td>Pensa por até 3 segundos.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            A busca também conhece os empates: uma posição que se repete no caminho vale zero, e 20 lances seguidos só
            de damas, sem captura, também.
          </p>
        </section>

        <section id="painel">
          <h2>Lendo o painel do motor</h2>
          <p>
            Na tela da partida, o painel do motor mostra a busca acontecendo: os números mudam a cada profundidade
            concluída, e a barra corre com o tempo que o nível dá para pensar. Embaixo do tabuleiro ficam as
            estatísticas da partida inteira.
          </p>
          <div className="scroll">
            <table className="plain">
              <thead>
                <tr>
                  <th scope="col">No painel</th>
                  <th scope="col">O que é</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Profundidade</th>
                  <td>Quantos lances à frente a última iteração completa enxergou.</td>
                </tr>
                <tr>
                  <th scope="row">Posições e velocidade</th>
                  <td>Quantas posições a busca visitou, e quantas por segundo.</td>
                </tr>
                <tr>
                  <th scope="row">Melhor lance e avaliação</th>
                  <td>
                    O lance escolhido e a nota da posição, em pedras, do ponto de vista das brancas. Quando a busca
                    enxerga o fim da partida, a nota vira “vencem em N”.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Linha principal</th>
                  <td>
                    O melhor lance e as respostas que o motor espera dos dois lados, cada lance na cor de quem joga. É o
                    caminho que levou à avaliação.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Alcance</th>
                  <td>O lance mais distante que a busca alcançou. Passa da profundidade porque as capturas são seguidas até o fim.</td>
                </tr>
                <tr>
                  <th scope="row">Além do limite</th>
                  <td>A parte das posições visitadas depois da profundidade pedida, nessas sequências de captura.</td>
                </tr>
                <tr>
                  <th scope="row">Avaliações</th>
                  <td>Quantas posições receberam nota da função de avaliação.</td>
                </tr>
                <tr>
                  <th scope="row">Acertos na tabela</th>
                  <td>De cada 100 consultas à tabela de transposição, quantas acharam a posição já guardada.</td>
                </tr>
                <tr>
                  <th scope="row">Tabela ocupada</th>
                  <td>Quanto da tabela, que guarda 1 milhão de posições, a busca encheu.</td>
                </tr>
                <tr>
                  <th scope="row">Cortes na 1ª jogada</th>
                  <td>
                    De cada 100 cortes da poda alfa-beta, quantos vieram logo na primeira jogada testada. Mede a
                    ordenação: perto de 100% ela está acertando a melhor jogada de primeira.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Profundidade por profundidade</th>
                  <td>
                    Cada volta do aprofundamento iterativo da última busca, com o lance preferido naquele momento. A
                    barrinha mostra como o custo cresce a cada lance a mais.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Partida em números</th>
                  <td>
                    A soma de todas as buscas da partida e o gráfico da avaliação lance a lance, na mesma escala da
                    barra ao lado do tabuleiro.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="avaliacao">
          <h2>Função de avaliação</h2>
          <p>
            Quando a busca chega ao limite, alguém precisa dizer se a posição é boa. A função de avaliação soma cinco
            termos, cada um medido para as brancas menos o mesmo para as pretas. Todos saem de contagens de bits, sem
            percorrer o tabuleiro casa a casa.
          </p>
          <EvaluationDiagram
            position={evaluated}
            onEdit={(square) => setEvaluated(cycleSquare(evaluated, square))}
            onPreset={setEvaluated}
          />
          <p>
            É uma avaliação simples, e é a profundidade da busca que faz a força do jogo. A barra ao lado do tabuleiro,
            na tela da partida, mostra essa nota vista do fim da busca.
          </p>
        </section>

        <section id="testes">
          <h2>Testes</h2>
          <p>Um gerador de jogadas errado estraga tudo o que vem depois, então ele é a parte mais testada.</p>
          <p>
            <strong>Perft.</strong> Conta quantas posições existem a 1, 2, 3… lances da posição inicial. O gerador de
            bitboards é comparado com um segundo gerador, escrito do jeito mais simples possível, casa a casa: os dois
            precisam dar o mesmo número. As contagens também batem com as publicadas para damas brasileiras no{' '}
            <a href="https://damforum.nl/viewtopic.php?t=2822">World Draughts Forum</a>.
          </p>
          <div className="scroll">
            <table className="plain numbers">
              <thead>
                <tr>
                  <th scope="col">Lances</th>
                  <th scope="col">Posições</th>
                </tr>
              </thead>
              <tbody>
                {PERFT.map((count, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{formatInteger(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong>Posições montadas.</strong> Uma para cada regra delicada: lei da maioria, peça que não pode ser
            pulada duas vezes, peça capturada que bloqueia a passagem e coroação no meio de uma captura. São as mesmas
            do diagrama de capturas acima.
          </p>
          <p>
            <strong>Busca.</strong> A busca com poda e ordenação é comparada com um minimax de referência sem poda
            nenhuma, e a pontuação tem que ser idêntica.
          </p>
        </section>

        <footer className="article-foot">
          <a className="run" href="/" onClick={followLink}>
            Voltar ao jogo
          </a>
        </footer>
      </main>
    </div>
  )
}
