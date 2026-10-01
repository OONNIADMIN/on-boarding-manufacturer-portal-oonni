export const MARKETPLACE_ME_SELLER_QUERY = `
query {
  me {
    id
    email
    seller {
      id
    }
  }
}
`;

export type MarketplaceMeSellerPayload = {
  me: {
    id: string;
    email: string;
    seller: { id: string } | null;
  } | null;
};
