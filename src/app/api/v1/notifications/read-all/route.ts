import { apiRouteV2 } from "@/server/http/api-route";
import { markAllNotificationsRead } from "@/server/modules/notifications/notifications.service";

export const POST = apiRouteV2({ self: true }, ({ ctx }) => markAllNotificationsRead(ctx));
