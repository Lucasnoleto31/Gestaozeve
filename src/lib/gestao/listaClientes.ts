// A lista de clientes (tela Clientes): os filtros, as etiquetas dos filtros ligados e as visões de
// colunas. Só funções puras (testes em listaClientes.test.ts); a tabela é TabelaClientes.tsx.
import { opcaoValida, type ValoresFiltro } from '@/lib/filtrosLista'
import { GRUPOS_CORRETAGEM, NIVEIS, RISCOS, type ClienteLinha } from './tipos'
import { MOMENTOS, MOMENTO_DA_SITUACAO, momentoDoCliente, type Momento } from './momentoCliente'

export type FiltrosClientes = {
  busca: string
  momento: string        // o cartão escolhido no alto da lista ('' = todos): operando, risco, inativo…
  risco: string          // dentro de "Em risco": 'parou' ou 'em queda'
  status: string; responsavel: string; ativacao: string; contato: string
  assessor: string; alerta: string; grupo: string; nivel: string
  fora: string           // 'sim' = só quem gira em outra corretora do escritório (a tabela confere; não entra em passaFiltros)
}
export const SEM_FILTRO_CLIENTES: FiltrosClientes = { busca: '', momento: '', risco: '', status: '', responsavel: '', ativacao: '', contato: '', assessor: '', alerta: '', grupo: '', nivel: '', fora: '' }

export const STATUS_CLIENTE = ['Migrado', 'Em processamento', 'Recusou'] as const

// Filtros a partir do que veio do endereço ou do cookie: opção de lista fixa que não existe vira vazio
// (filtro escondido não). Endereços antigos continuam valendo: ?risco=qualquer é o grupo "Em risco" e
// ?situacao= vira o grupo quando a situação corresponde a um grupo inteiro.
export function filtrosClientesDe(v: ValoresFiltro): FiltrosClientes {
  const risco = opcaoValida(v.risco, RISCOS)
  const momento = opcaoValida(v.momento, MOMENTOS) || (risco || v.risco === 'qualquer' ? 'risco' : MOMENTO_DA_SITUACAO[v.situacao ?? ''] ?? '')
  return {
    busca: v.busca ?? '', momento, risco: momento === 'risco' ? risco : '', status: opcaoValida(v.status, STATUS_CLIENTE),
    responsavel: v.responsavel ?? '', ativacao: v.ativacao ?? '', contato: opcaoValida(v.contato, ['sim', 'nao']), assessor: v.assessor ?? '', alerta: v.alerta ?? '',
    grupo: opcaoValida(v.grupo, [...GRUPOS_CORRETAGEM, 'vazio']), nivel: opcaoValida(v.nivel, [...NIVEIS, 'vazio']), fora: opcaoValida(v.fora, ['sim']),
  }
}

// "2 contas", "3 contas"… viram uma opção só no filtro de alertas
const VARIAS_CONTAS = /^\d+ contas$/
export const chaveAlerta = (alerta: string) => (VARIAS_CONTAS.test(alerta) ? 'contas' : alerta)

type Filtravel = Pick<ClienteLinha, 'status' | 'situacao' | 'responsavel' | 'ativador' | 'contatos' | 'assessor_nome' | 'alertas' | 'grupo_corretagem' | 'risco' | 'nivel' | 'lotes_media_3m'>

// O cliente passa nos filtros de lista (todos menos a busca por texto, que usa o índice da tabela, e o
// giro em outra corretora, que vem de outra leitura)?
export function passaFiltros(c: Filtravel, f: FiltrosClientes): boolean {
  if (f.momento && momentoDoCliente(c) !== f.momento) return false
  if (f.risco && c.risco !== f.risco) return false
  if (f.status && c.status !== f.status) return false
  if (f.responsavel && (c.responsavel ?? '') !== f.responsavel) return false
  if (f.ativacao && (f.ativacao === 'sem' ? c.ativador != null : c.ativador !== f.ativacao)) return false
  if (f.contato && (f.contato === 'sim' ? !c.contatos : f.contato === 'nao' && c.contatos > 0)) return false
  if (f.assessor && (c.assessor_nome ?? '') !== f.assessor) return false
  if (f.alerta && (f.alerta === 'qualquer' ? c.alertas.length === 0 : !c.alertas.some(a => chaveAlerta(a) === f.alerta))) return false
  if (f.grupo && (f.grupo === 'vazio' ? c.grupo_corretagem != null : c.grupo_corretagem !== f.grupo)) return false
  if (f.nivel && (f.nivel === 'vazio' ? c.nivel != null : c.nivel !== f.nivel)) return false
  return true
}

// Os mesmos filtros sem o grupo: é como se contam os cartões (cada cartão mostra quantos clientes há
// nele com a busca e os outros filtros que estiverem ligados)
export const semGrupo = (f: FiltrosClientes): FiltrosClientes => ({ ...f, momento: '', risco: '' })

// Os filtros que ficam recolhidos em "Filtros" e estão ligados, com o texto da etiqueta de cada um.
// O grupo, a busca, o risco e "giram em outra" têm controle próprio à mostra e não entram aqui.
export function etiquetasDosFiltros(f: FiltrosClientes): { chave: keyof FiltrosClientes; texto: string }[] {
  const out: { chave: keyof FiltrosClientes; texto: string }[] = []
  if (f.status) out.push({ chave: 'status', texto: `Status: ${f.status}` })
  if (f.responsavel) out.push({ chave: 'responsavel', texto: `Responsável: ${f.responsavel}` })
  if (f.ativacao) out.push({ chave: 'ativacao', texto: `Ativação: ${f.ativacao === 'sem' ? 'sem atendente' : f.ativacao}` })
  if (f.contato) out.push({ chave: 'contato', texto: f.contato === 'sim' ? 'Já chamados' : 'Ainda não chamados' })
  if (f.assessor) out.push({ chave: 'assessor', texto: `Assessor: ${f.assessor}` })
  if (f.alerta) out.push({ chave: 'alerta', texto: f.alerta === 'qualquer' ? 'Com algum alerta' : `Alerta: ${f.alerta === 'contas' ? 'mais de uma conta' : f.alerta}` })
  if (f.grupo) out.push({ chave: 'grupo', texto: `Grupo de corretagem: ${f.grupo === 'vazio' ? 'não informado' : f.grupo.toLowerCase()}` })
  if (f.nivel) out.push({ chave: 'nivel', texto: f.nivel === 'vazio' ? 'Sem giro nos 3 meses' : `Nível ${f.nivel.toLowerCase()}` })
  return out
}

// ── Visões de colunas ────────────────────────────────────────────────────────
// A tabela tem 25 colunas; cada visão mostra as de uma pergunta e nenhuma mostra todas (era a visão
// "Todas" que deixava a tela ilegível; o CSV continua levando tudo). Prioridade no estilo da casa:
// sem marca = sempre; 'p2' = a partir de 768 px; 'p3' = a partir de 1280 px.
export type ColunaCliente =
  | 'nome' | 'momento' | 'nivel' | 'media_3m' | 'documento' | 'conta' | 'contas' | 'status' | 'assessor' | 'responsavel' | 'ativador' | 'contato'
  | 'telefone' | 'tarifa' | 'grupo' | 'migracao' | 'entrada' | 'parceiro' | 'lotes_mes' | 'receita_mes' | 'lotes_12m' | 'receita_12m' | 'ultimo_giro' | 'alertas'
  | 'outra'   // giro em outra corretora do escritório
export type ColunaDaVisao = readonly [ColunaCliente, ('p2' | 'p3')?]

export const VISOES_CLIENTES = ['resumo', 'atendimento', 'giro', 'cadastro'] as const
export type VisaoClientes = (typeof VISOES_CLIENTES)[number]
export const VISAO_ROTULO: Record<VisaoClientes, string> = { resumo: 'Resumo', atendimento: 'Atendimento', giro: 'Giro e receita', cadastro: 'Cadastro' }
// A escolha da pessoa fica num cookie de um ano (fora do prefixo dos filtros, que a saída apaga).
// O nome mudou em 16/11/2026 junto com as visões: quem tinha "Todas" guardada volta para o Resumo.
export const COOKIE_VISAO_CLIENTES = 'zv_clientes_visao'
export const visaoClientes = (v: string | null | undefined): VisaoClientes =>
  ((VISOES_CLIENTES as readonly string[]).includes(String(v)) ? (v as VisaoClientes) : 'resumo')

// No celular cabem o nome e mais uma coluna sem rolar de lado: por isso toda visão tem só duas colunas
// sem marca. O estado ("Como está") é sempre p2; no celular ele desce para baixo do nome.
export const COLUNAS_DA_VISAO: Record<VisaoClientes, readonly ColunaDaVisao[]> = {
  // como está cada cliente e como falar com ele: o que a equipe olha no dia a dia
  resumo: [['nome'], ['momento', 'p2'], ['lotes_mes'], ['media_3m', 'p2'], ['ultimo_giro', 'p2'], ['telefone', 'p2'], ['contato', 'p3'], ['assessor', 'p3']],
  // quem cuida, quem já foi chamado e como falar com o cliente
  atendimento: [['nome'], ['momento', 'p2'], ['telefone'], ['contato', 'p2'], ['responsavel', 'p2'], ['ativador', 'p2'], ['outra', 'p3'], ['assessor', 'p3'], ['parceiro', 'p3']],
  // quanto cada cliente gira e rende
  giro: [['nome'], ['momento', 'p2'], ['nivel', 'p2'], ['lotes_mes'], ['receita_mes', 'p2'], ['lotes_12m', 'p2'], ['receita_12m', 'p2'], ['ultimo_giro', 'p3'], ['outra', 'p3']],
  // os dados da conta
  cadastro: [['nome'], ['documento', 'p2'], ['conta'], ['contas', 'p3'], ['status', 'p2'], ['tarifa', 'p2'], ['grupo', 'p2'], ['migracao', 'p2'], ['entrada', 'p3'], ['parceiro', 'p3'], ['alertas', 'p2']],
}

// No Resumo as colunas acompanham o grupo escolhido: cada grupo mostra o que importa nele (quem nunca
// operou não tem lotes para mostrar; interessa quando migrou e se já foi chamado). O estado do cliente
// só aparece onde ele muda de uma linha para outra (Todos, Em risco, Inativos); nos outros grupos o
// cartão já diz qual é.
const RESUMO_DO_GRUPO: Record<Momento, readonly ColunaDaVisao[]> = {
  operando: [['nome'], ['lotes_mes'], ['media_3m', 'p2'], ['ultimo_giro', 'p2'], ['telefone', 'p2'], ['contato', 'p3'], ['assessor', 'p3']],
  risco: [['nome'], ['momento', 'p2'], ['media_3m'], ['lotes_mes', 'p2'], ['ultimo_giro', 'p2'], ['telefone', 'p2'], ['contato', 'p3'], ['assessor', 'p3']],
  inativo: [['nome'], ['momento', 'p2'], ['lotes_12m'], ['ultimo_giro', 'p2'], ['telefone', 'p2'], ['contato', 'p3'], ['assessor', 'p3']],
  nunca: [['nome'], ['migracao', 'p2'], ['telefone'], ['contato', 'p2'], ['ativador', 'p2'], ['assessor', 'p3']],
  abertura: [['nome'], ['telefone'], ['contato', 'p2'], ['entrada', 'p2'], ['responsavel', 'p2'], ['assessor', 'p3']],
  recusou: [['nome'], ['telefone'], ['contato', 'p2'], ['responsavel', 'p2'], ['assessor', 'p3'], ['parceiro', 'p3']],
}
const ehMomento = (v: string): v is Momento => (MOMENTOS as readonly string[]).includes(v)
// Grupos em que todo mundo tem o mesmo estado: a coluna "Como está" repetiria o cartão em todas as linhas
const ESTADO_IGUAL: readonly string[] = ['operando', 'nunca', 'abertura', 'recusou']

export function colunasDaVisao(visao: VisaoClientes, momento: string): readonly ColunaDaVisao[] {
  if (visao === 'resumo' && ehMomento(momento)) return RESUMO_DO_GRUPO[momento]
  return ESTADO_IGUAL.includes(momento) ? COLUNAS_DA_VISAO[visao].filter(([id]) => id !== 'momento') : COLUNAS_DA_VISAO[visao]
}

// A ordem em que cada grupo abre, enquanto a pessoa não clica num cabeçalho: o que mais importa primeiro
// (quem mais gira, quem mais girava, quem parou por último, quem migrou ou entrou por último)
export type OrdemClientes = { col: keyof ClienteLinha; dir: 'asc' | 'desc' }
const ORDEM_DO_GRUPO: Record<Momento, OrdemClientes> = {
  operando: { col: 'lotes_mes', dir: 'desc' }, risco: { col: 'lotes_media_3m', dir: 'desc' }, inativo: { col: 'ultimo_giro', dir: 'desc' },
  nunca: { col: 'data_migracao', dir: 'desc' }, abertura: { col: 'data_entrada', dir: 'desc' }, recusou: { col: 'nome', dir: 'asc' },
}
export const ordemDoGrupo = (momento: string): OrdemClientes => (ehMomento(momento) ? ORDEM_DO_GRUPO[momento] : { col: 'lotes_mes', dir: 'desc' })

// Ordena sem mexer na lista original; quem não tem o valor vai para o fim nos dois sentidos, e o empate
// mantém a ordem em que a lista chegou (do banco: mais lotes em 12 meses primeiro)
export function ordenarClientes<T extends Partial<ClienteLinha>>(linhas: T[], { col, dir }: OrdemClientes): T[] {
  return [...linhas].sort((a, b) => {
    const va = a[col], vb = b[col]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
    return dir === 'asc' ? cmp : -cmp
  })
}

// '(11) 98888-7777' a partir de qualquer forma do telefone (com ou sem o 55); o que não é
// telefone brasileiro volta como veio
export function telefoneCurto(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  const d = telefone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone
}
