/**
 * Product type definitions
 */

export interface Product {
  id: number
  sku: string
  manufacturer_id: number
  catalog_id?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface ProductListItem {
  id: number
  sku: string
  manufacturer_id: number
  catalog_id?: number
  created_at: string
  updated_at: string
}

export interface ProductCreate {
  sku: string
  manufacturer_id: number
  catalog_id?: number
}

export interface ProductUpdate {
  sku?: string
  catalog_id?: number
}

export interface ProductListResponse {
  products: Product[]
  total: number
  limit: number
  offset: number
}
