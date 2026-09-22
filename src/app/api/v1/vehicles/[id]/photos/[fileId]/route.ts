import { apiRoute } from "@/server/http/api-route";
import { deleteVehiclePhoto, photoUpdateSchema, updateVehiclePhoto } from "@/server/modules/files/files.service";

export const PATCH = apiRoute<{ id: string; fileId: string }>(
  { permission: ["vehicles", "update"] },
  async ({ ctx, params, body, meta }) =>
    updateVehiclePhoto(ctx, params.id, params.fileId, await body(photoUpdateSchema), meta)
);

export const DELETE = apiRoute<{ id: string; fileId: string }>(
  { permission: ["vehicles", "update"] },
  ({ ctx, params, meta }) => deleteVehiclePhoto(ctx, params.id, params.fileId, meta)
);
