import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off ESLint formatting rules that would conflict with Prettier —
  // Prettier owns formatting, ESLint owns everything else.
  prettierConfig,
  // ---- Multi-tenancy guard rails -------------------------------------------------------------
  // 1. The owner-role (RLS-bypassing) client and raw client factory are only for code that runs
  //    before a tenant is known or spans tenants. Feature code must use withTenant().
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/server/db/**",
      "src/server/auth/**",
      "src/server/http/**",
      "src/server/platform/**",
      // The one module allowed to talk to Supabase Storage (and to hold its service-role key).
      "src/server/storage/**",
      // The one module allowed to talk to AI providers (and to hold their API keys).
      "src/server/ai/providers/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db/clients", "@/server/db/client"],
              message:
                "Use withTenant(ctx, ...) from @/server/db/tenant. The raw/platform database clients bypass tenant isolation and are restricted to src/server/{db,auth,http,platform}.",
            },
            {
              group: ["@supabase/*", "openai", "@anthropic-ai/*", "@google/genai", "@google/generative-ai"],
              message:
                "Provider SDKs (Supabase, OpenAI, Anthropic, Google) are only used inside src/server/storage and src/server/ai/providers, where the server-side secret keys live.",
            },
            {
              group: ["@/generated/prisma/client", "@/generated/prisma/*"],
              allowTypeImports: true,
              message: "Import Prisma types only (import type). Runtime access goes through withTenant().",
            },
          ],
        },
      ],
    },
  },
  // 2. Server code must never end up in the browser bundle.
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "src/services/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
      "src/store/**/*.{ts,tsx}",
      "src/mock/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
    ],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/generated/*"],
              message: "Server-only code cannot be imported by frontend code.",
            },
            {
              group: ["@supabase/*", "openai", "@anthropic-ai/*", "@google/genai", "@google/generative-ai"],
              message: "Provider SDKs hold secret keys and are server-only. The frontend calls our API instead.",
            },
          ],
        },
      ],
    },
  },
  // 2b. Layering: pages, components, hooks and libraries never fetch data themselves. They call a service in
  //     src/services, which is the only place that knows where data comes from (the backend API today, demo data
  //     when there is no session). That is what lets the backend change without touching the UI. (Same patterns
  //     as rule 2, repeated because a later rule replaces an earlier one for the same files.)
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "src/store/**/*.{ts,tsx}",
    ],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/generated/*"],
              message: "Server-only code cannot be imported by frontend code.",
            },
            {
              group: ["@supabase/*", "openai", "@anthropic-ai/*", "@google/genai", "@google/generative-ai"],
              message: "Provider SDKs hold secret keys and are server-only. The frontend calls our API instead.",
            },
            {
              group: ["@/mock/*", "@/services/backend"],
              message:
                "UI code gets its data from a service in src/services (for example vehicleService). Demo data and the API client belong to the services layer only.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name=\"fetch\"], CallExpression[callee.object.name=\"window\"][callee.property.name=\"fetch\"]",
          message: "Do not call fetch from UI code. Add or reuse a function in src/services (they own every network call).",
        },
      ],
    },
  },
  // 3. The AI agent may never run SQL. Its tools get a narrow database view (see src/server/ai/agent/types.ts) and
  //    this rule forbids the raw-query and transaction APIs anywhere in the agent directory and the agent service.
  {
    files: ["src/server/ai/agent/**/*.ts", "src/server/modules/ai/ai-agent.service.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^\$(queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe|transaction|connect|extends|use)$/]",
          message: "The AI agent must not run raw SQL or manage transactions. Use the model accessors on AgentDb.",
        },
        {
          selector: "TaggedTemplateExpression[tag.name=/^(sql|Prisma)$/]",
          message: "No SQL templates in the AI agent.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
