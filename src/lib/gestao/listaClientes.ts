// A lista de clientes (tela Clientes): os filtros, as etiquetas dos filtros ligados e as visões de
// colunas. Só funções puras (testes em listaClientes.test.ts); a tabela é TabelaClientes.tsx.
import type { ClienteLinha } from './tipos'

export type FiltrosClientes = {
  busca: string; status: string; situacao: string; responsavel: string; ativacao: string; contato: string
  assessor: string; alerta: string; grupo: string; risco: string; nivel: string
  fora: string           // 'sim' = só quem gira em outra corretora do escritório (a tabela confere; não entra em passaFiltros)
}
export const SEM_FILTRO_CLIENTES: FiltrosClientes = { busca: '', status: '', situacao: '', responsavel: '', ativacao: '', contato: '', assessor: '', alerta: '', grupo: '', risco: '', nivel: '', fora: '' }

export const SITUACOES_CLIENTE = ['Ativo', 'Inativo', 'Nunca girou', 'Em processamento', 'Recusou'] as const
export const STATUS_CLIENTE = ['Migrado', 'Em processamento', 'Recusou'] as const
// No seletor de situação o rótulo vai no plural
export const SITUACAO_PLURAL: Record<string, string> = { Ativo: 'Ativos', Inativo: 'Inativos', 'Nunca girou': 'Nunca giraram', 'Em processamento': 'Em processamento', Recusou: 'Recusaram' }

// "2 contas", "3 contas"… viram uma opção só no filtro de alertas
const VARIAS_CONTAS = /^\d+ contas$/
export const chaveAlerta = (alerta: string) => (VARIAS_CONTAS.test(alerta) ? 'contas' : alerta)

type Filtravel = Pick<ClienteLinha, 'status' | 'situacao' | 'responsavel' | 'ativador' | 'contatos' | 'assessor_nome' | 'alertas' | 'grupo_corretagem' | 'risco' | 'nivel'>

// O cliente passa nos filtros de lista (todos menos a busca por texto, que usa o índice da tabela, e o
// giro em outra corretora, que vem de outra leitura)?
// `pular` deixa um filtro de fora: é como se contam as opções dele sem que ele mesmo zere a conta.
export function passaFiltros(c: Filtravel, f: FiltrosClientes, pular?: keyof FiltrosClientes): boolean {
  const vale = (k: keyof FiltrosClientes) => k !== pular && f[k] !== ''
  if (vale('status') && c.status !== f.status) return false
  if (vale('situacao') && c.situacao !== f.situacao) return false
  if (vale('responsavel') && (c.responsavel ?? '') !== f.responsavel) return false
  if (vale('ativacao') && (f.ativacao === 'sem' ? c.ativador != null : c.ativador !== f.ativacao)) return false
  if (vale('contato') && (f.contato === 'sim' ? !c.contatos : f.contato === 'nao' && c.contatos > 0)) return false
  if (vale('assessor') && (c.assessor_nome ?? '') !== f.assessor) return false
  if (vale('alerta') && (f.alerta === 'qualquer' ? c.alertas.length === 0 : !c.alertas.some(a => chaveAlerta(a) === f.alerta))) return false
  if (vale('grupo') && (f.grupo === 'vazio' ? c.grupo_corretagem != null : c.grupo_corretagem !== f.grupo)) return false
  if (vale('risco') && (f.risco === 'qualquer' ? !c.risco : c.risco !== f.risco)) return false
  if (vale('nivel') && (f.nivel === 'vazio' ? c.nivel != null : c.nivel !== f.nivel)) return false
  return true
}

// Os filtros que ficam recolhidos em "Filtros" e estão ligados, com o texto da etiqueta de cada um.
// Situação, busca, "em risco", "com alertas" e "giram em outra" têm controle próprio à mostra e não entram aqui.
export function etiquetasDosFiltros(f: FiltrosClientes): { chave: keyof FiltrosClientes; texto: string }[] {
  const out: { chave: keyof FiltrosClientes; texto: string }[] = []
  if (f.status) out.push({ chave: 'status', texto: `Status: ${f.status}` })
  if (f.responsavel) out.push({ chave: 'responsavel', texto: `Responsável: ${f.responsavel}` })
  if (f.ativacao) out.push({ chave: 'ativacao', texto: `Ativação: ${f.ativacao === 'sem' ? 'sem atendente' : f.ativacao}` })
  if (f.contato) out.push({ chave: 'contato', texto: f.contato === 'sim' ? 'Já chamados' : 'Ainda não chamados' })
  if (f.assessor) out.push({ chave: 'assessor', texto: `Assessor: ${f.assessor}` })
  if (f.alerta && f.alerta !== 'qualquer') out.push({ chave: 'alerta', texto: `Alerta: ${f.alerta === 'contas' ? 'mais de uma conta' : f.alerta}` })
  if (f.grupo) out.push({ chave: 'grupo', texto: `Grupo de corretagem: ${f.grupo === 'vazio' ? 'não informado' : f.grupo.toLowerCase()}` })
  if (f.risco && f.risco !== 'qualquer') out.push({ chave: 'risco', texto: `Risco: ${f.risco}` })
  if (f.nivel) out.push({ chave: 'nivel', texto: f.nivel === 'vazio' ? 'Sem giro nos 3 meses' : `Nível ${f.nivel.toLowerCase()}` })
  return out
}

// ── Visões de colunas ────────────────────────────────────────────────────────
// A tabela tem 25 colunas; cada visão mostra as de uma pergunta. Prioridade no estilo da casa:
// sem marca = sempre; 'p2' = a partir de 768 px; 'p3' = a partir de 1280 px.
export type ColunaCliente =
  | 'nome' | 'nivel' | 'documento' | 'conta' | 'contas' | 'status' | 'situacao' | 'risco' | 'assessor' | 'responsavel' | 'ativador' | 'contato'
  | 'telefone' | 'tarifa' | 'grupo' | 'migracao' | 'entrada' | 'parceiro' | 'lotes_mes' | 'receita_mes' | 'lotes_12m' | 'receita_12m' | 'ultimo_giro' | 'alertas'
  | 'outra'   // giro em outra corretora do escritório
export type ColunaDaVisao = readonly [ColunaCliente, ('p2' | 'p3')?]

export const VISOES_CLIENTES = ['giro', 'atendimento', 'cadastro', 'todas'] as const
export type VisaoClientes = (typeof VISOES_CLIENTES)[number]
export const VISAO_ROTULO: Record<VisaoClientes, string> = { giro: 'Giro', atendimento: 'Atendimento', cadastro: 'Cadastro', todas: 'Todas' }
// A escolha da pessoa fica num cookie de um ano (fora do prefixo dos filtros, que a saída apaga)
export const COOKIE_VISAO_CLIENTES = 'zv_clientes_colunas'
export const visaoClientes = (v: string | null | undefined): VisaoClientes =>
  ((VISOES_CLIENTES as readonly string[]).includes(String(v)) ? (v as VisaoClientes) : 'giro')

export const COLUNAS_DA_VISAO: Record<VisaoClientes, readonly ColunaDaVisao[]> = {
  // quanto cada cliente gira
  giro: [['nome'], ['nivel', 'p2'], ['situacao'], ['risco', 'p2'], ['outra', 'p3'], ['assessor', 'p3'], ['responsavel', 'p3'], ['lotes_mes'], ['receita_mes', 'p2'], ['lotes_12m'], ['receita_12m', 'p2'], ['ultimo_giro', 'p3']],
  // quem cuida, quem já foi chamado e como falar com o cliente
  atendimento: [['nome'], ['situacao', 'p2'], ['risco', 'p2'], ['outra', 'p2'], ['ativador'], ['contato'], ['telefone', 'p2'], ['responsavel', 'p2'], ['assessor', 'p3'], ['parceiro', 'p3'], ['ultimo_giro', 'p3']],
  // os dados da conta
  cadastro: [['nome'], ['documento', 'p2'], ['conta'], ['contas', 'p3'], ['status'], ['tarifa', 'p2'], ['grupo', 'p2'], ['migracao', 'p2'], ['entrada', 'p3'], ['parceiro', 'p3'], ['alertas', 'p2']],
  todas: [
    ['nome'], ['nivel', 'p2'], ['documento', 'p2'], ['conta', 'p2'], ['contas', 'p3'], ['status', 'p2'], ['situacao'], ['risco', 'p2'], ['outra', 'p3'], ['assessor', 'p2'], ['responsavel', 'p3'],
    ['ativador', 'p2'], ['contato', 'p2'], ['telefone', 'p3'], ['tarifa', 'p3'], ['grupo', 'p2'], ['migracao', 'p3'], ['entrada', 'p3'], ['parceiro', 'p3'],
    ['lotes_mes'], ['receita_mes', 'p2'], ['lotes_12m'], ['receita_12m', 'p2'], ['ultimo_giro', 'p3'], ['alertas', 'p3'],
  ],
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
