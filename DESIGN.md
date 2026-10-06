# DESIGN.md — ZeveAI · Controle de lotes

Fonte da verdade de cor, tipografia, espaçamento e comportamento visual. Vale para todas as telas
(Painel, Clientes, Consulta, Giro diário, Assessores, Receita, Incentivo, Gráficos, Importar, Parâmetros,
Leads, Funil, Início, Login, Usuários, Perfil). Quem for mexer na interface lê isto antes.

## 1. Direção

**O que o sistema é:** o terminal de controle de um escritório de assessoria — lotes, receita, incentivo e
base de clientes de três corretoras. **Como deve parecer:** produto de banco de investimento (referência:
apps do BTG Pactual), não planilha. Escuro por padrão, denso só onde há dado, muito respiro no resto.

Princípios, em ordem:

1. **Hierarquia por tipografia e espaço**, não por borda e caixa. Seção é um título e um respiro; card só
   quando o bloco precisa se destacar do fundo (KPI, flutuante).
2. **Uma cor de ação** (azul), usada pouco: links, botão primário, item ativo, foco. **Verde e vermelho só
   para ganho/perda, subida/queda e alerta crítico.** Âmbar para "atenção". O resto é neutro.
3. **Números são o protagonista:** tabulares, alinhados à direita, com peso; texto de apoio recua.
4. **Densidade proporcional ao dado:** tabela de 1.500 linhas é compacta; cabeçalho de página, KPI e
   ficha respiram.
5. **Nada de template:** sem gradiente decorativo, glassmorphism, sombra em tudo, cards idênticos
   enfileirados, emoji como ícone, texto explicando fórmula na tela (vai para tooltip/`?`).
6. **Mobile primeiro (390 px):** sem rolagem horizontal da página; tabelas mostram as colunas prioritárias
   e o resto fica para telas maiores; toque mínimo de 44 px.
7. **Animação só em resposta a ação** (abrir menu/modal, hover, troca de aba). Sem animação de entrada.

## 2. Tokens (um lugar só: `src/app/globals.css`)

Tudo que é cor, tipo, espaço, raio e sombra vem de `--token`. Componentes e páginas **não** usam hex,
rgba, px de cor nem `text-[Npx]` fora da escala. Gráficos leem os mesmos tokens em runtime
(`getComputedStyle`), não têm paleta própria.

### 2.1 Cor

Escuro (padrão) → claro.

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0a0e14` | `#f4f6f9` | fundo da página |
| `--surface` | `#10151d` | `#ffffff` | painéis, tabelas, sidebar |
| `--surface-2` | `#151b25` | `#f7f9fc` | cabeçalho de tabela, hover, linha de total |
| `--surface-3` | `#1b2230` | `#eef2f6` | controles segmentados, chips, skeleton |
| `--line` | `rgba(255,255,255,.07)` | `#e3e8ef` | divisórias (hairline) |
| `--line-strong` | `rgba(255,255,255,.14)` | `#c9d2df` | borda de input, total |
| `--fg` | `#eef2f6` | `#0f1722` | texto e números |
| `--fg-muted` | `#a7b1bf` | `#4a5667` | texto de apoio |
| `--fg-subtle` | `#6f7a89` | `#8a95a5` | rótulos, zero (–), placeholders |
| `--accent` | `#4d8dff` | `#1f5eff` | ação, link, ativo, foco |
| `--accent-hover` | `#6ea1ff` | `#1a4fd6` | hover do primário |
| `--accent-soft` | `rgba(77,141,255,.14)` | `rgba(31,94,255,.09)` | fundo do item ativo, seleção |
| `--gain` | `#2ecc8a` | `#148a4f` | ganho, subida, ativo, positivo |
| `--gain-soft` | `rgba(46,204,138,.14)` | `rgba(20,138,79,.10)` | fundo de badge/heatmap de lotes |
| `--loss` | `#ff5c5c` | `#d6382d` | perda, queda, crítico |
| `--loss-soft` | `rgba(255,92,92,.14)` | `rgba(214,56,45,.09)` | fundo de badge |
| `--warn` | `#f0b35b` | `#b26a05` | atenção (alerta de contato, inativo) |
| `--warn-soft` | `rgba(240,179,91,.14)` | `rgba(178,106,5,.10)` | fundo de badge |
| `--c-genial` / `--c-xp` / `--c-btg` | `#60a5fa` / `#f5b942` / `#35c3a2` | `#2563eb` / `#c77d00` / `#0f8f72` | só para identificar corretora (ponto, aba) |
| `--focus` | `var(--accent)` | `var(--accent)` | anel de foco 2 px |

Regras: `success/danger/warning/info/violet` deixam de existir como tons de componente — viram `gain`,
`loss`, `warn`; "info" e "violet" são substituídos por neutro. Sidebar usa `--surface` + `--line`
(sem segunda paleta `--sb-*`). Sombra: escuro nenhuma (degraus de superfície fazem o trabalho);
claro `--shadow-float: 0 8px 24px rgba(15,23,34,.08)` só em modal, menu e popover.

Contraste mínimo AA: `--fg` sobre `--surface` ≥ 12:1; `--fg-muted` ≥ 7:1; `--fg-subtle` ≥ 4.5:1;
`--accent` como texto sobre `--surface` ≥ 4.5:1 nos dois temas.

### 2.2 Tipografia

Fonte: **Geist** (já carregada via `next/font`). Números: `font-variant-numeric: tabular-nums` em
qualquer valor numérico (`.num`, KPI, eixos). Sem segunda família; sem itálico.

| Nome | Tamanho / altura | Peso | Uso |
|---|---|---|---|
| `display` | 32 / 1.1 | 600, `tracking-tight` | número-herói (Início, Consulta) |
| `kpi` | 26 / 1.1 | 600, `tracking-tight` | valor de KPI |
| `title` | 20 / 1.2 | 600 | título de página |
| `section` | 15 / 1.3 | 600 | título de seção/painel |
| `body` | 14 / 1.5 | 400 | texto, inputs, botões |
| `dense` | 13 / 1.4 | 400 | tabelas, listas, descrições |
| `label` | 12 / 1.3 | 500 | rótulo de campo, cabeçalho de tabela (sentence case, sem letter-spacing) |
| `micro` | 11 / 1.3 | 500 | subtexto de KPI, timestamps |

Fora da escala só por exceção documentada aqui. Cabeçalho de tabela deixa de ser CAIXA ALTA espaçada
(cara de planilha): `label`, cor `--fg-subtle`, sentence case.

### 2.3 Espaço, raio, borda

- Escala de espaço (px): 4, 8, 12, 16, 20, 24, 32, 40, 48. Gutter da página: 16 (mobile) / 32 (desktop).
- Entre seções: 32. Dentro de painel: 16–20. Célula de tabela: 6 × 12 (densa) / 10 × 12 (normal).
- Raio: `--r-sm` 6 (badge, chip, input), `--r-md` 8 (botão, menu), `--r-lg` 12 (card, modal). Tabela
  dentro de painel não tem raio próprio.
- Borda: hairline `--line` 1 px. Painel no escuro: sem borda (superfície já destaca); no claro: borda
  `--line`. Nunca borda + sombra juntas.

## 3. Componentes base (`src/components/ui`)

| Componente | Regra |
|---|---|
| **Botão** | Primário (accent, texto branco), secundário (superfície + hairline), ghost (só texto), destrutivo (loss). Altura 40 (36 em barras densas); 44 no mobile. Ícone 16 px. Loading = spinner no lugar do ícone. |
| **Input / Select / Textarea** | Superfície, hairline, raio sm, altura 40; foco = anel 2 px `--focus`; erro = borda `--loss` + mensagem. Rótulo `label` acima. |
| **Seção / Painel** | `Section`: título `section` + subtítulo opcional `dense` muted + divisor. `Card`: superfície com raio lg, só para KPI, ficha e blocos flutuantes. Não aninhar card em card. |
| **KPI** | Faixa única com divisórias verticais (não 6 caixas): rótulo `label`, valor `kpi`, subtexto `micro`. Cor só na variação (gain/loss) e no ícone de tendência. Máximo 6 por faixa; no mobile 2 colunas. |
| **Tabela** | Cabeçalho `label` muted, sticky; linhas hairline; hover `--surface-2`; números `.num` à direita; zero = `–` em `--fg-subtle`; linha de total `--surface-2` + peso 600; primeira coluna sticky quando rola. Prioridade de colunas: P1 sempre, P2 ≥ 768, P3 ≥ 1280. Sem zebra. |
| **Badge** | Neutro (hairline + `--fg-muted`) por padrão. Semântico só para estado que importa: `gain` (Ativo, Migrado, Ganho), `loss` (Perdido, Recusou, crítico), `warn` (Inativo, Nunca girou, alerta de contato). Um badge por linha no máximo. |
| **Barra em célula / Heatmap** | Barra de dados só em tabela de ranking, uma coluna. Heatmap só nas matrizes mês × linha (giro mensal, receita mensal): `gain-soft` para lotes, `accent-soft` para receita, intensidade por raiz quadrada. |
| **Modal** | Centro, raio lg, `--shadow-float`, título `section`, rodapé com ações à direita, fecha com Esc e clique fora. |
| **Tabs / Segmentado** | Trilho `--surface-3`, item ativo `--surface` + `--fg`; sem sombra interna. |
| **Menu lateral** | Mesma superfície do conteúdo, hairline à direita, 240 px; item ativo `--accent-soft` + texto `--fg` + barra 2 px `--accent`; seletor de corretora como segmentado com ponto da cor da corretora. Topo: título da página (não breadcrumb duplicado), tema e sair. |
| **Toast** | Canto inferior direito (mobile: inferior centralizado), superfície, hairline, ícone de estado, some em 4 s. Sem lib. |
| **Skeleton / Vazio / Erro** | Skeleton segue a forma final (faixa de KPI, tabela de N linhas, gráfico). Vazio: ícone 20 px `--fg-subtle`, frase curta, ação. Erro: mensagem + "Tentar de novo". |

## 4. Dados e gráficos

- Formatos pt-BR: `1.234`, `R$ 1.234,56`, `12,3%`, `17/09/26`. Zero mostra `–`. Variação `+12,3%` /
  `−4,0%` colorida gain/loss; sem seta se já tem sinal.
- Gráficos (recharts) leem tokens: grade só horizontal `--line`, eixos `--fg-subtle` 11 px, sem linha de
  eixo, tooltip = `--surface-2` + hairline + `dense`, legenda só com 3+ séries. Cores das séries:
  1ª `--accent`, 2ª `--gain`, 3ª `--warn`, 4ª `--fg-muted`; ganho/perda sempre gain/loss. Um gráfico
  "herói" por página; os demais menores e sem card próprio.
- Página inteira sem rolagem horizontal; dentro de tabela é permitido só acima de 768 px.

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
