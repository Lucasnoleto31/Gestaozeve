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
