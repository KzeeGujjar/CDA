import { useEffect, useState } from "react";

export function useMockStream(fullText: string, active: boolean, speedMs = 12) {
  const [revealedLength, setRevealedLength] = useState(active ? 0 : fullText.length);

  useEffect(() => {
    if (!active) return;
    let index = 0;
    const interval = setInterval(() => {
      index += Math.max(1, Math.round(fullText.length / 120));
      setRevealedLength(Math.min(index, fullText.length));
      if (index >= fullText.length) clearInterval(interval);
    }, speedMs);
    return () => clearInterval(interval);
  }, [fullText, active, speedMs]);

  return active ? fullText.slice(0, revealedLength) : fullText;
}
