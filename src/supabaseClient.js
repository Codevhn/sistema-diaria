import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Placeholder credentials; replace with project-specific values.
const SUPABASE_URL = 'https://zxdxskldmwzwjmmmqsvc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ad3HhXrb0jTsUVvq9_PQxg_71XPQmVZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
