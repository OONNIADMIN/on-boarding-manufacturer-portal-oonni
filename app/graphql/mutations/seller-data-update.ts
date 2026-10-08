export const SELLER_DATA_UPDATE_MUTATION = `
mutation ($id: ID!, $input: SellerUpdateInput!) {
  sellerDataUpdate(id: $id, input: $input) {
    ok
    seller {
      id
      companyName
      status
    }
    sellerErrors {
      field
      message
      code
    }
  }
}
`;

export type SellerDataUpdatePayload = {
  sellerDataUpdate: {
    ok?: boolean | null;
    seller: {
      id: string;
      companyName?: string | null;
      status?: string | null;
    } | null;
    sellerErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
    }>;
  };
};
