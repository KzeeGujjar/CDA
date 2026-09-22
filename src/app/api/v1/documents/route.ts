import { apiRoute } from "@/server/http/api-route";
import { listDocuments } from "@/server/modules/files/files.service";

export const GET = apiRoute({ permission: ["documents", "read"] }, ({ ctx, query }) => listDocuments(ctx, query));
