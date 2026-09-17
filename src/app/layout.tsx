import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@/lib/theme'
import { THEME_COOKIE, THEME_INIT_SCRIPT, isThemePref, type ThemePref } from '@/lib/theme-shared'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ZeveAI · Controle de Lotes',
  description: 'Lotes, barras e receita das corretoras Genial, XP e BTG',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O cookie deixa o servidor já mandar a classe certa; o script inline cobre
  // o caso "seguir o sistema" antes da hidratação.
  const store = await cookies()
  const raw = store.get(THEME_COOKIE)?.value
  const initial: ThemePref = isThemePref(raw) ? raw : 'system'
  const dark = initial === 'dark'

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
      <body className={`${geist.className} h-full bg-bg text-fg antialiased`}>
        <ThemeProvider initial={initial}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
