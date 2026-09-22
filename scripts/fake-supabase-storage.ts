/** Runs the fake Supabase Storage server (tests only): tsx scripts/fake-supabase-storage.ts [port] */
import { startFakeSupabase } from "./lib/fake-supabase-storage";

const port = Number(process.argv[2] ?? 54340);
const serviceKey = process.env.FAKE_SUPABASE_SERVICE_KEY ?? "test-service-role-key-not-a-real-secret";

startFakeSupabase(port, serviceKey).then((fake) => {
  console.log(`FAKE SUPABASE READY on ${fake.url}`);
  process.on("SIGTERM", () => fake.close().then(() => process.exit(0)));
});
