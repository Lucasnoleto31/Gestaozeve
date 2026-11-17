'use server'

// Parceiros do cliente (tabela cliente_parceiros, S61): a gravação da lista da ficha. Só o administrador:
// a lista decide quem recebe e quanto. As regras (o que muda e o que fica como histórico) estão em
// parceirosCliente.ts; aqui só a conferência e a escrita.
import { revalidatePath } from 'next/cache'
import { CORRETORA_SLUG } from '@/lib/corretoras'
import { normTexto } from '@/lib/texto'
import { corretoraValida, somenteAdmin } from './guard'
import { parceirosDeParticipacao, parceirosDoCliente } from './consultasParceirosCliente'
import { depoisDoPlano, erroDaSoma, erroDoFormulario, planoDeGravacao, type LinhaForm } from './parceirosCliente'
import { mesAtual } from './meses'

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Grava a lista de parceiros de um cliente numa corretora. `linhas` = os parceiros que estão valendo
// (parceiro, percentual, desde quando); `apagar` = linhas já encerradas para apagar de vez.
export async function salvarParceirosCliente(corretoraIn: string, clienteId: string, linhas: LinhaForm[], apagar: string[] = []): Promise<Resultado<{ gravadas: number }>> {
  try {
    const { db, profile } = await somenteAdmin()
    const corretora = await corretoraValida(corretoraIn)
    if (!UUID.test(clienteId)) return { ok: false, erro: 'Cliente inválido' }
    const [permitidos, atual] = await Promise.all([parceirosDeParticipacao(corretora), parceirosDoCliente(corretora, clienteId)])
    if (!atual.disponivel) return { ok: false, erro: 'A lista de parceiros do cliente ainda não existe no banco: falta rodar o script S61 no Supabase.' }
    // o nome fica com a grafia do cadastro do parceiro
    const enviados: LinhaForm[] = (Array.isArray(linhas) ? linhas : []).map(l => {
      const nome = String(l?.parceiro ?? '').trim()
      return { parceiro: permitidos.find(p => normTexto(p) === normTexto(nome)) ?? nome, pct: Number(l?.pct), desde: String(l?.desde ?? '') }
    })
    const mes = mesAtual()
    const erro = erroDoFormulario(enviados, mes, permitidos)
    if (erro) return { ok: false, erro }
    const plano = planoDeGravacao(atual.linhas, enviados, (Array.isArray(apagar) ? apagar : []).filter(id => UUID.test(String(id))), mes)
    const soma = erroDaSoma(depoisDoPlano(atual.linhas, plano))
    if (soma) return { ok: false, erro: soma }

    // apaga, encerra/corrige e só então insere (o começo de um parceiro é único por cliente e corretora)
    if (plano.apagar.length) {
      const { error } = await db.from('cliente_parceiros').delete().eq('cliente_id', clienteId).eq('corretora', corretora).in('id', plano.apagar)
      if (error) throw new Error(error.message)
    }
    for (const a of plano.atualizar) {
      const campos: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (a.pct !== undefined) campos.pct = a.pct
      if (a.ate !== undefined) campos.ate = a.ate
      const { error } = await db.from('cliente_parceiros').update(campos).eq('cliente_id', clienteId).eq('corretora', corretora).eq('id', a.id)
      if (error) throw new Error(error.message)
    }
    if (plano.inserir.length) {
      const { error } = await db.from('cliente_parceiros').insert(plano.inserir.map(i => ({
        cliente_id: clienteId, corretora, parceiro: i.parceiro, pct: i.pct, desde: i.desde, criado_por: profile.user_id, criado_por_nome: profile.nome,
      })))
      if (error) throw new Error(error.message)
    }
    const gravadas = plano.apagar.length + plano.atualizar.length + plano.inserir.length
    if (gravadas) {
      revalidatePath(`/${CORRETORA_SLUG[corretora]}`, 'layout')
      revalidatePath('/comissoes')
      revalidatePath('/dashboard')
    }
    return { ok: true, dados: { gravadas } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não consegui gravar os parceiros do cliente' }
  }
}
