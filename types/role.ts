/**
 * Role entity types based on API contracts
 * Note: Role interface is also defined in user.ts for convenience
 */

/**
 * Role creation/update request types
 */
export interface CreateRoleRequest {
  name: string;
}

export interface UpdateRoleRequest {
  name?: string;
}
