// Leituras da página Oportunidades (só servidor): a base de uma corretora que pode render mais — em
// risco, inativos, migrados que nunca operaram e contas em abertura (os grupos da tela Clientes, menos
// quem está operando normalmente e quem recusou) — com os contatos registrados, o patrimônio do cadastro,
// o que o lead respondeu no formulário (já opera? onde?) e o giro de cada um nas outras corretoras.
import type { Corretora } from '@/lib/corretoras'
import { clientesLista, contatosClientesResumo } from './consultas'
import { giroNasOutrasCorretoras } from './consultasGiroFora'
import { equipe, falha, num, str } from './guard'
import { comContatos } from './fila'
import { momentoDoCliente } from './momentoCliente'
import type { ClienteBase } from './oportunidades'

type Row = Record<string, unknown>

export async function baseDeOportunidades(corretora: Corretora): Promise<ClienteBase[]> {
  const { db } = await equipe()
  const [lista, contatos, fora, cad, leads] = await Promise.all([
    clientesLista(corretora, null), contatosClientesResumo(corretora), giroNasOutrasCorretoras(corretora),
    db.from('clientes').select('id, patrimonio').not('patrimonio', 'is', null).range(0, 9999),
    db.from('leads').select('cliente_id, ja_opera, corretora, data_hora').not('cliente_id', 'is', null).order('data_hora', { ascending: false }).range(0, 9999),
  ])
  if (cad.error) falha(cad.error, 'clientes')
  if (leads.error) falha(leads.error, 'leads')
  const patrimonio = new Map(((cad.data ?? []) as Row[]).map(r => [String(r.id), num(r.patrimonio)]))
  // um cliente pode ter mais de um lead: vale o mais recente (a lista vem do mais novo para o mais antigo)
  const lead = new Map<string, { ja_opera: string | null; corretora: string | null }>()
  for (const l of (leads.data ?? []) as Row[]) {
    const id = String(l.cliente_id)
    if (!lead.has(id)) lead.set(id, { ja_opera: str(l.ja_opera), corretora: str(l.corretora) })
  }
  const temOportunidade = (c: { situacao: string; risco: string | null; lotes_media_3m: number }) => { const g = momentoDoCliente(c); return g !== 'operando' && g !== 'recusou' }
  return comContatos(lista, contatos).filter(temOportunidade).map(c => ({
    cliente_id: c.cliente_id, nome: c.nome, telefone: c.telefone, responsavel: c.responsavel, ativador: c.ativador, situacao: c.situacao,
    risco: c.risco, dias_sem_giro: c.dias_sem_giro, lotes_mes: c.lotes_mes, lotes_media_3m: c.lotes_media_3m,
    data_migracao: c.data_migracao, data_entrada: c.data_entrada, lotes_12m: c.lotes_12m, receita_total: c.receita_total, meses_ativos: c.meses_ativos,
    meses_sem_giro: c.meses_sem_giro, ultimo_giro: c.ultimo_giro, contatos: c.contatos, ultimo_contato: c.ultimo_contato,
    patrimonio: patrimonio.get(c.cliente_id) || null, lead_ja_opera: lead.get(c.cliente_id)?.ja_opera ?? null, lead_corretora: lead.get(c.cliente_id)?.corretora ?? null,
    fora: fora.get(c.cliente_id) ?? null,
  }))
}
