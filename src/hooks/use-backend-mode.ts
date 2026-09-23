import { useEffect, useState } from "react";
import { backendMode } from "@/services/authService";

/**
 * Whether the app is currently talking to the real backend or showing demo data. Most of the UI does not need
 * this — a service already picks the right source on its own — but a few features (uploading a real vehicle
 * photo, for one) have no demo equivalent at all and need to know up front, so they can show an explanatory
 * state instead of letting every action fail with a confusing 401.
 */
export function useBackendMode(): "live" | "demo" | "loading" {
  const [mode, setMode] = useState<"live" | "demo" | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    backendMode().then((result) => {
      if (!cancelled) setMode(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
