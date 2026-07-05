import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";

export type BackendSupabase = SupabaseClient<Database>;
export type JsonRecord = Record<string, unknown>;

export interface AuthContext {
  email: string;
  isAdmin: boolean;
  name: string;
  photoUrl: string | null;
  uid: string;
}
