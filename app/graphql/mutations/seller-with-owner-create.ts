export const SELLER_WITH_OWNER_CREATE_MUTATION = `
mutation ($user: SellerOwnerCreateInput!, $seller: DetailedSellerInput!) {
  sellerWithOwnerCreate(user: $user, seller: $seller) {
    seller {
      id
      companyName
      owner {
        id
        email
      }
    }
    sellerErrors {
      field
      message
      code
    }
  }
}
`;

export type SellerWithOwnerCreatePayload = {
  sellerWithOwnerCreate: {
    seller: {
      id: string;
      companyName?: string | null;
      owner: { id: string; email?: string | null } | null;
    } | null;
    sellerErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
    }>;
  };
};
