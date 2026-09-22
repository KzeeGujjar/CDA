"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/** An address that does not exist: a clear page with a way back, in the user's language. */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{t("errors.notFoundPage.title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("errors.notFoundPage.description")}</p>
      </div>
      <Button asChild>
        <Link href="/dashboard">{t("errors.page.goDashboard")}</Link>
      </Button>
    </main>
  );
}
