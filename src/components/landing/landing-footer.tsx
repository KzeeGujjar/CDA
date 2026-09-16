"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { Logo } from "@/components/shared/logo";

export function LandingFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t("landing.footer.product"),
      links: [
        { label: t("landing.nav.features"), href: "#features" },
        { label: t("landing.nav.howItWorks"), href: "#how-it-works" },
        { label: t("landing.nav.pricing"), href: "#pricing" },
        { label: t("landing.nav.faq"), href: "#faq" },
      ],
    },
    {
      title: t("landing.footer.company"),
      links: [
        { label: t("landing.footer.about"), href: "#" },
        { label: t("landing.footer.careers"), href: "#" },
        { label: t("landing.footer.contact"), href: "#" },
      ],
    },
    {
      title: t("landing.footer.legal"),
      links: [
        { label: t("landing.footer.privacy"), href: "#" },
        { label: t("landing.footer.terms"), href: "#" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-14 md:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <span className="text-sm font-semibold text-foreground">{t("app.name")}</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">{t("landing.footer.description")}</p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <span className="text-sm font-medium text-foreground">{col.title}</span>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 text-xs text-muted-foreground">
          © {year} {t("app.name")}. {t("landing.footer.rights")}
        </div>
      </div>
    </footer>
  );
}
