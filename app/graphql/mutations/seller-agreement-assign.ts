import type { MarketplaceAgreementError } from "./agreement-create";

export const SELLER_AGREEMENT_ASSIGN_MUTATION = `
mutation ($input: SellerAgreementInput!) {
  sellerAgreementAssign(input: $input) {
    sellerAgreement {
      id
      effectiveAt
      acknowledgedOn
      plan {
        id
        slug
        defaultCommission
      }
    }
    agreementErrors {
      field
      message
      code
    }
  }
}
`;

export type SellerAgreementAssignPayload = {
  sellerAgreementAssign: {
    sellerAgreement: {
      id: string;
      effectiveAt: string;
      acknowledgedOn: string | null;
      plan: {
        id: string;
        slug: string;
        defaultCommission: number | string;
      } | null;
    } | null;
    agreementErrors: MarketplaceAgreementError[];
  };
};
