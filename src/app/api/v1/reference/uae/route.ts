import { apiRoute } from "@/server/http/api-route";
import { getUaeReference } from "@/server/modules/reference/reference.service";

// Reference lists (emirates, vehicle types, currencies): not tenant data, so any signed-in user may read them.
export const GET = apiRoute({ self: true }, ({ ctx }) => getUaeReference(ctx));
