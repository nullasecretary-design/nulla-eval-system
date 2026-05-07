import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Server-side admin client. Uses the secret key, bypasses RLS.
// NEVER import this from a Client Component or expose to the browser.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

if (!supabaseUrl || !secretKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
}

export const supabaseAdmin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
