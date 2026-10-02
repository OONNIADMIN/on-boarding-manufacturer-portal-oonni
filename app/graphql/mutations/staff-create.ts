export const STAFF_CREATE_MUTATION = `
mutation ($input: StaffCreateInput!) {
  staffCreate(input: $input) {
    user {
      id
      email
    }
    staffErrors {
      field
      message
      code
      users
    }
  }
}
`;

export type MarketplaceStaffError = {
  field?: string | null;
  message?: string | null;
  code?: string | null;
  users?: string[] | null;
};

export type StaffCreatePayload = {
  staffCreate: {
    user: { id: string; email?: string | null } | null;
    staffErrors: MarketplaceStaffError[];
  };
};
