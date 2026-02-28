/**
 * User/Auth entity types based on API contracts
 */

import { Manufacturer } from './manufacturer';

export interface User {
  id: number;
  name: string;
  email: string;
  password?: string; // Optional for responses, required for creation
  manufacturer_id?: number | null;
  manufacturer: Manufacturer | null;
  role_id?: number;
  is_active?: number;
  created_at?: string;
  updated_at?: string;
  role?: Role; // Include role for API responses
  /** True if user has been invited but not yet set password */
  pending_invitation?: boolean;
}

export interface Role {
  id: number;
  name: string;
}

/**
 * User creation request type
 */
export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  manufacturer_id: string;
  role_id?: number;
}

/**
 * User update request type
 */
export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  manufacturer_id?: string;
  role_id?: number;
}

/**
 * Login request type
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login response type
 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: Omit<User, 'password'>;
}

/**
 * User profile type (without sensitive data)
 */
export interface UserProfile {
  id: number;
  name: string;
  email: string;
  manufacturer_id: string;
  role_id?: number;
}
