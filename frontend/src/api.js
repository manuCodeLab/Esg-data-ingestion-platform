const API_BASE_URLS = [
  import.meta.env.VITE_API_BASE_URL,
  '/api',
  'https://esg-data-ingestion-platform.onrender.com/api',
  'https://esg-ingestion-backend.onrender.com/api',
].filter(Boolean);
const TENANT = import.meta.env.VITE_TENANT || 'demo';

async function request(path, options = {}) {
  let lastError;
  for (const baseUrl of API_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          'X-Tenant': TENANT,
          ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(options.headers || {}),
        },
      });
      if (response.ok) {
        return response.json();
      }
      const payload = await response.json().catch(() => ({}));
      lastError = new Error(payload.detail || `Request failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Request failed');
}

export function fetchDashboard() {
  return request('/dashboard');
}

export function fetchRecords(filters) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/records${query ? `?${query}` : ''}`).then((payload) => (
    Array.isArray(payload) ? payload : payload.results || []
  ));
}

export function fetchRecord(id) {
  return request(`/records/${id}`);
}

export function reviewRecord(id, action, comment) {
  return request(`/records/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
}

export function uploadFile(source, file) {
  const body = new FormData();
  body.append('file', file);
  return request(`/upload/${source}`, { method: 'POST', body });
}

export const uploadCsv = uploadFile;
