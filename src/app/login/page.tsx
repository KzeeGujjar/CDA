"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Lock, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, isPending } = useAuth();
  const [email, setEmail] = useState("manager@autodesk.ae");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      router.push("/dashboard");
    } catch {
      setError(t("login.error"));
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Car className="size-5" />
          </div>
          <CardTitle>{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label={t("common.email")} htmlFor="login-email">
              <div className="relative">
                <Mail className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ps-8"
                  required
                />
              </div>
            </FormField>
            <FormField label={t("common.password")} htmlFor="login-password" error={error ?? undefined}>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ps-8"
                  required
                />
              </div>
            </FormField>
            <Button type="submit" className="mt-1 w-full" disabled={isPending}>
              {isPending ? t("common.signingIn") : t("common.signIn")}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted-foreground">{t("login.placeholderNotice")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
