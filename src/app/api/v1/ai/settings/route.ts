import { apiRoute } from "@/server/http/api-route";
import { getAiSettings, updateAiSettings, updateSettingsSchema } from "@/server/modules/ai/ai-usage-settings.service";

export const GET = apiRoute({ permission: ["settings", "read"] }, ({ ctx }) => getAiSettings(ctx));

export const PUT = apiRoute({ permission: ["settings", "update"] }, async ({ ctx, body, meta }) =>
  updateAiSettings(ctx, await body(updateSettingsSchema), meta)
);
