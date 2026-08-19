export const APPROVED_SELLERS_QUERY = `
query ApprovedSellers($search: String!) {
  sellers(first: 100, filter: { search: $search, status: APPROVED }) {
    edges {
      node {
        companyName
        id
      }
    }
  }
}
`;
