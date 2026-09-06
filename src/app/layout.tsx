import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Extrinha — Escala 12x36",
    template: "%s · Extrinha",
  },
  description: "Sistema de escala 12x36 e distribuição de plantões extras",
  applicationName: "Extrinha",
  robots: { index: false, follow: false },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#0B4F4A" }],
  },
  openGraph: {
    title: "Extrinha — Escala 12x36",
    description: "Sistema de escala 12x36 e distribuição de plantões extras",
    siteName: "Extrinha",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Extrinha" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Extrinha — Escala 12x36",
    description: "Sistema de escala 12x36 e distribuição de plantões extras",
    images: ["/twitter-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6B4D",
};

/**
 * `await headers()` aqui não serve pra ler nada — o valor é descartado — mas
 * é o que a documentação do Next.js pede pra CSP com nonce funcionar
 * (`src/middleware.ts`/`security-headers.ts`): qualquer rota que não chame
 * uma API dinâmica (`headers()`/`cookies()`/etc.) em algum Server Component
 * da árvore é PRÉ-RENDERIZADA em build time — o HTML (com os `<script>` que
 * o próprio Next injeta) fica fixo, gerado uma vez, sem nonce nenhum
 * correspondente ao CSP daquela requisição específica (que o middleware
 * gera de novo a cada request). Como o layout raiz envolve TODA a árvore,
 * essa chamada força renderização dinâmica em toda a aplicação — o preço
 * de usar CSP com nonce em vez de `unsafe-inline` (achado em uso real:
 * `/login`, sem nenhuma chamada dinâmica própria, era pré-renderizado, e o
 * nonce do HTML nunca batia com o da resposta — script bloqueado sempre,
 * `strict-dynamic` ou não, ver `_conflitos.md`).
 */
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  await headers();
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
