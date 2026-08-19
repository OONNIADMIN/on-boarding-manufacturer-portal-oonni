/**
 * Traide/Nautical GraphQL queries. Documents live here so operations never embed SDL.
 */

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
            value
          }
        }
        variants {
          id
          name
          sku
          seoDescription
          seoTitle
          externalId
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
              value
            }
          }
        }
      }
    }
  }
}
`;

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
        }
        variantAttributes {
          id
          slug
          name
          inputType
        }
      }
    }
  }
}
`;

export const PRODUCT_TYPE_BY_ID_QUERY = `
query ($id: ID!) {
  productType(id: $id) {
    id
    slug
    name
    productAttributes {
      id
      name
      inputType
    }
    variantAttributes {
      id
      name
      inputType
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

export const TRAIDE_QUERIES = {
  inventoryProducts: INVENTORY_PRODUCTS_QUERY,
  approvedSellers: APPROVED_SELLERS_QUERY,
  productTypesPage: PRODUCT_TYPES_PAGE_QUERY,
  productTypeById: PRODUCT_TYPE_BY_ID_QUERY,
  categoriesForTemplate: CATEGORIES_FOR_TEMPLATE_QUERY,
} as const;

export type TraideQueryName = keyof typeof TRAIDE_QUERIES;
