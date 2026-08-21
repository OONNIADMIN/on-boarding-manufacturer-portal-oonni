export const PRODUCT_TYPE_BY_ID_QUERY = `
query ($id: ID!) {
  productType(id: $id) {
    id
    slug
    name
    productAttributes {
      id
      name
      slug
      inputType
      valueRequired
    }
    variantAttributes {
      id
      name
      slug
      inputType
      valueRequired
    }
  }
}
`;
