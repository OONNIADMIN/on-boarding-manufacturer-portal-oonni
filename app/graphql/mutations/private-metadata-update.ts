export const PRIVATE_METADATA_UPDATE_MUTATION = `
mutation ($id: ID!, $input: [MetadataInput!]!) {
  privateMetadataUpdate(id: $id, input: $input) {
    metadataErrors {
      field
      message
      code
    }
  }
}
`;

export type MarketplaceMetadataError = {
  field?: string | null;
  message?: string | null;
  code?: string | null;
};

export type PrivateMetadataUpdatePayload = {
  privateMetadataUpdate: {
    metadataErrors: MarketplaceMetadataError[];
  };
};
