// Leituras do calendário do Funil (aba Calendário). Só servidor. As contas ficam em calendario.ts.
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, num, str, type Admin } from './guard'
import { clientesLista, giroDiario, todasAsLinhas } from './consultas'
import { somarMeses, type MesRef } from './meses'
import { MESES_SEM_GIRO_REATIVA, conhecidoAte, primeiroDiaOperado, quemAtivou, quemParou, type AtivadoDia, type FechadoDia, type ParouDia } from './calendario'

type Row = Record<string, unknown>
const PAGINA = 10000

// Leads fechados (Ganho e Perdido) com a data de fechamento do mês `desde` até o fim do mês `ate`. É o
// mesmo critério dos cartões "Ganhos" e "Perdidos" da aba Mês, então os totais do calendário batem com eles.
// Lead fechado sem data de fechamento não aparece em nenhum dia (já não entrava nos cartões).
export async function leadsFechados(desde: MesRef, ate: MesRef): Promise<{ ganhos: FechadoDia[]; perdidos: FechadoDia[] }> {
  const { db } = await equipe()
  const { data, error } = await db.from('leads').select('id, nome, whatsapp, responsavel, status, motivo_perda, data_fechamento')
    .in('status', ['Ganho', 'Perdido']).gte('data_fechamento', desde).lt('data_fechamento', somarMeses(ate, 1)).order('nome').range(0, PAGINA - 1)
  if (error) falha(error, 'leads')
  const ganhos: FechadoDia[] = [], perdidos: FechadoDia[] = []
  for (const r of (data ?? []) as Row[]) {
    const item: FechadoDia = { id: String(r.id), dia: String(r.data_fechamento).slice(0, 10), nome: String(r.nome ?? ''), whatsapp: str(r.whatsapp), responsavel: str(r.responsavel), motivo: str(r.motivo_perda) }
    if (r.status === 'Ganho') ganhos.push(item); else perdidos.push(item)
  }
  return { ganhos, perdidos }
}

export type ClientesParados = {
  parados: ParouDia[]
  ultimas: { corretora: Corretora; dia: string | null }[]   // até que dia há lote lançado em cada corretora
  conhecidoAte: string | null   // quem girou pela última vez depois deste dia ainda não completou o tempo parado
}

// Clientes que pararam de girar desde `desde`, nas corretoras pedidas: o último dia com lote de cada um
// (clientes_lista com o mês de referência atual, para valer o último giro de verdade, não o de um mês
// passado) e os pregões da corretora desde então (giro_diario), para medir há quantos pregões está parado.
export async function clientesQuePararam(corretoras: Corretora[], desde: string, hoje: string, minimo: number): Promise<ClientesParados> {
  const partes = await Promise.all(corretoras.map(async corretora => {
    const [clientes, giro] = await Promise.all([clientesLista(corretora, null), giroDiario(corretora, desde, hoje)])
    const pregoes = giro.filter(g => g.lotes > 0).map(g => g.dia.slice(0, 10)).sort()
    return { corretora, parados: quemParou(clientes, corretora, pregoes, desde, minimo), ultima: pregoes.at(-1) ?? null, conhecido: conhecidoAte(pregoes, minimo) }
  }))
  return {
    conhecidoAte: partes.map(p => p.conhecido).filter((d): d is string => !!d).sort().at(-1) ?? null,
    parados: partes.flatMap(p => p.parados).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    ultimas: partes.map(p => ({ corretora: p.corretora, dia: p.ultima })),
  }
}

// ── Ativados no mês ────────────────────────────────────────────────────────────
// A lista de clientes de uma corretora num mês, só com as colunas pedidas (a mesma função da tela Clientes)
async function listaDoMes(db: Admin, corretora: Corretora, mes: MesRef, colunas: string): Promise<Row[]> {
  const out: Row[] = []
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await db.rpc('clientes_lista', { p_corretora: corretora, p_mes_ref: mes }).select(colunas).range(offset, offset + PAGINA - 1)
    if (error) falha(error, 'clientes_lista')
    const rows = (data ?? []) as unknown as Row[]
    out.push(...rows)
    if (rows.length < PAGINA) break
  }
  return out
}

const LOTE_DE_IDS = 80
const emLotes = <T,>(xs: T[]): T[][] => Array.from({ length: Math.ceil(xs.length / LOTE_DE_IDS) }, (_, i) => xs.slice(i * LOTE_DE_IDS, (i + 1) * LOTE_DE_IDS))

// Clientes ativados no mês nas corretoras pedidas (conta nova que operou, 1ª operação e quem voltou a operar
// depois de 4 meses), cada um no dia da primeira operação dele no mês. A classificação é a do resultado do
// mês no banco (funil_resultado), feita cliente a cliente: quem operou no mês (clientes_lista do mês) contra
// o último giro de cada um até o fim do mês anterior (clientes_lista do mês anterior). O dia sai dos
// lançamentos desses poucos clientes.
export async function clientesAtivados(corretoras: Corretora[], mes: MesRef, mesesInativo = MESES_SEM_GIRO_REATIVA): Promise<AtivadoDia[]> {
  const { db } = await equipe()
  const anterior = somarMeses(mes, -1), fim = somarMeses(mes, 1)
  const partes = await Promise.all(corretoras.map(async corretora => {
    const [atual, antes] = await Promise.all([
      listaDoMes(db, corretora, mes, 'cliente_id, nome, telefone, responsavel, lotes_mes, data_migracao'),
      listaDoMes(db, corretora, anterior, 'cliente_id, ultimo_giro'),
    ])
    const giroAntes = new Map(antes.map(r => [String(r.cliente_id), str(r.ultimo_giro)]))
    const candidatos = quemAtivou(atual.map(r => ({
      cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), lotes_mes: num(r.lotes_mes), data_migracao: str(r.data_migracao), responsavel: str(r.responsavel), telefone: str(r.telefone),
    })), giroAntes, corretora, mes, mesesInativo)
    if (!candidatos.length) return []
    const lotes = (await Promise.all(emLotes(candidatos.map(c => c.cliente_id)).map(ids => todasAsLinhas<Row>((de, ate) => db.from('lotes')
      .select('cliente_id, data, qtd, zeragem, posicao, acoes').eq('corretora', corretora).in('cliente_id', ids).eq('conta_para_receita', true)
      .gte('data', mes).lt('data', fim).order('id').range(de, ate), 'lotes')))).flat()
    const dia = primeiroDiaOperado(lotes.map(l => ({ cliente_id: str(l.cliente_id), data: String(l.data), qtd: num(l.qtd), zeragem: l.zeragem === true, posicao: l.posicao === true, acoes: l.acoes === true })))
    return candidatos.flatMap(c => { const d = dia.get(c.cliente_id); return d ? [{ ...c, dia: d }] : [] })
  }))
  return partes.flat().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}
