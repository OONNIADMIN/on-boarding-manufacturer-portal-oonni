export const SELLER_AGREEMENT_STATE_QUERY = `
query ($id: ID!) {
  seller(id: $id) {
    id
    privateMetadata {
      key
      value
    }
    agreement {
      id
      slug
      defaultCommission
    }
    agreementAcknowledged
    sellerAgreements(first: 10) {
      edges {
        node {
          id
          acknowledgedOn
          plan {
            id
            slug
            defaultCommission
          }
        }
      }
    }
  }
}
`;

export type SellerAgreementStatePayload = {
  seller: {
    id: string;
    privateMetadata: Array<{ key: string; value: string }>;
    agreement: {
      id: string;
      slug: string;
      defaultCommission: number | string;
    } | null;
    agreementAcknowledged: string | null;
    sellerAgreements: {
      edges: Array<{
        node: {
          id: string;
          acknowledgedOn: string | null;
          plan: {
            id: string;
            slug: string;
            defaultCommission: number | string;
          } | null;
        };
      }>;
    };
  } | null;
};
