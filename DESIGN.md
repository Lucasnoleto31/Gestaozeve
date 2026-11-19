# DESIGN.md — ZeveAI · Controle de lotes

Fonte da verdade de cor, tipografia, espaçamento e comportamento visual. Vale para todas as telas
(Painel, Clientes, Consulta, Giro diário, Assessores, Receita, Incentivo, Gráficos, Importar, Parâmetros,
Leads, Funil, Início, Login, Usuários, Perfil). Quem for mexer na interface lê isto antes.

## 1. Direção

**O que o sistema é:** o terminal de controle de um escritório de assessoria — lotes, receita, incentivo e
base de clientes de três corretoras. **Como deve parecer:** a **ficha padrão do Midiakit**
(`C:\Users\PICHAU\OneDrive\Documentos\Midiakit\ficha-padrao.md`, aplicada em 08/10/2026 a pedido do Lucas):
monocromático, Poppins, cartão chapado, a tinta fazendo o destaque. Os dois temas desde o início; escuro
é o padrão salvo.

Princípios, em ordem:

1. **Nenhum acento cromático.** A tinta (`--fg`) faz o destaque: link, botão principal, item ativo e o
   card principal da página. A cor da marca (azul `--marca`) entra só no detalhe: o símbolo da Zeve
   e o anel de foco. **Semânticas só em texto curto e no delta:** verde (bom), âmbar (atenção) e vermelho
   (erro) pintam a palavra "Ativo", "Inativo", "Bloqueado", o +12,3 %; nunca um fundo, uma barra ou um
   gráfico.
2. **Hierarquia por tom e espaço**, não por borda e caixa. Cartão chapado (`--surface`, sem borda e sem
   sombra); duas superfícies acima do fundo bastam (card e popover). Vidro só no que flutua (barra de
   abas do celular).
3. **Números são o protagonista:** Bold 700, tabulares, à direita; o texto de apoio recua. Número antes
   do texto: o card abre pelo número e a legenda vem embaixo.
4. **Um destaque por página, na tinta:** o card principal (`KpiCard destaque`) fica preto com texto
   claro; os outros no tom de card. Dois destaques anulam os dois.
5. **Densidade proporcional ao dado:** tabela de 1.500 linhas é compacta; cabeçalho de página, KPI e
   ficha respiram (20 px dentro do card, também no celular).
6. **Nada que lembre tela gerada:** ícone de brilho, ícone em quadradinho tintado, pílula tintada com
   seta, número contando, rótulo em caixa alta com palavra colorida, sombra colorida, hover que cresce.
7. **Celular como aplicativo (390 px):** o nome da tela e a troca de corretora na barra de cima, barra de
   abas flutuante de vidro no pé, sem rolagem horizontal da página; toque mínimo de 44 px. O celular tem
   desenho próprio: ver §8.
8. **Movimento mínimo:** fade de 180 ms no que aparece, escala 0,97 no toque, nada em carga de página.
   `prefers-reduced-motion` respeitado no CSS e nos gráficos.

## 2. Tokens (um lugar só: `src/app/globals.css`)

Tudo que é cor, tipo, espaço, raio e sombra vem de `--token`. Componentes e páginas **não** usam hex,
rgba, px de cor nem `text-[Npx]` fora da escala. Gráficos leem os mesmos tokens em runtime
(`getComputedStyle`), não têm paleta própria. Migrar de identidade é trocar os **valores** aqui, não os
nomes (foi assim que a ficha padrão entrou, sem tocar em componente).

### 2.1 Cor

Claro (medido no Business Plan XP) → escuro (derivado pela regra do kit, não medido).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#ffffff` | `#0b0b0b` | fundo da página |
| `--surface` | `#f3f3f3` | `#151515` | card: KPI, painel, ficha (fundo com L +4) |
| `--surface-2` | `#eaeaea` | `#1c1c1c` | hover de linha, tooltip |
| `--surface-3` | `#e2e2e2` | `#232323` | skeleton, controles apagados |
| `--popover` | `#ffffff` | `#1a1a1a` | o que flutua: menu, modal, toast (fundo com L +6) |
| `--line` | `#e4e4e4` | `#262626` | fio: linha de tabela, divisória |
| `--line-strong` | `#cfcfcf` | `#343434` | borda de input e de botão secundário |
| `--fg` | `#111111` | `#f5f5f5` | a tinta: texto, número, destaque, ação |
| `--fg-muted` | `#555555` | `#9e9e9e` | texto de apoio, cabeçalho de tabela |
| `--fg-subtle` | `#7a7a7a` | `#7a7a7a` | só em texto grande (4,3:1): placeholder, zero (–) |
| `--accent` | `= --fg` | `= --fg` | ação, link, item ativo, foco do botão (sem matiz) |
| `--accent-soft` | tinta a 7 % | tinta a 8 % | fundo do item ativo, seleção |
| `--gain` | `#2e6f40` | `#31c47f` | bom: Ativo, Migrado, Vinculado, subida |
| `--loss` | `#b22222` | `#df3a3a` | erro: Recusou, Bloqueado, queda, crítico |
| `--warn` | `#a14a17` | `#f6a823` | atenção: Inativo, Não vinculado, alerta |
| `--c-genial` / `--c-xp` / `--c-btg` | `#8c8c8c` / `#c4c4c4` / `#111111` | `#a3a3a3` / `#666666` / `#f5f5f5` | corretora por valor, não por matiz (ponto, aba) |
| `--marca` | `#0a5cff` | `#0a5cff` | o símbolo da Zeve (`Marca`) e nada mais |
| `--focus` | `= --marca` | `#4d8dff` | anel de foco 2 px |
| `--capa` / `--capa-fg` | `#0b0b0b` / `#f5f5f5` | iguais | capa escura do login |

Regras: `gain-soft`, `loss-soft` e `warn-soft` existem só para o heatmap e o foco de linha editada;
badge e alerta pintam o texto, não o fundo. Sombra: nenhuma em conteúdo; `--elev-float` só em modal,
menu e toast. Contraste medido sobre a cor composta: tinta 18,9:1 no branco e 17:1 no card;
`--fg-muted` 7,5:1; `--fg-subtle` 4,3:1 (por isso só em texto grande).

### 2.2 Tipografia

Fonte: **Poppins** (uma família só, via `next/font`; pesos 300, 400, 500, 600 e 700). Bold 700 em
título e número, Regular 400 no corpo, Light 300 no subtítulo ao lado do título, itálico só em rótulo.
Números: `font-variant-numeric: tabular-nums` em qualquer valor (`.num`, KPI, eixos).

Papéis do HIG no desktop (tamanho/entrelinha); no telefone a escala sobe um degrau (§8.4):

| Nome | Tamanho / altura | Peso | Uso |
|---|---|---|---|
| `display` | 32 / 38 | 700 | número-herói (Início, Consulta) |
| `title` | 28 / 34 | 700 | título grande de página |
| `kpi` | 24 / 30 | 700 | valor de KPI |
| `section` | 17 / 22 | 600 | título de seção/painel |
| `body` | 14 / 20 | 400 | texto, inputs, botões |
| `dense` | 13 / 18 | 400 | tabelas, listas, descrições (subtítulo em 300) |
| `label` | 12 / 16 | 500 | rótulo de campo, subtexto |
| `micro` | 11 / 14 | 500 | cabeçalho de tabela e eyebrow (caixa alta leve, 0,04–0,06 em), timestamps |

Caixa alta só no rótulo de grupo (eyebrow, cabeçalho de tabela), apagada e leve, como o iOS agrupa.
Fora da escala só por exceção documentada aqui.

### 2.3 Espaço, raio, borda

- Escala de espaço (px): 4, 8, 12, 16, 20, 24, 32, 40, 48. Gutter da página: 16 (mobile) / 32 (desktop).
- Entre seções: 32. Dentro de card: 20. Entre cards de KPI: 12. Célula de tabela: 6 × 12 (densa) / 9 × 12.
- Raio proporcional ao controle (10): `--radius-sm` 8 (chip, badge, célula), `--radius-md` 10 (botão,
  input, menu), `--radius-lg` 12 (card), `--radius-xl` 16 (folha, modal). Cápsula de navegação e barra
  de abas seguem o desenho do sistema (26 / 20), fora da escala.
- Borda: só o fio `--line` entre linhas de tabela e em input/botão secundário. Card sem borda e sem
  sombra, nos dois temas. Nunca borda + sombra juntas.

## 3. Componentes base (`src/components/ui`)

| Componente | Regra |
|---|---|
| **Botão** | Primário (tinta: fundo `--fg`, texto `--bg`), secundário (superfície + hairline), ghost (só texto), destrutivo (loss). Altura 40 (36 em barras densas); 44 no mobile. Ícone 16 px. Loading = spinner no lugar do ícone. |
| **Input / Select / Textarea** | Superfície, hairline, raio sm, altura 40; foco = anel 2 px `--focus`; erro = borda `--loss` + mensagem. Rótulo `label` acima. |
| **Seção / Painel** | `Section`: título `section` + subtítulo opcional `dense` muted + divisor. `Card`: superfície com raio lg, só para KPI, ficha e blocos flutuantes. Não aninhar card em card. |
| **KPI** | Cards chapados em grade (gap 12), um por indicador; um card `destaque` por página, na tinta: rótulo `label`, valor `kpi`, subtexto `micro`. Cor só na variação (gain/loss) e no ícone de tendência. Máximo 6 por faixa; no mobile 2 colunas. |
| **Tabela** | Sem caixa em volta; cabeçalho `micro` em caixa alta leve, muted, sticky; linhas hairline; hover `--surface-2`; números `.num` à direita; zero = `–` em `--fg-subtle`; linha de total `--surface-2` + peso 600; primeira coluna sticky quando rola. Prioridade de colunas: P1 sempre, P2 ≥ 768, P3 ≥ 1280. Sem zebra. |
| **Badge** | Neutro (hairline + `--fg-muted`) por padrão. Semântico só para estado que importa: `gain` (Ativo, Migrado, Ganho), `loss` (Perdido, Recusou, crítico), `warn` (Inativo, Nunca girou, alerta de contato). Um badge por linha no máximo. |
| **Barra em célula / Heatmap** | Barra de dados só em tabela de ranking, uma coluna. Heatmap só nas matrizes mês × linha (giro mensal, receita mensal): `gain-soft` para lotes, `accent-soft` para receita, intensidade por raiz quadrada. |
| **Modal** | Centro, raio lg, `--shadow-float`, título `section`, rodapé com ações à direita, fecha com Esc e clique fora. |
| **Tabs / Segmentado** | Trilho `--surface-3`, item ativo `--surface` + `--fg`; sem sombra interna. |
| **Navegação** | Desktop: cabeçalho fixo em três colunas (marca + seletor de corretora · cápsula com Início, Painel, Clientes, Giro diário, Receita, Leads e "Mais" · data e conta). Celular: barra de cima com o nome da tela e a troca de corretora, menu completo como gaveta e barra de abas flutuante de vidro no pé (Início, Painel, Clientes, Leads, Fila, Menu); ver §8.1. |
| **Toast** | Canto inferior direito (mobile: inferior centralizado), superfície, hairline, ícone de estado, some em 4 s. Sem lib. |
| **Skeleton / Vazio / Erro** | Skeleton segue a forma final (faixa de KPI, tabela de N linhas, gráfico). Vazio: ícone 20 px `--fg-subtle`, frase curta, ação. Erro: mensagem + "Tentar de novo". |

## 4. Dados e gráficos

- Formatos pt-BR: `1.234`, `R$ 1.234,56`, `12,3%`, `17/09/26`. Zero mostra `–`. Variação `+12,3%` /
  `−4,0%` colorida gain/loss; sem seta se já tem sinal.
- Gráficos (recharts) leem tokens: grade só horizontal `--line`, eixos `--fg-subtle` 11 px, sem linha de
  eixo, tooltip = `--surface-2` + hairline + `dense`, legenda só com 3+ séries. Séries por valor, não por matiz:
  1ª `--fg`, 2ª `--fg-muted`, 3ª `--fg-subtle`, depois as mesmas a 55 % e 30 %. Barra com gradiente vertical
  (0,95 → 0,32) sobre um trilho a 4 %; grade pontilhada só horizontal; verde/vermelho nunca em série. Sem animação de entrada. Um gráfico
  "herói" por página; os demais menores e sem card próprio.
- Página inteira sem rolagem horizontal; dentro de tabela é permitido só acima de 768 px.

### 4.1 Telas refeitas em nov/26 (pedido do Lucas: "virou tabelão")

Vale para Receita, Responsáveis, Incentivo, Gráficos, Fila e Leads, e para toda tela nova:

- Cada tela responde a uma pergunta. Abre com a resposta em uma frase (`Resumo`, em
  `components/gestao/Resumo.tsx`) e depois **no máximo 4 cartões**, cada um com um número e uma comparação.
- Tabela principal com **no máximo 7 colunas**. O resto vai para o detalhe: linha que abre, ficha do cliente
  ou seção recolhida (`Recolhido`, em `components/ui/Recolhido.tsx`). Nada some sem ter onde ser achado.
- Fórmula e explicação de conta ficam atrás do "i" (`Dica`, em `components/ui/Dica.tsx`; no `KpiCard`, a
  propriedade `dica`), não em subtítulo.
- Série e tabela por mês começam no primeiro mês com dado (`doPrimeiroComDado`): o BTG começou em set/26.
- Um nome por coisa: "Responsáveis" (menu e título, nas duas corretoras), "lotes" para a quantidade,
  "operou / com operação" para quem teve lotes. "Giro diário" é só o nome da tela.
- Barra empilhada por tipo (corretagem, zeragem, incentivo) usa a paleta colorida (`colorido`): em tons de
  tinta as faixas não se distinguem. A legenda segue a ordem das séries, de baixo para cima.

## 5. Estados e movimento

- Toda rota tem `loading.tsx` (skeleton na forma da tela) e `error.tsx` (mensagem + tentar de novo).
- Toda lista tem estado vazio com próxima ação.
- Transições: 120 ms cor/opacidade; 150–180 ms abrir/fechar menu e modal; nada em carga de página.

## 6. Acessibilidade

Contraste AA; foco visível (anel 2 px `--focus`, offset 2); alvos ≥ 44 px no toque; tabela com
`<th scope>`; ícone decorativo `aria-hidden`; ícone-botão com `aria-label`; texto de dado ≥ 12 px.

## 7. Checklist antes de dar por pronta uma tela

- [ ] Nenhum hex/rgba/`text-[Npx]` fora dos tokens
- [ ] Cor semântica só em ganho/perda/alerta; accent só em ação
- [ ] Hierarquia: título → KPI → herói → tabelas; um card não contém outro
- [ ] Números tabulares à direita; zero = `–`
- [ ] 390 px sem rolagem horizontal; colunas P1 visíveis; toque 44 px
- [ ] Escuro e claro conferidos; foco visível
- [ ] loading / vazio / erro existem
- [ ] Antes × depois comparados; autocrítica feita

## 8. Celular (abaixo de 768 px; a casca vale abaixo de 1024 px)

Pedido do Lucas em 18/11/2026: "Melhore a versão de todo o sistema para celular, está muito confuso e não
consigo entender nada". As fotos de 390 px mostraram por quê: a tabela perdia as colunas para caber, a
lista ficava presa numa caixa com rolagem própria, quase todo o texto estava em 11 e 13 px e o conteúdo
começava na segunda ou terceira tela. **O celular não é o computador encolhido.** Tudo o que está aqui
vale só no celular: o computador não muda. As regras de CSS ficam num bloco só, no fim de `globals.css`.

### 8.1 A casca

- **Barra de cima** (`TopBar`): a marca, o **nome da tela** (o mesmo do menu) e, nas telas que dependem da
  corretora, a troca **Genial | BTG** a um toque. Em Comissões a troca é o filtro da tela (com "Todas"); na
  aba Distribuir da Fila, a corretora da lista. Na ficha de um cliente e nas operações de um dia a corretora
  aparece só como texto (trocar tiraria a pessoa da tela). Tema e sair moram no Menu.
- **Barra de baixo** (`BottomNav`): os mesmos seis atalhos. "Menu" fica aceso quando a tela aberta só existe
  no Menu (Giro diário, Receita, Funil, Comissões…). Atrás da barra há um degradê: o conteúdo some aos
  poucos em vez de aparecer cortado no vidro.
- **Menu** (gaveta): páginas em duas colunas, itens de 44 px, cabe numa tela; tema e sair no pé.
- **A primeira tela tem cerca de 680 px úteis** (844 menos a barra de cima e a de baixo). É nesse espaço
  que a resposta da tela precisa caber.

### 8.2 A ordem de uma tela

1. Abas da página (`Abas`), se houver. 2. A linha de mexer: mês e ações do dia a dia. 3. **A frase com a
conclusão** (`Resumo`). 4. Até dois números em cartão e os demais em linha. 5. A lista ou o gráfico.
A lista (ou o primeiro número) tem de aparecer na primeira tela. O que não é do dia a dia vai para um
`Recolhido` ou para a folha de filtros.

### 8.3 Cabeçalho da página (`PageHeader`)

No celular a seção (eyebrow) e o título em texto simples somem da vista: a barra de cima já diz o nome da
tela (o título continua para o leitor de tela). `tituloNoCelular` mantém o título que é informação (nome
do parceiro, "Operações de 17/11"); título que é um elemento (o voltar da ficha, o nome no perfil) fica
sempre. A descrição também some: a tela abre pela frase. `descricaoNoCelular` mantém a descrição que traz
dado que a tela não repete (e-mail e "membro desde" no perfil). O rótulo "Mês de referência" some: o
campo já diz o mês.

### 8.4 Letra

No celular a escala sobe um degrau: `micro` 12, `label` 13, `dense` e `body` 15, `section` 18, `title` 24,
`kpi` 26. As classes `text-*` apontam para a variável (a escala fica num `@theme` próprio, fora do bloco
`inline`), então o celular troca só a variável e `max-md:text-label` continua valendo. Nenhum dado abaixo de 12 px. Tabela que continua tabela (matriz mês a mês) fica em 13 px, para
caber. Campos de formulário em 16 px (o iPhone dá zoom abaixo disso).

### 8.5 Cartões de número (`KpiRow`)

Os **dois primeiros** ficam como cartão, lado a lado; **do terceiro em diante viram linha** (nome e apoio
à esquerda, número à direita). O cartão em destaque sobe sozinho para o topo, na largura toda, quando a
tela o desenha depois do segundo. A ordem dos cartões decide quem fica na frente: os dois números que
respondem à tela vêm primeiro. No máximo quatro números à vista; o resto vai para um `Recolhido`.
`<KpiRow principalLargo>` deixa só o primeiro como cartão, na largura toda, e os outros em linha: use quando
o apoio dos cartões é longo e, lado a lado, quebraria em três ou quatro linhas.
`<KpiRow etiquetas>` é para cartões que filtram a lista (os estados de Clientes): no celular viram uma
fileira de etiquetas que rola de lado, todas à vista. Cartão feito à mão (um `<button className="kpi">`)
usa as classes `kpi-rotulo`, `kpi-valor` e `kpi-apoio` nos três filhos.

### 8.6 Tabela vira lista (`tbl-lista`)

Lista de pessoas, clientes, leads, parceiros, operações: no celular cada linha é um item, não uma linha
de planilha. A mesma `<table>` do computador ganha a classe `tbl-lista` e cada célula diz o papel:

| Classe na célula | O que vira no celular |
|---|---|
| `cel-titulo` | o nome, em cima, inteiro (até duas linhas) |
| `cel-sub` | a linha de apoio: as células ficam em fila, separadas por "·". `data-rotulo="resp."` põe o nome do dado na frente. A classe `vazio` esconde a célula sem dado |
| `cel-valor` | o número, à direita (um por linha). `data-rotulo="lotes"` põe a unidade embaixo |
| `cel-acoes` | os botões da linha, à direita |
| `cel-marca` | a caixa de marcar a linha, à esquerda |
| `cel-bloco` | uma linha inteira embaixo (barra, detalhe que abre) |

- **Célula sem papel some no celular.** Só pode ficar sem papel o que a linha de apoio já diz ou o que a
  tela de destino mostra (a ficha, a edição). Nada some sem ter onde ser achado.
- A linha de apoio diz o **estado em palavras** ("Operando", "Parou há 12 dias") e mais um ou dois fatos.
  O selo (`Badge`) dentro dela vira a palavra na cor do estado, sem moldura.
- `lista-abre` na tabela quando a linha leva a outra tela: aparece a seta e o link do título pega a linha
  inteira. O que é clicável dentro da linha (WhatsApp, botões) continua funcionando.
- A largura reservada para o número é `--lista-direita` (padrão 6rem; com botões, 9.5rem): ajuste no
  `style` da tabela quando o número for largo ("R$ 1.234.567") ou houver menos botões.
- Linha de total: `<tr className="total">` com `cel-titulo` e `cel-valor`.
- `data-sufixo="tombaram"` numa `cel-sub` põe a palavra depois do número. `sem-seta` na linha tira a seta de
  quem não tem para onde ir (conta sem cadastro). Com um `cel-bloco` na linha, o número fica na altura do nome.
- **Matriz mês a mês não vira lista**: continua tabela, rola de lado dentro da moldura com a primeira
  coluna presa, e mostra primeiro os meses mais novos.

### 8.7 Nenhuma caixa com rolagem própria

No celular `max-h-[…]` em `.tbl-wrap` não vale: a lista corre com a página e termina em "mostrar mais".
Rolagem dentro de rolagem prende o dedo.
Lista longa que não é o último bloco da tela mostra as primeiras linhas e o resto atrás de `MostrarMais`
(`components/ui/MostrarMais.tsx`; as linhas além do limite levam `ALEM_NO_CELULAR`). Bloco que não responde
à pergunta da tela fica atrás do próprio título com `RecolheNoCelular` (`components/ui/RecolheNoCelular.tsx`):
fechado no celular, aberto no computador, o mesmo conteúdo nos dois.

### 8.8 Filtros, etiquetas e abas

- Uma linha: a busca e o botão **Filtros**. Os demais campos ficam em `FolhaCelular` (os mesmos campos do
  computador, que no celular sobem numa folha, um por linha; `ativos` mostra quantos estão ligados).
  Filtro ligado aparece fora da folha, como etiqueta que se remove.
- Fileira de etiquetas (etapas, grupos, atalhos): classe `trilho`, rola de lado até a borda da tela.
- "Colunas" (visões de colunas) não aparece no celular: a linha da lista já diz o que importa.
- `Abas` rola de lado e traz a aba aberta para a vista.

### 8.9 Toque e texto

- Alvo de 44 px. Link tem sublinhado (no toque não existe o destaque do mouse). O "i" (`Dica`) abre no
  toque e fecha no toque seguinte.
- **Nada de informação só em `title=`**: no toque ela não existe. O que importa vai para a linha de apoio
  ou para o "i".
- Sem instrução de mouse ("clique na linha", "passe o mouse"). Subtítulo de bloco com mais de uma linha
  vira "i" ou `max-md:hidden`.
- Janela (`Modal`) sobe do pé como folha e trava a página de trás.

### 8.10 Quando a regra da base atrapalha

As regras de celular do `globals.css` ficam fora de camada de propósito: elas precisam vencer os utilitários
que desenham o computador (`px-5`, `truncate`, `grid-cols-2`). Por isso um utilitário só vence uma
propriedade que elas definem com o `!` no fim (`max-md:hidden!`, `max-md:right-13!`). Use pouco: se a mesma
exceção aparecer em duas telas, ela vira regra da base.

### 8.11 Antes de dar por pronta uma tela no celular

- [ ] Foto em 390 px: a resposta (frase, número ou começo da lista) está na primeira tela
- [ ] Nenhuma rolagem lateral da página e nenhuma caixa com rolagem própria
- [ ] Cada coluna escondida tem lugar: linha de apoio, linha que abre, ficha ou edição
- [ ] Nenhum texto de dado abaixo de 12 px; nomes inteiros, sem reticências
- [ ] Os mesmos números do computador (é só apresentação)
- [ ] O computador não mudou
