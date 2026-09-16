"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/forms/form-field";
import { dealerships } from "@/constants";
import { dealershipInfo } from "@/lib/dealership-info";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function DealershipSection() {
  const { t } = useTranslation();
  const [nameEn, setNameEn] = useState(dealershipInfo.nameEn);
  const [nameAr, setNameAr] = useState(dealershipInfo.nameAr);
  const [address, setAddress] = useState(dealershipInfo.address);
  const [phone, setPhone] = useState("+971 2 555 0100");
  const [email, setEmail] = useState("info@emcocars.ae");

  function handleSave() {
    toast.success(t("settings.dealership.saved"));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" /> {t("settings.nav.dealership")}
          </CardTitle>
          <CardDescription>{t("settings.dealership.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t("settings.dealership.nameEn")} htmlFor="dealer-name-en">
              <Input id="dealer-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </FormField>
            <FormField label={t("settings.dealership.nameAr")} htmlFor="dealer-name-ar">
              <Input id="dealer-name-ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </FormField>
            <FormField label={t("settings.dealership.phone")} htmlFor="dealer-phone">
              <Input id="dealer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
            <FormField label={t("settings.dealership.email")} htmlFor="dealer-email">
              <Input id="dealer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
          </div>
          <FormField label={t("settings.dealership.address")} htmlFor="dealer-address">
            <Textarea id="dealer-address" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <div>
            <Button size="sm" onClick={handleSave}>
              {t("common.saveChanges")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4" /> {t("settings.dealership.branches")}
          </CardTitle>
          <CardDescription>{t("settings.dealership.branchesSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {dealerships.map((d, i) => (
            <div key={d.id}>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-foreground">{d.name}</span>
                <Button variant="outline" size="sm" onClick={() => toast.info(t("settings.dealership.editComingSoon"))}>
                  {t("common.edit")}
                </Button>
              </div>
              {i < dealerships.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.dealership.hours")}</CardTitle>
          <CardDescription>{t("settings.dealership.hoursSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {days.map((day) => (
            <div key={day} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm text-foreground">{t(`settings.dealership.days.${day}`)}</span>
              <span className="font-mono text-sm text-muted-foreground">
                {day === "fri" ? t("settings.dealership.closed") : "9:00 AM – 9:00 PM"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
