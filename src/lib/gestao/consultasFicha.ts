// Leituras extras da ficha do cliente (só servidor): o mesmo cliente nas outras corretoras e o lead
// de onde ele veio. A ficha em si (resumo, contas, extrato…) é clienteFicha, em consultas.ts.
import { CORRETORAS, podeVerCorretora, type Corretora } from '@/lib/corretoras'
import { mapCliente } from './consultas'
import { equipe, falha, str } from './guard'
import type { ClienteRow } from './tipos'

type Row = Record<string, unknown>

export type ClienteEmOutra = { corretora: Corretora; resumo: ClienteRow }

// O mesmo cliente (um cadastro por CPF/CNPJ) nas outras corretoras que o usuário pode ver: situação e
// giro no mês de referência de cada uma. Serve para saber se quem não gira aqui gira lá.
export async function clienteNasOutrasCorretoras(atual: Corretora, clienteId: string): Promise<ClienteEmOutra[]> {
  const { db, profile } = await equipe()
  const outras = CORRETORAS.filter(c => c !== atual && podeVerCorretora(profile, c))
  const achados = await Promise.all(outras.map(async corretora => {
    const { data, error } = await db.rpc('clientes_lista', { p_corretora: corretora, p_mes_ref: null, p_cliente_id: clienteId })
    if (error) falha(error, 'clientes_lista')
    const linha = ((data ?? []) as Row[])[0]
    return linha ? { corretora, resumo: mapCliente(linha) } : null
  }))
  return achados.filter((x): x is ClienteEmOutra => x != null)
}

export type LeadDoCliente = {
  id: string
  data_hora: string
  origem: string | null
  ja_opera: string | null            // resposta do formulário: "Sim, já opero", "Já operei e parei"…
  corretora: string | null           // onde opera, segundo o formulário
  responsavel: string | null
  status: string
  observacoes: string | null
}

// Os leads ligados ao cliente, do mais recente para o mais antigo (quase sempre um)
export async function leadsDoCliente(clienteId: string): Promise<LeadDoCliente[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('leads').select('id, data_hora, origem, ja_opera, corretora, responsavel, status, observacoes')
    .eq('cliente_id', clienteId).order('data_hora', { ascending: false }).limit(5)
  if (error) falha(error, 'leads')
  return ((data ?? []) as Row[]).map(l => ({
    id: String(l.id), data_hora: String(l.data_hora), origem: str(l.origem), ja_opera: str(l.ja_opera), corretora: str(l.corretora),
    responsavel: str(l.responsavel), status: String(l.status ?? 'Novo'), observacoes: str(l.observacoes),
  }))
}
