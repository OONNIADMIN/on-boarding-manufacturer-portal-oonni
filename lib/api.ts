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
  Product,
  ProductListResponse
} from '@/types'
import { mimeToListFileType } from '@/lib/image-list-json'

// All API calls go to Next.js API routes (same origin — no CORS, no external backend needed)
const API_URL = '/api'

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
  message: string
  original_filename: string
  s3_key: string
  s3_url: string
  file_size_bytes: number
  optimized_size_bytes: number
  manufacturer_id?: number
  user_id: number
  uploaded_at: string
  optimization_info: {
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

function normalizeImageStorageKey(key: string): string {
  return key.trim().replace(/^\/+/u, '').toLowerCase()
}

function imageKitFolderFileToImageInfo(
  f: ImageKitListFolderResponse['files'][number]
): ImageInfo {
  return {
    s3_key: f.filePath,
    s3_url: f.url || f.thumbnail || '',
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
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Login failed')
    }

    const data = await response.json()
    
    // Store token in localStorage and cookie
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      
      // Set cookie for middleware authentication
      document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict`
    }
    
    return data
  },

  /**
   * Logout user
   */
  logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      
      // Remove cookie
      document.cookie = 'access_token=; path=/; max-age=0; SameSite=Strict'
    }
  },

  /**
   * Get stored token
   */
  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
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
    const response = await fetch(`${API_URL}/auth/users`, {
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
    const response = await fetch(`${API_URL}/auth/roles`)

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
    console.log('API_URL:', API_URL)
    console.log('Creating user with data:', { ...userData, password: '***' })
    console.log('Authorization header:', `Bearer ${token.substring(0, 20)}...`)
    
    const response = await fetch(`${API_URL}/auth/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    })

    console.log('Response status:', response.status)
    
    if (!response.ok) {
      const error = await response.json()
      console.error('Error response:', error)
      throw new Error(error.detail || 'Failed to create user')
    }

    return response.json()
  },

  /**
   * Verify invitation token
   */
  async verifyInvitation(token: string): Promise<InvitationVerifyResponse> {
    const response = await fetch(`${API_URL}/auth/verify-invitation/${token}`)

    if (!response.ok) {
      throw new Error('Failed to verify invitation token')
    }

    return response.json()
  },

  /**
   * Set password using invitation token
   */
  async setPassword(request: SetPasswordRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/auth/set-password`, {
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
    
    // Store token in localStorage and cookie (auto-login)
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      
      // Set cookie for middleware authentication
      document.cookie = `access_token=${data.access_token}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict`
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
    const response = await fetch(`${API_URL}/auth/invite-manufacturer`, {
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
    const response = await fetch(`${API_URL}/auth/resend-invitation`, {
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
  }
}

export const catalogAPI = {
  /**
   * Upload a catalog file (CSV or Excel)
   */
  async uploadFile(file: File, manufacturerId?: number): Promise<UploadResponse> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const formData = new FormData()
    formData.append('file', file)
    if (manufacturerId !== undefined) {
      formData.append('manufacturer_id', manufacturerId.toString())
    }

    const response = await fetch(`${API_URL}/catalogs/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Upload failed')
    }

    return response.json()
  },

  /**
   * Get list of all catalogs (authenticated)
   */
  async listCatalogs(): Promise<any[]> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch(`${API_URL}/catalogs`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch catalogs')
    }

    return response.json()
  },

  /**
   * Get catalog columns for preview and selection
   */
  async getColumns(catalogId: number): Promise<{ list_columns: string[] }> {
    const token = authAPI.getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch(`${API_URL}/catalogs/${catalogId}/columns`, {
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
    const response = await fetch(`${API_URL}/catalogs/${catalogId}/preview-skus?${params}`, {
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

    const response = await fetch(`${API_URL}/catalogs/${catalogId}`, {
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

    const response = await fetch(`${API_URL}/catalogs/${catalogId}`, {
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

    const response = await fetch(`${API_URL}/catalogs/${catalogId}/notify-upload`, {
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
    imageColumn: string,
    manufacturerId: number
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

    const response = await fetch(`${API_URL}/catalogs/${catalogId}/ingest-url-images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sku_column: skuColumn,
        image_column: imageColumn,
        manufacturer_id: manufacturerId,
      }),
    })

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
    const response = await fetch(`${API_URL}/health`)
    
    if (!response.ok) {
      throw new Error('Backend is not responding')
    }

    return response.json()
  }
}

export const imageAPI = {
  /**
   * Upload an image file with optimization
   */
  async uploadImage(file: File, manufacturerId: number): Promise<ImageUploadResponse> {
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

    const response = await fetch(`${API_URL}/images/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Image upload failed')
    }

    return response.json()
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

    const response = await fetch(`${API_URL}/imagekit/list-folder?${params}`, {
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

    const response = await fetch(`${API_URL}/images/bulk-assign-product`, {
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

    const response = await fetch(`${API_URL}/images/upload/${encodeURIComponent(imageKey)}`, {
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

    const response = await fetch(`${API_URL}/images/?${params}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch images')
    }

    const raw = (await response.json()) as Record<string, unknown>
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

export const nauticalAPI = {
  async listProductTypes(): Promise<NauticalProductTypeSummary[]> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const response = await fetch(`${API_URL}/nautical/product-types`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { detail?: string }
      throw new Error(error.detail || 'Failed to load Nautical product types')
    }
    const raw = (await response.json()) as Record<string, unknown>
    const list = raw.product_types
    return Array.isArray(list) ? (list as NauticalProductTypeSummary[]) : []
  },

  async downloadCatalogTemplate(productTypeId: string): Promise<void> {
    const token = authAPI.getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    const response = await fetch(`${API_URL}/nautical/catalog-template`, {
      method: 'POST',
      headers,
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

/**
 * Manufacturer API functions
 */
export const manufacturerAPI = {
  /**
   * Get all manufacturers (returns list format for UI)
   */
  async getManufacturers(token: string): Promise<ManufacturerListItem[]> {
    const response = await fetch(`${API_URL}/manufacturers`, {
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
    const response = await fetch(`${API_URL}/manufacturers`, {
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
    const response = await fetch(`${API_URL}/manufacturers/${manufacturerId}`, {
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
    const response = await fetch(`${API_URL}/manufacturers`, {
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

  /**
   * Get users for a specific manufacturer
   */
  async getManufacturerUsers(token: string, manufacturerId: number): Promise<User[]> {
    const response = await fetch(`${API_URL}/manufacturers/${manufacturerId}/users`, {
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
    const response = await fetch(`${API_URL}/stats/platform`, {
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
    const response = await fetch(`${API_URL}/stats/detailed`, {
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

    const response = await fetch(`${API_URL}/products/admin/all?${params}`, {
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

    const response = await fetch(`${API_URL}/products/preview-skus`, {
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

    const response = await fetch(`${API_URL}/catalogs/products/from-catalog-column`, {
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

