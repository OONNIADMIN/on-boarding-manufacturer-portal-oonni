/**
 * Manufacturer entity types based on API contracts
 */

export interface Manufacturer {
  id: number;
  name: string;
  thumbnail: string;
  slug: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Manufacturer list response type (used in GET /manufacturers)
 * This is a simplified version without timestamps
 */
export interface ManufacturerListItem {
  id: number;
  slug: string;
  name: string;
  thumbnail: string;
}

/**
 * Manufacturer creation/update request types
 */
export interface CreateManufacturerRequest {
  name: string;
  thumbnail?: string;
  slug?: string;
}

export interface UpdateManufacturerRequest {
  name?: string;
  thumbnail?: string;
  slug?: string;
}
