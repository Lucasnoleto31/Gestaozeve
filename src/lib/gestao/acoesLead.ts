'use server'

// Leituras pequenas da ficha do lead que não cabem na lista da tela (a lista vem compacta, sem o retorno).
import { equipeDoLead, falha } from './guard'

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

// O retorno combinado com o lead (leads.proximo_contato, S59), para a frase do topo da ficha; null quando
// não há retorno marcado ou a coluna ainda não existe.
export async function retornoDoLead(leadId: string): Promise<Resultado<string | null>> {
  try {
    const { db } = await equipeDoLead(leadId)
    const { data, error } = await db.from('leads').select('proximo_contato').eq('id', leadId).maybeSingle()
    if (error) {
      if (error.code === '42703' || /proximo_contato/i.test(error.message)) return { ok: true, dados: null }
      falha(error, 'leads')
    }
    const v = (data as { proximo_contato: string | null } | null)?.proximo_contato
    return { ok: true, dados: v ? String(v).slice(0, 10) : null }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não consegui ler o retorno do lead' }
  }
}
