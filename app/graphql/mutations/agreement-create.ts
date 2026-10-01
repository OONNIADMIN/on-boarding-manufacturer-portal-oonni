export const AGREEMENT_CREATE_MUTATION = `
mutation ($input: AgreementInput!) {
  agreementCreate(input: $input) {
    agreement {
      id
      slug
      title
      defaultCommission
      isPublished
    }
    agreementErrors {
      field
      message
      code
    }
  }
}
`;

export type MarketplaceAgreementError = {
  field?: string | null;
  message?: string | null;
  code?: string | null;
};

export type AgreementCreatePayload = {
  agreementCreate: {
    agreement: {
      id: string;
      slug: string;
      title: string;
      defaultCommission: number | string;
      isPublished: boolean;
    } | null;
    agreementErrors: MarketplaceAgreementError[];
  };
};
