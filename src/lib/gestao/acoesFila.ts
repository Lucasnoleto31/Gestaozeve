'use server'

// Escritas da fila do dia: registrar um contato (com o próximo combinado) e marcar ou desmarcar o
// retorno de um lead ou de um cliente. As fichas (ContatosLead, ContatosCliente) usam as mesmas ações.
import { revalidatePath } from 'next/cache'
import { corretoraValida, equipe, equipeDoLead, falha, num } from './guard'
import { funcaoAusente } from './consultas'
import { ehIso } from './meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import type { Resultado } from './tipos'

export type AlvoFila = { tipo: 'lead'; id: string } | { tipo: 'cliente'; id: string; corretora: string }
export type ContatoCampos = { data?: string | null; nota?: string | null; proximo?: string | null; status?: string | null }

const SEM_S59 = 'Próximo contato ainda não ativado no banco: rode a S59 no Supabase'

async function tentar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}

function revalidar(alvo: AlvoFila) {
  revalidatePath('/fila')
  revalidatePath('/leads', 'layout')
  revalidatePath('/funil')
  if (alvo.tipo === 'cliente' && isCorretora(alvo.corretora)) revalidatePath(`/${CORRETORA_SLUG[alvo.corretora]}`, 'layout')
}

// Registra o contato (data, nota, novo status do lead) e o próximo combinado. Sem a S59 a função do
// banco não tem p_proximo (a API responde "função não encontrada"): registra como antes, sem o próximo.
export async function registrarContato(alvo: AlvoFila, campos: ContatoCampos) {
  return tentar(async () => {
    const hoje = fmtDate(hojeBrasil())
    const dia = campos.data && ehIso(campos.data) ? campos.data : hoje
    if (dia > hoje) throw new Error('A data do contato não pode ser futura')
    const proximo = campos.proximo && ehIso(campos.proximo) ? campos.proximo : null
    if (proximo && proximo <= dia) throw new Error('O próximo contato tem de ser depois deste')
    const nota = campos.nota?.trim() || null
    if (alvo.tipo === 'lead') {
      const { db, profile } = await equipeDoLead(alvo.id)
      const args = { p_lead_id: alvo.id, p_data: dia, p_nota: nota, p_status: campos.status?.trim() || null, p_criado_por: profile.user_id, p_criado_por_nome: profile.nome }
      let r = await db.rpc('registrar_contato_lead', { ...args, p_proximo: proximo })
      if (r.error && funcaoAusente(r.error)) {
        if (proximo) throw new Error(SEM_S59)
        r = await db.rpc('registrar_contato_lead', args)
      }
      if (r.error) falha(r.error, 'registrar_contato_lead')
      revalidar(alvo)
      return { contatos: num(r.data), proximo }
    }
    const corretora = await corretoraValida(alvo.corretora)
    const { db, profile } = await equipe()
    const args = { p_cliente_id: alvo.id, p_corretora: corretora, p_data: dia, p_nota: nota, p_criado_por: profile.user_id, p_criado_por_nome: profile.nome }
    let r = await db.rpc('registrar_contato_cliente', { ...args, p_proximo: proximo })
    if (r.error && funcaoAusente(r.error)) {
      if (proximo) throw new Error(SEM_S59)
      r = await db.rpc('registrar_contato_cliente', args)
    }
    if (r.error) falha(r.error, 'registrar_contato_cliente')
    revalidar(alvo)
    return { contatos: num(r.data), proximo }
  })
}

// Marca (data) ou desmarca (null) o próximo contato sem registrar contato
export async function agendarContato(alvo: AlvoFila, data: string | null) {
  return tentar(async () => {
    const hoje = fmtDate(hojeBrasil())
    const dia = data && ehIso(data) ? data : null
    if (data && !dia) throw new Error('Data inválida')
    if (dia && dia < hoje) throw new Error('A data do próximo contato já passou')
    if (alvo.tipo === 'lead') {
      const { db } = await equipeDoLead(alvo.id)
      const { error } = await db.rpc('agendar_contato_lead', { p_lead_id: alvo.id, p_data: dia })
      if (error) { if (funcaoAusente(error)) throw new Error(SEM_S59); falha(error, 'agendar_contato_lead') }
    } else {
      const corretora = await corretoraValida(alvo.corretora)
      const { db } = await equipe()
      const { error } = await db.rpc('agendar_contato_cliente', { p_cliente_id: alvo.id, p_corretora: corretora, p_data: dia })
      if (error) { if (funcaoAusente(error)) throw new Error(SEM_S59); falha(error, 'agendar_contato_cliente') }
    }
    revalidar(alvo)
    return { proximo: dia }
  })
}
