export const GET_ALL_CATEGORIES_QUERY = `
query ($afterCursor: String) {
  categories(first: 100, after: $afterCursor) {
    pageInfo {
      endCursor
      startCursor
      hasNextPage
    }
    edges {
      node {
        name
        id
        slug
        parent {
          id
          slug
          metadata {
            key
            value
          }
        }
        customFields {
          values {
            attribute {
              name
            }
            plainText
          }
        }
        metadata {
          key
          value
        }
      }
    }
  }
}
`;

export const CATEGORIES_FOR_TEMPLATE_QUERY = `
query ($search: String!) {
  categories(first: 100, filter: { search: $search }) {
    edges {
      node {
        name
        slug
        children(first: 100) {
          edges {
            node {
              name
              slug
              children(first: 100) {
                edges {
                  node {
                    name
                    slug
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;
