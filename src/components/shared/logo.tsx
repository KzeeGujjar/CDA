import { LogoMark } from "./logo-mark";
import { cn } from "@/utils";

/**
 * The brand's icon-mark badge — a rounded square containing `LogoMark`.
 * This is the one place the mark's container styling lives; every nav/header
 * usage across the app renders this instead of duplicating the markup.
 */
export function Logo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className
      )}
    >
      <LogoMark className={cn("size-4", iconClassName)} />
    </div>
  );
}
