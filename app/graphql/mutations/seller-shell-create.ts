export const SELLER_SHELL_CREATE_MUTATION = `
mutation ($name: String!) {
  sellerShellCreate(name: $name) {
    ok
    seller {
      id
      companyName
    }
    sellerErrors {
      field
      message
      code
    }
  }
}
`;

export type MarketplaceSellerError = {
  field?: string | null;
  message?: string | null;
  code?: string | null;
};

export type SellerShellCreatePayload = {
  sellerShellCreate: {
    ok?: boolean | null;
    seller: { id: string; companyName?: string | null } | null;
    sellerErrors: MarketplaceSellerError[];
  };
};
