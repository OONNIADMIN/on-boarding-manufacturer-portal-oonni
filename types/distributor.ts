export type DistributorStatus = "active" | "invite_sent" | "not_invited";

export type AuthorizedDistributor = {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  region: string | null;
  valid_until: string | null;
  status: DistributorStatus;
  invitation_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DistributorInput = {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string | null;
  region?: string | null;
  valid_until?: string | null;
  status?: DistributorStatus;
  send_invite?: boolean;
};
