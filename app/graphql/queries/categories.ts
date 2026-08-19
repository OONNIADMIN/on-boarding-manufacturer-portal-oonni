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
