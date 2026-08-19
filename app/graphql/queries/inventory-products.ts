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
        dimensions {
          length
          width
          height
          unit
        }
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
          }
          attributes {
            attribute {
              id
              slug
              name
              inputType
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
