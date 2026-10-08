import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@/lib/theme'
import { THEME_COOKIE, THEME_INIT_SCRIPT, THEME_PADRAO, isThemePref, type ThemePref } from '@/lib/theme-shared'
import './globals.css'

// Uma família só (ficha padrão): Poppins, com os pesos que a escala usa
const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Zeve Controle',
  description: 'Lotes, barras e receita das corretoras Genial, XP e BTG',
  applicationName: 'Zeve Controle',
  // iPhone: "Adicionar à Tela de Início" abre em tela cheia, com a barra de status sobre o app
  appleWebApp: { capable: true, title: 'Zeve Controle', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',   // usa a tela toda no iPhone (as áreas seguras ficam no CSS)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0b' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O cookie deixa o servidor já mandar a classe certa; o script inline cobre
  // o caso "seguir o sistema" antes da hidratação.
  const store = await cookies()
  const raw = store.get(THEME_COOKIE)?.value
  const initial: ThemePref = isThemePref(raw) ? raw : THEME_PADRAO
  // 'system' só se resolve no cliente; aqui assume o padrão (escuro)
  const dark = initial !== 'light'

  return (
    <html
      lang="pt-BR"
      className={dark ? 'h-full dark' : 'h-full'}
      style={{ colorScheme: dark ? 'dark' : 'light' }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${poppins.className} h-full bg-bg text-fg antialiased`}>
        <ThemeProvider initial={initial}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
