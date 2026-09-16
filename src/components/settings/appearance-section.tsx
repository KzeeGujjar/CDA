"use client";

import { useTheme } from "next-themes";
import { Laptop, Moon, Sun, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/utils";

const themeOptions: { value: "light" | "dark" | "system"; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Laptop },
];

export function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="size-4" /> {t("settings.nav.appearance")}
        </CardTitle>
        <CardDescription>{t("settings.appearance.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => {
            const isActive = mounted && theme === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border border-border px-4 py-5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5",
                  isActive && "border-primary bg-primary/10 text-primary"
                )}
              >
                <Icon className="size-5" />
                {t(`theme.${option.value}`)}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
