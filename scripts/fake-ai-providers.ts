/** Runs the fake AI providers (tests only): tsx scripts/fake-ai-providers.ts [port] */
import { startFakeAiProviders } from "./lib/fake-ai-providers";

const port = Number(process.argv[2] ?? 54350);
startFakeAiProviders(port, {
  anthropic: "sk-ant-test-anthropic-key-0000000000000000",
  openai: "sk-test-openai-key-0000000000000000",
  google: "AIzaTestGeminiKey000000000000000000000",
}).then((fake) => {
  console.log(`FAKE AI READY on ${fake.url}`);
  process.on("SIGTERM", () => fake.close().then(() => process.exit(0)));
});
