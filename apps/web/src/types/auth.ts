import { Profile, UserRole } from "./database";

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
