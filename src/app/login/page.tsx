"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, CheckCircle2, Lock, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { requestPasswordReset } from "@/services/authService";
import { errorMessage } from "@/lib/errors/message";
import type { ApiError } from "@/types/common";

/** Why sign-in failed, in words that help: wrong details, account not confirmed, too many attempts, or a service problem. */
function signInMessage(error: unknown, t: (key: string) => string): string {
  if ((error as Partial<ApiError> | null)?.code === "invalid_credentials") return t("login.error");
  return errorMessage(error, t, { showServerText: ["forbidden"], overrides: { unauthenticated: t("login.error") } });
}

function SignInForm({
  onForgotPassword,
  onSignUp,
}: {
  onForgotPassword: (email: string) => void;
  onSignUp: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, isPending } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      router.push("/dashboard");
    } catch (e) {
      setError(signInMessage(e, t));
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label={t("common.email")} htmlFor="login-email">
          <div className="relative">
            <Mail className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
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
          <button
            type="button"
            onClick={() => onForgotPassword(email)}
            className="self-end text-xs font-medium text-primary hover:underline"
          >
            {t("login.forgotPassword")}
          </button>
        </FormField>
        <Button type="submit" className="mt-1 w-full" disabled={isPending}>
          {isPending ? t("common.signingIn") : t("common.signIn")}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("login.noAccount")}{" "}
        <button type="button" onClick={onSignUp} className="font-medium text-primary hover:underline">
          {t("login.signUpLink")}
        </button>
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t("login.placeholderNotice")}</p>
    </>
  );
}

function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail);
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setIsPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CheckCircle2 className="size-5" />
        </div>
        <p className="text-sm text-foreground">{t("login.resetSentMessage").replace("{email}", email)}</p>
        <p className="text-xs text-muted-foreground">{t("login.resetDemoNotice")}</p>
        <Button variant="outline" className="mt-2 w-full" onClick={onBack}>
          {t("login.backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("login.forgotPasswordSubtitle")}</p>
      <FormField label={t("common.email")} htmlFor="reset-email" error={error ?? undefined}>
        <div className="relative">
          <Mail className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ps-8"
            required
          />
        </div>
      </FormField>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("common.signingIn") : t("login.sendResetLink")}
      </Button>
      <button type="button" onClick={onBack} className="text-center text-xs font-medium text-primary hover:underline">
        {t("login.backToSignIn")}
      </button>
    </form>
  );
}

function SignUpForm({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { signUp, isPending } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("login.passwordMismatch"));
      return;
    }
    try {
      await signUp({ name, email, password });
      router.push("/dashboard");
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label={t("common.name")} htmlFor="signup-name">
          <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </FormField>
        <FormField label={t("common.email")} htmlFor="signup-email">
          <div className="relative">
            <Mail className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ps-8"
              required
            />
          </div>
        </FormField>
        <FormField label={t("common.password")} htmlFor="signup-password">
          <div className="relative">
            <Lock className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="ps-8"
              required
            />
          </div>
        </FormField>
        <FormField label={t("login.confirmPassword")} htmlFor="signup-confirm-password" error={error ?? undefined}>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signup-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="ps-8"
              required
            />
          </div>
        </FormField>
        <Button type="submit" className="mt-1 w-full" disabled={isPending}>
          {isPending ? t("common.signingIn") : t("login.createAccount")}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("login.haveAccount")}{" "}
        <button type="button" onClick={onBack} className="font-medium text-primary hover:underline">
          {t("login.signInLink")}
        </button>
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t("login.signUpDemoNotice")}</p>
    </>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<"signIn" | "forgotPassword" | "signUp">("signIn");
  const [resetEmail, setResetEmail] = useState("");

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Car className="size-5" />
          </div>
          <CardTitle>
            {view === "signIn" && t("login.title")}
            {view === "forgotPassword" && t("login.forgotPasswordTitle")}
            {view === "signUp" && t("login.signUpTitle")}
          </CardTitle>
          {view === "signIn" && <CardDescription>{t("login.subtitle")}</CardDescription>}
        </CardHeader>
        <CardContent>
          {view === "signIn" && (
            <SignInForm
              onForgotPassword={(email) => {
                setResetEmail(email);
                setView("forgotPassword");
              }}
              onSignUp={() => setView("signUp")}
            />
          )}
          {view === "forgotPassword" && (
            <ForgotPasswordForm initialEmail={resetEmail} onBack={() => setView("signIn")} />
          )}
          {view === "signUp" && <SignUpForm onBack={() => setView("signIn")} />}
        </CardContent>
      </Card>
    </div>
  );
}
