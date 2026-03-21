'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type PlataformaRow = {
  cpf?: string
  conta_sinacor?: string
  nome_cliente?: string
  data_receita?: string
  valor?: string
  descricao?: string
}

function parseDateToMes(value: string): string | null {
  const str = String(value).trim()
  // DD/MM/YYYY
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}`
  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`
  // Excel serial
  const serial = Number(value)
  if (!isNaN(serial) && serial > 40000) {
    const d = new Date((serial - 25569) * 86400 * 1000)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
  return null
}

function parseCurrency(value: string): number | null {
  const str = String(value).replace(/[R$\s]/g, '').trim()
  // Formato BR (ex: "1.234,56") → tem vírgula: remove pontos e troca vírgula por ponto
  if (str.includes(',')) {
    const n = parseFloat(str.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }
  // Número decimal já no formato JS/Excel (ex: 1234.56)
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

export async function importarPlataformasAction(rows: PlataformaRow[]) {
  const supabase = createAdminClient()

  const [
    { data: clientes },
    { data: contas },
    { data: barras },
  ] = await Promise.all([
    supabase.from('clientes').select('id, nome, cpf'),
    supabase.from('cliente_contas').select('numero_conta, cliente_id'),
    supabase.from('barras').select('nome, assessor_id, influenciador_id'),
  ])

  const cpfMap    = new Map((clientes ?? []).map((c) => [c.cpf.replace(/\D/g, ''), c.id]))
  const contaMap  = new Map((contas ?? []).map((c) => [String(c.numero_conta).trim(), c.cliente_id]))
  const nomeMap   = new Map((clientes ?? []).map((c) => [c.nome.toLowerCase().trim(), c.id]))
  const barraMap  = new Map((barras ?? []).map((b) => [b.nome.toUpperCase().trim(), b]))

  let ok = 0
  const erros: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const linha = i + 2

    // Resolve barra → assessor + influenciador
    let assessorId: string | null = null
    let influenciadorId: string | null = null
    if (row.assessor) {
      const barra = barraMap.get(String(row.assessor).toUpperCase().trim())
      if (barra) {
        assessorId = barra.assessor_id
        influenciadorId = barra.influenciador_id
      }
    }

    // Resolve cliente: CPF → COD SINACOR → nome
    let clienteId: string | null = null
    if (row.cpf) {
      const cpfLimpo = String(row.cpf).replace(/\D/g, '')
      if (cpfLimpo.length >= 11) clienteId = cpfMap.get(cpfLimpo) ?? null
    }
    if (!clienteId && row.conta_sinacor) {
      clienteId = contaMap.get(String(row.conta_sinacor).trim()) ?? null
    }
    if (!clienteId && row.nome_cliente) {
      clienteId = nomeMap.get(String(row.nome_cliente).toLowerCase().trim()) ?? null
    }

    // Sincronizar assessor/influenciador no cliente se resolvidos via barra
    if (clienteId && (assessorId || influenciadorId)) {
      const update: Record<string, string | null> = {}
      if (assessorId) update.assessor_id = assessorId
      if (influenciadorId) update.influenciador_id = influenciadorId
      await supabase.from('clientes').update(update).eq('id', clienteId)
    }

    // DATA DE RECEITA → YYYY-MM
    const mesReferencia = row.data_receita ? parseDateToMes(String(row.data_receita)) : null
    if (!mesReferencia) {
      erros.push(`Linha ${linha}: DATA DE RECEITA inválida ("${row.data_receita}")`)
      continue
    }

    // DESCRICAO → plataforma
    const plataforma = row.descricao?.trim()
    if (!plataforma) {
      erros.push(`Linha ${linha}: DESCRICAO obrigatória`)
      continue
    }

    // VALOR
    const valor = row.valor ? parseCurrency(String(row.valor)) : null
    if (valor === null) {
      erros.push(`Linha ${linha}: VALOR inválido ("${row.valor}")`)
      continue
    }

    const { error } = await supabase.from('plataformas').insert({
      cliente_id: clienteId,
      plataforma,
      valor,
      mes_referencia: mesReferencia,
    })

    if (error) {
      erros.push(`Linha ${linha} (${row.nome_cliente ?? row.cpf ?? ''}): ${error.message}`)
    } else {
      ok++
    }
  }

  // Detectar o mês mais frequente nos dados importados
  const mesesContados: Record<string, number> = {}
  for (const row of rows) {
    const mes = row.data_receita ? parseDateToMes(String(row.data_receita)) : null
    if (mes) mesesContados[mes] = (mesesContados[mes] ?? 0) + 1
  }
  const mesDetectado = Object.entries(mesesContados).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  revalidatePath('/plataformas')
  return { ok, erros, mes: mesDetectado }
}

export async function deletarPlataformas(ids: string[]) {
  if (!ids.length) return { error: 'Nenhum ID fornecido' }
  const supabase = createAdminClient()
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await supabase.from('plataformas').delete().in('id', ids.slice(i, i + BATCH))
    if (error) return { error: error.message }
  }
  revalidatePath('/plataformas')
  return { ok: true }
}
