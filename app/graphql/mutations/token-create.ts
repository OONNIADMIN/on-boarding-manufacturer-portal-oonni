export const TOKEN_CREATE_MUTATION = `
mutation ($email: String!, $password: String!) {
  tokenCreate(email: $email, password: $password) {
    token
    accountErrors {
      field
      message
      code
    }
  }
}
`;

export type TokenCreatePayload = {
  tokenCreate: {
    token?: string | null;
    accountErrors: Array<{ field?: string | null; message?: string | null; code?: string | null }>;
  };
};
