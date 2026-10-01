export const SELLER_STAFF_USERS_QUERY = `
query ($id: ID!) {
  seller(id: $id) {
    id
    sellerusers(first: 50) {
      edges {
        node {
          id
          isDefault
          user {
            id
            email
          }
        }
      }
    }
  }
}
`;

export type SellerStaffUsersPayload = {
  seller: {
    id: string;
    sellerusers?: {
      edges: Array<{
        node: {
          id: string;
          isDefault?: boolean | null;
          user: { id: string; email?: string | null };
        };
      }>;
    } | null;
  } | null;
};
