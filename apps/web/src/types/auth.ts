import { Profile, UserRole } from "./database";

export type { UserRole };

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  profile?: Profile;
}

export interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
}
