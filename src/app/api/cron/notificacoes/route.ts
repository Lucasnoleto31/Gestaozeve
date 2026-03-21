import { NextRequest, NextResponse } from 'next/server'
import { rodarEngineNotificacoes } from '@/lib/notificacoes/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Verificação de segurança: só Vercel Cron ou chamada com token correto
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const resultado = await rodarEngineNotificacoes()
    console.log('[cron/notificacoes]', resultado)
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[cron/notificacoes] erro fatal:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
