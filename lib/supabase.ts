import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Public client — safe for browser usage, respects RLS
let publicClientInstance: SupabaseClient | null = null;

export function getSupabasePublicClient(): SupabaseClient {
  if (!publicClientInstance) {
    publicClientInstance = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return publicClientInstance;
}

// Service-role client — server-side only, bypasses RLS when needed
let serviceClientInstance: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!serviceClientInstance) {
    serviceClientInstance = createClient(supabaseUrl!, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serviceClientInstance;
}

// Default export — public client for general use
export const supabase = getSupabasePublicClient();
