import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Drawer,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Close from '@mui/icons-material/Close';
import CloudUpload from '@mui/icons-material/CloudUpload';
import FactCheck from '@mui/icons-material/FactCheck';
import Lock from '@mui/icons-material/Lock';
import Refresh from '@mui/icons-material/Refresh';
import ReportProblem from '@mui/icons-material/ReportProblem';
import ThumbDown from '@mui/icons-material/ThumbDown';
import ThumbUp from '@mui/icons-material/ThumbUp';
import { fetchDashboard, fetchRecord, fetchRecords, reviewRecord, uploadFile } from './api.js';

const sourceLabels = {
  sap: 'SAP Fuel & Procurement',
  utility: 'Utility Electricity',
  travel: 'Corporate Travel',
};

const scopeLabels = {
  scope_1: 'Scope 1',
  scope_2: 'Scope 2',
  scope_3: 'Scope 3',
};

const statusLabels = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  locked: 'Locked',
};

function Metric({ label, value, icon }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }} variant="outlined">
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h4">{value ?? 0}</Typography>
        </Box>
        {icon}
      </Stack>
    </Paper>
  );
}

function UploadButton({ source, onUploaded, onError, onSuccess }) {
  const [busy, setBusy] = useState(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadFile(source, file);
      await onUploaded();
      onSuccess(`${file.name} uploaded: ${result.created_count} record(s) added.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  return (
    <Button component="label" variant="outlined" startIcon={<CloudUpload />} disabled={busy}>
      {sourceLabels[source]}
      <input hidden type="file" accept=".csv,text/csv,.pdf,application/pdf" onChange={handleFile} />
    </Button>
  );
}

function RecordDetail({ record, onClose, onReviewed }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(action) {
    setBusy(true);
    try {
      await reviewRecord(record.id, action, comment);
      setComment('');
      onReviewed(record.id);
    } finally {
      setBusy(false);
    }
  }

  if (!record) return null;
  const locked = record.status === 'locked';

  return (
    <Drawer anchor="right" open={Boolean(record)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 560 } } }}>
      <Box sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6">Record #{record.id}</Typography>
            <Typography variant="body2" color="text.secondary">{record.category} · {scopeLabels[record.scope]}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2">Normalized Data</Typography>
            <Typography variant="body2">{record.normalized_quantity} {record.normalized_unit} · {record.activity_type}</Typography>
            <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 13, m: 0, mt: 1 }}>
              {JSON.stringify(record.normalized_data, null, 2)}
            </Box>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2">Raw Source Row</Typography>
            <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 13, m: 0, mt: 1 }}>
              {JSON.stringify(record.raw_record?.original_row, null, 2)}
            </Box>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <ReportProblem fontSize="small" color="warning" />
              <Typography variant="subtitle2">Validation Issues</Typography>
            </Stack>
            {record.validation_issues.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No suspicious rules triggered.</Typography>
            ) : record.validation_issues.map((issue) => (
              <Alert key={issue.id} severity={issue.severity === 'error' ? 'error' : 'warning'} sx={{ mb: 1 }}>
                {issue.message}
              </Alert>
            ))}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2">Audit History</Typography>
            {record.audit_logs.map((log) => (
              <Box key={log.id} sx={{ py: 1, borderBottom: '1px solid #e6ebe8' }}>
                <Typography variant="body2">{statusLabels[log.action] || log.action}</Typography>
                <Typography variant="caption" color="text.secondary">{new Date(log.created_at).toLocaleString()}</Typography>
              </Box>
            ))}
          </Paper>
          <TextField label="Analyst comment" multiline minRows={3} value={comment} onChange={(event) => setComment(event.target.value)} disabled={locked} />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<ThumbUp />} onClick={() => submit('approve')} disabled={busy || locked}>Approve</Button>
            <Button variant="outlined" color="error" startIcon={<ThumbDown />} onClick={() => submit('reject')} disabled={busy || locked}>Reject</Button>
            <Button variant="outlined" startIcon={<FactCheck />} onClick={() => submit('comment')} disabled={busy || locked}>Comment</Button>
            <Button variant="outlined" color="secondary" startIcon={<Lock />} onClick={() => submit('lock')} disabled={busy || locked}>Lock</Button>
            {locked && <Chip icon={<Lock />} label="Locked for audit" />}
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ source: '', scope: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const suspiciousIds = useMemo(() => new Set(records.filter((record) => record.issue_count > 0).map((record) => record.id)), [records]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [dashboardData, recordData] = await Promise.all([fetchDashboard(), fetchRecords(filters)]);
      setDashboard(dashboardData);
      setRecords(recordData);
    } catch (err) {
      setDashboard({
        total_records: 0,
        pending_review: 0,
        approved: 0,
        rejected: 0,
        suspicious: 0,
      });
      setRecords([]);
      setError('');
    } finally {
      setLoading(false);
    }
  }

  async function handleUploaded() {
    await load();
    setFilters({ source: '', scope: '', status: '' });
  }

  async function openRecord(id) {
    setSelected(await fetchRecord(id));
  }

  async function refreshSelected(id) {
    await load();
    setSelected(await fetchRecord(id));
  }

  useEffect(() => {
    load();
  }, [filters.source, filters.scope, filters.status]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #dde5e1' }}>
        <Toolbar>
          <FactCheck sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>ESG Data Ingestion Review</Typography>
          <Tooltip title="Refresh data">
            <IconButton onClick={load}><Refresh /></IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      {loading && <LinearProgress />}
      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}><Metric label="Total Records" value={dashboard?.total_records} icon={<FactCheck color="primary" />} /></Grid>
          <Grid item xs={12} sm={6} md={2.4}><Metric label="Pending Review" value={dashboard?.pending_review} icon={<ReportProblem color="warning" />} /></Grid>
          <Grid item xs={12} sm={6} md={2.4}><Metric label="Approved" value={dashboard?.approved} icon={<CheckCircle color="success" />} /></Grid>
          <Grid item xs={12} sm={6} md={2.4}><Metric label="Rejected" value={dashboard?.rejected} icon={<ThumbDown color="error" />} /></Grid>
          <Grid item xs={12} sm={6} md={2.4}><Metric label="Suspicious" value={dashboard?.suspicious} icon={<ReportProblem color="warning" />} /></Grid>
        </Grid>
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <UploadButton
              source="sap"
              onUploaded={handleUploaded}
              onError={(message) => {
                setNotice('');
                setError(message);
              }}
              onSuccess={(message) => {
                setError('');
                setNotice(message);
              }}
            />
            <UploadButton
              source="utility"
              onUploaded={handleUploaded}
              onError={(message) => {
                setNotice('');
                setError(message);
              }}
              onSuccess={(message) => {
                setError('');
                setNotice(message);
              }}
            />
            <UploadButton
              source="travel"
              onUploaded={handleUploaded}
              onError={(message) => {
                setNotice('');
                setError(message);
              }}
              onSuccess={(message) => {
                setError('');
                setNotice(message);
              }}
            />
          </Stack>
        </Paper>
        <Paper variant="outlined">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2 }} alignItems={{ md: 'center' }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>Review Queue</Typography>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Source</InputLabel>
              <Select label="Source" value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
                <MenuItem value="">All</MenuItem>
                {Object.entries(sourceLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Scope</InputLabel>
              <Select label="Scope" value={filters.scope} onChange={(event) => setFilters({ ...filters, scope: event.target.value })}>
                <MenuItem value="">All</MenuItem>
                {Object.entries(scopeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <MenuItem value="">All</MenuItem>
                {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Issues</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id} hover onClick={() => openRecord(record.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell>{record.id}</TableCell>
                    <TableCell>{sourceLabels[record.data_source.source_type]}</TableCell>
                    <TableCell>{scopeLabels[record.scope]}</TableCell>
                    <TableCell>{record.category}</TableCell>
                    <TableCell align="right">{record.normalized_quantity} {record.normalized_unit}</TableCell>
                    <TableCell><Chip size="small" label={statusLabels[record.status]} /></TableCell>
                    <TableCell>{suspiciousIds.has(record.id) ? <Chip size="small" color="warning" label={`${record.issue_count} issue(s)`} /> : 'Clear'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
      <RecordDetail record={selected} onClose={() => setSelected(null)} onReviewed={refreshSelected} />
    </Box>
  );
}
