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
7. **Celular como aplicativo (390 px):** título grande no topo, barra de abas flutuante de vidro no pé,
   sem rolagem horizontal da página; toque mínimo de 44 px.
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

Papéis do HIG no desktop (tamanho/entrelinha); no telefone a escala sobe (34 · 28 · 22 · 20 · 17):

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
| **Navegação** | Desktop: cabeçalho fixo em três colunas (marca + seletor de corretora · cápsula com Início, Painel, Clientes, Giro diário, Receita, Leads e "Mais" · data e conta). Celular: barra fina no topo, menu completo como gaveta e barra de abas flutuante de vidro no pé (Início, Painel, Clientes, Leads, Menu). |
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
