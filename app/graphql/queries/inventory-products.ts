export const INVENTORY_PRODUCTS_QUERY = `
query InventoryProducts($first: Int!, $after: String, $seller: ID!) {
  products(first: $first, after: $after, filter: { seller: $seller, isStaff: true }) {
    pageInfo {
      endCursor
      hasNextPage
      hasPreviousPage
      startCursor
    }
    edges {
      node {
        slug
        id
        name
        images {
          id
          url
          sortOrder
        }
        descriptionHtml
        description
        currency
        seoTitle
        seoDescription
        externalId
        externalSource
        isDigital
        isShippingRequired
        isBundle
        allowSellerVariants
        availableForPurchase
        status
        isPublished
        warnings {
          code
          message
        }
        hasWarnings
        hasVariantOptions
        category {
          id
          slug
          name
        }
        productType {
          id
          slug
          name
        }
        attributes {
          attribute {
            id
            slug
            name
            inputType
            valueRequired
          }
          values {
            slug
            name
            plainText
            richText
            boolean
            amount
          }
        }
        variants {
          id
          name
          sku
          seoDescription
          seoTitle
          externalId
          externalSource
          dimensions {
            width
            height
            length
            unit
          }
          images {
            id
            url
            sortOrder
          }
          attributes {
            attribute {
              id
              slug
              name
              inputType
              valueRequired
            }
            values {
              slug
              name
              plainText
              richText
              boolean
              amount
            }
          }
        }
      }
    }
  }
}
`;
