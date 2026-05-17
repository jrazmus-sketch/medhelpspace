import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { Toaster } from "@/components/ui/sonner";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://medhelpspace.com.br"),
  title: {
    default: "MedHelpSpace Revalida",
    template: "%s | MedHelpSpace",
  },
  description:
    "Plataforma de preparação para o Revalida — questões comentadas, resumos e flashcards.",
  openGraph: {
    siteName: "MedHelpSpace",
    title: "MedHelpSpace Revalida",
    description:
      "Plataforma de preparação para o Revalida — questões comentadas, resumos e flashcards.",
    url: "https://medhelpspace.com.br",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://medhelpspace.com.br/og-image.png",
        width: 1200,
        height: 630,
        alt: "MedHelpSpace Revalida",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MedHelpSpace Revalida",
    description:
      "Plataforma de preparação para o Revalida — questões comentadas, resumos e flashcards.",
    images: ["https://medhelpspace.com.br/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${bricolage.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body
        className="min-h-screen bg-background antialiased"
      >
        <Script id="theme-init" strategy="beforeInteractive" src="/theme-init.js" />
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster richColors position="top-right" />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
