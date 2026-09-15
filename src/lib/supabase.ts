import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL_PROD ||
    'https://ncgbvbpkinrvrzxyttfz.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY_PROD ||
    'sb_publishable_mG6DsF6355IRpy9TJ2ziBw_DSoVyQqE',
);
