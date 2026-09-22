import { apiRoute } from "@/server/http/api-route";
import { documentUploadSchema, requestDocumentUpload } from "@/server/modules/files/files.service";

export const POST = apiRoute({ permission: ["documents", "create"] }, async ({ ctx, body, meta }) =>
  Response.json(await requestDocumentUpload(ctx, await body(documentUploadSchema), meta), { status: 201 })
);
