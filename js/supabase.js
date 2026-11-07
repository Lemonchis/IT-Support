import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://lgudzyptpalwklbboyhh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iDL0IPU-5PySM-iqYrNNKw_8HjpTHtb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);