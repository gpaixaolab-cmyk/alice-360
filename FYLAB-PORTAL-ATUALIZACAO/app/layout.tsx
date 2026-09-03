import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FYLAB Personal Classes — Portal de Inglês",
  description: "Aulas, progresso e avaliação multimodal de inglês com parecer narrativo por habilidade.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
