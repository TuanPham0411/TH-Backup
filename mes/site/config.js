// Publishable keys are public. Never put a Supabase secret/service_role key here.
export const supabaseUrl = import.meta.env.VITE_MES_SUPABASE_URL || 'https://aaosgmphvhjcygldocyi.supabase.co';
export const supabaseKey = import.meta.env.VITE_MES_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8LP7RWd68deu9eKX_7EoZg_UMW8oZVM';
export const configured = Boolean(supabaseUrl && supabaseKey);
export const previewMode = import.meta.env.VITE_MES_PREVIEW === 'true';
