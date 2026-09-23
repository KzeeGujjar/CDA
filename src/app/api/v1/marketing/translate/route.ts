import { apiRoute } from "@/server/http/api-route";
import { translateMarketingContent, translateMarketingContentSchema } from "@/server/modules/marketing/marketing.service";

export const POST = apiRoute({ permission: ["marketing", "create"] }, async ({ ctx, body }) =>
  translateMarketingContent(ctx, await body(translateMarketingContentSchema))
);
