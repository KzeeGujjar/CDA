"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/components/shared/currency";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Customer } from "@/types/customer";

export function CustomerCard({ customer }: { customer: Customer }) {
  const { t } = useTranslation();

  return (
    <Link href={`/customers/${customer.id}`}>
      <Card className="h-full border-0 transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={customer.avatarUrl} alt={customer.name} />
              <AvatarFallback>{customer.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-foreground">{customer.name}</span>
              <span className="truncate text-xs text-muted-foreground">{customer.nationality}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 truncate" title={customer.phone}>
              <Phone className="size-3 shrink-0" />
              {customer.phone}
            </span>
            <span className="flex items-center gap-1.5 truncate" title={customer.email}>
              <Mail className="size-3 shrink-0" />
              {customer.email}
            </span>
          </div>

          {customer.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customer.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="border-0 text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
            <span className="text-muted-foreground">{t("customers.lifetimeValue")}</span>
            <span className="font-medium text-foreground">{formatMoney({ amount: customer.lifetimeValue, currency: "AED" })}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
