export function contentSecurityPolicy(config) {
  const supabase = config.authMode === 'account' ? ` ${config.url}` : '';
  const google = config.google ? ' https://accounts.google.com https://oauth2.googleapis.com' : '';
  const googleForm = config.google ? ' https://accounts.google.com' : '';
  return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'${supabase}${googleForm}; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' blob:; media-src 'self' blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://translate.googleapis.com${supabase}${google}`;
}
