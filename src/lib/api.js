const tokenKey = 'story-bridge-owner';
let accountSessionToken = '';

export function setAccountSessionToken(token) {
  accountSessionToken = token || '';
}

export function ownerToken() {
  let token = localStorage.getItem(tokenKey);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(tokenKey, token);
  }
  return token;
}

export const headers = () => ({ 'x-owner-token': ownerToken(), ...(accountSessionToken ? { Authorization: `Bearer ${accountSessionToken}` } : {}) });

export async function apiResponse(url, options = {}) {
  return fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
}

export async function api(url, options = {}) {
  const response = await apiResponse(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

// Loads a protected file (for example the profile photo) with the session token and
// returns an object URL the page can display. The caller revokes it when replaced.
export async function authorizedObjectUrl(url) {
  const response = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!response.ok) throw Error(`Request failed (${response.status})`);
  return URL.createObjectURL(await response.blob());
}
