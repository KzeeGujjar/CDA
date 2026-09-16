"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/forms/form-field";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function TaxSection() {
  const { t } = useTranslation();
  const [vatRate, setVatRate] = useState("5");
  const [trn, setTrn] = useState("100234567800003");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);

  function handleSave() {
    toast.success(t("settings.tax.saved"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="size-4" /> {t("settings.nav.tax")}
        </CardTitle>
        <CardDescription>{t("settings.tax.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("settings.tax.vatRate")} htmlFor="vat-rate">
            <Input id="vat-rate" type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          </FormField>
          <FormField label={t("settings.tax.trn")} htmlFor="trn">
            <Input id="trn" value={trn} onChange={(e) => setTrn(e.target.value)} className="font-mono" />
          </FormField>
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{t("settings.tax.pricesIncludeTax")}</span>
            <span className="text-xs text-muted-foreground">{t("settings.tax.pricesIncludeTaxDescription")}</span>
          </div>
          <Switch checked={pricesIncludeTax} onCheckedChange={setPricesIncludeTax} />
        </div>
        <div>
          <Button size="sm" onClick={handleSave}>
            {t("common.saveChanges")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
