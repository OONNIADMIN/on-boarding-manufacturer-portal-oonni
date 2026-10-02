export const STAFF_UPDATE_MUTATION = `
mutation ($id: ID!, $input: StaffUpdateInput!) {
  staffUpdate(id: $id, input: $input) {
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

export type StaffUpdatePayload = {
  staffUpdate: {
    user: { id: string; email?: string | null } | null;
    staffErrors: Array<{
      field?: string | null;
      message?: string | null;
      code?: string | null;
      users?: string[] | null;
    }>;
  };
};
