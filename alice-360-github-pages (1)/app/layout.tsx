import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alice 360 — Diagnóstico CEFR",
  description: "Avaliação multimodal de inglês com parecer narrativo por habilidade, sem nota numérica.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
