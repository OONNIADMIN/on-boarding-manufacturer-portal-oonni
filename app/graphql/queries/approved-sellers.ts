export const APPROVED_SELLERS_QUERY = `
query ApprovedSellers($search: String!, $after: String) {
  sellers(first: 100, after: $after, filter: { search: $search, status: APPROVED }) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        companyName
        id
      }
    }
  }
}
`;

/** Same name search without the approved-only filter. Loaded catalogs can sit on sellers that are not APPROVED yet. */
export const SELLERS_SEARCH_QUERY = `
query SellersSearch($search: String!, $after: String) {
  sellers(first: 100, after: $after, filter: { search: $search }) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        companyName
        id
      }
    }
  }
}
`;

/** Full seller list. Used when the search filter does not return the company name. */
export const SELLERS_PAGE_QUERY = `
query SellersPage($after: String) {
  sellers(first: 100, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        companyName
        id
      }
    }
  }
}
`;
