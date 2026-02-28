/**
 * Catalog entity types based on API contracts
 */

export interface Catalog {
  id: number;  
  manufacturer_id: number;
  name: string;
  slug: string;
  description: string;
  catalog_file: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}


/**
 * Catalog creation/update request types
 */
export interface CreateCatalogRequest {
  name: string;
  description: string;
  thumbnail?: string;
  catalog_file?: string;
  manufacturer_id: string;
  slug?: string;
}

export interface UpdateCatalogRequest {
  name?: string;
  description?: string;
  catalog_file?: string;
  manufacturer_id?: string;
  slug?: string;
}

// Catalog preview/columns
export interface CatalogColumnsResponse {
  list_columns: string[];
}

export interface CatalogPreviewSkusResponse {
  message: string;
  sku_column: string;
  catalog_id: number;
  total_skus: number;
  preview_skus: string[];
  has_more: boolean;
}