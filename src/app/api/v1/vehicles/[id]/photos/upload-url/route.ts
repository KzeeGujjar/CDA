import { apiRoute } from "@/server/http/api-route";
import { photoUploadSchema, requestVehiclePhotoUpload } from "@/server/modules/files/files.service";

export const POST = apiRoute<{ id: string }>(
  { permission: ["vehicles", "update"] },
  async ({ ctx, params, body, meta }) =>
    Response.json(await requestVehiclePhotoUpload(ctx, params.id, await body(photoUploadSchema), meta), { status: 201 })
);
