/** Runs the fake WhatsApp/Twilio providers (tests only): tsx scripts/fake-messaging-providers.ts [port] */
import { startFakeMessagingProviders } from "./lib/fake-messaging-providers";

const port = Number(process.argv[2] ?? 54360);
startFakeMessagingProviders(port).then((fake) => {
  console.log(`FAKE MESSAGING READY on ${fake.url}`);
  console.log(`WHATSAPP_ACCESS_TOKEN=${fake.whatsAppToken}`);
  console.log(`TWILIO_ACCOUNT_SID=${fake.twilioAccountSid} TWILIO_AUTH_TOKEN=${fake.twilioAuthToken}`);
  process.on("SIGTERM", () => fake.close().then(() => process.exit(0)));
});
