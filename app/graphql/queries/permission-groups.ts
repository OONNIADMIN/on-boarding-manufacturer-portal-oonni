export const PERMISSION_GROUPS_QUERY = `
query ($first: Int!) {
  permissionGroups(first: $first) {
    edges {
      node {
        id
        name
      }
    }
  }
}
`;

export type PermissionGroupsPayload = {
  permissionGroups: {
    edges: Array<{
      node: { id: string; name: string };
    }>;
  } | null;
};
