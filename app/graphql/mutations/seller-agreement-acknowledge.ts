import type { MarketplaceAgreementError } from "./agreement-create";

export const SELLER_AGREEMENT_ACKNOWLEDGE_MUTATION = `
mutation ($id: ID!, $input: SellerAgreementAcknowledgeInput) {
  sellerAgreementAcknowledge(id: $id, input: $input) {
    sellerAgreement {
      id
      acknowledgedOn
      effectiveAt
      plan {
        id
        slug
        defaultCommission
      }
    }
    user {
      id
      email
    }
    agreementErrors {
      field
      message
      code
    }
  }
}
`;

export type SellerAgreementAcknowledgePayload = {
  sellerAgreementAcknowledge: {
    sellerAgreement: {
      id: string;
      acknowledgedOn: string | null;
      effectiveAt: string;
      plan: {
        id: string;
        slug: string;
        defaultCommission: number | string;
      } | null;
    } | null;
    user: { id: string; email?: string | null } | null;
    agreementErrors: MarketplaceAgreementError[];
  };
};
