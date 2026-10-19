'use client'

// Gráfico de clientes ganhos por dia do mês (Funil, bloco Ritmo): clicar na barra de um dia abre a lista
// de quem fechou nele (nome, telefone e responsável). A página manda os dias e os ganhos do mês prontos.
import { useState } from 'react'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { ModalGanhosDia } from '@/components/gestao/GanhosDia'
import { ganhosDoDia } from '@/lib/gestao/contatos'
import type { GanhoDia, LeadDiaRow } from '@/lib/gestao/tipos'

export function GanhosDoMes({ dias, ganhos, hoje }: { dias: LeadDiaRow[]; ganhos: GanhoDia[]; hoje: string }) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  return (
    <>
      <div className="cursor-pointer">
        <GraficoSeries dados={dias.map(d => ({ label: d.dia.slice(8, 10), ganhos: d.ganhos, contas: d.contas_abertas }))}
          series={[{ key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'gain' }, { key: 'contas', nome: 'Contas abertas', tipo: 'bar', cor: 'neutral' }]} altura={200}
          aoClicar={i => { const d = dias[i]; if (d && d.ganhos > 0) setDiaAberto(d.dia) }} />
      </div>
      <p className="mt-2 text-micro text-fg-subtle">Clique na barra de um dia para ver quem fechou nele.</p>
      <ModalGanhosDia dia={diaAberto} ganhos={diaAberto ? ganhosDoDia(ganhos, diaAberto) : []} hoje={hoje} onClose={() => setDiaAberto(null)} />
    </>
  )
}
