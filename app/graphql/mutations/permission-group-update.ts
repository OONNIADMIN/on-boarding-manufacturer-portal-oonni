export const PERMISSION_GROUP_UPDATE_MUTATION = `
mutation ($id: ID!, $input: PermissionGroupUpdateInput!) {
  permissionGroupUpdate(id: $id, input: $input) {
    group {
      id
      name
    }
    permissionGroupErrors {
      field
      message
      code
    }
  }
}
`;

export type PermissionGroupUpdatePayload = {
  permissionGroupUpdate: {
    group: { id: string; name?: string | null } | null;
    permissionGroupErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
    }>;
  };
};
