/**
 * Live probe of the AI providers you have configured, with YOUR keys (the automated tests can only use
 * fakes of the three APIs). It makes ONE tiny real request per configured provider through the same adapter
 * the app uses, and reports the model, token counts and finish reason. It is the check that the request and
 * response formats in src/server/ai/providers match the real services.
 *
 *   ANTHROPIC_API_KEY=... [OPENAI_API_KEY=... AI_MODEL_OPENAI=...] [GEMINI_API_KEY=... AI_MODEL_GOOGLE=...] npm run ai:check
 *
 * Costs a few tokens per provider. Exit code 1 if any configured provider fails. Nothing is stored.
 */
import { configuredProviders, providerConfig, providerIds } from "@/server/ai/config";
import { scrubSecrets } from "@/server/ai/providers/http";
import { getProvider } from "@/server/ai/providers/registry";
import { AiProviderError } from "@/server/ai/providers/types";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}

async function main() {
  const available = configuredProviders();
  if (!available.length) {
    console.error(
      "No provider is configured. Set at least ANTHROPIC_API_KEY (OpenAI and Gemini also need AI_MODEL_OPENAI / AI_MODEL_GOOGLE)."
    );
    process.exit(1);
  }
  let failed = 0;
  for (const id of providerIds) {
    const config = providerConfig(id);
    if (!config) {
      console.log(`SKIP  ${id}: not configured`);
      continue;
    }
    const provider = getProvider(id)!;
    try {
      const started = Date.now();
      const result = await provider.complete({
        model: provider.model,
        system: "You are a connectivity test. Reply with exactly the word OK.",
        messages: [{ role: "user", content: "ping" }],
        maxOutputTokens: 16,
        timeoutMs: 30_000,
      });
      console.log(
        `PASS  ${id}: model=${result.model} tokens in/out=${result.inputTokens}/${result.outputTokens} finish=${result.finishReason} ${Date.now() - started} ms reply=${JSON.stringify(result.text.slice(0, 40))}`
      );
      if (result.inputTokens === 0 || result.outputTokens === 0) {
        console.log(
          `WARN  ${id}: the response carried no token counts; usage and cost would be recorded as 0. Check the adapter's usage fields.`
        );
      }
    } catch (error) {
      failed++;
      const e = error as AiProviderError;
      console.log(`FAIL  ${id}: ${e.message}${e.detail ? ` :: ${scrubSecrets(String(e.detail)).slice(0, 200)}` : ""}`);
    }
  }
  console.log(failed ? `\n${failed} provider(s) failed.` : "\nAll configured providers answered.");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Live check could not run:", scrubSecrets(String((error as Error).message)));
  process.exit(1);
});
