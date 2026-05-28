const API_BASE_URL = '/api';
const TENANT = import.meta.env.VITE_TENANT || 'demo';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'X-Tenant': TENANT,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || `Request failed: ${response.status}`);
  }
  return response.json();
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
