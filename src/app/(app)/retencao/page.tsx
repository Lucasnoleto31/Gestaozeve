export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { AlertOctagon, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { calcularRiscoChurn } from '@/lib/chs/calculator'
import { Tendencia } from '@/types/cliente'
import { RiscoTable } from './RiscoTable'

export default async function RetencaoPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('clientes')
    .select(`
      id, nome, status, telefone, updated_at,
      assessor:profiles(nome),
      influenciador:influenciadores(nome, codigo),
      ultimo_score:cliente_scores(score_total, classificacao, tendencia),
      dados_chs:cliente_dados_chs(ultima_operacao)
    `)
    .in('status', ['ativo', 'inativo'])
    .order('created_at', { referencedTable: 'cliente_scores', ascending: false })
    .limit(1, { referencedTable: 'cliente_scores' })

  const clientes = (raw ?? []).map((c) => {
    const score = (c.ultimo_score as any[])?.[0] ?? null
    const chs = (c.dados_chs as any[])?.[0] ?? null
    const ultimaOperacao = chs?.ultima_operacao ?? null
    const diasSemOperar = ultimaOperacao
      ? Math.floor((Date.now() - new Date(ultimaOperacao).getTime()) / 86400000)
      : null
    const risco = calcularRiscoChurn(
      score?.score_total ?? null,
      ultimaOperacao,
      (score?.tendencia as Tendencia) ?? null,
    )
    return {
      id: c.id,
      nome: c.nome,
      status: c.status,
      telefone: c.telefone ?? null,
      updatedAt: c.updated_at,
      score: score?.score_total ?? null,
      classificacao: score?.classificacao ?? null,
      tendencia: score?.tendencia ?? null,
      diasSemOperar,
      risco,
      assessor: (c.assessor as any)?.nome ?? null,
      influenciador: (c.influenciador as any)?.nome ?? null,
    }
  })

  const ativos = clientes.filter((c) => c.status === 'ativo')
  const inativos = clientes.filter((c) => c.status === 'inativo')
  const limite90 = Date.now() - 90 * 86400000
  const recuperaveis = inativos
    .filter((c) => new Date(c.updatedAt).getTime() > limite90)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const riscoAlto = ativos.filter((c) => c.risco.nivel === 'alto').sort((a, b) => b.risco.percentual - a.risco.percentual)
  const riscoMedio = ativos.filter((c) => c.risco.nivel === 'medio').sort((a, b) => b.risco.percentual - a.risco.percentual)
  const saudaveis = ativos.filter((c) => c.risco.nivel === 'baixo')

  const dist = {
    saudavel: ativos.filter((c) => c.classificacao === 'saudavel').length,
    atencao: ativos.filter((c) => c.classificacao === 'atencao').length,
    risco: ativos.filter((c) => c.classificacao === 'risco').length,
    sem_score: ativos.filter((c) => c.classificacao === null).length,
  }
  const totalAtivos = ativos.length || 1

  return (
    <div>
      <Header title="Retenção de Clientes" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Gestão
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Retenção de Clientes</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Monitore o risco de churn e identifique clientes recuperáveis
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Risco Alto',   value: riscoAlto.length },
              { label: 'Em Atenção',   value: riscoMedio.length },
              { label: 'Saudáveis',    value: saudaveis.length },
              { label: 'Recuperáveis', value: recuperaveis.length },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3 text-center"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1 leading-tight">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 space-y-6">
        {/* Distribuição CHS */}
        <div
          className="rounded-2xl p-5"
          style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Saúde da carteira — distribuição CHS dos clientes ativos</h3>
          <div className="space-y-3">
            {[
              { label: 'Saudável  ≥80',  count: dist.saudavel,  color: 'bg-emerald-500', text: 'text-emerald-600' },
              { label: 'Atenção (50–79)', count: dist.atencao,   color: 'bg-amber-500',   text: 'text-amber-600' },
              { label: 'Risco (<50)',     count: dist.risco,     color: 'bg-red-500',     text: 'text-red-600' },
              { label: 'Sem score',       count: dist.sem_score, color: 'bg-gray-300',    text: 'text-gray-500' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-36 flex-shrink-0">{row.label}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className={`h-full rounded-full ${row.color} transition-all`} style={{ width: `${(row.count / totalAtivos) * 100}%` }} />
                </div>
                <span className={`text-xs font-bold w-8 text-right ${row.text}`}>{row.count}</span>
                <span className="text-xs text-gray-400 w-10 text-right">{Math.round((row.count / totalAtivos) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>

        <RiscoTable clientes={riscoAlto} titulo="Risco Alto — Ação Imediata" emptyMsg="Nenhum cliente em risco alto no momento." />
        <RiscoTable clientes={riscoMedio} titulo="Em Atenção — Monitorar" emptyMsg="Nenhum cliente em atenção no momento." />

        {recuperaveis.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: '#FFFFFF', border: '1px solid rgba(23,100,244,0.2)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Clientes Recuperáveis</h3>
                <p className="text-xs text-gray-500 mt-0.5">Inativos há menos de 90 dias com janela de reativação aberta</p>
              </div>
              <span className="text-xs text-gray-500">{recuperaveis.length} cliente{recuperaveis.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Assessor</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">CHS</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Inativo há</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {recuperaveis.map((c) => {
                    const diasInativo = Math.floor((Date.now() - new Date(c.updatedAt).getTime()) / 86400000)
                    const tel = c.telefone?.replace(/\D/g, '')
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="px-4 py-3">
                          <a href={`/clientes/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                            {c.nome}
                          </a>
                          {c.influenciador && (
                            <p className="text-xs text-blue-600 mt-0.5">via {c.influenciador}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{c.assessor ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${c.score !== null && c.score >= 80 ? 'text-emerald-600' : c.score !== null && c.score >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                            {c.score ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${diasInativo > 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {diasInativo} dia{diasInativo !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {tel && (
                            <a href={`https://wa.me/55${tel}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors">
                              WhatsApp
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
