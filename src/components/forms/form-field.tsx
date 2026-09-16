import { Label } from "@/components/ui/label";
import { cn } from "@/utils";

export function FormField({
  label,
  htmlFor,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <span id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
