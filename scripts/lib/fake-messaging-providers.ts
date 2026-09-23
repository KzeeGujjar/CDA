/**
 * Small fakes of the WhatsApp Cloud API and Twilio's REST API, for tests only — enough to prove
 * src/server/messaging/providers/{whatsapp,sms}.ts build the right request (auth header/scheme, path, body
 * shape) and parse the right response, not that Meta or Twilio behave identically in every detail.
 * A `to`/`To` value starting with "fail-" makes the fake answer with a provider-shaped error.
 */
import { createServer, type Server } from "node:http";

export interface FakeMessagingProviders {
  url: string;
  whatsAppToken: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  sent: { channel: "whatsapp" | "sms"; to: string; body: string }[];
  close(): Promise<void>;
}

export function startFakeMessagingProviders(port: number): Promise<FakeMessagingProviders> {
  const whatsAppToken = "fake-whatsapp-token-0000000000000000";
  const twilioAccountSid = "ACfaketwiliosid00000000000000000000";
  const twilioAuthToken = "fake-twilio-auth-token-000000000000";
  const sent: FakeMessagingProviders["sent"] = [];
  let seq = 0;

  const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const auth = req.headers.authorization ?? "";

    // WhatsApp Cloud API: POST /v20.0/:phoneNumberId/messages, bearer token.
    if (req.method === "POST" && /^\/v20\.0\/[^/]+\/messages$/.test(url.pathname)) {
      if (auth !== `Bearer ${whatsAppToken}`) return json(res, 401, { error: { message: "Invalid OAuth access token" } });
      let body: { to?: string; text?: { body?: string } };
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: { message: "invalid JSON" } });
      }
      if (!body.to || !body.text?.body) return json(res, 400, { error: { message: "missing to/text.body" } });
      if (body.to.startsWith("fail-")) return json(res, 400, { error: { message: "Recipient phone number not in allowed list" } });
      sent.push({ channel: "whatsapp", to: body.to, body: body.text.body });
      return json(res, 200, { messaging_product: "whatsapp", messages: [{ id: `wamid.FAKE${seq++}` }] });
    }

    // Twilio: POST /2010-04-01/Accounts/:sid/Messages.json, HTTP Basic auth, form-encoded body.
    if (req.method === "POST" && /^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(url.pathname)) {
      const expected = `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`;
      if (auth !== expected) return json(res, 401, { code: 20003, message: "Authentication Error" });
      const form = new URLSearchParams(raw);
      const to = form.get("To");
      const body = form.get("Body");
      if (!to || !body) return json(res, 400, { code: 21603, message: "missing To/Body" });
      if (to.startsWith("fail-")) return json(res, 400, { code: 21211, message: "Invalid 'To' Phone Number" });
      sent.push({ channel: "sms", to, body });
      return json(res, 201, { sid: `SMFAKE${seq++}`, status: "queued" });
    }

    json(res, 404, { message: "not found" });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        whatsAppToken,
        twilioAccountSid,
        twilioAuthToken,
        sent,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
