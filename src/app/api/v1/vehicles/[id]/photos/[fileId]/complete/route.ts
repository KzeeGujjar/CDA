import { apiRoute } from "@/server/http/api-route";
import { completeVehiclePhotoUpload } from "@/server/modules/files/files.service";

export const POST = apiRoute<{ id: string; fileId: string }>(
  { permission: ["vehicles", "update"] },
  ({ ctx, params, meta }) => completeVehiclePhotoUpload(ctx, params.id, params.fileId, meta)
);
