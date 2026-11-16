'use server'

// Grava as regras de participação de parceiros na receita (parâmetro parceiros_receita da corretora),
// editadas em Parâmetros. O formato e a conta ficam em participacao.ts; as leituras, em consultasParticipacao.ts.
import { revalidatePath } from 'next/cache'
import { corretoraValida, falha, somenteAdmin } from './guard'
import { CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, textoParceirosReceita } from './participacao'
import { CORRETORA_SLUG } from '@/lib/corretoras'
import type { Resultado } from './tipos'

const DESCRICAO = 'Parceiros com participação na receita dos clientes deles — "nome:% da corretagem:% da zeragem:% do incentivo:desde AAAA-MM" separados por ; (os clientes são os dos assessores com esse parceiro)'

// Valor vazio apaga as regras da corretora. A regra só muda a leitura de Comissões e do extrato: os lotes
// não são recalculados. Devolve o texto como ficou gravado (a forma canônica), para o campo mostrar.
export async function salvarParceirosReceita(corretoraIn: string, valor: string): Promise<Resultado<{ regras: number; valor: string }>> {
  try {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const v = valor.trim()
    const regras = lerParceirosReceita(v)
    if (v && regras.length === 0) throw new Error('Use "nome:% da corretagem:% da zeragem:% do incentivo:desde AAAA-MM", separados por ; — por exemplo: Fabio PTAX:100:100:50:2026-11')
    const gravado = textoParceirosReceita(regras)
    if (!v) {
      const { error } = await db.from('parametros').delete().eq('corretora', corretora).eq('chave', CHAVE_PARCEIROS_RECEITA)
      if (error) falha(error, 'parametros')
    } else {
      const { error } = await db.from('parametros').upsert(
        { corretora, chave: CHAVE_PARCEIROS_RECEITA, valor: gravado, descricao: DESCRICAO, updated_at: new Date().toISOString() },
        { onConflict: 'corretora,chave' },
      )
      if (error) falha(error, 'parametros')
    }
    revalidatePath(`/${CORRETORA_SLUG[corretora]}/parametros`)
    revalidatePath('/comissoes')
    return { ok: true, dados: { regras: regras.length, valor: gravado } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}
