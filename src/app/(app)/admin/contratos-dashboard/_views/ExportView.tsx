'use client'

import { useEffect, useState } from 'react'
import { Printer, Smartphone, Square, FileText } from 'lucide-react'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ACTIONS } from '../_lib/dashboardActions'
import { fmtNum, fmtBRL2, fmtDataPt } from '../_lib/utils'
import type { DashboardKpis, MetaAnual } from '../actions'

// Mesma normalização usada no backend (norm_barra) pra casar a barra selecionada
const normBarra = (s: string) =>
  s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Formato = 'story' | 'feed' | 'a4'

const FORMATOS: { id: Formato; label: string; icon: React.ElementType; w: number; h: number }[] = [
  { id: 'story', label: 'WhatsApp / Story (9:16)', icon: Smartphone, w: 1080, h: 1920 },
  { id: 'feed',  label: 'Instagram Feed (1:1)',     icon: Square,     w: 1080, h: 1080 },
  { id: 'a4',    label: 'A4 / Print (210×297)',    icon: FileText,   w: 794,  h: 1123 }, // 96dpi
]

export function ExportView() {
  const { periodo, barra } = useDashboardFilters()
  const [formato, setFormato] = useState<Formato>('story')
  const [escala, setEscala] = useState(0.4)

  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, receita: true, meta: true, alertas: true,
  })

  // Auto-escala pra caber na viewport
  useEffect(() => {
    const fmt = FORMATOS.find(f => f.id === formato)!
    const update = () => {
      const targetW = window.innerWidth - 80
      const targetH = window.innerHeight - 200
      const e = Math.min(targetW / fmt.w, targetH / fmt.h, 1)
      setEscala(Math.max(0.2, e))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [formato])

  const fmt = FORMATOS.find(f => f.id === formato)!

  // Receita coerente com o filtro: com barra selecionada, usa a linha daquela
  // barra em receita-por-assessor (getReceitaTotal é sempre do escritório todo).
  const receitaExibida = barra
    ? d.receitaPorAss.find(r => normBarra(r.barra_nome) === normBarra(barra))?.receita_total ?? null
    : d.receitaTotal?.receita_total ?? null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          {FORMATOS.map(f => {
            const Icon = f.icon
            const active = formato === f.id
            return (
              <button key={f.id} onClick={() => setFormato(f.id)}
                className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                style={active
                  ? { background: 'var(--blue)', color: '#fff' }
                  : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                <Icon className="w-3.5 h-3.5" />{f.label}
              </button>
            )
          })}
        </div>
        <button onClick={() => window.print()}
          className="px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2"
          style={{ background: '#0f172a', color: '#fff' }}>
          <Printer className="w-3.5 h-3.5" /> Imprimir / Salvar PDF
        </button>
      </div>

      <p className="text-xs text-gray-500 print:hidden">
        Pré-visualização escalada em <strong>{Math.round(escala * 100)}%</strong>. Use o botão imprimir pra exportar como PDF, ou tire screenshot do card abaixo.
        Dimensões reais: {fmt.w}×{fmt.h}px.
      </p>

      <div className="flex justify-center">
        <div className="export-print-area" style={{
          transform: `scale(${escala})`,
          transformOrigin: 'top center',
          width: fmt.w,
          height: fmt.h,
          marginBottom: -fmt.h * (1 - escala),
        }}>
          <ExportCard formato={formato} kpis={d.kpis} receita={receitaExibida} meta={d.meta}
            periodo={periodo} barra={barra} alertas={d.alertas.length} />
        </div>
      </div>

      {/* Na impressão: esconde todo o app (header/tabs/filtros) e imprime só o
          card em escala 1:1 fixado no topo da página. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          @page { size: ${fmt.w}px ${fmt.h}px; margin: 0; }
          body * { visibility: hidden; }
          .export-print-area, .export-print-area * { visibility: visible; }
          .export-print-area {
            visibility: visible;
            transform: none !important;
            margin: 0 !important;
            position: fixed;
            top: 0;
            left: 0;
          }
        }
      ` }} />
    </div>
  )
}

function ExportCard({
  formato, kpis, receita, meta, periodo, barra, alertas,
}: {
  formato: Formato
  kpis: DashboardKpis | null
  receita: number | null
  meta: MetaAnual | null
  periodo: string
  barra: string | null
  alertas: number
}) {
  const isStory = formato === 'story'
  const isFeed = formato === 'feed'
  const isA4 = formato === 'a4'

  const titleSize = isStory ? 64 : isFeed ? 56 : 36
  const subSize = isStory ? 28 : isFeed ? 24 : 16
  const kpiTitleSize = isStory ? 32 : isFeed ? 28 : 18
  const kpiValueSize = isStory ? 80 : isFeed ? 64 : 36
  const padding = isStory ? 80 : isFeed ? 60 : 40

  const fmt = FORMATOS.find(f => f.id === formato)!

  return (
    <div className="relative" style={{
      width: fmt.w,
      height: fmt.h,
      background: 'linear-gradient(135deg, #0a1628 0%, #0f1e3a 50%, #0a1628 100%)',
      color: '#fff',
      padding,
      display: 'flex',
      flexDirection: 'column',
      gap: padding * 0.4,
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      {/* Decorativo */}
      <div style={{ position: 'absolute', top: -200, right: -200, width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(23,100,244,0.3) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', bottom: -200, left: -200, width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)' }} />

      {/* Cabeçalho */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{ fontSize: subSize, color: '#94a3b8', fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', margin: 0 }}>
          ZeveAI · Contratos
        </p>
        <h1 style={{ fontSize: titleSize, fontWeight: 800, margin: '8px 0 0', lineHeight: 1.1 }}>
          {isStory && 'Resumo do período'}
          {isFeed && 'Resumo'}
          {isA4 && 'Dashboard de contratos — resumo do período'}
        </h1>
        <p style={{ fontSize: subSize, color: '#cbd5e1', marginTop: 12 }}>
          {periodoLabel(periodo)}{barra ? ` · ${barra}` : ' · todas as barras'}
          {kpis?.dataset_max ? ` · até ${fmtDataPt(kpis.dataset_max)}` : ''}
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isStory ? '1fr 1fr' : '1fr 1fr', gap: padding * 0.3, position: 'relative', zIndex: 1 }}>
        <KpiCard label="Volume operado" value={kpis ? fmtNum(kpis.volume_operados) : '—'} suffix="lotes" titleSize={kpiTitleSize} valueSize={kpiValueSize} accent="#1764f4" />
        <KpiCard label="Volume zerado" value={kpis ? fmtNum(kpis.volume_zerados) : '—'} suffix="lotes" titleSize={kpiTitleSize} valueSize={kpiValueSize} accent="#dc2626" />
        <KpiCard label="Clientes ativos" value={kpis ? fmtNum(kpis.num_clientes_ativos) : '—'} titleSize={kpiTitleSize} valueSize={kpiValueSize} accent="#10b981" />
        <KpiCard label="Receita estimada" value={receita != null ? fmtBRL2(receita) : '—'} titleSize={kpiTitleSize} valueSize={kpiValueSize} accent="#a855f7" />
      </div>

      {/* Meta */}
      {meta && meta.meta_receita > 0 && (
        <div style={{ position: 'relative', zIndex: 1, padding: padding * 0.3, borderRadius: 24, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ fontSize: kpiTitleSize, color: '#94a3b8', margin: 0, fontWeight: 600 }}>
            Meta anual {meta.ano}
          </p>
          <p style={{ fontSize: kpiValueSize * 0.7, fontWeight: 800, margin: '8px 0', color: meta.pct_receita >= 100 ? '#10b981' : '#fff' }}>
            {meta.pct_receita.toFixed(1)}% atingido
          </p>
          <div style={{ width: '100%', height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, meta.pct_receita)}%`, height: '100%',
              background: meta.pct_receita >= 100
                ? 'linear-gradient(90deg, #10b981, #059669)'
                : 'linear-gradient(90deg, #1764f4, #a855f7)' }} />
          </div>
          <p style={{ fontSize: kpiTitleSize * 0.7, color: '#94a3b8', marginTop: 12 }}>
            {fmtBRL2(meta.realizado_receita)} de {fmtBRL2(meta.meta_receita)} · faltam {meta.dias_corridos_restantes} dias
          </p>
        </div>
      )}

      {/* Rodapé */}
      <div style={{ marginTop: 'auto', position: 'relative', zIndex: 1, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: padding * 0.3 }}>
        <p style={{ fontSize: kpiTitleSize * 0.7, color: '#64748b', margin: 0 }}>
          {alertas > 0 ? `${alertas} alerta${alertas > 1 ? 's' : ''} ativo${alertas > 1 ? 's' : ''}` : 'Sem alertas'}
        </p>
        <p style={{ fontSize: kpiTitleSize * 0.7, color: '#64748b', margin: 0 }}>
          gerado em {new Date().toLocaleDateString('pt-BR')}
        </p>
      </div>
    </div>
  )
}

function KpiCard({ label, value, suffix, titleSize, valueSize, accent }: {
  label: string; value: string; suffix?: string; titleSize: number; valueSize: number; accent: string
}) {
  return (
    <div style={{
      padding: 32,
      borderRadius: 24,
      background: 'rgba(255,255,255,0.05)',
      border: `2px solid ${accent}33`,
      borderLeft: `6px solid ${accent}`,
    }}>
      <p style={{ fontSize: titleSize * 0.85, color: '#94a3b8', margin: 0, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ fontSize: valueSize, fontWeight: 800, margin: '8px 0 0', lineHeight: 1, color: '#fff' }}>
        {value}
        {suffix && <span style={{ fontSize: titleSize * 0.7, color: '#64748b', marginLeft: 12 }}>{suffix}</span>}
      </p>
    </div>
  )
}

function periodoLabel(p: string): string {
  const m = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(p)
  if (m) return `${fmtDataPt(m[1])} – ${fmtDataPt(m[2])}`
  switch (p) {
    case '30d': return 'Últimos 30 dias'
    case '60d': return 'Últimos 60 dias'
    case '90d': return 'Últimos 90 dias'
    case 'ano': return 'Ano atual'
    case 'tudo': return 'Histórico completo'
    default: return p
  }
}
