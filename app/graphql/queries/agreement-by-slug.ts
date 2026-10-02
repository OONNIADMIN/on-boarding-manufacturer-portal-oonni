export const AGREEMENT_BY_SLUG_QUERY = `
query ($slug: String!) {
  agreement(slug: $slug) {
    id
    slug
    title
    defaultCommission
    isPublished
  }
}
`;

export type MarketplaceAgreement = {
  id: string;
  slug: string;
  title: string;
  defaultCommission: number | string;
  isPublished: boolean;
};

export type AgreementBySlugPayload = {
  agreement: MarketplaceAgreement | null;
};
