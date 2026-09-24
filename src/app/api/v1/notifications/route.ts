import { apiRouteV2 } from "@/server/http/api-route";
import { listNotifications } from "@/server/modules/notifications/notifications.service";

export const GET = apiRouteV2({ self: true }, ({ ctx }) => listNotifications(ctx));
