const API_BASE_URLS = [
  import.meta.env.VITE_API_BASE_URL,
  '/api',
  'https://esg-data-ingestion-platform.onrender.com/api',
  'https://esg-ingestion-backend.onrender.com/api',
].filter(Boolean);
const TENANT = import.meta.env.VITE_TENANT || 'demo';
const STORAGE_KEY = `esg-records-${TENANT}`;

function readLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function localDashboard() {
  const records = readLocalRecords();
  return {
    total_records: records.length,
    pending_review: records.filter((record) => record.status === 'pending_review').length,
    approved: records.filter((record) => record.status === 'approved').length,
    rejected: records.filter((record) => record.status === 'rejected').length,
    suspicious: records.filter((record) => record.issue_count > 0).length,
    by_status: [],
    by_scope: [],
    by_source: [],
  };
}

function sourceCategory(source) {
  return {
    sap: 'Fuel procurement',
    utility: 'Electricity usage',
    travel: 'Corporate travel',
  }[source] || 'Uploaded source';
}

function sourceScope(source) {
  return {
    sap: 'scope_1',
    utility: 'scope_2',
    travel: 'scope_3',
  }[source] || 'scope_3';
}

function createLocalRecord(source, file) {
  const records = readLocalRecords();
  const nextId = Math.max(0, ...records.map((record) => record.id || 0)) + 1;
  const record = {
    id: nextId,
    data_source: { source_type: source },
    scope: sourceScope(source),
    category: sourceCategory(source),
    normalized_quantity: 0,
    normalized_unit: 'kgCO2e',
    activity_type: file.type || 'uploaded_file',
    status: 'pending_review',
    issue_count: file.type === 'application/pdf' ? 1 : 0,
    normalized_data: {
      file_name: file.name,
      file_type: file.type || 'unknown',
      file_size_bytes: file.size,
      note: 'Stored locally because the hosted backend API is not reachable.',
    },
    raw_record: {
      original_row: {
        file_name: file.name,
        source,
      },
    },
    validation_issues: file.type === 'application/pdf'
      ? [{ id: 1, severity: 'warning', message: 'PDF uploaded. Backend extraction is unavailable, so values need review.' }]
      : [],
    audit_logs: [],
  };
  writeLocalRecords([record, ...records]);
  return record;
}

function applyFilters(records, filters) {
  return records.filter((record) => (
    (!filters?.source || record.data_source.source_type === filters.source)
    && (!filters?.scope || record.scope === filters.scope)
    && (!filters?.status || record.status === filters.status)
  ));
}

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
  return request('/dashboard').catch(() => localDashboard());
}

export function fetchRecords(filters) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/records${query ? `?${query}` : ''}`).then((payload) => (
    Array.isArray(payload) ? payload : payload.results || []
  )).catch(() => applyFilters(readLocalRecords(), filters));
}

export function fetchRecord(id) {
  return request(`/records/${id}`).catch(() => {
    const record = readLocalRecords().find((item) => item.id === Number(id));
    if (!record) throw new Error('Record not found');
    return record;
  });
}

export function reviewRecord(id, action, comment) {
  return request(`/records/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }).catch(() => {
    const records = readLocalRecords();
    const statusByAction = {
      approve: 'approved',
      reject: 'rejected',
      lock: 'locked',
    };
    const updated = records.map((record) => (
      record.id === Number(id)
        ? {
          ...record,
          status: statusByAction[action] || record.status,
          audit_logs: [
            { id: Date.now(), action, created_at: new Date().toISOString(), comment },
            ...(record.audit_logs || []),
          ],
        }
        : record
    ));
    writeLocalRecords(updated);
    return updated.find((record) => record.id === Number(id));
  });
}

export function uploadFile(source, file) {
  const body = new FormData();
  body.append('file', file);
  return request(`/upload/${source}`, { method: 'POST', body }).catch(() => {
    const record = createLocalRecord(source, file);
    return {
      batch_id: `local-${Date.now()}`,
      created_count: 1,
      record_ids: [record.id],
    };
  });
}

export const uploadCsv = uploadFile;
