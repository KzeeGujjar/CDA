import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";
import { PageTransition } from "./page-transition";
import { SkipLink } from "./skip-link";
import { QueryErrorBanner } from "./query-error-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <SkipLink />
      <AppSidebar />
      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-8 md:py-8">
          <PageTransition>
            <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
              <QueryErrorBanner />
              {children}
            </div>
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
