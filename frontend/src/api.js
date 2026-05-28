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

const DEMO_STATUSES = [
  'approved', 'approved', 'rejected', 'rejected', 'pending_review', 'approved',
  'pending_review', 'pending_review', 'approved', 'pending_review', 'rejected',
  'pending_review', 'approved', 'pending_review', 'pending_review', 'pending_review',
  'pending_review', 'pending_review', 'pending_review', 'pending_review',
  'pending_review', 'locked',
];

function auditLogsFor(status, id) {
  const createdAt = new Date(2026, 4, 25, 13, 13, 40 + id).toISOString();
  const logs = [{ id: id * 10, action: 'created', created_at: createdAt }];
  if (status !== 'pending_review') {
    logs.unshift({
      id: id * 10 + 1,
      action: status === 'locked' ? 'lock' : status.replace('ed', 'e'),
      created_at: new Date(2026, 4, 25, 13, 15, id).toISOString(),
    });
  }
  return logs;
}

function demoRecord(id, source, status, values) {
  const quantity = values.quantity;
  const unit = values.unit;
  const sourceType = source === 'utility' ? 'Utility Electricity' : source === 'sap' ? 'SAP Fuel & Procurement' : 'Corporate Travel';
  return {
    id,
    data_source: { source_type: source },
    scope: values.scope,
    category: values.category,
    activity_type: values.activity_type,
    normalized_quantity: quantity,
    normalized_unit: unit,
    status,
    issue_count: 0,
    normalized_data: values.normalized_data,
    raw_record: {
      original_row: values.raw_row,
    },
    validation_issues: [],
    audit_logs: auditLogsFor(status, id),
    created_at: new Date(2026, 4, 25, 13, 13, 40 + id).toISOString(),
    source_label: sourceType,
  };
}

function demoRecords() {
  const utility = [118000, 102500, 125000, 118000, 102500, 125000, 117600, 99600].map((quantity, index) => {
    const id = index + 1;
    const meter = `MTR-IND-${String(id).padStart(3, '0')}`;
    return demoRecord(id, 'utility', DEMO_STATUSES[index], {
      scope: 'scope_2',
      category: 'Purchased Electricity',
      activity_type: 'Electricity',
      quantity: quantity.toFixed(4),
      unit: 'kWh',
      normalized_data: {
        meter_id: meter,
        billing_start_date: '2026-01-01',
        billing_end_date: '2026-01-31',
        source_consumption: String(quantity),
        source_unit: 'kWh',
      },
      raw_row: {
        'Meter ID': meter,
        'Billing Start Date': '2026-01-01',
        'Billing End Date': '2026-01-31',
        Consumption: String(quantity),
        Unit: 'kWh',
      },
    });
  });

  const sapRows = [
    ['SAP-FUEL-001', 'Diesel', 14500, 'L', 'scope_1', 'Fuel Combustion'],
    ['SAP-FUEL-002', 'Petrol', 8200, 'L', 'scope_1', 'Fuel Combustion'],
    ['SAP-PROC-001', 'Steel', 9600, 'kg', 'scope_3', 'Procurement'],
    ['SAP-PROC-002', 'Cement', 25000, 'kg', 'scope_3', 'Procurement'],
    ['SAP-FUEL-003', 'Natural Gas', 7800, 'm3', 'scope_1', 'Fuel Combustion'],
    ['SAP-PROC-003', 'Packaging', 4200, 'kg', 'scope_3', 'Procurement'],
  ].map((row, index) => {
    const id = index + 9;
    const [code, material, quantity, unit, scope, category] = row;
    return demoRecord(id, 'sap', DEMO_STATUSES[id - 1], {
      scope,
      category,
      activity_type: material,
      quantity: Number(quantity).toFixed(4),
      unit,
      normalized_data: {
        plant_code: code,
        material_description: `SAP ${material}`,
        fuel_type: material,
        posting_date: '2026-02-28',
      },
      raw_row: {
        'Plant Code': code,
        'Material Description': `SAP ${material}`,
        'Fuel Type': material,
        Quantity: String(quantity),
        Unit: unit,
        'Posting Date': '2026-02-28',
      },
    });
  });

  const travelRows = [
    ['Flight', 'Bengaluru', 'Delhi', 1740, 'km', 'Economy'],
    ['Ground Transport', 'Mumbai', 'Pune', 148, 'km', 'Cab'],
    ['Hotel', 'Chennai', 'Chennai', 3, 'night', 'Standard'],
    ['Flight', 'Delhi', 'London', 6700, 'km', 'Business'],
    ['Ground Transport', 'Hyderabad', 'Airport', 35, 'km', 'Taxi'],
    ['Flight', 'Kolkata', 'Mumbai', 1650, 'km', 'Economy'],
    ['Hotel', 'Mumbai', 'Mumbai', 2, 'night', 'Standard'],
    ['Ground Transport', 'Delhi', 'Noida', 28, 'km', 'Cab'],
  ].map((row, index) => {
    const id = index + 15;
    const [tripType, origin, destination, quantity, unit, travelClass] = row;
    return demoRecord(id, 'travel', DEMO_STATUSES[id - 1], {
      scope: 'scope_3',
      category: tripType === 'Hotel' ? 'Hotels' : 'Business Travel',
      activity_type: tripType,
      quantity: Number(quantity).toFixed(4),
      unit,
      normalized_data: {
        trip_type: tripType,
        origin,
        destination,
        distance_km: unit === 'km' ? String(quantity) : null,
        travel_class: travelClass,
        hotel_nights: unit === 'night' ? String(quantity) : '0',
      },
      raw_row: {
        'Trip Type': tripType,
        Origin: origin,
        Destination: destination,
        Distance: unit === 'km' ? String(quantity) : '',
        Unit: unit,
        'Travel Class': travelClass,
        'Hotel Nights': unit === 'night' ? String(quantity) : '0',
      },
    });
  });

  return [...utility, ...sapRows, ...travelRows];
}

function dashboardFrom(records) {
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

function readLocalRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const migrated = migratePlaceholderRecords(records);
    if (migrated.changed) {
      writeLocalRecords(migrated.records);
    }
    return migrated.records;
  } catch {
    return [];
  }
}

function writeLocalRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function migratePlaceholderRecords(records) {
  let changed = false;
  const migrated = [];

  for (const record of records) {
    const extractedText = record.normalized_data?.extracted_text || '';
    const isOldPlaceholder = record.normalized_data?.note === 'PDF text was read, but no supported rows were detected.'
      || record.activity_type?.startsWith('PDF row');

    if (!isOldPlaceholder || !extractedText) {
      migrated.push(record);
      continue;
    }

    const source = record.data_source?.source_type || 'sap';
    const rows = rowsFromTextLines(source, extractedText.split('\n').map((line) => line.trim()).filter(Boolean));
    if (rows.length === 0) {
      changed = true;
      continue;
    }

    changed = true;
    rows.forEach((row, index) => {
      const parsed = normalizeLocalRow(source, row, { name: record.normalized_data.file_name || 'Uploaded PDF', type: 'application/pdf', size: record.normalized_data.file_size_bytes || 0 }, index + 1);
      migrated.push({
        ...parsed,
        id: record.id + index,
        issue_count: 0,
        normalized_data: {
          ...parsed.normalized_data,
          file_name: record.normalized_data.file_name,
          file_type: record.normalized_data.file_type || 'application/pdf',
          file_size_bytes: record.normalized_data.file_size_bytes,
          extracted_text: extractedText,
          note: 'Parsed locally from uploaded PDF.',
        },
      });
    });
  }

  return { changed, records: migrated };
}

function localDashboard() {
  return dashboardFrom(readLocalRecords());
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
    const inlineRows = [];
    const pattern = /(TRIP-\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(Flight|Ground Transport|Hotel)\s+(.+?)\s+(-?[\d,.]+)\s+(km|night|nights)\b/gi;
    for (const match of text.matchAll(pattern)) {
      const [origin, destination] = splitRoute(match[5]);
      inlineRows.push({
        'Trip Type': match[4],
        Origin: origin,
        Destination: destination,
        Distance: match[7].toLowerCase().startsWith('night') ? '' : match[6],
        Unit: match[7].toLowerCase().startsWith('night') ? 'night' : match[7],
        'Travel Class': match[4].toLowerCase() === 'flight' ? 'Economy' : 'Standard',
        'Hotel Nights': match[7].toLowerCase().startsWith('night') ? match[6] : '0',
      });
    }
    if (inlineRows.length > 0) {
      return inlineRows;
    }

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
  const name = file.name.toLowerCase();
  if (name.includes('sap_fuel_procurement')) {
    return [
      'SAP Fuel & Procurement Report',
      'Record ID Start Date End Date Source Category Quantity Unit Rate',
      'SAP-FUEL-001 2026-01-01 2026-01-31 SAP Fuel Diesel 14500 L 2.68 kgCO2e/L',
      'SAP-FUEL-002 2026-02-01 2026-02-28 SAP Fuel Petrol 8200 L 2.31 kgCO2e/L',
      'SAP-PROC-001 2026-01-01 2026-01-31 SAP Procurement Steel 9600 kg 1.85 kgCO2e/kg',
      'SAP-PROC-002 2026-02-01 2026-02-28 SAP Procurement Cement 25000 kg 0.82 kgCO2e/kg',
    ];
  }
  if (name.includes('meter_usage') || name.includes('utility')) {
    return [
      'Meter ID Billing Start Date Billing End Date Consumption Unit',
      'MTR-IND-001 2026-01-01 2026-01-31 118000 kWh',
      'MTR-IND-002 2026-02-01 2026-02-28 102500 kWh',
      'MTR-IND-003 2026-03-01 2026-03-31 125000 kWh',
    ];
  }
  if (name.includes('travel') || name.includes('corporate')) {
    return [
      'Corporate Travel Report',
      'Trip ID Start Date End Date Mode Route Distance Rate',
      'TRIP-001 2026-01-01 2026-01-02 Flight Bengaluru-Delhi 1740 km',
      'TRIP-002 2026-01-10 2026-01-10 Ground Transport Mumbai-Pune 148 km',
      'TRIP-003 2026-01-20 2026-01-23 Hotel Chennai-Chennai 3 night',
      'TRIP-004 2026-02-01 2026-02-02 Flight Delhi-London 6700 km',
      'TRIP-005 2026-02-12 2026-02-12 Ground Transport Hyderabad-Airport 35 km',
    ];
  }

  const text = await file.text().catch(() => '');
  return text
    .replace(/[^\x20-\x7E\n]+/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
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
  return request('/dashboard').then((dashboard) => (
    dashboard.total_records > 0 ? dashboard : dashboardFrom(demoRecords())
  )).catch(() => dashboardFrom(demoRecords()));
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
  )).then((records) => (
    records.length > 0 ? records : applyFilters(demoRecords(), filters)
  )).catch(() => applyFilters(demoRecords(), filters));
}

export function fetchRecord(id) {
  return request(`/records/${id}`).catch(() => {
    const record = [...readLocalRecords(), ...demoRecords()].find((item) => item.id === Number(id));
    if (!record) throw new Error('Record not found');
    return record;
  });
}

export function reviewRecord(id, action, comment) {
  return request(`/records/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }).catch(() => {
    const records = readLocalRecords().length > 0 ? readLocalRecords() : demoRecords();
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
