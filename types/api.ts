/**
 * API response types based on endpoint contracts
 */

import { ManufacturerListItem } from './manufacturer';
import { Catalog } from './catalog';

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Error response type
 */
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Specific endpoint response types
 */

// GET /manufacturers
export type ManufacturersListResponse = ManufacturerListItem[];

// POST /catalogs/
export type CreateCatalogResponse = Catalog;

// GET /catalogs/:slug
export type GetCatalogResponse = Catalog;

// GET /seller/:slug/catalogs
export type SellerCatalogsResponse = Catalog[];
