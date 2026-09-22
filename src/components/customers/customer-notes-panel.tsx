"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineError } from "@/components/shared/inline-state";
import { addCustomerNote, getCustomerNotes } from "@/services/customerService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function CustomerNotesPanel({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const {
    data: notes,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: () => getCustomerNotes(customerId),
  });

  const mutation = useMutation({
    mutationFn: () => addCustomerNote(customerId, body, "Sales Manager"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
      setBody("");
      toast.success(t("common.saveChanges"));
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          placeholder={t("customers.addNote")}
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={body.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>
            {t("customers.addNote")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <InlineError error={error} onRetry={() => refetch()} />
      ) : !notes || notes.length === 0 ? (
        <EmptyState icon={StickyNote} title={t("common.noResults")} />
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {notes.map((note) => (
            <div key={note.id} className="flex flex-col gap-0.5">
              <p className="text-sm text-foreground">{note.body}</p>
              <span className="text-xs text-muted-foreground">
                {note.authorName} · {new Date(note.createdAt).toLocaleDateString(locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
