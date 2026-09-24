import { apiRouteV2 } from "@/server/http/api-route";
import { markNotificationRead, markNotificationReadSchema } from "@/server/modules/notifications/notifications.service";

export const PATCH = apiRouteV2<{ id: string }>({ self: true }, async ({ ctx, params, body }) => {
  await body(markNotificationReadSchema);
  return markNotificationRead(ctx, params.id);
});
