export const SELLER_USER_MAPPING_CREATE_MUTATION = `
mutation ($input: SellerUserInput!) {
  sellerUserMappingCreate(input: $input) {
    ok
    sellerUser {
      id
      isDefault
    }
    sellerErrors {
      field
      message
      code
    }
  }
}
`;

export type SellerUserMappingCreatePayload = {
  sellerUserMappingCreate: {
    ok?: boolean | null;
    sellerUser: { id: string; isDefault?: boolean | null } | null;
    sellerErrors: Array<{ field?: string | null; message?: string | null; code?: string | null }>;
  };
};
