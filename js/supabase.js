if(!window.supabase) throw new Error("Supabase library did not load.");
const supabaseClient=window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY,
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);
