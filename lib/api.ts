import { 
  User, 
  Role, 
  LoginRequest, 
  LoginResponse, 
  UserProfile,
  ApiResponse,
  ApiError,
  ManufacturerListItem,
  Manufacturer,
  Catalog,
  Product,
  ProductListResponse
} from '@/types'
import { mimeToListFileType } from '@/lib/image-list-json'
import type { CatalogColumnRuleRecord } from '@/lib/catalog-column-validation'
import type { CatalogImageIngestProgress } from '@/lib/catalog-image-ingest'
import type { EntityCompleteness, ProductCompleteness } from '@/lib/inventory-completeness'

export type { CatalogImageIngestProgress }

import { rememberCatalogImportJob } from '@/lib/catalog-import-jobs-client'

const API_URL = '/api'

function isJwt(value: string): boolean {
  return value.split('.').length === 3 && value.length > 40
}

function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token && isJwt(token) && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }
  const auth = headers.get('Authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const value = auth.slice(7).trim()
    if (!isJwt(value)) headers.delete('Authorization')
  }
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  })
}

export interface CatalogImportJobView {
  id: string
  filename: string
  status: string
  phase: string
  message: string | null
  progress_current: number
  progress_total: number
  catalog_id: number | null
  products_created: number
  images_created: number
  images_failed: number
  error: string | null
  created_at: string
  finished_at: string | null
}

export interface CatalogUploadAccepted {
  job_id: string
  status: string
  filename: string
  message: string
}

export interface UploadResponse {
  id?: number
  name?: string
  message: string
  filename: string
  saved_as: string
  file_path: string
  file_size_bytes: number
  manufacturer_id?: number
  uploaded_at: string
  products_from_upload?: {
    total_skus: number
    created_count: number
    skipped: number
  } | null
  data_info: {
    rows: number
    columns: number
    column_names: string[]
    preview: any[]
  }
}

export interface FileInfo {
  filename: string
  size_bytes: number
  uploaded_at: string
  file_type: string
}

export interface FilesListResponse {
  total_files: number
  files: FileInfo[]
}

export interface ImageUploadResponse {
  message?: string
  original_filename: string
  s3_key: string
  s3_url: string
  imagekit_url?: string
  file_size_bytes?: number
  optimized_size_bytes?: number
  manufacturer_id?: number
  user_id?: number
  uploaded_at?: string
  optimization_info?: {
    format: string
    saved: number
    reason: string
    width: number
    height: number
    quality: number
  }
}

export interface ImageInfo {
  id?: number
  original_filename?: string
  s3_key: string
  s3_url: string
  /** Smaller ImageKit transform for grid thumbnails */
  preview_url?: string
  size_bytes: number
  last_modified: string
  file_type: string
  mime_type?: string
  width?: number
  height?: number
  optimized?: boolean
  manufacturer_id?: number
  product_id?: number
  user_id?: number
  created_at?: string
  updated_at?: string
  /** Present when row comes from ImageKit folder listing only (no `images` DB row yet). */
  imagekit_only?: boolean
  imagekit_file_id?: string
}

export interface ImagesListResponse {
  total_images: number
  images: ImageInfo[]
}

/** Response from GET /api/imagekit/list-folder (ImageKit GET /v1/files for a manufacturer folder). */
export interface ImageKitListFolderResponse {
  folder_path: string
  scope: 'images' | 'catalogs'
  limit: number
  skip: number
  count: number
  files: Array<{
    fileId: string
    name: string
    filePath: string
    url: string
    thumbnail?: string
    size?: number
    width?: number
    height?: number
    mime?: string
    fileType?: string
  }>
  may_have_more: boolean
}

/** Nautical product type (dropdown + template download). */
export interface NauticalProductTypeSummary {
  id: string
  slug: string
  name: string
}

/** ImageKit catalog template matched to a Nautical product type. */
export interface ImageKitTemplateSummary {
  fileId: string
  name: string
  filePath: string
  url: string
  thumbnail?: string
  size?: number
  mime?: string
}

export interface NauticalProductTypeWithTemplate {
  id: string
  slug: string
  name: string
  template_search_name: string
  template: ImageKitTemplateSummary | null
}

/** DAM-hosted Excel template (dropdown on catalog template page). */
export interface CatalogDamTemplateSummary {
  id: string
  name: string
  slug: string
}

export interface ImageKitTemplatesResponse {
  count: number
  product_types: NauticalProductTypeWithTemplate[]
}

export interface ImageKitTemplateByProductTypeResponse {
  product_type: NauticalProductTypeWithTemplate
}

function normalizeImageStorageKey(key: string): string {
  return key.trim().replace(/^\/+/u, '').toLowerCase()
}

function imageKitFolderFileToImageInfo(
  f: ImageKitListFolderResponse['files'][number]
): ImageInfo {
  const deliveryUrl = f.url || f.thumbnail || ''
  return {
    s3_key: f.filePath,
    s3_url: deliveryUrl,
    preview_url: f.thumbnail || deliveryUrl,
    size_bytes: typeof f.size === 'number' ? f.size : 0,
    last_modified: '',
    file_type: mimeToListFileType(f.mime),
    mime_type: f.mime,
    original_filename: f.name,
    imagekit_file_id: f.fileId,
    imagekit_only: true,
  }
}

function mergeDbImagesWithImageKitFolder(
  db: ImageInfo[],
  ik: ImageKitListFolderResponse['files']
): ImageInfo[] {
  const seen = new Set(db.map((i) => normalizeImageStorageKey(i.s3_key)))
  const out: ImageInfo[] = db.map((i) => ({ ...i, imagekit_only: false }))
  for (const f of ik) {
    const k = normalizeImageStorageKey(f.filePath)
    if (!seen.has(k)) {
      seen.add(k)
      out.push(imageKitFolderFileToImageInfo(f))
    }
  }
  return out
}

export interface InvitationVerifyResponse {
  valid: boolean
  email?: string
  name?: string
  expired: boolean
  message?: string
}

export interface SetPasswordRequest {
  token: string
  password: string
}

export const authAPI = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await apiFetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    })

    if (!response.ok) {
      const text = await response.text()
      let detail = 'Login failed'
      try {
        const error = JSON.parse(text) as { detail?: string }
        if (error.detail) detail = error.detail
      } catch {
        if (response.status === 500) {
          detail = 'Login failed (server error). Check DATABASE_URL and that Postgres is running.'
        }
      }
      throw new Error(detail)
    }

    const data = await response.json()

    if (typeof window !== 'undefined' && data.user) {
      localStorage.removeItem('access_token')
      localStorage.setItem('user', JSON.stringify(data.user))
    }

    return data
  },

  /**
   * Logout user
   */
  logout(): void {
    if (typeof window !== 'undefined') {
      void apiFetch(`${API_URL}/auth/logout`, { method: 'POST' })
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      document.cookie = 'access_token=; path=/; max-age=0; SameSite=Strict'
    }
  },

  /**
   * Get stored token
   */
  getToken(): string | null {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('access_token')
    if (stored && isJwt(stored)) return stored
    return localStorage.getItem('user') ? 'cookie' : null
  },

  /**
   * Get stored user
   */
  getStoredUser(): User | null {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user')
      return userStr ? JSON.parse(userStr) : null
    }
    return null
  },

  persistUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user))
    }
  },

  async getMe(token: string): Promise<User> {
    const response = await apiFetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Failed to load profile')
    }
    return response.json()
  },

  async updateProfile(token: string, data: { name: string }): Promise<User> {
    const response = await apiFetch(`${API_URL}/auth/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Failed to update profile')
    }
    const user = await response.json()
    this.persistUser(user)
    return user
  },

  /**
   * Check if user is admin
   */
  isAdmin(user: User | null): boolean {
    return user?.role?.name?.trim().toLowerCase() === 'admin'
  },

  /**
   * Get all users (admin only)
   */
  async getAllUsers(token: string): Promise<User[]> {
    const response = await apiFetch(`${API_URL}/auth/users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get users')
    }

    return response.json()
  },

  /**
   * Get all roles
   */
  async getRoles(): Promise<Role[]> {
    const response = await apiFetch(`${API_URL}/auth/roles`)

    if (!response.ok) {
      throw new Error('Failed to get roles')
    }

    return response.json()
  },

  /**
   * Create a new user (admin only)
   * Note: manufacturer_id is auto-generated for manufacturers
   */
  async createUser(token: string, userData: {
    email: string
    name: string
    password: string
    role_id: number
  }): Promise<User> {
    const response = await apiFetch(`${API_URL}/auth/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to create user')
    }

    return response.json()
  },

  /**
   * Verify invitation token
   */
  async verifyInvitation(token: string): Promise<InvitationVerifyResponse> {
    const response = await apiFetch(`${API_URL}/auth/verify-invitation/${token}`)

    if (!response.ok) {
      throw new Error('Failed to verify invitation token')
    }

    return response.json()
  },

  /**
   * Set password using invitation token
   */
  async setPassword(request: SetPasswordRequest): Promise<LoginResponse> {
    const response = await apiFetch(`${API_URL}/auth/set-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to set password')
    }

    const data = await response.json()

    if (typeof window !== 'undefined' && data.user) {
      localStorage.removeItem('access_token')
      localStorage.setItem('user', JSON.stringify(data.user))
    }

    return data
  },

  /**
   * Invite a manufacturer (admin only) - sends invitation email
   */
  async inviteManufacturer(token: string, inviteData: {
    email: string
    name: string
    manufacturer_id?: number
  }): Promise<User> {
    const response = await apiFetch(`${API_URL}/auth/invite-manufacturer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(inviteData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to invite manufacturer')
    }

    return response.json()
  },

  /**
   * Resend invitation email to a manufacturer user (admin only)
   */
  async resendInvitation(token: string, userId: number): Promise<{ message: string; email: string }> {
    const response = await apiFetch(`${API_URL}/auth/resend-invitation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to resend invitation')
    }

    return response.json()
  },

  /**
   * Activate a manufacturer user and set their password (admin only)
   */
  async activateUser(token: string, userId: number, password: string): Promise<User> {
    const response = await apiFetch(`${API_URL}/auth/users/${userId}/activate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to activate user')
    }

    return response.json()
  }
}

export const catalogAPI = {
  /**
   * Upload a catalog file (CSV or Excel)
   */
  async uploadFile(
    file: File,
    manufacturerId?: number,
    headerRowIndex = 0,
    options?: {
      skuColumn?: string
      imageColumns?: string[]
      onProgress?: (percent: number) => void
    }
  ): Promise<CatalogUploadAccepted> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('header_row_index', String(headerRowIndex))
    if (manufacturerId !== undefined) {
      formData.append('manufacturer_id', manufacturerId.toString())
    }
    if (options?.skuColumn?.trim()) {
      formData.append('sku_column', options.skuColumn.trim())
    }
    if (options?.imageColumns?.length) {
      formData.append('image_columns', JSON.stringify(options.imageColumns))
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_URL}/catalogs/upload`)
      xhr.withCredentials = true
      if (token && token.split('.').length === 3 && token.length > 40) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !options?.onProgress) return
        options.onProgress(Math.round((event.loaded / event.total) * 100))
      }

      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText) as CatalogUploadAccepted & { detail?: string }
          if (xhr.status >= 200 && xhr.status < 300) {
            options?.onProgress?.(100)
            rememberCatalogImportJob(body.job_id)
            resolve(body)
          } else {
            reject(new Error(body.detail || 'Upload failed'))
          }
        } catch {
          reject(new Error('Upload failed. Check that the catalog API is running.'))
        }
      }

      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(formData)
    })
  },

  async getImportJob(jobId: string): Promise<CatalogImportJobView> {
    const response = await apiFetch(`${API_URL}/catalogs/upload-jobs/${encodeURIComponent(jobId)}`)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as { detail?: string }).detail || 'Failed to load import status')
    }
    return response.json()
  },

  async listImportJobs(): Promise<CatalogImportJobView[]> {
    const response = await apiFetch(`${API_URL}/catalogs/upload-jobs`)
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data) ? data : []
  },

  /**
   * Get list of all catalogs (authenticated)
   */
  async listCatalogs(): Promise<Catalog[]> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/catalogs?limit=500`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch catalogs')
    }

    const data = await response.json()
    return Array.isArray(data) ? data : []
  },

  /**
   * Get catalog columns for preview and selection
   */
  async getColumns(catalogId: number): Promise<{ list_columns: string[] }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/catalogs/${catalogId}/columns`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch catalog columns')
    }

    return response.json()
  },

  /**
   * Preview SKUs from a specific column in a catalog
   */
  async previewSkus(catalogId: number, skuColumn: string): Promise<{
    message: string
    sku_column: string
    catalog_id: number
    total_skus: number
    preview_skus: string[]
    has_more: boolean
  }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const params = new URLSearchParams({ sku_column: skuColumn })
    const response = await apiFetch(`${API_URL}/catalogs/${catalogId}/preview-skus?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to preview SKUs')
    }

    return response.json()
  },

  /**
   * Get a specific catalog by ID
   */
  async getCatalog(catalogId: number): Promise<any> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/catalogs/${catalogId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch catalog')
    }

    return response.json()
  },

  /**
   * Delete a catalog by ID
   */
  async deleteCatalog(catalogId: number): Promise<void> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/catalogs/${catalogId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Delete failed')
    }
  },


  /**
   * Send upload notification to admin users
   */
  async sendUploadNotification(catalogId: number, imagesUploaded: number, imagesFailed: number): Promise<void> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/catalogs/${catalogId}/notify-upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images_uploaded: imagesUploaded,
        images_failed: imagesFailed
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to send notification')
    }
  },

  /**
   * Download images from URLs in the spreadsheet column, upload to ImageKit (DAM),
   * link to products by SKU, and replace column cells with ImageKit URLs in the stored catalog file.
   */
  async ingestImagesFromSpreadsheetUrls(
    catalogId: number,
    skuColumn: string,
    imageColumns: string | string[],
    manufacturerId: number,
    options?: {
      onProgress?: (progress: CatalogImageIngestProgress) => void
      catalogFile?: File | null
    }
  ): Promise<{
    message: string
    catalog_id: number
    catalog_file: string
    unique_sources_fetched: number
    images_created: number
    upload_failures: number
    rows_missing_product: number
  }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const useMultipart = Boolean(options?.catalogFile?.size)
    const imageColumnList = (Array.isArray(imageColumns) ? imageColumns : [imageColumns])
      .map((name) => String(name ?? '').trim())
      .filter(Boolean)
    const imageColumn = imageColumnList[0] ?? ''

    const response = await apiFetch(`${API_URL}/catalogs/${catalogId}/ingest-url-images`, {
      method: 'POST',
      headers: useMultipart
        ? { Authorization: `Bearer ${token}` }
        : {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
      body: useMultipart
        ? (() => {
            const formData = new FormData()
            formData.append('file', options!.catalogFile!)
            formData.append('sku_column', skuColumn)
            if (imageColumn) formData.append('image_column', imageColumn)
            formData.append('image_columns', JSON.stringify(imageColumnList))
            formData.append('manufacturer_id', String(manufacturerId))
            formData.append('stream', 'true')
            return formData
          })()
        : JSON.stringify({
            sku_column: skuColumn,
            image_column: imageColumn,
            image_columns: imageColumnList,
            manufacturer_id: manufacturerId,
            stream: true,
          }),
    })

    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('ndjson') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result: {
        message: string
        catalog_id: number
        catalog_file: string
        unique_sources_fetched: number
        images_created: number
        upload_failures: number
        rows_missing_product: number
      } | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const event = JSON.parse(trimmed) as {
            type?: string
            message?: string
            phase?: CatalogImageIngestProgress['phase']
            processed?: number
            total?: number
            uploaded?: number
            failed?: number
            images_created?: number
            catalog_id?: number
            catalog_file?: string
            unique_sources_fetched?: number
            upload_failures?: number
            rows_missing_product?: number
          }

          if (event.type === 'progress' && event.phase != null) {
            options?.onProgress?.({
              phase: event.phase,
              processed: event.processed ?? 0,
              total: event.total ?? 0,
              uploaded: event.uploaded ?? 0,
              failed: event.failed ?? 0,
              images_created: event.images_created ?? 0,
            })
          } else if (event.type === 'done') {
            result = {
              message: event.message ?? 'Images imported',
              catalog_id: event.catalog_id ?? catalogId,
              catalog_file: event.catalog_file ?? '',
              unique_sources_fetched: event.unique_sources_fetched ?? 0,
              images_created: event.images_created ?? 0,
              upload_failures: event.upload_failures ?? 0,
              rows_missing_product: event.rows_missing_product ?? 0,
            }
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Failed to import images from catalog URLs')
          }
        }
      }

      if (!response.ok && !result) {
        throw new Error('Failed to import images from catalog URLs')
      }
      if (!result) {
        throw new Error('Image import ended without a result')
      }
      return result
    }

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to import images from catalog URLs')
    }

    return response.json()
  },

  /**
   * Check backend health
   */
  async healthCheck(): Promise<{ status: string; service: string; version: string }> {
    const response = await apiFetch(`${API_URL}/health`)
    
    if (!response.ok) {
      throw new Error('Backend is not responding')
    }

    return response.json()
  }
}

export type CatalogColumnRuleInput = {
  id?: number
  label: string
  candidates: string[]
  sort_order: number
  is_active: boolean
}

export const catalogColumnRulesAPI = {
  /** Active rules for catalog upload validation (manufacturer or admin). */
  async listForUpload(): Promise<CatalogColumnRuleRecord[]> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const response = await apiFetch(`${API_URL}/catalog-column-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to load catalog column rules')
    }

    const data = await response.json()
    return data.rules ?? []
  },

  /** Full rule list for admin configuration. */
  async listAdmin(): Promise<CatalogColumnRuleRecord[]> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const response = await apiFetch(`${API_URL}/admin/catalog-column-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to load catalog column rules')
    }

    const data = await response.json()
    return data.rules ?? []
  },

  async saveAdmin(rules: CatalogColumnRuleInput[]): Promise<CatalogColumnRuleRecord[]> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const response = await apiFetch(`${API_URL}/admin/catalog-column-rules`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rules }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to save catalog column rules')
    }

    const data = await response.json()
    return data.rules ?? []
  },

  async resetDefaults(): Promise<CatalogColumnRuleRecord[]> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const response = await apiFetch(`${API_URL}/admin/catalog-column-rules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'reset_defaults' }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to reset catalog column rules')
    }

    const data = await response.json()
    return data.rules ?? []
  },
}

export const imageAPI = {
  /**
   * Upload an image file with optimization
   */
  async uploadImage(
    file: File,
    manufacturerId: number,
    options?: { onProgress?: (percent: number) => void }
  ): Promise<ImageUploadResponse> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    if (!manufacturerId) {
      throw new Error('Manufacturer ID is required for image upload')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('manufacturer_id', manufacturerId.toString())

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_URL}/images/upload`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !options?.onProgress) return
        const percent = Math.round((event.loaded / event.total) * 100)
        options.onProgress(percent)
      }

      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText) as ImageUploadResponse & { detail?: string }
          if (xhr.status >= 200 && xhr.status < 300) {
            options?.onProgress?.(100)
            resolve(body)
          } else {
            reject(new Error(body.detail || 'Image upload failed'))
          }
        } catch {
          reject(new Error('Image upload failed'))
        }
      }

      xhr.onerror = () => reject(new Error('Image upload failed'))
      xhr.send(formData)
    })
  },

  /**
   * List files in ImageKit for the manufacturer’s `images` or `catalogs` folder (Admin API list assets).
   * Admins must pass manufacturerId; manufacturers are scoped to their own account.
   */
  async listImageKitManufacturerFolder(options: {
    scope?: 'images' | 'catalogs'
    manufacturerId?: number
    limit?: number
    skip?: number
  }): Promise<ImageKitListFolderResponse> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const params = new URLSearchParams()
    params.set('scope', options.scope ?? 'images')
    if (options.limit != null) params.set('limit', String(options.limit))
    if (options.skip != null) params.set('skip', String(options.skip))
    if (options.manufacturerId != null) {
      params.set('manufacturer_id', String(options.manufacturerId))
    }

    const response = await apiFetch(`${API_URL}/imagekit/list-folder?${params}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as { detail?: string }).detail || 'Failed to list ImageKit folder')
    }

    return response.json()
  },

  /**
   * Bulk assign images to a product
   */
  async bulkAssignToProduct(imageIds: number[], productId: number): Promise<{
    message: string
    requested_count: number
    assigned_count: number
    product_id: number
    product_sku: string
  }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const formData = new FormData()
    imageIds.forEach(id => formData.append('image_ids', id.toString()))
    formData.append('product_id', productId.toString())

    const response = await apiFetch(`${API_URL}/images/bulk-assign-product`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to assign images to product')
    }

    return response.json()
  },

  /**
   * Get list of all uploaded images (same scope rules as GET /api/images for manufacturers).
   * For manufacturer users, also merges files from their ImageKit `images` folder so assets that
   * exist in Media Library but have no `images` row yet still appear (e.g. legacy uploads).
   */
  async listImages(): Promise<ImagesListResponse> {
    const db = await imageAPI.listImagesWithFilters(undefined, undefined, 500, 0)
    if (typeof window === 'undefined') {
      return db
    }
    const user = authAPI.getStoredUser()
    if (!user || authAPI.isAdmin(user)) {
      return db
    }

    try {
      const ikFiles: ImageKitListFolderResponse['files'] = []
      let skip = 0
      const limit = 1000
      for (;;) {
        const page = await imageAPI.listImageKitManufacturerFolder({
          scope: 'images',
          limit,
          skip,
        })
        ikFiles.push(...page.files)
        if (!page.may_have_more || page.files.length === 0) {
          break
        }
        skip += limit
      }
      const merged = mergeDbImagesWithImageKitFolder(db.images, ikFiles)
      return { images: merged, total_images: merged.length }
    } catch {
      return db
    }
  },

  /**
   * Delete an uploaded image
   */
  async deleteImage(imageKey: string): Promise<void> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/images/upload/${encodeURIComponent(imageKey)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Image deletion failed')
    }
  },

  /**
   * Get list of images with filters (admin sees all, manufacturers see their own)
   */
  async listImagesWithFilters(manufacturerId?: number, productId?: number, limit: number = 50, offset: number = 0): Promise<ImagesListResponse> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })
    
    if (manufacturerId) {
      params.append('manufacturer_id', manufacturerId.toString())
    }
    
    if (productId) {
      params.append('product_id', productId.toString())
    }

    const response = await apiFetch(`${API_URL}/images/?${params}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { detail?: string }
      const hint =
        error.detail ||
        `${response.status} ${response.statusText || ''}`.trim() ||
        'Failed to fetch images'
      throw new Error(hint)
    }

    const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid response from images API (empty or not JSON)')
    }
    const nested = raw?.data as Record<string, unknown> | undefined
    const list =
      Array.isArray(raw) ? raw :
      Array.isArray(raw.images) ? raw.images :
      Array.isArray(nested?.images) ? nested.images :
      []
    const total =
      typeof raw.total_images === 'number' ? raw.total_images :
      typeof nested?.total_images === 'number' ? (nested.total_images as number) :
      list.length
    return { images: list as ImageInfo[], total_images: total }
  }
}

export const catalogTemplatesAPI = {
  async list(): Promise<CatalogDamTemplateSummary[]> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const response = await apiFetch(`${API_URL}/catalog-templates`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { detail?: string }
      throw new Error(error.detail || 'Failed to load catalog templates')
    }
    const raw = (await response.json()) as { templates?: CatalogDamTemplateSummary[] }
    return Array.isArray(raw.templates) ? raw.templates : []
  },

  async downloadTemplate(templateId: string): Promise<void> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const response = await apiFetch(
      `${API_URL}/catalog-templates/download?id=${encodeURIComponent(templateId)}`,
      { headers, cache: 'no-store' }
    )
    if (!response.ok) {
      const errJson = (await response.json().catch(() => ({}))) as { detail?: string }
      throw new Error(errJson.detail || 'Failed to download template')
    }
    const blob = await response.blob()
    const cd = response.headers.get('Content-Disposition')
    let filename = 'catalog-template.xlsx'
    const quoted = cd?.match(/filename="([^"]+)"/)
    if (quoted?.[1]) {
      filename = quoted[1]
    } else {
      const plain = cd?.match(/filename=([^;\s]+)/)
      if (plain?.[1]) filename = plain[1].replace(/^"+|"+$/g, '')
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}

export const nauticalAPI = {
  async listProductTypes(): Promise<NauticalProductTypeSummary[]> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const response = await apiFetch(`${API_URL}/nautical/product-types`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { detail?: string }
      throw new Error(error.detail || 'Could not load product types')
    }
    const raw = (await response.json()) as Record<string, unknown>
    const list = raw.product_types
    return Array.isArray(list) ? (list as NauticalProductTypeSummary[]) : []
  },

  async downloadCatalogTemplate(productTypeId: string): Promise<void> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const resolveRes = await apiFetch(
      `${API_URL}/imagekit/templates?product_type_id=${encodeURIComponent(productTypeId)}`,
      { headers, cache: 'no-store' }
    )
    if (!resolveRes.ok) {
      const error = (await resolveRes.json().catch(() => ({}))) as { detail?: string }
      throw new Error(error.detail || 'Failed to resolve catalog template')
    }
    const resolved = (await resolveRes.json()) as ImageKitTemplateByProductTypeResponse
    const template = resolved.product_type.template
    const url = template?.url
    if (!url) {
      throw new Error(
        `No catalog template found for "${resolved.product_type.name}". Contact your Oonni administrator.`
      )
    }
    const filename = template.name?.trim() || `${resolved.product_type.name}.xlsx`

    try {
      const fileRes = await fetch(url, { cache: 'no-store' })
      if (fileRes.ok) {
        const blob = await fileRes.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = filename
        a.click()
        URL.revokeObjectURL(objectUrl)
        return
      }
    } catch {
      // Fall through to server proxy if direct ImageKit fetch is blocked.
    }

    const response = await apiFetch(`${API_URL}/nautical/catalog-template`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ product_type_id: productTypeId }),
    })
    if (!response.ok) {
      const errJson = (await response.json().catch(() => ({}))) as { detail?: string }
      throw new Error(errJson.detail || 'Failed to download catalog template')
    }
    const blob = await response.blob()
    const cd = response.headers.get('Content-Disposition')
    let downloadName = filename
    const quoted = cd?.match(/filename="([^"]+)"/)
    if (quoted?.[1]) {
      downloadName = quoted[1]
    } else {
      const plain = cd?.match(/filename=([^;\s]+)/)
      if (plain?.[1]) downloadName = plain[1].replace(/^"+|"+$/g, '')
    }
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = downloadName
    a.click()
    URL.revokeObjectURL(objectUrl)
  },
}

export const imagekitAPI = {
  /**
   * List Nautical product types with their ImageKit template (if found).
   * Names always come from Nautical; ImageKit files are matched by that name.
   */
  async listTemplates(options?: {
    name?: string
    productTypeId?: string
  }): Promise<ImageKitTemplatesResponse | ImageKitTemplateByProductTypeResponse> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const params = new URLSearchParams()
    if (options?.productTypeId?.trim()) params.set('product_type_id', options.productTypeId.trim())
    else if (options?.name?.trim()) params.set('name', options.name.trim())
    const qs = params.toString()
    const response = await apiFetch(`${API_URL}/imagekit/templates${qs ? `?${qs}` : ''}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { detail?: string }
      throw new Error(error.detail || 'Failed to load catalog templates')
    }
    return (await response.json()) as ImageKitTemplatesResponse | ImageKitTemplateByProductTypeResponse
  },
}

/**
 * Manufacturer API functions
 */
export const manufacturerAPI = {
  /**
   * Get all manufacturers (returns list format for UI)
   */
  async getManufacturers(token: string): Promise<ManufacturerListItem[]> {
    const response = await apiFetch(`${API_URL}/manufacturers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch manufacturers')
    }

    return response.json()
  },

  /**
   * Get all manufacturers (returns full manufacturer objects)
   */
  async getAllManufacturers(token: string): Promise<Manufacturer[]> {
    const response = await apiFetch(`${API_URL}/manufacturers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get manufacturers')
    }

    return response.json()
  },

  /**
   * Get a specific manufacturer by ID
   */
  async getManufacturer(token: string, manufacturerId: number): Promise<Manufacturer> {
    const response = await apiFetch(`${API_URL}/manufacturers/${manufacturerId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get manufacturer')
    }

    return response.json()
  },

  /**
   * Create a new manufacturer
   */
  async createManufacturer(token: string, manufacturerData: {
    name: string
    slug: string
    thumbnail?: string
  }): Promise<Manufacturer> {
    const response = await apiFetch(`${API_URL}/manufacturers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(manufacturerData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to create manufacturer')
    }

    return response.json()
  },

  async updateManufacturer(
    token: string,
    manufacturerId: number,
    data: { name?: string; thumbnail?: string }
  ): Promise<Manufacturer> {
    const response = await apiFetch(`${API_URL}/manufacturers/${manufacturerId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Failed to update manufacturer')
    }

    return response.json()
  },

  /**
   * Get users for a specific manufacturer
   */
  async getManufacturerUsers(token: string, manufacturerId: number): Promise<User[]> {
    const response = await apiFetch(`${API_URL}/manufacturers/${manufacturerId}/users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch manufacturer users')
    }

    return response.json()
  }
}

/**
 * Platform statistics API functions
 */
export const statsAPI = {
  /**
   * Get platform statistics (admin only)
   */
  async getPlatformStats(token: string): Promise<{
    totalManufacturers: number
    totalUsers: number
    totalCatalogs: number
    totalImages: number
    recentActivity: {
      newManufacturers: number
      newUsers: number
      newCatalogs: number
      newImages: number
    }
  }> {
    const response = await apiFetch(`${API_URL}/stats/platform`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch platform statistics')
    }

    return response.json()
  },

  /**
   * Get detailed platform statistics (admin only)
   */
  async getDetailedStats(token: string): Promise<{
    totalManufacturers: number
    totalUsers: number
    totalCatalogs: number
    totalImages: number
    recentActivity: {
      newManufacturers: number
      newUsers: number
      newCatalogs: number
      newImages: number
    }
    monthlyStats: {
      manufacturers: number[]
      users: number[]
      catalogs: number[]
      images: number[]
    }
    topManufacturers: Array<{
      id: number
      name: string
      userCount: number
      catalogCount: number
    }>
    userDistribution: {
      admins: number
      manufacturers: number
      users: number
    }
  }> {
    const response = await apiFetch(`${API_URL}/stats/detailed`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch detailed statistics')
    }

    return response.json()
  }
}

/**
 * Product API functions
 */
export const productAPI = {
  /**
   * Get all products with optional manufacturer filter (admin only)
   */
  async getAllProducts(manufacturerId?: number, limit: number = 50, offset: number = 0): Promise<ProductListResponse> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })
    
    if (manufacturerId) {
      params.append('manufacturer_id', manufacturerId.toString())
    }

    const response = await apiFetch(`${API_URL}/products/admin/all?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch products')
    }

    return response.json()
  },

  /**
   * Preview SKUs from a specific column in a catalog
   */
  async previewSKUsFromCatalog(catalogId: number, skuColumn: string, manufacturerId: number): Promise<{
    message: string
    sku_column: string
    catalog_id: number
    total_skus: number
    preview_skus: string[]
    has_more: boolean
  }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/products/preview-skus`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        catalog_id: catalogId,
        sku_column: skuColumn,
        manufacturer_id: manufacturerId
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to preview SKUs')
    }

    return response.json()
  },

  /**
   * Create products from a catalog using a specific SKU column
   */
  async createProductsFromCatalog(catalogId: number, skuColumn: string, manufacturerId: number): Promise<{
    message: string
    created_count: number
    total_requested: number
    sku_column: string
    catalog_id: number
    products: Array<{
      id: number
      sku: string
      manufacturer_id: number
      catalog_id: number
      created_at: string
    }>
  }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await apiFetch(`${API_URL}/catalogs/products/from-catalog-column`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        catalog_id: catalogId,
        sku_column: skuColumn,
        manufacturer_id: manufacturerId
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to create products from catalog')
    }

    return response.json()
  }
}

export type InventoryAttribute = {
  id?: string | null
  name: string
  slug?: string | null
  value?: string | null
  inputType?: string | null
  valueRequired?: boolean | null
  values?: Array<{
    slug?: string | null
    name?: string | null
    plainText?: string | null
    richText?: string | null
    boolean?: boolean | null
    amount?: string | number | null
    value?: string | null
  }>
}

export type InventoryVariantRow = {
  id: number
  nautical_id: string
  name: string
  sku?: string | null
  seo_description?: string | null
  dimensions?: {
    length?: number | null
    width?: number | null
    height?: number | null
    unit?: string | null
  } | null
  attributes: InventoryAttribute[]
  images: Array<{ id?: string | null; url?: string | null }>
  completeness?: EntityCompleteness
}

export type InventoryCategoryOption = {
  id: string
  name: string
  slug: string
  path: string
  level: number
  parent_id: string | null
}

export type InventoryProductRow = {
  id: number
  nautical_id: string
  slug: string
  name: string
  description?: string | null
  seo_title?: string | null
  seo_description?: string | null
  external_id: string | null
  status: string | null
  is_published: boolean
  available_for_purchase: boolean
  images: Array<{ url?: string | null }>
  category: { id?: string | null; slug?: string | null; name?: string | null } | null
  product_type: { id?: string | null; slug?: string | null; name?: string | null } | null
  attributes: InventoryAttribute[]
  variants?: InventoryVariantRow[]
  variant_count?: number
  completeness?: ProductCompleteness
  synced_at: string
  traide_synced?: number
  traide_errors?: string[]
}

export type InventoryAttributeWrite = {
  name: string
  value: string
  id?: string | null
  slug?: string | null
  inputType?: string | null
  valueRequired?: boolean | null
}

export type InventoryProductInput = {
  name: string
  slug?: string
  external_id?: string | null
  status?: string | null
  is_published?: boolean
  available_for_purchase?: boolean
  description?: string | null
  seo_title?: string | null
  seo_description?: string | null
  category_id?: string | null
  category_name?: string | null
  product_type_name?: string | null
  attributes?: InventoryAttributeWrite[]
}

export type InventoryVariantInput = {
  name: string
  sku?: string | null
  seo_description?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  unit?: string | null
  attributes?: InventoryAttributeWrite[]
  images?: Array<{ id?: string | null; url?: string | null }>
}

function withManufacturerId(path: string, manufacturerId?: number | null): string {
  if (!manufacturerId || manufacturerId < 1) return path
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}manufacturer_id=${manufacturerId}`
}

async function inventoryRequest<T>(
  path: string,
  options?: { method?: string; body?: unknown; manufacturerId?: number | null }
): Promise<T> {
  const token = authAPI.getToken()
  if (!token) throw new Error('Authentication required')

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (options?.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await apiFetch(`${API_URL}${withManufacturerId(path, options?.manufacturerId)}`, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Could not save this catalog change')
  }
  return response.json()
}

export const inventoryAPI = {
  async listProducts(
    page = 1,
    limit = 10,
    options?: {
      search?: string
      sort?: string
      order?: 'asc' | 'desc'
      completeness?: string
      issues?: string[]
      manufacturerId?: number | null
    }
  ): Promise<{
    products: InventoryProductRow[]
    total: number
    page: number
    limit: number
    total_pages: number
  }> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (options?.search?.trim()) params.set('search', options.search.trim())
    if (options?.sort) params.set('sort', options.sort)
    if (options?.order) params.set('order', options.order)
    if (options?.completeness?.trim()) params.set('completeness', options.completeness.trim())
    if (options?.issues?.length) params.set('issues', options.issues.join(','))
    if (options?.manufacturerId && options.manufacturerId > 0) {
      params.set('manufacturer_id', String(options.manufacturerId))
    }

    const response = await apiFetch(`${API_URL}/inventory/products?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Could not load your catalog')
    }
    return response.json()
  },

  async listVariants(
    productId: number,
    manufacturerId?: number | null
  ): Promise<{ variants: InventoryVariantRow[] }> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const response = await apiFetch(
      `${API_URL}${withManufacturerId(`/inventory/products/${productId}/variants`, manufacturerId)}`,
      { cache: 'no-store' }
    )
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Failed to load variants')
    }
    return response.json()
  },

  async getProduct(productId: number, manufacturerId?: number | null): Promise<InventoryProductRow> {
    return inventoryRequest(`/inventory/products/${productId}`, { manufacturerId })
  },

  async createProduct(
    payload: InventoryProductInput,
    manufacturerId?: number | null
  ): Promise<InventoryProductRow> {
    return inventoryRequest('/inventory/products/create', { method: 'POST', body: payload, manufacturerId })
  },

  async updateProduct(
    productId: number,
    payload: InventoryProductInput,
    manufacturerId?: number | null
  ): Promise<InventoryProductRow> {
    return inventoryRequest(`/inventory/products/${productId}`, {
      method: 'PATCH',
      body: payload,
      manufacturerId,
    })
  },

  async deleteProduct(
    productId: number,
    manufacturerId?: number | null
  ): Promise<{ deleted: boolean; id: number }> {
    return inventoryRequest(`/inventory/products/${productId}`, { method: 'DELETE', manufacturerId })
  },

  async createVariant(
    productId: number,
    payload: InventoryVariantInput,
    manufacturerId?: number | null
  ): Promise<{
    variant: InventoryVariantRow
    traide_synced?: number
    traide_errors?: string[]
  }> {
    return inventoryRequest(`/inventory/products/${productId}/variants`, {
      method: 'POST',
      body: payload,
      manufacturerId,
    })
  },

  async updateVariant(
    productId: number,
    variantId: number,
    payload: InventoryVariantInput,
    manufacturerId?: number | null
  ): Promise<{
    variant: InventoryVariantRow
    traide_synced?: number
    traide_errors?: string[]
  }> {
    return inventoryRequest(`/inventory/products/${productId}/variants/${variantId}`, {
      method: 'PATCH',
      body: payload,
      manufacturerId,
    })
  },

  async deleteVariant(
    productId: number,
    variantId: number,
    manufacturerId?: number | null
  ): Promise<{ deleted: boolean; id: number }> {
    return inventoryRequest(`/inventory/products/${productId}/variants/${variantId}`, {
      method: 'DELETE',
      manufacturerId,
    })
  },

  async downloadBulk(kind: 'products' | 'variants', options?: {
    search?: string
    completeness?: string
    issues?: string[]
    manufacturerId?: number | null
  }): Promise<void> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')
    const params = new URLSearchParams({ kind })
    if (options?.search?.trim()) params.set('search', options.search.trim())
    if (options?.completeness?.trim()) params.set('completeness', options.completeness.trim())
    if (options?.issues?.length) params.set('issues', options.issues.join(','))
    if (options?.manufacturerId && options.manufacturerId > 0) {
      params.set('manufacturer_id', String(options.manufacturerId))
    }
    const response = await apiFetch(`${API_URL}/inventory/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Could not download your catalog file')
    }
    const blob = await response.blob()
    const cd = response.headers.get('Content-Disposition')
    let filename = `inventory-${kind}.xlsx`
    const quoted = cd?.match(/filename="([^"]+)"/)
    if (quoted?.[1]) filename = quoted[1]
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  async uploadBulk(
    file: File,
    kind?: 'products' | 'variants',
    manufacturerId?: number | null
  ): Promise<{
    kind: 'products' | 'variants'
    updated: number
    skipped: number
    errors: string[]
    traide_synced: number
    traide_errors: string[]
  }> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')
    const formData = new FormData()
    formData.append('file', file)
    if (kind) formData.append('kind', kind)
    const response = await apiFetch(`${API_URL}${withManufacturerId('/inventory/import', manufacturerId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Could not upload your catalog file')
    }
    return response.json()
  },

  async sync(manufacturerId?: number | null): Promise<{
    seller_id: string
    products_synced: number
    variants_synced: number
  }> {
    const token = authAPI.getToken()
    if (!token) throw new Error('Authentication required')

    const response = await apiFetch(`${API_URL}${withManufacturerId('/inventory/products', manufacturerId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Failed to sync inventory')
    }
    return response.json()
  },

  async listCategories(): Promise<{ categories: InventoryCategoryOption[]; total: number }> {
    return inventoryRequest('/inventory/categories')
  },

  async syncCategories(): Promise<{
    synced: number
    removed: number
    total: number
    categories: InventoryCategoryOption[]
  }> {
    return inventoryRequest('/inventory/categories/sync', { method: 'POST' })
  },
}

