import { AppPlan } from '@prisma/client';

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: {
    id: string;
    name: string;
    type: string;
    permissions: string[];
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    website?: string | null;
    sourcingChannels?: string[];
    activePlans: AppPlan[];
  };
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  isVerified: boolean;
  verifiedDomain: string | null;
  sourcingChannels: string[];
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    users: number;
    jobs: number;
    candidates: number;
  };
}

export interface OrganizationRole {
  id: string;
  name: string;
  description: string | null;
  type: string;
  permissions: string[];
  isSystem: boolean;
}

export interface OrganizationMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: {
    id: string;
    name: string;
    type: string;
    description?: string | null;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds
}

export interface AuthResponse {
  user: UserSummary;
  tokens: AuthTokens;
}


