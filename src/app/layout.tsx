import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Geist,
  Geist_Mono,
  Noto_Sans_Arabic,
  Noto_Nastaliq_Urdu,
  Noto_Sans_Devanagari,
} from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { defaultLocale, isLocale, isRtl, LOCALE_COOKIE } from "@/lib/i18n/config";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/lib/branding";

const geistSans = Geist({ variable: "--font-latin", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoArabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "500", "600", "700"] });
const notoUrdu = Noto_Nastaliq_Urdu({ variable: "--font-urdu", subsets: ["arabic"], weight: ["400", "500", "600", "700"] });
const notoDevanagari = Noto_Sans_Devanagari({ variable: "--font-devanagari", subsets: ["devanagari"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} ${notoUrdu.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <LanguageProvider initialLocale={locale}>
                <TooltipProvider>
                  {children}
                  <Toaster position="top-center" />
                </TooltipProvider>
              </LanguageProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
