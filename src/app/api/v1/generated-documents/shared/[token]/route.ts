import { publicRouteV2 } from "@/server/http/api-route";
import { getSharedDocument } from "@/server/platform/shared-documents";

export const GET = publicRouteV2<{ token: string }>(({ params }) => getSharedDocument(params.token));
