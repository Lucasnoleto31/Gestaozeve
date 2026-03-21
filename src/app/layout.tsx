import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ZeveAI — Assessoria de Traders",
  description: "Sistema de gestão para assessoria de investimentos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className={`${geist.className} bg-gray-950 text-gray-900 antialiased h-full`}>
        {children}
      </body>
    </html>
  );
}
