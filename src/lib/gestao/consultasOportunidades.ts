// Leituras da página Oportunidades (só servidor): a base parada de uma corretora — inativos, migrados
// que nunca giraram e contas em abertura — com os contatos registrados, o patrimônio do cadastro e o que
// o lead respondeu no formulário (já opera? onde?).
import type { Corretora } from '@/lib/corretoras'
import { clientesLista, contatosClientesResumo } from './consultas'
import { equipe, falha, num, str } from './guard'
import { comContatos } from './fila'
import type { ClienteBase } from './oportunidades'

type Row = Record<string, unknown>
const PARADOS = ['Inativo', 'Nunca girou', 'Em processamento']

export async function baseDeOportunidades(corretora: Corretora): Promise<ClienteBase[]> {
  const { db } = await equipe()
  const [lista, contatos, cad, leads] = await Promise.all([
    clientesLista(corretora, null), contatosClientesResumo(corretora),
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
  return comContatos(lista, contatos).filter(c => PARADOS.includes(c.situacao)).map(c => ({
    cliente_id: c.cliente_id, nome: c.nome, telefone: c.telefone, responsavel: c.responsavel, ativador: c.ativador, situacao: c.situacao,
    data_migracao: c.data_migracao, data_entrada: c.data_entrada, lotes_12m: c.lotes_12m, receita_total: c.receita_total, meses_ativos: c.meses_ativos,
    meses_sem_giro: c.meses_sem_giro, ultimo_giro: c.ultimo_giro, contatos: c.contatos, ultimo_contato: c.ultimo_contato,
    patrimonio: patrimonio.get(c.cliente_id) || null, lead_ja_opera: lead.get(c.cliente_id)?.ja_opera ?? null, lead_corretora: lead.get(c.cliente_id)?.corretora ?? null,
  }))
}
