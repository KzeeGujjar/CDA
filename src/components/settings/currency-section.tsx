"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/forms/form-field";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/components/shared/currency";
import { convertFromAed, primaryCurrency, supportedCurrencies } from "@/lib/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Currency } from "@/types/common";

const sampleAedAmount = 245_000;

export function CurrencySection() {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState<Currency>(primaryCurrency);
  const [format, setFormat] = useState("symbol");
  const [roundPrices, setRoundPrices] = useState(true);

  function handleSave() {
    toast.success(t("settings.currency.saved"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="size-4" /> {t("settings.nav.currency")}
        </CardTitle>
        <CardDescription>{t("settings.currency.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("settings.currency.defaultCurrency")} htmlFor="currency-default">
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger id="currency-default" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="inline-flex items-center gap-2">
                      {c === "AED" ? "AED — UAE Dirham" : "USD — US Dollar"}
                      {c === primaryCurrency ? (
                        <Badge variant="secondary" className="border-0 bg-primary/10 text-primary">
                          {t("settings.currency.primary")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="border-0">
                          {t("settings.currency.ready")}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("settings.currency.displayFormat")} htmlFor="currency-format">
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger id="currency-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="symbol">AED 245,000</SelectItem>
                <SelectItem value="code">245,000 AED</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{t("settings.currency.roundPrices")}</span>
            <span className="text-xs text-muted-foreground">{t("settings.currency.roundPricesDescription")}</span>
          </div>
          <Switch checked={roundPrices} onCheckedChange={setRoundPrices} />
        </div>
        <Separator />
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4">
          <span className="text-sm font-medium text-foreground">{t("settings.currency.previewTitle")}</span>
          <span className="text-xs text-muted-foreground">{t("settings.currency.previewDescription")}</span>
          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-sm">
            <span className="text-foreground">{formatMoney({ amount: sampleAedAmount, currency: "AED" })}</span>
            <span className="text-muted-foreground">≈</span>
            <span className="text-primary">{formatMoney({ amount: convertFromAed(sampleAedAmount, "USD"), currency: "USD" })}</span>
          </div>
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
