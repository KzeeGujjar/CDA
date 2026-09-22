"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Contact, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CustomerCard } from "@/components/customers/customer-card";
import { getCustomers } from "@/services/customerService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function CustomersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const {
    data: customers,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => getCustomers({ search: search || undefined }),
  });

  return (
    <>
      <PageHeader
        title={t("customers.title")}
        subtitle={t("customers.subtitle")}
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search")}
              className="w-64 ps-8"
            />
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !customers || customers.length === 0 ? (
        <EmptyState icon={Contact} title={t("common.noResults")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} />
          ))}
        </div>
      )}
    </>
  );
}
