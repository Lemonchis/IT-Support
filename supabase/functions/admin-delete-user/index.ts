import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (status: number, body: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return jsonResponse(401, { error: 'Authentication is required.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Supabase function environment is not configured.' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return jsonResponse(401, { error: 'The access token is invalid or expired.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  let userId: unknown;
  try {
    ({ userId } = await request.json());
  } catch {
    return jsonResponse(400, { error: 'A valid JSON request body is required.' });
  }
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonResponse(400, { error: 'A valid user ID is required.' });
  }

  const isSelfDeletion = userId === caller.id;
  const { data: callerProfile, error: roleError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();
  if (roleError || (!isSelfDeletion && callerProfile?.role !== 'admin')) {
    return jsonResponse(403, { error: 'Only administrators can delete another user account.' });
  }

  const { error: requestsError } = await adminClient
    .from('repair_requests')
    .delete()
    .eq('user_id', userId);
  if (requestsError) {
    return jsonResponse(500, { error: `Could not remove the user's requests: ${requestsError.message}` });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return jsonResponse(500, { error: `Could not delete the account: ${deleteError.message}` });
  }

  return jsonResponse(200, { message: 'User account and related requests deleted.' });
});
