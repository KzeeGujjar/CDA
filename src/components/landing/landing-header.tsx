"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { Logo } from "@/components/shared/logo";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const navLinks = [
  { href: "#features", key: "features" },
  { href: "#how-it-works", key: "howItWorks" },
  { href: "#pricing", key: "pricing" },
  { href: "#faq", key: "faq" },
] as const;

export function LandingHeader() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold text-foreground">{t("app.name")}</span>
        </Link>

        <nav className="ms-6 hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a key={link.key} href={link.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {t(`landing.nav.${link.key}`)}
            </a>
          ))}
        </nav>

        <div className="ms-auto hidden items-center gap-2 md:flex">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">{t("landing.nav.signIn")}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard">{t("landing.nav.cta")}</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ms-auto md:hidden"
          aria-label={t("common.openNavigation")}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {open && (
        <div className="border-t border-border px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t(`landing.nav.${link.key}`)}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="outline" asChild>
              <Link href="/login">{t("landing.nav.signIn")}</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">{t("landing.nav.cta")}</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
