# 👑 kingme

Damas brasileiras contra uma IA de bitboards que roda inteira no navegador.

> **Status: pronto para teste local.** O site ainda não foi publicado: sem push, sem deploy e sem workflow de deploy automático até a confirmação do autor.

"King me!" é o que se diz em inglês quando uma pedra chega à última linha e vira dama.

## Funcionalidades

- Partida de damas brasileiras contra a IA, com escolha da cor das peças
- Quatro níveis de dificuldade
- Layout de mesa de análise: barra de avaliação, lista de lances e painel do motor
- Painel do motor ao vivo: profundidade, posições, velocidade, barra do tempo de busca, linha principal e os contadores internos da busca, atualizados a cada profundidade enquanto a IA pensa
- Estatísticas da partida: gráfico da avaliação lance a lance, totais de todas as buscas e a última busca profundidade por profundidade
- Análise opcional da sua vez: o motor mostra o melhor lance para você, com uma seta no tabuleiro
- Capturas em série animadas casa a casa, com as peças capturadas no tabuleiro até o fim da jogada
- Desfazer, e a partida fica salva no navegador
- Página "Como funciona", com diagramas interativos que usam o mesmo código do jogo
- Site 100% estático: a IA roda em um Web Worker, sem servidor
- Interface em português, com tema claro e escuro, para desktop e celular

## Regras

Damas brasileiras, as regras oficiais no Brasil para o tabuleiro de 64 casas.

| Regra | Como é |
|-------|--------|
| **Tabuleiro** | 8×8, jogado só nas 32 casas escuras, com 12 pedras por lado. As brancas começam. |
| **Pedra** | Anda uma casa na diagonal, só para frente. Captura para frente e para trás. |
| **Dama** | Anda quantas casas quiser na diagonal e captura à distância. |
| **Captura** | Obrigatória. Havendo mais de uma opção, vale a que captura mais peças (lei da maioria). |
| **Captura em série** | As peças capturadas só saem do tabuleiro no fim da jogada, e nenhuma pode ser pulada duas vezes. |
| **Coroação** | A pedra vira dama se terminar a jogada na última linha. Se só passar por ela no meio de uma captura, continua pedra. |
| **Vitória** | O adversário fica sem peças ou sem jogada possível. |
| **Empate** | Posição repetida três vezes, ou 20 lances seguidos só de damas, sem captura (20 de cada lado). |

## Níveis de dificuldade

| Nível | Como a IA joga |
|-------|----------------|
| **Fácil** | Enxerga 2 lances à frente e, uma vez em cada quatro, joga de propósito um lance que não é o melhor. |
| **Médio** | Enxerga 6 lances à frente. |
| **Difícil** | Pensa por até 1 segundo, indo o mais fundo que o tempo permitir. |
| **Mestre** | Pensa por até 3 segundos. |

Esses números são o ponto de partida e serão ajustados jogando. Ficam em `LEVELS`, em `src/pages/Play.tsx`.

Nos primeiros quatro lances de cada lado a IA sorteia entre jogadas de valor quase igual, para as partidas não saírem sempre idênticas.

## Layout

Mesa de análise, no estilo do lichess.

```
┌──────────────────────────────────────────────────────────────┐
│ kingme        Nível ▾   Novo jogo   Desfazer   Como funciona │
├───┬──────────────────────────────┬───────────────────────────┤
│ █ │                              │ Sua vez            12 · 12│
│ █ │                              ├───────────────────────────┤
│ █ │                              │ 1. c3-d4    f6-e5         │
│ █ │          TABULEIRO           │ 2. d4xf6    g7xe5         │
│ ░ │                              ├───────────────────────────┤
│ ░ │                              │ MOTOR                     │
│ ░ │                              │  16      7,4 M   7,4 M/s  │
│ ░ │                              │ ▓▓▓▓▓▓▓▓▓░░░  0,8 s de 1 s│
│ ░ │                              │ melhor lance c3-d4  +0,4  │
│ ░ │                              │ linha: c3-d4 f6-e5 d4xf6 …│
│ ░ │                              │ alcance, tabela, cortes…  │
├───┴──────────────────────────────┼───────────────────────────┤
│ PARTIDA EM NÚMEROS               │ PROFUNDIDADE POR          │
│ totais · gráfico da avaliação    │ PROFUNDIDADE              │
└──────────────────────────────────┴───────────────────────────┘
  ▲ barra de avaliação
```

- **Barra de avaliação** colada no tabuleiro: mostra quem está melhor, segundo a IA.
- **Tabuleiro** com coordenadas e destaque para o último lance, as peças obrigadas a capturar e as casas de destino. Jogando de pretas, o tabuleiro vira.
- **Lista de lances** em notação algébrica (`c3-d4`, `d4xf6`, `c3xe5xg7`).
- **Painel do motor**, atualizado a cada profundidade enquanto a IA pensa:
  - profundidade, posições visitadas e velocidade, em destaque;
  - uma barra com o quanto do limite do nível já foi gasto;
  - melhor lance, avaliação e a linha principal (os lances que o motor espera dos dois lados);
  - os contadores internos: alcance, avaliações, acertos e ocupação da tabela de transposição, cortes na primeira jogada e posições além do limite.
  - O interruptor "Analisar minha vez" liga a busca também quando é você quem joga.
- **Partida em números**, embaixo do tabuleiro: total de posições analisadas, tempo de busca, profundidade e velocidade médias, e o gráfico da avaliação lance a lance, com a tabela de todas as buscas.
- **Profundidade por profundidade**: cada volta do aprofundamento iterativo da última busca, com lance, avaliação, posições e tempo.
- **Barra superior**: nível, novo jogo, desfazer, o link para "Como funciona" e o tema.
- No celular tudo empilha: tabuleiro em cima, lances e motor embaixo.

## Como funciona

A explicação completa, com diagramas interativos, está na página "Como funciona" do site. Este é o resumo.

### O tabuleiro em 32 bits

O jogo só usa as 32 casas escuras, então o tabuleiro inteiro cabe em um inteiro de 32 bits, um bit por casa. É exatamente o tamanho que os operadores de bits do JavaScript enxergam, então cada bitboard é um `number` comum. A posição toda são três deles: peças brancas, peças pretas e damas.

```
        a   b   c   d   e   f   g   h
  8     ·  28   ·  29   ·  30   ·  31
  7    24   ·  25   ·  26   ·  27   ·
  6     ·  20   ·  21   ·  22   ·  23
  5    16   ·  17   ·  18   ·  19   ·
  4     ·  12   ·  13   ·  14   ·  15
  3     8   ·   9   ·  10   ·  11   ·
  2     ·   4   ·   5   ·   6   ·   7
  1     0   ·   1   ·   2   ·   3   ·
```

Andar na diagonal vira um deslocamento de bits: para cada pedra, uma das diagonais fica a 4 bits e a outra a 3 ou a 5, conforme a linha seja par ou ímpar. Assim os movimentos de todas as pedras são calculados de uma vez, sem percorrer o tabuleiro casa por casa:

```ts
// todas as pedras, um passo para cima e para a direita
deslocadas = ((pedras & LINHAS_PARES) << 4) | ((pedras & LINHAS_ÍMPARES_SEM_H) << 5)
destinos = deslocadas & vazias
```

### Gerador de jogadas

- **Pedras:** deslocamentos de bits com máscaras para as bordas do tabuleiro.
- **Damas:** deslizam pela diagonal usando tabelas pré-calculadas com o caminho de cada casa em cada direção.
- **Capturas:** uma busca em profundidade percorre todas as sequências possíveis, anotando em um bitboard as peças já puladas, e guarda só as que capturam mais peças, como manda a lei da maioria.

### A busca

| Técnica | Para que serve |
|---------|----------------|
| **Negamax com poda alfa-beta** | Descarta ramos que não podem mudar o resultado. |
| **Aprofundamento iterativo** | Busca 1 lance à frente, depois 2, 3… até acabar o tempo do nível. |
| **Tabela de transposição** | Lembra posições já avaliadas (1 milhão de entradas em `Int32Array`). |
| **Ordenação de jogadas** | Testa primeiro a melhor jogada da iteração anterior, depois as que já causaram cortes. |
| **Busca de quiescência** | Não avalia uma posição no meio de uma troca: segue até as capturas acabarem. |
| **Função de avaliação** | Material, avanço das pedras, controle do centro, proteção da última linha e mobilidade. |

Para enxergar 8 lances à frente a partir da posição inicial, o minimax puro visita 3,1 milhões de posições. Com as técnicas acima são 20 mil, 153 vezes menos, e a avaliação é a mesma.

Números de `npm run bench` (Node 24):

| Posição | 1 s | 3 s | Velocidade |
|---------|-----|-----|------------|
| Inicial | profundidade 16 | profundidade 17 | 7 M posições/s |
| Abertura (12 lances) | profundidade 15 | profundidade 16 | 7 M posições/s |
| Meio de jogo (30 lances) | profundidade 18 | profundidade 20 | 7 M posições/s |
| Final com damas | profundidade 16 | profundidade 17 | 6 M posições/s |

### Testes

- **Perft:** conta as posições alcançáveis a cada profundidade e compara o gerador de bitboards com um gerador simples, escrito casa a casa. As contagens também batem, até a profundidade 10 (21.566.606 posições), com as [publicadas para damas brasileiras no World Draughts Forum](https://damforum.nl/viewtopic.php?t=2822).
- **Posições sorteadas:** os dois geradores são comparados jogada a jogada em 30 mil posições, de partidas aleatórias e de tabuleiros cheios de damas.
- **Posições montadas** para cada regra delicada: lei da maioria, peça que não pode ser pulada duas vezes, peça capturada que bloqueia a passagem e coroação no meio de uma captura.
- **Busca:** a pontuação com poda e ordenação é comparada com a de um minimax de referência sem poda nenhuma; ligar a tabela de transposição não pode mudar o resultado; e trocar as cores do tabuleiro não pode mudar a avaliação.
- **Linha principal e contadores:** jogar a linha principal até o fim tem que levar à pontuação que a busca informou, e os contadores precisam fechar entre si.
- **Partida:** vitória, empate por repetição, empate por 20 lances de damas e partida salva.

## Stack

A mesma base do tomatask (Vite, React, TypeScript, oxlint e wrangler), mais testes com `node --test`.

```
src/engine/board.ts     bitboards, deslocamentos e tabelas de caminhos
src/engine/movegen.ts   gerador de jogadas
src/engine/search.ts    busca e função de avaliação
src/engine/worker.ts    a busca dentro do Web Worker
src/game.ts             a partida: lances, peças, vitória e empates
src/report.ts           os números de cada busca, como o painel mostra e o navegador guarda
src/pages/              o jogo e a página "Como funciona"
test/                   perft, regras, busca, partida e o gerador de referência
```

## Desenvolvimento

Requer Node.js 24+.

```bash
npm install
npm run dev      # servidor local em http://localhost:5173/
npm run build    # build de produção em dist/
npm run lint
npm test
npm run bench
```

## Etapas

1. ✅ Motor: bitboards, gerador de jogadas, busca e testes
2. ✅ Interface no layout de mesa de análise, com os níveis de dificuldade
3. ✅ Página "Como funciona" e README final
4. ✅ Teste local com `npm run dev`
5. Publicação no GitHub e na Cloudflare, **somente após a confirmação do autor**

Antes da etapa 5 nada sai da máquina: sem push, sem deploy e sem workflow de deploy automático. O `wrangler.jsonc` já existe, mas sem domínio.

## Em aberto

- **Domínio do site.** Seguindo os outros projetos, seria `kingme.igreg.dev`.
- **Empate em finais com poucas peças.** As regras oficiais têm limites de lances próprios para finais como dama contra dama. Ficaram fora da primeira versão: por enquanto esses finais acabam por repetição ou pelos 20 lances de damas.
