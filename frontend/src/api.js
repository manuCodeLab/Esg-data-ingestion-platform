import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const API_BASE_URLS = [
  import.meta.env.VITE_API_BASE_URL,
  '/api',
  'https://esg-data-ingestion-platform.onrender.com/api',
  'https://esg-ingestion-backend.onrender.com/api',
].filter(Boolean);
const TENANT = import.meta.env.VITE_TENANT || 'demo';
const STORAGE_KEY = `esg-records-${TENANT}`;

const SOURCE_HEADERS = {
  sap: ['Plant Code', 'Material Description', 'Fuel Type', 'Quantity', 'Unit', 'Posting Date'],
  utility: ['Meter ID', 'Billing Start Date', 'Billing End Date', 'Consumption', 'Unit'],
  travel: ['Trip Type', 'Origin', 'Destination', 'Distance', 'Unit', 'Travel Class', 'Hotel Nights'],
};

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

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function rowsFromStackedLines(lines, headers) {
  const normalizedHeaders = headers.map(normalizedText);
  for (let index = 0; index <= lines.length - headers.length; index += 1) {
    const window = lines.slice(index, index + headers.length).map(normalizedText);
    if (!window.every((value, offset) => value === normalizedHeaders[offset])) continue;

    const values = lines.slice(index + headers.length);
    const rows = [];
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += headers.length) {
      const rowValues = values.slice(valueIndex, valueIndex + headers.length);
      if (rowValues.length !== headers.length) break;
      rows.push(Object.fromEntries(headers.map((header, offset) => [header, rowValues[offset]])));
    }
    return rows;
  }
  return [];
}

function splitQuantityUnit(value) {
  const match = String(value || '').match(/^\s*(-?[\d,.]+)\s*([A-Za-z0-9/]+)?\s*$/);
  return [match?.[1] || value || '', match?.[2] || ''];
}

function splitRoute(value) {
  const parts = String(value || '').split(/\s*-\s*/);
  return [parts[0] || '', parts.slice(1).join(' - ') || ''];
}

function rowsFromReportLines(source, lines) {
  const text = lines.join('\n');
  if (source === 'sap') {
    const inlineRows = [];
    const pattern = /(SAP-(?:FUEL|PROC)-\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(SAP Fuel|SAP Procurement)\s+(.+?)\s+(-?[\d,.]+)\s+([A-Za-z0-9/]+)\s+[\d.]+\s+kgCO2e\/[A-Za-z0-9/]+/g;
    for (const match of text.matchAll(pattern)) {
      inlineRows.push({
        'Plant Code': match[1],
        'Material Description': `${match[4]} ${match[5]}`.trim(),
        'Fuel Type': match[5],
        Quantity: match[6],
        Unit: match[7],
        'Posting Date': match[3] || match[2],
      });
    }
    if (inlineRows.length > 0) {
      return inlineRows;
    }

    const rows = rowsFromStackedLines(lines, ['Record ID', 'Start Date', 'End Date', 'Source', 'Category', 'Quantity', 'Unit', 'Rate']);
    return rows.map((row) => ({
      'Plant Code': row['Record ID'],
      'Material Description': `${row.Source || ''} ${row.Category || ''}`.trim(),
      'Fuel Type': row.Category || row.Source || '',
      Quantity: row.Quantity,
      Unit: row.Unit,
      'Posting Date': row['End Date'] || row['Start Date'],
    }));
  }

  if (source === 'travel') {
    const rows = rowsFromStackedLines(lines, ['Trip ID', 'Start Date', 'End Date', 'Mode', 'Route', 'Distance', 'Rate']);
    return rows.map((row) => {
      const [origin, destination] = splitRoute(row.Route);
      const [distance, unit] = splitQuantityUnit(row.Distance);
      return {
        'Trip Type': row.Mode,
        Origin: origin,
        Destination: destination,
        Distance: distance,
        Unit: unit || 'km',
        'Travel Class': 'Standard',
        'Hotel Nights': '0',
      };
    });
  }

  return [];
}

function parseSapLine(line) {
  const match = line.match(/^(.+?)\s+(-?[\d,.]+)\s+([A-Za-z0-9/]+)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})$/);
  if (!match) return null;
  const left = match[1];
  const fuelMatch = left.match(/\s(Diesel|Natural Gas|Petrol|Gasoline|Procurement|Fuel)\s*$/i);
  if (!fuelMatch) return null;
  const beforeFuel = left.slice(0, fuelMatch.index).trim();
  const parts = beforeFuel.split(/\s+/);
  const plantCode = /\d/.test(parts[0] || '') ? parts.shift() : '';
  return {
    'Plant Code': plantCode,
    'Material Description': parts.join(' ') || beforeFuel,
    'Fuel Type': fuelMatch[1],
    Quantity: match[2],
    Unit: match[3],
    'Posting Date': match[4],
  };
}

function parseUtilityLine(line) {
  const match = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+(-?[\d,.]+)\s+([A-Za-z0-9/]+)$/);
  if (!match) return null;
  return {
    'Meter ID': match[1],
    'Billing Start Date': match[2],
    'Billing End Date': match[3],
    Consumption: match[4],
    Unit: match[5],
  };
}

function parseTravelLine(line) {
  const match = line.match(/^(Ground Transport|Flight|Hotel)\s+(\S*)\s+(\S*)\s+(-?[\d,.]+)\s+([A-Za-z0-9/]+)\s+(.+?)\s+(-?[\d,.]+)$/i);
  if (!match) return null;
  return {
    'Trip Type': match[1],
    Origin: match[2],
    Destination: match[3],
    Distance: match[4],
    Unit: match[5],
    'Travel Class': match[6],
    'Hotel Nights': match[7],
  };
}

function rowsFromTextLines(source, lines) {
  const reportRows = rowsFromReportLines(source, lines);
  if (reportRows.length > 0) return reportRows;

  const stackedRows = rowsFromStackedLines(lines, SOURCE_HEADERS[source] || []);
  if (stackedRows.length > 0) return stackedRows;

  const parser = { sap: parseSapLine, utility: parseUtilityLine, travel: parseTravelLine }[source];
  return parser ? lines.map(parser).filter(Boolean) : [];
}

async function extractPdfLines(file) {
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;
  const lines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => item.str?.trim())
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: Math.round(item.transform[5]),
      }))
      .sort((a, b) => (b.y - a.y) || (a.x - b.x));

    let current = [];
    for (const item of items) {
      if (current.length === 0 || Math.abs(current[0].y - item.y) <= 2) {
        current.push(item);
      } else {
        lines.push(current.sort((a, b) => a.x - b.x).map((part) => part.text).join(' '));
        current = [item];
      }
    }
    if (current.length > 0) {
      lines.push(current.sort((a, b) => a.x - b.x).map((part) => part.text).join(' '));
    }
  }

  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function normalizeLocalRow(source, row, file, index) {
  const recordBase = {
    data_source: { source_type: source },
    status: 'pending_review',
    raw_record: {
      original_row: {
        file_name: file.name,
        ...row,
      },
    },
    validation_issues: [],
    audit_logs: [],
  };

  if (source === 'utility') {
    return {
      ...recordBase,
      scope: 'scope_2',
      category: 'Purchased Electricity',
      activity_type: 'Electricity',
      normalized_quantity: row.Consumption || 0,
      normalized_unit: row.Unit || 'kWh',
      normalized_data: {
        meter_id: row['Meter ID'],
        billing_start_date: row['Billing Start Date'],
        billing_end_date: row['Billing End Date'],
      },
    };
  }

  if (source === 'travel') {
    return {
      ...recordBase,
      scope: 'scope_3',
      category: row['Trip Type']?.toLowerCase().includes('hotel') ? 'Hotels' : 'Business Travel',
      activity_type: row['Trip Type'] || 'Travel',
      normalized_quantity: row.Distance || row['Hotel Nights'] || 0,
      normalized_unit: row.Unit || 'km',
      normalized_data: {
        origin: row.Origin,
        destination: row.Destination,
        travel_class: row['Travel Class'],
        hotel_nights: row['Hotel Nights'],
      },
    };
  }

  return {
    ...recordBase,
    scope: normalizedText(row['Fuel Type']).includes('diesel') || normalizedText(row['Fuel Type']).includes('gas')
      ? 'scope_1'
      : 'scope_3',
    category: normalizedText(row['Fuel Type']).includes('procurement') ? 'Procurement' : 'Fuel Combustion',
    activity_type: row['Fuel Type'] || row['Material Description'] || `PDF row ${index}`,
    normalized_quantity: row.Quantity || 0,
    normalized_unit: row.Unit || '',
    normalized_data: {
      plant_code: row['Plant Code'],
      material_description: row['Material Description'],
      fuel_type: row['Fuel Type'],
      posting_date: row['Posting Date'],
    },
  };
}

async function createLocalRecords(source, file) {
  const records = readLocalRecords().filter((record) => record.normalized_data?.file_name !== file.name);
  const nextId = Math.max(0, ...records.map((record) => record.id || 0)) + 1;
  let rows = [];
  let extractedText = '';

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const lines = await extractPdfLines(file);
    extractedText = lines.join('\n');
    rows = rowsFromTextLines(source, lines);
  } else {
    extractedText = await file.text().catch(() => '');
  }

  if (rows.length === 0) {
    rows = [{}];
  }

  const created = rows.map((row, index) => {
    const record = normalizeLocalRow(source, row, file, index + 1);
    const needsReview = Object.keys(row).length === 0;
    return {
      ...record,
      id: nextId + index,
      issue_count: needsReview ? 1 : 0,
      normalized_data: {
        ...record.normalized_data,
        file_name: file.name,
        file_type: file.type || 'unknown',
        file_size_bytes: file.size,
        extracted_text: extractedText.slice(0, 4000),
        note: needsReview ? 'PDF text was read, but no supported rows were detected.' : 'Parsed locally from uploaded PDF.',
      },
      validation_issues: needsReview
        ? [{ id: 1, severity: 'warning', message: 'No supported table rows were detected in the PDF.' }]
        : record.validation_issues,
    };
  });

  writeLocalRecords([...created, ...records]);
  return created;
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
  const localRecords = readLocalRecords();
  if (localRecords.length > 0) {
    return Promise.resolve(localDashboard());
  }
  return request('/dashboard').catch(() => localDashboard());
}

export function fetchRecords(filters) {
  const localRecords = readLocalRecords();
  if (localRecords.length > 0) {
    return Promise.resolve(applyFilters(localRecords, filters));
  }
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
  return request(`/upload/${source}`, { method: 'POST', body }).catch(async () => {
    const records = await createLocalRecords(source, file);
    return {
      batch_id: `local-${Date.now()}`,
      created_count: records.length,
      record_ids: records.map((record) => record.id),
    };
  });
}

export const uploadCsv = uploadFile;
