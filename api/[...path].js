const BACKEND_API_URL = process.env.BACKEND_API_URL || 'https://esg-data-ingestion-platform.onrender.com/api';

function fallback(path) {
  if (path === 'dashboard') {
    return {
      total_records: 0,
      pending_review: 0,
      approved: 0,
      rejected: 0,
      suspicious: 0,
      by_status: [],
      by_scope: [],
      by_source: [],
    };
  }

  if (path === 'records') {
    return [];
  }

  return null;
}

export default async function handler(request, response) {
  const path = Array.isArray(request.query.path)
    ? request.query.path.join('/')
    : request.query.path || '';
  const query = new URLSearchParams(request.query);
  query.delete('path');
  const queryString = query.toString();
  const target = `${BACKEND_API_URL}/${path}${queryString ? `?${queryString}` : ''}`;

  try {
    const backendResponse = await fetch(target, {
      method: request.method,
      headers: {
        'X-Tenant': request.headers['x-tenant'] || 'demo',
        'Content-Type': request.headers['content-type'] || 'application/json',
      },
    });

    if (backendResponse.ok) {
      const data = await backendResponse.json();
      return response.status(backendResponse.status).json(data);
    }
  } catch {
    // Fall back below so the review dashboard stays usable while the backend wakes up or is reconfigured.
  }

  const data = fallback(path);
  if (data !== null) {
    return response.status(200).json(data);
  }

  return response.status(503).json({ detail: 'Backend API is not reachable. Check the Render backend URL.' });
}
