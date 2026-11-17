// Parceiros do cliente (tabela cliente_parceiros, S61): as leituras do banco. Só servidor.
// As regras da lista ficam em parceirosCliente.ts; a gravação, em acoesParceirosCliente.ts.
// Enquanto a S61 não rodou a tabela não existe: as leituras voltam vazias e tudo segue como antes.
import { cache } from 'react'
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, num, str } from './guard'
import { todasAsLinhas } from './consultas'
import { configBtg } from './btg'
import { CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, nomesComRegra } from './participacao'
import type { ParceiroDoCliente } from './parceirosCliente'
import { normTexto } from '@/lib/texto'
import type { Parametro } from './tipos'

type Row = Record<string, unknown>

// Erro da API quando a tabela ainda não existe no banco (script SQL não aplicado)
export const semTabelaDeParceiros = (e: { code?: string; message: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message))

const COLUNAS = 'id, cliente_id, corretora, parceiro, pct, desde, ate'
const ler = (r: Row): ParceiroDoCliente => ({
  id: String(r.id), cliente_id: String(r.cliente_id), corretora: String(r.corretora), parceiro: String(r.parceiro ?? ''),
  pct: num(r.pct), desde: String(r.desde).slice(0, 10), ate: r.ate ? String(r.ate).slice(0, 10) : null,
})
const emOrdem = (a: ParceiroDoCliente, b: ParceiroDoCliente) => a.desde.localeCompare(b.desde) || a.parceiro.localeCompare(b.parceiro, 'pt-BR')

// Todas as linhas de uma corretora (são poucas): a base da conta das comissões. Lida uma vez por página.
export const listaDaCorretora = cache(async (corretora: Corretora): Promise<ParceiroDoCliente[]> => {
  const { db } = await equipe()
  const { data, error } = await db.from('cliente_parceiros').select(COLUNAS).eq('corretora', corretora).range(0, 9999)
  if (error) { if (semTabelaDeParceiros(error)) return []; falha(error, 'cliente_parceiros') }
  return ((data ?? []) as Row[]).map(ler).sort(emOrdem)
})

// A lista de um cliente numa corretora, com o histórico. `disponivel` = a tabela já existe no banco.
export async function parceirosDoCliente(corretora: Corretora, clienteId: string): Promise<{ linhas: ParceiroDoCliente[]; disponivel: boolean }> {
  const { db } = await equipe()
  const { data, error } = await db.from('cliente_parceiros').select(COLUNAS).eq('corretora', corretora).eq('cliente_id', clienteId)
  if (error) { if (semTabelaDeParceiros(error)) return { linhas: [], disponivel: false }; falha(error, 'cliente_parceiros') }
  return { linhas: ((data ?? []) as Row[]).map(ler).sort(emOrdem), disponivel: true }
}

// Quem pode entrar na lista de um cliente: os parceiros com participação cadastrada. No BTG, os da divisão
// da comissão (repasse_parceiros), porque é ela que diz quanto do restante fica com o escritório; nas outras
// corretoras, qualquer parceiro com participação (na receita de alguma corretora ou na comissão do BTG).
export async function parceirosDeParticipacao(corretora: Corretora): Promise<string[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('parametros').select('corretora, chave, valor').in('chave', ['repasse_parceiros', CHAVE_PARCEIROS_RECEITA])
  if (error) falha(error, 'parametros')
  const doBtg: string[] = [], daReceita: string[] = []
  for (const p of (data ?? []) as Row[]) {
    const valor = String(p.valor ?? '')
    if (p.chave === CHAVE_PARCEIROS_RECEITA) daReceita.push(...nomesComRegra(lerParceirosReceita(valor)))
    else if (p.corretora === 'BTG') doBtg.push(...configBtg([{ chave: 'repasse_parceiros', valor, descricao: null } as Parametro]).parceiros.map(x => x.nome))
  }
  const nomes = new Map<string, string>()
  for (const n of corretora === 'BTG' ? doBtg : [...doBtg, ...daReceita]) if (!nomes.has(normTexto(n))) nomes.set(normTexto(n), n)
  return [...nomes.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// ── A lista com a receita dos clientes dela (corretora com cadeia de repasse: o BTG) ─────────────
// No BTG a parte do parceiro sai da comissão que o BTG paga pelo cliente, então a conta precisa da receita
// mensal de cada cliente com lista e da situação da ficha (só conta com a situação Migrado entra na divisão,
// como nos clientes sem lista). A receita sai da tabela lotes com a mesma conta do resumo mensal do banco
// (lotes_mes, que o Painel e as Comissões usam, mas que o aplicativo não lê direto): só o que conta para a
// receita; zeragem = contratos × R$ da zeragem, ação e posição = a corretagem da linha, o resto = lotes × tarifa.
export type ListaComReceita = {
  linhas: ParceiroDoCliente[]
  receita: Map<string, Map<string, { receita: number; lotes: number }>>   // cliente → mês ('AAAA-MM-01') → receita e lotes
  clientes: Map<string, { nome: string; status: string }>
}

const LOTE = 100
const emLotes = <T,>(xs: T[]): T[][] => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE))

// null quando a corretora não tem nenhuma linha (o caso de hoje): quem chama segue a conta de sempre
export const listaComReceita = cache(async (corretora: Corretora): Promise<ListaComReceita | null> => {
  const linhas = await listaDaCorretora(corretora)
  if (!linhas.length) return null
  const { db } = await equipe()
  const ids = [...new Set(linhas.map(l => l.cliente_id))]
  const inicio = linhas.map(l => l.desde).sort()[0]
  const [mensais, fichas, nomes] = await Promise.all([
    Promise.all(emLotes(ids).map(parte => todasAsLinhas<Row>((de, ate) => db.from('lotes').select('cliente_id, data, qtd, tarifa, zeragem_rs, zeragem, posicao, acoes')
      .eq('corretora', corretora).in('cliente_id', parte).eq('conta_para_receita', true).gte('data', inicio).order('id').range(de, ate), 'lotes'))),
    Promise.all(emLotes(ids).map(parte => db.from('v_cliente_corretora').select('cliente_id, status').eq('corretora', corretora).in('cliente_id', parte))),
    Promise.all(emLotes(ids).map(parte => db.from('clientes').select('id, nome').in('id', parte))),
  ])
  const receita = new Map<string, Map<string, { receita: number; lotes: number }>>()
  for (const r of mensais.flat()) {
    const id = str(r.cliente_id), mes = `${String(r.data).slice(0, 7)}-01`
    if (!id) continue
    const qtd = num(r.qtd), avulsa = r.posicao === true || r.acoes === true
    const valor = r.zeragem === true ? qtd * num(r.zeragem_rs) : avulsa ? num(r.tarifa) : qtd * num(r.tarifa)
    const lotes = r.zeragem === true || avulsa ? 0 : qtd
    let porMes = receita.get(id)
    if (!porMes) { porMes = new Map(); receita.set(id, porMes) }
    const x = porMes.get(mes) ?? { receita: 0, lotes: 0 }
    porMes.set(mes, { receita: x.receita + valor, lotes: x.lotes + lotes })
  }
  const status = new Map<string, string>(), nome = new Map<string, string>()
  for (const f of fichas) { if (f.error) falha(f.error, 'v_cliente_corretora'); for (const r of (f.data ?? []) as Row[]) status.set(String(r.cliente_id), String(r.status ?? '')) }
  for (const n of nomes) { if (n.error) falha(n.error, 'clientes'); for (const r of (n.data ?? []) as Row[]) nome.set(String(r.id), String(r.nome ?? '')) }
  return { linhas, receita, clientes: new Map(ids.map(id => [id, { nome: nome.get(id) ?? 'Cliente', status: status.get(id) ?? '' }])) }
})
