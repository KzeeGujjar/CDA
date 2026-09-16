"use client";

import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="motion-reduce:animate-none animate-in fade-in-0 duration-200">
      {children}
    </div>
  );
}
