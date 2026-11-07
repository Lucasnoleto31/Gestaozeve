# Leads do Instagram no Zeve Gestão

Especificação para o Lucas. Escrita em 07/11/2026 sobre o `main` em `697837e`
(Lucasnoleto31/Gestaozeve). Pedido do Artur.

## Por que

Hoje só entra no sistema o lead do Direct que a Karen já converteu. Por isso ela aparece com
100% de ganho, e o resto do funil dela fica invisível: quem chegou, quem ela respondeu,
quantas vezes insistiu, quem recebeu o WhatsApp da equipe e quem sumiu. A leitura do export
do Instagram (nov/25 a nov/26) mostrou que a maior parte dos leads do Direct nunca chegou ao
sistema. Os números ficam no relatório interno, fora do repositório.

A meta é que todo lead do Direct entre no sistema no dia em que chega. Com isso, a Karen
passa a ser medida como o resto da equipe, no mesmo funil por safra.

## A regra de operação

- **Entra** quem pergunta de robô, curso, conta ou grupo.
- **Não entra** suporte de outra empresa, candidato a vaga, fã nem reação a story sem pergunta.
- **Origem** `Instagram Direct`, sempre com essa grafia.
- **Cada mensagem dela vira um contato** no histórico, do tipo resposta ou recontato.
- **Print da conta** vira o status `Print recebido`.
- **WhatsApp da equipe** vira o status `Handoff`, e o responsável passa a ser o assessor.
- **Ganho** continua só pelo troféu da lista, quando a conta existe.
- **Perdido** quando o lead some depois do último recontato, com motivo.

## Fase 0: sem código, pela tela de admin

1. Em Parâmetros › Status de lead, criar `Print recebido` e `Handoff`, os dois do tipo
   Aberto, com ordem depois de `Em contato`.
2. Em Parâmetros › Responsáveis, cadastrar `Karen` atendendo leads.
3. Criar o usuário da Karen. Hoje só `admin` e `vendedor` veem Leads (`equipe()` em
   `src/lib/gestao/guard.ts`), e `vendedor` também vê as páginas da corretora, com clientes.
   Decisão do Artur: liberar como `vendedor` agora ou esperar o papel novo do item 6.

Com a fase 0, a Karen já consegue cadastrar à mão pelo formulário atual. O @ vai no nome ou
nas observações até o item 1 existir.

## Fase 1: ajustes no código (uma migração, S57)

### 1. Campo Instagram e deduplicação por ele

O lead do Direct quase nunca dá CPF ou WhatsApp no primeiro contato. Sem isso,
`leadDaMesmaPessoa` (`src/lib/gestao/acoes.ts:579`) não acha duplicado e o mesmo lead pode
entrar duas vezes.

- `leads.instagram text` e `leads.instagram_norm text`, que guarda o @ em minúsculas, sem o
  `@` e sem espaços. Índice em `instagram_norm`.
- Campo "Instagram" no `LeadForm.tsx`, perto de Origem, e `instagram` em `LeadCampos` e em
  `leadRegistro`.
- Em `leadDaMesmaPessoa`, procurar também por `instagram_norm` igual. Com o mesmo @, é a
  mesma pessoa, mesmo sem CPF.
- Em `importar_leads` e `unificar_leads_duplicados` (S45), aceitar o @ como chave de mesma
  pessoa, com a mesma regra de CPF compatível que já vale para o WhatsApp.

### 2. Tipo no contato

`lead_contatos` guarda data, nota e quem registrou (S47), mas não diz se o contato foi
resposta ao lead ou insistência sem resposta. É essa a diferença que mede a Karen.

- `lead_contatos.tipo text`, nulo nos contatos antigos. Valores: `resposta`, `recontato`
  e `ligacao`.
- `registrar_contato_lead` ganha `p_tipo text DEFAULT NULL`. A assinatura muda, então é
  preciso dar `DROP` na antiga, como a S45 fez com `importar_leads`.
- `registrarContatoLead` em `acoes.ts` repassa o tipo.
- `ContatosLead.tsx` ganha a escolha do tipo, com `resposta` como padrão. O botão de
  telefone da `TabelaLeads.tsx:130` grava `ligacao`.

### 3. Quem captou o lead

`funil_safra_por('responsavel', …)` (S50) agrupa pelo responsável atual. No handoff, o lead
passa para o assessor e some da linha da Karen, junto com o ganho que ela gerou.

- `leads.captado_por text`. No insert, recebe o `responsavel`. Depois disso não muda com a
  troca de responsável. Os leads antigos recebem o `responsavel` de hoje.
- `funil_safra_por` aceita `p_campo = 'captado_por'`. O tipo de `funilSafraPor` em
  `src/lib/gestao/consultas.ts:738` ganha `'captado_por'`.
- Na página Funil, a tabela "por responsável" ganha a alternância responsável ou quem
  captou.

### 4. Indicadores de contato por quem captou

Uma função `funil_contatos_por_captador(p_mes_ref date, p_meses int)` devolve, por
`captado_por`:

| Coluna | Conta |
|---|---|
| leads | leads da safra |
| com_resposta | leads com ao menos um contato do tipo `resposta` |
| respostas | contatos do tipo `resposta` |
| recontatos | contatos do tipo `recontato` |
| recontato_com_volta | recontatos seguidos de uma `resposta` no mesmo lead |
| print | leads que passaram por `Print recebido` |
| handoff | leads que passaram por `Handoff` |
| ganhos, contas_novas, operaram | as mesmas regras da S50 e da S51 |

Para "passou por", basta guardar quando o status mudou. Se ainda não existe histórico de
status, a forma mais simples é gravar uma linha em `lead_contatos` com a nota `status: X` ao
trocar de status. Fica a critério do Lucas.

### 5. Fila de recontato

Na página Leads, um filtro "Recontato pendente": leads em `Em contato`, `Print recebido` ou
`Handoff` cujo último contato foi há mais de 2 dias. A regra que a Karen segue é recontatar
no dia seguinte, em três dias e em sete. O sistema não sabe quando o lead respondeu no
Instagram, então a fila se guia pela data do último contato.

### 6. Papel só de leads (opcional)

Um papel `atendente` em `Role` (`src/types/index.ts`) que vê Leads e Funil e nada das
páginas da corretora. Mexe em `equipe()`, `Header.tsx`, `Sidebar.tsx` e `BottomNav.tsx`.
Só é preciso se a Karen não puder ver clientes.

## Fase 2: cadastro automático

Uma rota `POST /api/leads/instagram`, protegida por um token em variável de ambiente.
Corpo: `nome`, `instagram`, `mensagem` e `quando`.

- Usa a mesma regra de mesma pessoa do item 1. Lead novo entra com origem
  `Instagram Direct`, captado por `Karen`, status `Novo` e a mensagem nas observações. Lead
  repetido soma uma reentrada.
- Quem chama a rota é o ManyChat ou uma automação da API do Instagram, quando a mensagem cita
  robô, curso, conta ou Genial. Precisa da conta comercial do Instagram ligada a essa
  ferramenta. Esse custo e essa decisão são do Artur.
- A rota não grava CPF nem telefone que venham na mensagem. Esses dados a Karen pede e
  preenche na ficha.

## Como saber que funcionou

1. Um lead cadastrado com o @ e cadastrado de novo com o mesmo @ dá o aviso de "Já existe o
   lead", em vez de criar outro.
2. Lead captado pela Karen e passado para outro responsável continua na linha dela no funil
   por quem captou, e aparece na linha do assessor no funil por responsável.
3. Três contatos, resposta, recontato e resposta, dão 2 respostas, 1 recontato e 1
   recontato com volta.
4. Os leads de antes da S57 continuam com os mesmos números no funil atual.
5. No fim do mês, o export do Instagram passa pelo cruzamento do relatório interno. Mais de
   95% dos leads do funil do Direct precisam estar no sistema.

## Fora deste pedido

- Tempo de resposta em horas. O contato guarda a data, e o horário de registro não é o
  horário da mensagem. Continua medido pelo export mensal do Instagram.
- Suporte de outra empresa que chega pelo mesmo Direct. Não entra no sistema da Zeve.
