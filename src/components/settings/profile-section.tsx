"use client";

import { useState } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/forms/form-field";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function ProfileSection() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("Sales Manager");
  const [email, setEmail] = useState("manager@autodesk.ae");
  const [phone, setPhone] = useState("+971 50 000 1234");

  function handleSave() {
    toast.success(t("settings.profile.saved"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="size-4" /> {t("settings.nav.profile")}
        </CardTitle>
        <CardDescription>{t("settings.profile.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src="https://i.pravatar.cc/150?u=dealer-admin" alt="Sales manager" />
            <AvatarFallback>SM</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="sm" onClick={() => toast.info(t("settings.profile.avatarComingSoon"))}>
            {t("common.edit")}
          </Button>
        </div>
        <Separator />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("settings.profile.fullName")} htmlFor="full-name">
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
          <FormField label={t("settings.profile.email")} htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label={t("settings.profile.phone")} htmlFor="phone">
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
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
