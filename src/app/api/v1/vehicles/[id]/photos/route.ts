import { apiRoute } from "@/server/http/api-route";
import { listVehiclePhotos } from "@/server/modules/files/files.service";

export const GET = apiRoute<{ id: string }>({ permission: ["vehicles", "read"] }, ({ ctx, params }) =>
  listVehiclePhotos(ctx, params.id)
);
