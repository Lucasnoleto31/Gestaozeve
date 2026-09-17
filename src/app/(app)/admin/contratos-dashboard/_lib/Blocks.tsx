'use client'

// Blocos compartilhados entre as sub-rotas do dashboard.

import { useState } from 'react'
import { Download } from 'lucide-react'
import type { DiarioProdutoRow, DrilldownRow } from '../actions'
import { WinVsWdoChart } from '../Charts'
import { fmtNum, fmtDataPt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

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
    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted">
      <span>Média móvel</span>
      <input
        type="number" inputMode="numeric" min={MM_MIN} max={MM_MAX}
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        className="field-sm w-14 text-center font-semibold tabular-nums text-fg"
      />
      <span>pregões</span>
    </label>
  )
}

export function WinVsWdoBlock({ data, onClickDia }: { data: DiarioProdutoRow[]; onClickDia: (data: string) => void }) {
  const [mm, setMm] = useState(7)
  return (
    <Panel title="Volume diário — WIN vs WDO"
      subtitle={`Lotes operados por pregão. Linha pontilhada = média móvel de ${mm} pregões. Clique num ponto pra abrir o detalhe do dia.`}
      action={<MediaMovelInput value={mm} onChange={setMm} />}
    >
      <WinVsWdoChart data={data} onClickDia={onClickDia} mm={mm} />
    </Panel>
  )
}

// ===========================================================
// Drill-down do dia (com export PNG via canvas)
// ===========================================================
function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface-2 p-3 text-center">
      <p className="label">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', className)}>{value}</p>
    </div>
  )
}

function Lista({ titulo, rows, valor, tone }: {
  titulo: string; rows: DrilldownRow[]; valor: (r: DrilldownRow) => string; tone: string
}) {
  return (
    <div>
      <p className={cn('label mb-2', tone)}>{titulo}</p>
      <ul className="space-y-1.5">
        {rows.length === 0 && <li className="text-sm text-fg-subtle">—</li>}
        {rows.map(r => (
          <li key={r.rank} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-fg"><strong className="mr-1 text-fg-subtle">{r.rank}.</strong> {r.cliente_nome}</span>
            <span className={cn('shrink-0 font-semibold tabular-nums', tone)}>{valor(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DrilldownModal({ data, rows, onClose }: { data: string; rows: DrilldownRow[]; onClose: () => void }) {
  const totals = rows.find(r => r.tipo === 'totals')
  const top_op = rows.filter(r => r.tipo === 'top_girou').sort((a, b) => a.rank - b.rank)
  const top_ze = rows.filter(r => r.tipo === 'top_zerou').sort((a, b) => a.rank - b.rank)
  const op = totals?.lotes_operados ?? 0
  const ze = totals?.lotes_zerados ?? 0
  const pctZ = op > 0 ? (ze / op) * 100 : 0

  function exportPng() {
    const c = document.createElement('canvas')
    c.width = 1200; c.height = 630
    const g = c.getContext('2d')!
    g.fillStyle = '#0c1526'
    g.fillRect(0, 0, c.width, c.height)
    // marca + título
    g.fillStyle = '#5b8def'
    g.fillRect(48, 48, 6, 36)
    g.font = '600 14px sans-serif'
    g.fillStyle = '#8d9bb5'
    g.fillText('ZeveAI · Lotes do dia', 64, 62)
    g.font = 'bold 40px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtDataPt(data), 64, 98)
    // totais
    const bloco = (label: string, valor: string, x: number) => {
      g.font = '600 13px sans-serif'
      g.fillStyle = '#8d9bb5'
      g.fillText(label, x, 156)
      g.font = 'bold 56px sans-serif'
      g.fillStyle = '#ffffff'
      g.fillText(valor, x, 210)
    }
    bloco('LOTES OPERADOS', fmtNum(op), 64)
    bloco('LOTES ZERADOS', fmtNum(ze), 480)
    bloco('% ZERAMENTO', `${pctZ.toFixed(1)}%`, 880)
    g.fillStyle = 'rgba(255,255,255,0.12)'
    g.fillRect(64, 256, c.width - 128, 1)
    const lista = (titulo: string, cor: string, x: number, xValor: number, linhas: DrilldownRow[], valor: (r: DrilldownRow) => number) => {
      g.font = 'bold 18px sans-serif'
      g.fillStyle = cor
      g.fillText(titulo, x, 296)
      linhas.slice(0, 3).forEach((r, i) => {
        const y = 332 + i * 52
        g.font = 'bold 24px sans-serif'
        g.fillStyle = '#8d9bb5'
        g.fillText(`${r.rank}`, x, y)
        g.font = 'bold 22px sans-serif'
        g.fillStyle = '#ffffff'
        g.fillText(r.cliente_nome.slice(0, 32), x + 36, y)
        g.fillStyle = cor
        g.textAlign = 'right'
        g.fillText(fmtNum(valor(r)), xValor, y)
        g.textAlign = 'start'
      })
    }
    lista('TOP 3 · QUEM MAIS GIROU', '#3dd68c', 64, 580, top_op, r => r.lotes_operados)
    lista('TOP 3 · QUEM MAIS ZEROU', '#f4706b', 640, 1136, top_ze, r => r.lotes_zerados)
    g.font = '500 12px sans-serif'
    g.fillStyle = '#8d9bb5'
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
    <Modal open onClose={onClose} size="xl" title={fmtDataPt(data)} subtitle="Detalhe do pregão: totais e quem mais girou e zerou"
      actions={
        <Button size="sm" variant="secondary" onClick={exportPng}>
          <Download className="h-3.5 w-3.5" /> Baixar PNG
        </Button>
      }>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Tile label="Operados" value={fmtNum(op)} className="text-accent" />
        <Tile label="Zerados" value={fmtNum(ze)} className="text-danger" />
        <Tile label="% zeramento" value={op > 0 ? `${pctZ.toFixed(1)}%` : '—'} className="text-fg" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Lista titulo="Top 3 · quem mais girou" rows={top_op} valor={r => fmtNum(r.lotes_operados)} tone="text-success" />
        <Lista titulo="Top 3 · quem mais zerou" rows={top_ze} valor={r => fmtNum(r.lotes_zerados)} tone="text-danger" />
      </div>
    </Modal>
  )
}
