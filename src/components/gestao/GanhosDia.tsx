'use client'

// Tabela de quem fechou num dia: abre pelo "+N" da faixa de clientes ganhos por dia (Leads) e pela barra
// do dia no gráfico do Funil. Nome, telefone e responsável; a lista já vem pronta da página.
import { Modal } from '@/components/ui/Modal'
import { TRACO, dataCurta } from '@/components/gestao/Celulas'
import { rotuloDia } from '@/lib/gestao/contatos'
import type { GanhoDia } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'

export function ModalGanhosDia({ dia, ganhos, hoje, onClose }: { dia: string | null; ganhos: GanhoDia[]; hoje: string; onClose: () => void }) {
  if (!dia) return null
  const n = ganhos.length
  return (
    <Modal open onClose={onClose} size="lg" title={`Clientes ganhos em ${dataCurta(dia)}`}
      subtitle={`${rotuloDia(dia, hoje)} · ${n === 1 ? '1 lead fechado como Ganho' : `${fmtNum(n)} leads fechados como Ganho`} neste dia. Para editar, abra o lead na tela de Leads.`}>
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead><tr><th>Nome</th><th>Telefone</th><th>Responsável</th></tr></thead>
          <tbody>
            {n === 0 && <tr><td colSpan={3} className="py-8 text-center text-dense text-fg-subtle">Nenhum lead com fechamento neste dia na lista de Leads.</td></tr>}
            {ganhos.map(g => (
              <tr key={g.id}>
                <td className="max-w-[260px] truncate font-medium">{g.nome}</td>
                <td className="num whitespace-nowrap">{g.whatsapp ?? TRACO}</td>
                <td className="muted">{g.responsavel ?? TRACO}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
