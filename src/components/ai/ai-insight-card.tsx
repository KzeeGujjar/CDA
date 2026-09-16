import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface AIInsightItem {
  id: string;
  icon?: LucideIcon;
  message: string;
}

export function AIInsightCard({
  title,
  icon: TitleIcon = Sparkles,
  items,
  loading,
  loadingRows = 4,
  action,
}: {
  title: string;
  icon?: LucideIcon;
  items: AIInsightItem[];
  loading?: boolean;
  loadingRows?: number;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <TitleIcon className="size-4.5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: loadingRows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : (
          items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <div key={item.id} className="flex items-start gap-3">
                {ItemIcon ? (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-primary">
                    <ItemIcon className="size-3.5" />
                  </div>
                ) : (
                  <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <p className="text-sm leading-relaxed text-foreground">{item.message}</p>
              </div>
            );
          })
        )}
        {!loading && action}
      </CardContent>
    </Card>
  );
}
