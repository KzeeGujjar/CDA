import { Button } from "@/components/ui/button";

export function AiSuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-auto whitespace-normal rounded-full py-1.5 text-start" onClick={onClick}>
      {label}
    </Button>
  );
}
