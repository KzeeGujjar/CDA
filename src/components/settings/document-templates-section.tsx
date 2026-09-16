"use client";

import { toast } from "sonner";
import { FileStack } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { documentTypeMeta, documentTypes } from "@/lib/document-type-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function DocumentTemplatesSection() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileStack className="size-4" /> {t("settings.nav.documentTemplates")}
        </CardTitle>
        <CardDescription>{t("settings.documentTemplates.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {documentTypes.map((dt, i) => {
          const meta = documentTypeMeta[dt];
          const Icon = meta.icon;
          return (
            <div key={dt}>
              <div className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{t(`contractsDocuments.types.${meta.labelKey}`)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(t("settings.documentTemplates.editComingSoon"))}
                >
                  {t("settings.documentTemplates.editTemplate")}
                </Button>
              </div>
              {i < documentTypes.length - 1 && <Separator />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
