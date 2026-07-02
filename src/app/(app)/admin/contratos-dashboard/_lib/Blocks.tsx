'use client'

// Containers e blocos compartilhados entre as sub-rotas do dashboard.
// (Extraídos do antigo View.tsx monolítico — o resto daquele arquivo era código morto.)

import { useState } from 'react'
import { Download, X } from 'lucide-react'
import type { DiarioProdutoRow, DrilldownRow } from '../actions'
import { WinVsWdoChart } from '../Charts'
import { fmtNum, fmtDataPt } from './utils'

export function Block({ title, subtitle, action, children }:
  { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }
) {
  return (
    <section className="rounded-2xl p-5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

// ===========================================================
// WIN vs WDO diário com média móvel configurável
// ===========================================================
const MM_MIN = 2
const MM_MAX = 90

// Input do período da média móvel — texto livre; o clamp só acontece ao
// confirmar (blur/Enter). Clampar a cada tecla tornava 10-19 impossíveis
// de digitar: o "1" inicial virava 2 e "15" acabava em 25.
function MediaMovelInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState(String(value))

  const valueStr = String(value)
  const [prevValueStr, setPrevValueStr] = useState(valueStr)
  if (valueStr !== prevValueStr) {
    setPrevValueStr(valueStr)
    setTxt(valueStr)
  }

  function commit(raw: string) {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) { setTxt(String(value)); return }
    const clamped = Math.min(MM_MAX, Math.max(MM_MIN, n))
    setTxt(String(clamped))
    onChange(clamped)
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
      <span>Média móvel</span>
      <input
        type="number" inputMode="numeric" min={MM_MIN} max={MM_MAX}
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        className="w-14 rounded-lg px-2 py-1 text-center font-semibold tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/30"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      />
      <span>pregões</span>
    </label>
  )
}

export function WinVsWdoBlock({ data, onClickDia }: { data: DiarioProdutoRow[]; onClickDia: (data: string) => void }) {
  const [mm, setMm] = useState(7)
  return (
    <Block title="Volume diário — WIN vs WDO"
      subtitle={`Lotes operados por pregão. Linha pontilhada = média móvel de ${mm} pregões. Clique num ponto pra abrir o detalhe do dia.`}
      action={<MediaMovelInput value={mm} onChange={setMm} />}
    >
      <WinVsWdoChart data={data} onClickDia={onClickDia} mm={mm} />
    </Block>
  )
}

// ===========================================================
// Drill-down modal (com export PNG via canvas)
// ===========================================================
export function DrilldownModal({ data, rows, onClose }: { data: string; rows: DrilldownRow[]; onClose: () => void }) {
  const totals = rows.find(r => r.tipo === 'totals')
  const top_op = rows.filter(r => r.tipo === 'top_girou').sort((a, b) => a.rank - b.rank)
  const top_ze = rows.filter(r => r.tipo === 'top_zerou').sort((a, b) => a.rank - b.rank)

  function exportPng() {
    const c = document.createElement('canvas')
    c.width = 1200; c.height = 630
    const g = c.getContext('2d')!
    // background gradiente
    const grad = g.createLinearGradient(0, 0, 0, 630)
    grad.addColorStop(0, '#0b1220'); grad.addColorStop(1, '#1e293b')
    g.fillStyle = grad
    g.fillRect(0, 0, c.width, c.height)
    // marca + título
    g.fillStyle = '#26E07F'
    g.fillRect(48, 48, 6, 36)
    g.font = '600 14px sans-serif'
    g.fillStyle = '#94a3b8'
    g.fillText('ZeveAI · Lotes do dia', 64, 62)
    g.font = 'bold 40px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtDataPt(data), 64, 98)
    // totais
    const op = totals?.lotes_operados ?? 0
    const ze = totals?.lotes_zerados ?? 0
    g.font = '600 13px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText('LOTES OPERADOS', 64, 156)
    g.font = 'bold 56px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtNum(op), 64, 210)
    g.font = '600 13px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText('LOTES ZERADOS', 480, 156)
    g.font = 'bold 56px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtNum(ze), 480, 210)
    g.font = '600 13px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText('% ZERAMENTO', 880, 156)
    g.font = 'bold 56px sans-serif'
    g.fillStyle = '#ffffff'
    const pctZ = op > 0 ? (ze / op) * 100 : 0
    g.fillText(`${pctZ.toFixed(1)}%`, 880, 210)
    // separador
    g.fillStyle = '#1e293b'
    g.fillRect(64, 256, c.width - 128, 1)
    // top 3 operou
    g.font = 'bold 18px sans-serif'
    g.fillStyle = '#26E07F'
    g.fillText('TOP 3 · QUEM MAIS GIROU', 64, 296)
    top_op.slice(0, 3).forEach((r, i) => {
      const y = 332 + i * 52
      g.font = 'bold 24px sans-serif'
      g.fillStyle = '#94a3b8'
      g.fillText(`${r.rank}`, 64, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#ffffff'
      g.fillText(r.cliente_nome.slice(0, 32), 100, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#26E07F'
      g.textAlign = 'right'
      g.fillText(fmtNum(r.lotes_operados), 580, y)
      g.textAlign = 'start'
    })
    // top 3 zerou
    g.font = 'bold 18px sans-serif'
    g.fillStyle = '#f87171'
    g.fillText('TOP 3 · QUEM MAIS ZEROU', 640, 296)
    top_ze.slice(0, 3).forEach((r, i) => {
      const y = 332 + i * 52
      g.font = 'bold 24px sans-serif'
      g.fillStyle = '#94a3b8'
      g.fillText(`${r.rank}`, 640, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#ffffff'
      g.fillText(r.cliente_nome.slice(0, 32), 676, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#f87171'
      g.textAlign = 'right'
      g.fillText(fmtNum(r.lotes_zerados), 1136, y)
      g.textAlign = 'start'
    })
    // footer
    g.font = '500 12px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 64, 590)
    c.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lotes-${data}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)' }}>
      <div className="rounded-2xl w-full max-w-3xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Detalhe do dia</p>
            <h3 className="text-xl font-bold text-gray-900">{fmtDataPt(data)}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPng}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> Compartilhar PNG
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Operados</p>
            <p className="text-2xl font-bold text-blue-700 tabular-nums">{fmtNum(totals?.lotes_operados ?? 0)}</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Zerados</p>
            <p className="text-2xl font-bold text-red-700 tabular-nums">{fmtNum(totals?.lotes_zerados ?? 0)}</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">% Zeramento</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {(totals?.lotes_operados ?? 0) > 0
                ? `${(((totals?.lotes_zerados ?? 0) / (totals?.lotes_operados ?? 1)) * 100).toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-widest mb-2">Top 3 — quem mais girou</p>
            <ul className="space-y-1.5">
              {top_op.length === 0 && <li className="text-sm text-gray-400">—</li>}
              {top_op.map(r => (
                <li key={r.rank} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700"><strong>{r.rank}.</strong> {r.cliente_nome}</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{fmtNum(r.lotes_operados)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-700 uppercase tracking-widest mb-2">Top 3 — quem mais zerou</p>
            <ul className="space-y-1.5">
              {top_ze.length === 0 && <li className="text-sm text-gray-400">—</li>}
              {top_ze.map(r => (
                <li key={r.rank} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700"><strong>{r.rank}.</strong> {r.cliente_nome}</span>
                  <span className="font-semibold text-red-700 tabular-nums">{fmtNum(r.lotes_zerados)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
