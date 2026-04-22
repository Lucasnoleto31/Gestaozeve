'use client'

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function downloadExcel(
  columns: string[],
  rows: (string | number | null)[][],
  filename: string
) {
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows])

  const colWidths = columns.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...rows.map((r) => String(r[i] ?? '').length)
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function downloadPDF(
  columns: string[],
  rows: (string | number | null)[][],
  title: string,
  filename: string
) {
  const orientation = columns.length > 5 ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation })

  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text(title, 14, 16)

  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(
    `Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`,
    14,
    23
  )

  autoTable(doc, {
    head: [columns],
    body: rows.map((r) => r.map((v) => (v === null || v === undefined ? '—' : String(v)))),
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`${filename}.pdf`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _drawPageHeader(doc: any, W: number, title: string, compact = false) {
  if (compact) {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, W, 14, 'F')
    doc.setFillColor(16, 185, 129)
    doc.rect(0, 13, W, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text(title, 10, 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(148, 163, 184)
    doc.text('ZeveAI', W - 10, 9, { align: 'right' })
    return 18
  }
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, W, 48, 'F')
  doc.setFillColor(23, 100, 244)
  doc.rect(0, 0, 5, 48, 'F')
  doc.setFillColor(16, 185, 129)
  doc.rect(0, 46.5, W, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.text(title, 12, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('ZeveAI  •  Relatório Financeiro', 12, 33)
  return 52
}

export function downloadReceitasPDF(
  columns: string[],
  rows: (string | number | null)[][],
  title: string,
  filename: string
) {
  const isLandscape = columns.length > 5
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  // ── Helpers ─────────────────────────────────
  const parseVal = (v: string | number | null): number => {
    if (v == null) return 0
    if (typeof v === 'number') return v
    return parseFloat(String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  }
  const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtShort = (n: number): string => {
    const abs = Math.abs(n), sign = n < 0 ? '-' : ''
    if (abs >= 1_000_000) return `${sign}R$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}R$${(abs / 1_000).toFixed(0)}k`
    return fmtBRL(n)
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' })

  const currencyIdxs = columns.reduce<number[]>((acc, col, i) => {
    if (col.includes('R$')) acc.push(i)
    return acc
  }, [])
  const totals = currencyIdxs.reduce<Record<number, number>>((acc, idx) => {
    acc[idx] = rows.reduce((s, r) => s + parseVal(r[idx]), 0)
    return acc
  }, {})

  const chartColIdx =
    currencyIdxs.find(i =>
      columns[i].toLowerCase().includes('líquido') || columns[i].toLowerCase().includes('liquido')
    ) ?? currencyIdxs[0]

  const isMonthly = columns[0]?.toLowerCase() === 'mês' && rows.length > 1

  // ════════════════════════════════════════════
  // PAGE 1 — SUMMARY
  // ════════════════════════════════════════════

  // Header
  _drawPageHeader(doc, W, title)

  // Date + records meta (below header)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(`${dateStr}   •   ${rows.length} registro${rows.length !== 1 ? 's' : ''}`, 12, 60)

  // Divider
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(12, 64, W - 12, 64)

  let y = 72

  // ── KPI Cards ───────────────────────────────
  if (currencyIdxs.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text('RESUMO FINANCEIRO', 12, y)
    y += 6

    const count = Math.min(currencyIdxs.length, 5)
    const gap = 5
    const cardW = (W - 24 - gap * (count - 1)) / count
    const cardH = 30

    const palette = [
      { ac: [23,100,244],  bg: [239,246,255], bd: [191,219,254], lbl: [71,85,105],  tx: [29,78,216]  },
      { ac: [16,185,129],  bg: [240,253,244], bd: [167,243,208], lbl: [71,85,105],  tx: [5,150,105]  },
      { ac: [245,158,11],  bg: [255,251,235], bd: [253,230,138], lbl: [71,85,105],  tx: [146,64,14]  },
      { ac: [139,92,246],  bg: [245,243,255], bd: [221,214,254], lbl: [71,85,105],  tx: [88,28,135]  },
      { ac: [236,72,153],  bg: [253,242,248], bd: [251,207,232], lbl: [71,85,105],  tx: [157,23,77]  },
    ]

    currencyIdxs.slice(0, 5).forEach((colIdx, i) => {
      const p = palette[i % palette.length]
      const x = 12 + i * (cardW + gap)

      doc.setFillColor(p.bg[0], p.bg[1], p.bg[2])
      doc.rect(x, y, cardW, cardH, 'F')
      doc.setDrawColor(p.bd[0], p.bd[1], p.bd[2])
      doc.setLineWidth(0.4)
      doc.rect(x, y, cardW, cardH, 'S')
      // Left accent bar
      doc.setFillColor(p.ac[0], p.ac[1], p.ac[2])
      doc.rect(x, y, 3, cardH, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(p.lbl[0], p.lbl[1], p.lbl[2])
      doc.text(columns[colIdx].replace(/\s*\(R\$\)/g, ''), x + 6, y + 10)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(p.tx[0], p.tx[1], p.tx[2])
      doc.text(fmtBRL(totals[colIdx]), x + 6, y + 22)
    })

    y += cardH + 14
  }

  // ── Chart ────────────────────────────────────
  if (chartColIdx !== undefined && rows.length > 1) {

    if (isMonthly) {
      // Vertical bar chart
      const values = rows.map(r => parseVal(r[chartColIdx]))
      const maxVal = Math.max(...values)
      const minVal = Math.min(0, ...values)
      const range = maxVal - minVal

      if (range > 0) {
        const plotW = W - 24
        const plotH = 60
        const plotX = 12
        const plotY = y + 14
        const innerH = plotH - 14

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(15, 23, 42)
        doc.text(`EVOLUÇÃO — ${columns[chartColIdx].replace(/\s*\(R\$\)/g, '').toUpperCase()}`, plotX, y + 9)

        // Chart area bg
        doc.setFillColor(248, 250, 252)
        doc.rect(plotX, plotY, plotW, plotH, 'F')

        // Gridlines (4 levels)
        for (let g = 1; g <= 4; g++) {
          const gy = plotY + innerH * (1 - g / 4)
          doc.setDrawColor(226, 232, 240)
          doc.setLineWidth(0.15)
          doc.line(plotX, gy, plotX + plotW, gy)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(5)
          doc.setTextColor(148, 163, 184)
          doc.text(fmtShort(minVal + range * (g / 4)), plotX + 2, gy - 1.5)
        }

        // Zero baseline
        if (minVal < 0) {
          const zeroY = plotY + innerH * (maxVal / range)
          doc.setDrawColor(100, 116, 139)
          doc.setLineWidth(0.5)
          doc.line(plotX, zeroY, plotX + plotW, zeroY)
        }

        const barW = Math.max(3, Math.min(18, plotW / rows.length - 3))
        const spacing = (plotW - barW * rows.length) / (rows.length + 1)

        rows.forEach((row, i) => {
          const val = values[i]
          const bh = Math.max(1, (Math.abs(val) / range) * innerH)
          const baseY = plotY + innerH * (maxVal / range)
          const by = val >= 0 ? baseY - bh : baseY
          const bx = plotX + spacing + i * (barW + spacing)
          const pos = val >= 0

          doc.setFillColor(pos ? 23 : 239, pos ? 100 : 68, pos ? 244 : 68)
          doc.rect(bx, by, barW, bh, 'F')

          // Value on bar (if wide enough)
          if (barW >= 8 && bh > 6) {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(4.5)
            doc.setTextColor(pos ? 29 : 185, pos ? 78 : 28, pos ? 216 : 28)
            doc.text(fmtShort(val), bx + barW / 2, by - 2, { align: 'center' })
          }

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(5)
          doc.setTextColor(100, 116, 139)
          doc.text(String(row[0] ?? '').slice(0, 5), bx + barW / 2, plotY + plotH - 2, { align: 'center' })
        })

        y += plotH + 22
      }

    } else {
      // Horizontal bar chart (top 8)
      const topRows = [...rows]
        .sort((a, b) => parseVal(b[chartColIdx]) - parseVal(a[chartColIdx]))
        .slice(0, Math.min(8, rows.length))
      const maxVal = Math.max(...topRows.map(r => parseVal(r[chartColIdx])))

      if (maxVal > 0) {
        const labelW = Math.min(60, W * 0.32)
        const plotW  = W - 24 - labelW - 6
        const barH   = 8
        const barGap = 5
        const totalChartH = topRows.length * (barH + barGap) + 20

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(15, 23, 42)
        doc.text(`TOP ${topRows.length} — ${columns[chartColIdx].replace(/\s*\(R\$\)/g, '').toUpperCase()}`, 12, y + 9)

        // Chart bg
        doc.setFillColor(248, 250, 252)
        doc.rect(12, y + 12, W - 24, totalChartH - 12, 'F')

        topRows.forEach((row, i) => {
          const val   = parseVal(row[chartColIdx])
          const ratio = val / maxVal
          const bw    = ratio * plotW
          const bx    = 12 + labelW + 6
          const by    = y + 16 + i * (barH + barGap)

          // Label
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6.5)
          doc.setTextColor(30, 41, 59)
          doc.text(String(row[0] ?? '').slice(0, 22), 14, by + barH / 2 + 2.5)

          // Track bg
          doc.setFillColor(226, 232, 240)
          doc.rect(bx, by, plotW, barH, 'F')

          // Bar (solid blue, alpha via rank)
          const r = Math.round(23  + (1 - ratio) * 70)
          const g = Math.round(100 + (1 - ratio) * 55)
          doc.setFillColor(r, g, 244)
          doc.rect(bx, by, Math.max(2, bw), barH, 'F')

          // Value
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.setTextColor(29, 78, 216)
          doc.text(fmtShort(val), bx + Math.max(2, bw) + 2, by + barH / 2 + 2.5)
        })

        y += totalChartH + 8
      }
    }
  }

  // ════════════════════════════════════════════
  // PAGE 2+ — DATA TABLE
  // ════════════════════════════════════════════
  doc.addPage()

  const colStyles = currencyIdxs.reduce<Record<number, { halign: 'right' }>>((acc, i) => {
    acc[i] = { halign: 'right' as const }
    return acc
  }, {})

  const tableStartY = _drawPageHeader(doc, W, title, true)

  autoTable(doc, {
    head: [columns],
    body: rows.map(r => r.map(v => (v == null ? '—' : String(v)))),
    startY: tableStartY,
    styles: {
      fontSize: 8,
      cellPadding: 3.5,
      textColor: [30, 41, 59] as [number, number, number],
    },
    headStyles: {
      fillColor: [23, 100, 244] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 4,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    columnStyles: colStyles,
    tableLineColor: [226, 232, 240] as [number, number, number],
    tableLineWidth: 0.2,
    margin: { left: 10, right: 10 },
    didDrawPage: (data) => {
      if (data.pageNumber === 1) return
      _drawPageHeader(doc, W, title, true)
      // Footer
      doc.setFillColor(15, 23, 42)
      doc.rect(0, H - 11, W, 11, 'F')
      doc.setFillColor(16, 185, 129)
      doc.rect(0, H - 11, W, 1.5, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(148, 163, 184)
      doc.text(`${title}  •  ZeveAI`, 10, H - 3.5)
      doc.text(`Página ${data.pageNumber}`, W - 10, H - 3.5, { align: 'right' })
    },
  })

  // Footer on last page
  doc.setFillColor(15, 23, 42)
  doc.rect(0, H - 11, W, 11, 'F')
  doc.setFillColor(16, 185, 129)
  doc.rect(0, H - 11, W, 1.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text(`${title}  •  ZeveAI`, 10, H - 3.5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.text(`Página ${(doc as any).internal.getNumberOfPages()}`, W - 10, H - 3.5, { align: 'right' })

  doc.save(`${filename}.pdf`)
}
