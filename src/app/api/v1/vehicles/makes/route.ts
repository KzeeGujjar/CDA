import { apiRoute } from "@/server/http/api-route";
import { listVehicleMakes } from "@/server/modules/vehicles/vehicles.service";

export const GET = apiRoute({ permission: ["vehicles", "read"] }, ({ ctx }) => listVehicleMakes(ctx));
