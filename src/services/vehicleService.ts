import type { ApiError, Currency, ID, PaginatedResult } from "@/types/common";
import type {
  AccidentHistory,
  FuelType,
  ImportSpec,
  RegistrationStatus,
  ServiceHistoryStatus,
  Transmission,
  Vehicle,
  VehicleFilters,
  VehicleInput,
  VehicleSortField,
} from "@/types/vehicle";
import { vehiclesFixture } from "@/mock/vehicles";
import { backendRequest, liveOrDemo, putSignedUpload, unwrapBackend } from "@/services/backend";

/**
 * Vehicles (the inventory). Connected to /api/v1/vehicles: with a real session every read and write goes through
 * the database (branch scope, tenant isolation, cost figures gated on profit:read). Without one, the built-in
 * demo data is used, exactly as before.
 *
 * Fields the live API cannot fill in yet come through as `undefined`, never a fabricated value — see the comments
 * on Vehicle in types/vehicle.ts. `images` holds at most one URL live (the primary photo, for cards/tables); the
 * full ordered gallery and the upload/reorder/primary/delete/replace operations live in the "photos" section
 * below, backed by real object storage (`/vehicles/:id/photos`, §0.19), not by this Vehicle record itself.
 */
let vehicles: Vehicle[] = [...vehiclesFixture];

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function applyFilters(list: Vehicle[], filters?: VehicleFilters): Vehicle[] {
  if (!filters) return list;
  return list.filter((v) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${v.make} ${v.model} ${v.trim} ${v.spec.vin}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.make && v.make !== filters.make) return false;
    if (filters.status && v.status !== filters.status) return false;
    if (filters.condition && v.condition !== filters.condition) return false;
    if (filters.minPrice && v.price.amount < filters.minPrice) return false;
    if (filters.maxPrice && v.price.amount > filters.maxPrice) return false;
    if (filters.emirate && v.emirate !== filters.emirate) return false;
    if (filters.sourceType && v.sourceType !== filters.sourceType) return false;
    return true;
  });
}

function applySort(list: Vehicle[], sortBy?: VehicleSortField, direction: "asc" | "desc" = "desc"): Vehicle[] {
  if (!sortBy) return list;
  const sorted = [...list].sort((a, b) => {
    const valueOf = (v: Vehicle) => {
      switch (sortBy) {
        case "price":
          return v.price.amount;
        case "year":
          return v.year;
        case "daysInStock":
          return v.daysInStock;
        case "acquiredAt":
          return new Date(v.acquiredAt).getTime();
      }
    };
    return valueOf(a) - valueOf(b);
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

async function demoGetVehicles(filters?: VehicleFilters): Promise<Vehicle[]> {
  await wait();
  return applyFilters(vehicles, filters);
}

async function demoGetVehiclesPaginated(filters?: VehicleFilters): Promise<PaginatedResult<Vehicle>> {
  await wait();
  const filtered = applyFilters(vehicles, filters);
  const sorted = applySort(filtered, filters?.sortBy, filters?.sortDirection ?? "desc");
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 8;
  const start = (page - 1) * pageSize;
  return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
}

async function demoGetVehicleById(id: ID): Promise<Vehicle | null> {
  await wait(200);
  return vehicles.find((v) => v.id === id) ?? null;
}

async function demoCreateVehicle(input: VehicleInput): Promise<Vehicle> {
  await wait();
  const vehicle: Vehicle = {
    ...input,
    id: `veh-${Math.random().toString(36).slice(2, 9)}`,
    daysInStock: 0,
    acquiredAt: new Date().toISOString().slice(0, 10),
  };
  vehicles = [vehicle, ...vehicles];
  return vehicle;
}

async function demoUpdateVehicle(id: ID, patch: Partial<VehicleInput>): Promise<Vehicle> {
  await wait();
  const index = vehicles.findIndex((v) => v.id === id);
  if (index === -1) throw new Error("Vehicle not found");
  vehicles[index] = { ...vehicles[index], ...patch };
  return vehicles[index];
}

async function demoGetVehicleMakes(): Promise<string[]> {
  await wait(100);
  return Array.from(new Set(vehicles.map((v) => v.make))).sort();
}

// ─────────────────────────────────────────── live ───────────────────────────────────────────

interface VehicleCostsDto {
  purchasePrice: number;
  repairCost: number;
  transportCost: number;
  otherCost: number;
}
interface VehicleDto {
  id: string;
  stockNumber: string;
  vin: string | null;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  condition: string;
  status: string;
  mileageKm: number | null;
  currency: string;
  listPrice: number;
  expectedSellingPrice: number | null;
  estimatedMarketValue: number | null;
  costs: VehicleCostsDto | null;
  emirate: string | null;
  importSpec: string | null;
  sourceType: string | null;
  branch: { id: string; name: string } | null;
  location: string | null;
  acquiredAt: string;
  daysInStock: number;
  spec: Record<string, unknown>;
  registration: Record<string, unknown>;
  notes: string | null;
  featured: boolean;
  primaryPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
interface VehicleListDto {
  items: VehicleDto[];
  total: number;
  page: number;
  pageSize: number;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * ImportSpec is spelled differently at each layer: the API/database use lower-case ("gcc"), the frontend type
 * (and its translation keys, inventory.importSpecs.*) use "GCC" / "UAE" / "Imported". A blind toUpperCase() would
 * turn "imported" into "IMPORTED", not "Imported", so both directions go through this explicit table.
 */
const IMPORT_SPEC_FROM_API: Record<string, ImportSpec> = { gcc: "GCC", uae: "UAE", imported: "Imported" };
const IMPORT_SPEC_TO_API: Record<ImportSpec, string> = { GCC: "gcc", UAE: "uae", Imported: "imported" };

function toVehicle(d: VehicleDto): Vehicle {
  const currency = d.currency as Currency;
  const spec = d.spec ?? {};
  const registration = d.registration ?? {};
  return {
    id: d.id,
    stockNumber: d.stockNumber,
    make: d.make,
    model: d.model,
    // Absent only for a record made outside this app's own forms, which always fill these in.
    trim: d.trim ?? "",
    year: d.year,
    condition: d.condition as Vehicle["condition"],
    status: d.status as Vehicle["status"],
    price: { amount: d.listPrice, currency },
    costPrice: d.costs ? { amount: d.costs.purchasePrice, currency } : undefined,
    repairCost: d.costs ? { amount: d.costs.repairCost, currency } : undefined,
    transportCost: d.costs ? { amount: d.costs.transportCost, currency } : undefined,
    otherCost: d.costs ? { amount: d.costs.otherCost, currency } : undefined,
    // 0 here is the same default the create/edit forms themselves use for "not entered", never a hidden real value.
    expectedSellingPrice: { amount: d.expectedSellingPrice ?? 0, currency },
    estimatedMarketValue: { amount: d.estimatedMarketValue ?? 0, currency },
    spec: {
      engine: str(spec.engine) ?? "",
      horsepower: num(spec.horsepower) ?? 0,
      fuelType: (str(spec.fuelType) ?? "petrol") as FuelType,
      transmission: (str(spec.transmission) ?? "automatic") as Transmission,
      mileageKm: d.mileageKm ?? 0,
      exteriorColor: str(spec.exteriorColor) ?? "",
      interiorColor: str(spec.interiorColor) ?? "",
      seats: num(spec.seats) ?? 5,
      bodyType: str(spec.bodyType) ?? "",
      vin: d.vin ?? "",
      importSpec: d.importSpec ? IMPORT_SPEC_FROM_API[d.importSpec] : undefined,
      accidentHistory: (str(spec.accidentHistory) ?? "none") as AccidentHistory,
      serviceHistory: (str(spec.serviceHistory) ?? "none") as ServiceHistoryStatus,
      owners: num(spec.owners) ?? 0,
    },
    // Just the primary thumbnail here — the full ordered gallery comes from getVehiclePhotos() (§0.19). Every
    // gallery/card already handles an empty list as "no photo yet".
    images: d.primaryPhotoUrl ? [d.primaryPhotoUrl] : [],
    daysInStock: d.daysInStock,
    acquiredAt: d.acquiredAt,
    location: d.location ?? undefined,
    emirate: d.emirate as Vehicle["emirate"] | undefined,
    sourceType: d.sourceType as Vehicle["sourceType"],
    registration: {
      status: (str(registration.status) ?? "not_registered") as RegistrationStatus,
      plateNumber: str(registration.plateNumber),
      expiryDate: str(registration.expiryDate),
      rtaNotes: str(registration.rtaNotes),
    },
    featured: d.featured,
    notes: d.notes ?? undefined,
  };
}

function filterQuery(filters?: VehicleFilters): string {
  if (!filters) return "";
  const q = new URLSearchParams();
  if (filters.search) q.set("search", filters.search);
  if (filters.make) q.set("make", filters.make);
  if (filters.status) q.set("status", filters.status);
  if (filters.condition) q.set("condition", filters.condition);
  if (filters.emirate) q.set("emirate", filters.emirate);
  if (filters.sourceType) q.set("sourceType", filters.sourceType);
  if (filters.minPrice !== undefined) q.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) q.set("maxPrice", String(filters.maxPrice));
  if (filters.sortBy) q.set("sortBy", filters.sortBy);
  if (filters.sortDirection) q.set("sortDirection", filters.sortDirection);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Appends page/pageSize to a filter query string built by filterQuery(), which never sets them itself. */
const withPage = (q: string, page: number, pageSize: number) => `${q}${q ? "&" : "?"}page=${page}&pageSize=${pageSize}`;

async function liveGetVehiclesPaginated(filters?: VehicleFilters): Promise<PaginatedResult<Vehicle>> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 8;
  const dto = unwrapBackend(
    await backendRequest<VehicleListDto>("GET", `/vehicles${withPage(filterQuery(filters), page, pageSize)}`)
  );
  return { items: dto.items.map(toVehicle), total: dto.total, page: dto.page, pageSize: dto.pageSize };
}

/** The full matching list, for pickers and dropdowns: pages through the API (bounded) rather than truncating at 100. */
async function liveGetVehicles(filters?: VehicleFilters): Promise<Vehicle[]> {
  const pageSize = 100;
  const q = filterQuery(filters);
  const items: Vehicle[] = [];
  for (let page = 1; page <= 20; page++) {
    const dto = unwrapBackend(await backendRequest<VehicleListDto>("GET", `/vehicles${withPage(q, page, pageSize)}`));
    items.push(...dto.items.map(toVehicle));
    if (items.length >= dto.total || dto.items.length === 0) break;
  }
  return items;
}

async function liveGetVehicleById(id: ID): Promise<Vehicle | null> {
  const result = await backendRequest<VehicleDto>("GET", `/vehicles/${id}`);
  if (result.kind === "error" && result.error.status === 404) return null;
  return toVehicle(unwrapBackend(result));
}

/** Frontend VehicleInput -> the API's flat create/update body. Only keys present in `input` are included. */
function toBody(input: Partial<VehicleInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value;
  };
  set("make", input.make);
  set("model", input.model);
  set("trim", input.trim);
  set("year", input.year);
  set("condition", input.condition);
  set("status", input.status);
  set("stockNumber", input.stockNumber);
  set("listPrice", input.price?.amount);
  set("expectedSellingPrice", input.expectedSellingPrice?.amount);
  set("estimatedMarketValue", input.estimatedMarketValue?.amount);
  set("purchasePrice", input.costPrice?.amount);
  set("repairCost", input.repairCost?.amount);
  set("transportCost", input.transportCost?.amount);
  set("otherCost", input.otherCost?.amount);
  set("emirate", input.emirate);
  set("sourceType", input.sourceType);
  set("location", input.location);
  set("notes", input.notes);
  set("featured", input.featured);
  if (input.spec) {
    set("vin", input.spec.vin || undefined);
    set("mileageKm", input.spec.mileageKm);
    set("importSpec", input.spec.importSpec ? IMPORT_SPEC_TO_API[input.spec.importSpec] : undefined);
    body.spec = {
      engine: input.spec.engine || undefined,
      horsepower: input.spec.horsepower,
      fuelType: input.spec.fuelType,
      transmission: input.spec.transmission,
      exteriorColor: input.spec.exteriorColor || undefined,
      interiorColor: input.spec.interiorColor || undefined,
      seats: input.spec.seats,
      bodyType: input.spec.bodyType || undefined,
      accidentHistory: input.spec.accidentHistory,
      serviceHistory: input.spec.serviceHistory,
      owners: input.spec.owners,
    };
  }
  if (input.registration) {
    body.registration = {
      status: input.registration.status,
      plateNumber: input.registration.plateNumber || undefined,
      expiryDate: input.registration.expiryDate || undefined,
      rtaNotes: input.registration.rtaNotes || undefined,
    };
  }
  return body;
}

async function liveCreateVehicle(input: VehicleInput): Promise<Vehicle> {
  return toVehicle(unwrapBackend(await backendRequest<VehicleDto>("POST", "/vehicles", toBody(input))));
}

async function liveUpdateVehicle(id: ID, patch: Partial<VehicleInput>): Promise<Vehicle> {
  return toVehicle(unwrapBackend(await backendRequest<VehicleDto>("PUT", `/vehicles/${id}`, toBody(patch))));
}

async function liveGetVehicleMakes(): Promise<string[]> {
  return unwrapBackend(await backendRequest<string[]>("GET", "/vehicles/makes"));
}

// ─────────────────────────────────────────── photos ───────────────────────────────────────────
//
// Real object storage, not the database: uploading is a 3-step handshake (ask the server for a one-time signed
// URL, PUT the bytes straight to Storage, tell the server to confirm what actually arrived), matching
// server/modules/files/files.service.ts. There is no demo backing for this — a fixture vehicle has no row in
// Storage to point at — so every function here only makes sense in live mode; the UI checks backendMode() itself
// (useBackendMode()) before offering these controls, rather than each call failing with a confusing 401.

export interface VehiclePhoto {
  id: ID;
  /** Signed download link, or null if it could not be issued. Expires at urlExpiresAt: re-fetch, don't cache. */
  url: string | null;
  urlExpiresAt: string;
  isPrimary: boolean;
  sortOrder: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface PhotoDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  url: string | null;
  urlExpiresAt: string;
}

interface UploadTicketDto {
  file: { id: string };
  upload: { url: string; headers: Record<string, string> };
}

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function toPhoto(d: PhotoDto): VehiclePhoto {
  return {
    id: d.id,
    url: d.url,
    urlExpiresAt: d.urlExpiresAt,
    isPrimary: d.isPrimary,
    sortOrder: d.sortOrder,
    fileName: d.fileName,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
  };
}

/** Checked again by the server (both the signed-URL request and the bucket itself); this just fails fast. */
function assertUploadable(file: File): void {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    const error: ApiError = { message: "Only JPEG, PNG or WebP images are allowed.", code: "invalid_upload" };
    throw error;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const error: ApiError = { message: "Photo is larger than the 10 MB limit.", code: "invalid_upload" };
    throw error;
  }
}

async function putToSignedUrl(upload: UploadTicketDto["upload"], file: File): Promise<void> {
  const ok = await putSignedUpload(upload.url, upload.headers, file);
  if (!ok) {
    const error: ApiError = { message: "The photo upload did not complete.", code: "upload_failed" };
    throw error;
  }
}

export async function getVehiclePhotos(vehicleId: ID): Promise<VehiclePhoto[]> {
  const dtos = unwrapBackend(await backendRequest<PhotoDto[]>("GET", `/vehicles/${vehicleId}/photos`));
  return dtos.map(toPhoto);
}

export async function uploadVehiclePhoto(vehicleId: ID, file: File): Promise<VehiclePhoto> {
  assertUploadable(file);
  const ticket = unwrapBackend(
    await backendRequest<UploadTicketDto>("POST", `/vehicles/${vehicleId}/photos/upload-url`, {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    })
  );
  await putToSignedUrl(ticket.upload, file);
  const dto = unwrapBackend(
    await backendRequest<PhotoDto>("POST", `/vehicles/${vehicleId}/photos/${ticket.file.id}/complete`)
  );
  return toPhoto(dto);
}

export async function setVehiclePhotoPrimary(vehicleId: ID, photoId: ID): Promise<VehiclePhoto> {
  const dto = unwrapBackend(
    await backendRequest<PhotoDto>("PATCH", `/vehicles/${vehicleId}/photos/${photoId}`, { isPrimary: true })
  );
  return toPhoto(dto);
}

export async function reorderVehiclePhoto(vehicleId: ID, photoId: ID, sortOrder: number): Promise<VehiclePhoto> {
  const dto = unwrapBackend(
    await backendRequest<PhotoDto>("PATCH", `/vehicles/${vehicleId}/photos/${photoId}`, { sortOrder })
  );
  return toPhoto(dto);
}

export async function deleteVehiclePhoto(vehicleId: ID, photoId: ID): Promise<void> {
  unwrapBackend(await backendRequest<{ deleted: true }>("DELETE", `/vehicles/${vehicleId}/photos/${photoId}`));
}

/**
 * Swaps a photo's picture for a new file while keeping its place in the gallery and its primary status.
 * Uploads the replacement FIRST and only removes the old photo once the new one is confirmed live, so a failed
 * upload never leaves the vehicle with one fewer photo than before.
 */
export async function replaceVehiclePhoto(vehicleId: ID, oldPhoto: VehiclePhoto, file: File): Promise<VehiclePhoto> {
  const uploaded = await uploadVehiclePhoto(vehicleId, file);
  let replacement = uploaded;
  try {
    if (oldPhoto.isPrimary && !uploaded.isPrimary) {
      replacement = await setVehiclePhotoPrimary(vehicleId, uploaded.id);
    } else if (!oldPhoto.isPrimary && uploaded.sortOrder !== oldPhoto.sortOrder) {
      replacement = await reorderVehiclePhoto(vehicleId, uploaded.id, oldPhoto.sortOrder);
    }
  } finally {
    await deleteVehiclePhoto(vehicleId, oldPhoto.id);
  }
  return replacement;
}

// ─────────────────────────────────────────── exported ───────────────────────────────────────────

export function getVehicles(filters?: VehicleFilters): Promise<Vehicle[]> {
  return liveOrDemo({ live: () => liveGetVehicles(filters), demo: () => demoGetVehicles(filters) });
}

export function getVehiclesPaginated(filters?: VehicleFilters): Promise<PaginatedResult<Vehicle>> {
  return liveOrDemo({
    live: () => liveGetVehiclesPaginated(filters),
    demo: () => demoGetVehiclesPaginated(filters),
  });
}

export function getVehicleById(id: ID): Promise<Vehicle | null> {
  return liveOrDemo({ live: () => liveGetVehicleById(id), demo: () => demoGetVehicleById(id) });
}

export function createVehicle(input: VehicleInput): Promise<Vehicle> {
  return liveOrDemo({ live: () => liveCreateVehicle(input), demo: () => demoCreateVehicle(input) });
}

export function updateVehicle(id: ID, patch: Partial<VehicleInput>): Promise<Vehicle> {
  return liveOrDemo({ live: () => liveUpdateVehicle(id, patch), demo: () => demoUpdateVehicle(id, patch) });
}

export function getVehicleMakes(): Promise<string[]> {
  return liveOrDemo({ live: liveGetVehicleMakes, demo: demoGetVehicleMakes });
}
