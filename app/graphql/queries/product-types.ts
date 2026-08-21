export const PRODUCT_TYPES_PAGE_QUERY = `
query ($afterCursor: String) {
  productTypes(first: 100, after: $afterCursor) {
    pageInfo {
      endCursor
      hasNextPage
    }
    edges {
      node {
        id
        slug
        name
        metadata {
          key
          value
        }
        productAttributes {
          id
          slug
          name
          inputType
          valueRequired
        }
        variantAttributes {
          id
          slug
          name
          inputType
          valueRequired
        }
      }
    }
  }
}
`;
