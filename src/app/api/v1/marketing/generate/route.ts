import { apiRoute } from "@/server/http/api-route";
import { generateMarketingContent, generateMarketingContentSchema } from "@/server/modules/marketing/marketing.service";

export const POST = apiRoute({ permission: ["marketing", "create"] }, async ({ ctx, body }) =>
  generateMarketingContent(ctx, await body(generateMarketingContentSchema))
);
