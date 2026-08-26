'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  Flag,
  ImageOff,
  Loader2,
  Search,
  Shield,
  Timer,
  TrendingUp,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type StatusTab = 'all' | 'submitted' | 'pending' | 'late';
type DisplayStatus = 'submitted' | 'verified' | 'late' | 'missing' | 'flagged';

interface Institution {
  id: number | string;
  name: string;
  code: string;
  region_id: number | string | null;
  is_active: boolean;
  regions?: { id: number | string; name: string } | { id: number | string; name: string }[] | null;
}

interface Submission {
  id: number | string;
  institution_id: number | string;
  submission_date: string | null;
  submission_time: string | null;
  image_url: string | null;
  remarks: string | null;
  status: string;
  is_late: boolean;
  created_at: string;
}

interface CollegeRow {
  institution: Institution;
  submission: Submission | null;
  displayStatus: DisplayStatus;
}

const CUTOFF_LABEL = '10:30 AM';
const SURFACE =
  'bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 hover:border-slate-700/60 shadow-xl rounded-2xl transition-colors';

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

function academicSession(date = new Date()) {
  const year = date.getFullYear();
  const start = date.getMonth() >= 7 ? year : year - 1;
  return `${start}–${String(start + 1).slice(-2)}`;
}

function asId(value: number | string) {
  return String(value);
}

function regionName(institution: Institution) {
  const region = institution.regions;
  if (!region) return null;
  if (Array.isArray(region)) return region[0]?.name ?? null;
  return region.name ?? null;
}

function parseDatePart(value: string | null | undefined) {
  if (!value) return null;
  return String(value).split('T')[0];
}

function normalizeSubmission(item: Record<string, unknown>): Submission {
  const submissionDate = (item.submission_date as string | null) ?? null;
  const submissionTime = (item.submission_time as string | null) ?? (item.submitted_at as string | null) ?? null;
  const createdAt = (item.created_at as string) || '';
  return {
    id: item.id as number | string,
    institution_id: (item.institution_id ?? item.campus_id) as number | string,
    submission_date: submissionDate || parseDatePart(submissionTime) || parseDatePart(createdAt),
    submission_time: submissionTime || createdAt,
    image_url: ((item.image_url as string | null) ?? (item.photo_url as string | null)) || null,
    remarks: ((item.remarks as string | null) ?? (item.notes as string | null)) || null,
    status: String(item.status || 'submitted'),
    is_late: Boolean(item.is_late),
    created_at: createdAt,
  };
}

function formatDateTime(dateStr: string | null, timeStr: string | null) {
  const iso = timeStr || dateStr;
  if (!iso) return '—';
  const parsed = new Date(iso.includes('T') || iso.includes(' ') ? iso : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateStr || '—';
  }
  if (!timeStr && dateStr && !dateStr.includes('T')) {
    return format(parsed, 'MMM d, yyyy');
  }
  return format(parsed, 'MMM d, yyyy • hh:mm a');
}

function formatTimeOnly(timeStr: string | null, createdAt: string | null) {
  const iso = timeStr || createdAt;
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'hh:mm a');
}

function isAfterCutoff(iso: string | null) {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getHours() > 10 || (parsed.getHours() === 10 && parsed.getMinutes() >= 30);
}

function resolveStatus(submission: Submission | null): DisplayStatus {
  if (!submission) return 'missing';
  const late = submission.is_late || isAfterCutoff(submission.submission_time || submission.created_at);
  if (late) return 'late';
  const status = (submission.status || '').toLowerCase();
  if (status === 'verified') return 'verified';
  if (status === 'flagged') return 'flagged';
  return 'submitted';
}

function statusPill(status: DisplayStatus) {
  switch (status) {
    case 'verified':
    case 'submitted':
      return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.12)]';
    case 'late':
      return 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.12)]';
    case 'missing':
    case 'flagged':
      return 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_18px_rgba(244,63,94,0.12)]';
  }
}

function statusLabel(status: DisplayStatus) {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'late':
      return 'Late';
    case 'missing':
      return 'Missing';
    case 'flagged':
      return 'Flagged';
    default:
      return 'Submitted';
  }
}

function timingStatus(row: CollegeRow) {
  if (!row.submission) return 'Missing';
  if (row.displayStatus === 'late' || row.submission.is_late) return 'Late';
  return 'On-Time';
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function ExecutiveDashboard() {
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lightboxRow, setLightboxRow] = useState<CollegeRow | null>(null);
  const [zoom, setZoom] = useState(1);
  const [actionBusy, setActionBusy] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage(null);
    }
    try {
      const response = await fetch('/api/monitoring', { cache: 'no-store' });
      const payload = (await response.json()) as {
        institutions?: Institution[];
        submissions?: Record<string, unknown>[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load monitoring data.');
      }

      setInstitutions(payload.institutions || []);
      setSubmissions((payload.submissions || []).map(normalizeSubmission));
      setLive(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load monitoring data.';
      setErrorMessage(message);
      setLive(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData(true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!lightboxRow) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxRow]);

  const rows = useMemo<CollegeRow[]>(() => {
    const activeColleges = institutions.filter((institution) => institution.is_active !== false);
    const latestByInstitution = new Map<string, Submission>();
    for (const submission of submissions) {
      const rowDate =
        parseDatePart(submission.submission_date) ||
        parseDatePart(submission.submission_time) ||
        parseDatePart(submission.created_at);
      if (rowDate !== selectedDate) continue;
      const key = asId(submission.institution_id);
      const existing = latestByInstitution.get(key);
      if (!existing) {
        latestByInstitution.set(key, submission);
        continue;
      }
      const nextTs = new Date(submission.submission_time || submission.created_at).getTime();
      const prevTs = new Date(existing.submission_time || existing.created_at).getTime();
      if (nextTs > prevTs) latestByInstitution.set(key, submission);
    }

    return activeColleges.map((institution) => {
      const submission = latestByInstitution.get(asId(institution.id)) ?? null;
      return {
        institution,
        submission,
        displayStatus: resolveStatus(submission),
      };
    });
  }, [institutions, submissions, selectedDate]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusTab === 'submitted' && row.displayStatus === 'missing') return false;
      if (statusTab === 'pending' && row.displayStatus !== 'missing') return false;
      if (statusTab === 'late' && row.displayStatus !== 'late') return false;
      if (!query) return true;
      const name = row.institution.name.toLowerCase();
      const code = row.institution.code.toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }, [rows, search, statusTab]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const submitted = rows.filter((row) => row.displayStatus !== 'missing').length;
    const pending = total - submitted;
    const late = rows.filter((row) => row.displayStatus === 'late').length;
    const compliance = total === 0 ? 0 : (submitted / total) * 100;
    const submittedPct = total === 0 ? 0 : (submitted / total) * 100;
    return { total, submitted, pending, late, compliance, submittedPct };
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      'College Code',
      'Name',
      'Submission Date',
      'Submission Time',
      'Timing Status',
      'Verification Link',
    ];
    const body = filteredRows.map((row) =>
      [
        row.institution.code,
        row.institution.name,
        row.submission?.submission_date || selectedDate,
        formatTimeOnly(row.submission?.submission_time ?? null, row.submission?.created_at ?? null),
        timingStatus(row),
        row.submission?.image_url || '',
      ]
        .map((value) => csvEscape(String(value)))
        .join(',')
    );
    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assembly-compliance-${selectedDate}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const updateStatus = async (submissionId: number | string, nextStatus: 'verified' | 'flagged') => {
    setActionBusy(true);
    try {
      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: submissionId, status: nextStatus }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error || 'Failed to update status.');
        return;
      }
      setSubmissions((prev) => prev.map((item) => (item.id === submissionId ? { ...item, status: nextStatus } : item)));
      setLightboxRow((current) =>
        current?.submission?.id === submissionId
          ? {
              ...current,
              submission: { ...current.submission, status: nextStatus },
              displayStatus: resolveStatus({ ...current.submission, status: nextStatus }),
            }
          : current
      );
    } finally {
      setActionBusy(false);
    }
  };

  const openLightbox = (row: CollegeRow) => {
    if (!row.submission?.image_url) return;
    setZoom(1);
    setLightboxRow(row);
  };

  const tabs: { id: StatusTab; label: string }[] = [
    { id: 'all', label: 'All Colleges' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'pending', label: 'Pending' },
    { id: 'late', label: 'Late' },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06090F] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 0%, rgba(99, 102, 241, 0.07) 0%, transparent 50%), radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.04) 0%, transparent 42%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1440px] space-y-6 px-4 py-6 md:px-8 md:py-8">
        <header className={`${SURFACE} px-5 py-5 md:px-7 md:py-6`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <SindhCrest />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Government of Sindh • College Education Department
                </p>
                <h1 className="mt-1.5 text-[1.65rem] font-semibold leading-tight tracking-tight text-slate-50 md:text-[2rem]">
                  Assembly Compliance &amp; Verification Directorate
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-800/80 bg-slate-950/50 px-3 py-1 text-[11px] font-medium text-slate-300">
                    {format(new Date(`${selectedDate}T00:00:00`), 'EEE, d MMM yyyy')}
                  </span>
                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-400">
                    Session {academicSession()}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${live ? 'animate-ping' : ''}`} />
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    </span>
                    {live ? 'Live Feed' : 'Feed Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={<Building2 className="h-5 w-5" />}
            iconClass="text-indigo-400 bg-indigo-500/10"
            label="Total Registered Colleges"
            value={metrics.total}
          />
          <MetricCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            iconClass="text-emerald-400 bg-emerald-500/10"
            label="Assembly Verified Today"
            value={metrics.submitted}
            accent="text-emerald-400"
            percent={`${metrics.submittedPct.toFixed(1)}%`}
            percentClass="text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          />
          <MetricCard
            icon={<Clock3 className="h-5 w-5" />}
            iconClass="text-rose-400 bg-rose-500/10"
            label="Pending Submissions"
            value={metrics.pending}
            accent="text-rose-400"
            percent="Action needed"
            percentClass="text-rose-400 bg-rose-500/10 border-rose-500/20"
          />
          <MetricCard
            icon={<Timer className="h-5 w-5" />}
            iconClass="text-amber-400 bg-amber-500/10"
            label="Late Submissions"
            value={metrics.late}
            accent="text-amber-400"
            hint={`After ${CUTOFF_LABEL} cutoff`}
          />
          <MetricCard
            icon={<TrendingUp className="h-5 w-5" />}
            iconClass="text-cyan-400 bg-cyan-500/10"
            label="Today's Compliance Rate"
            value={`${metrics.compliance.toFixed(1)}%`}
            accent="text-indigo-400"
            progress={metrics.compliance}
          />
        </section>

        <section className={`${SURFACE} overflow-hidden p-0 hover:border-slate-800/70`}>
          <div className="flex flex-col gap-4 px-5 py-4 md:px-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-100">Verification register</h2>
                <p className="text-xs text-slate-500">{filteredRows.length} colleges in the current view</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <label className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-950/40 px-3.5">
                <Calendar className="h-4 w-4 text-indigo-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none"
                  aria-label="Filter by submission date"
                />
              </label>

              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search college name or code (KQ…)"
                  className="h-11 w-full rounded-xl border border-slate-800/80 bg-slate-950/40 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500/40"
                />
              </label>

              <div className="flex h-11 items-center gap-1 overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40 p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusTab(tab.id)}
                    className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                      statusTab === tab.id
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 hover:shadow-indigo-500/40"
              >
                <Download className="h-4 w-4" />
                Export CSV Report
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mx-5 mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              <p className="text-sm text-slate-500">Synchronizing live assembly compliance…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-6 py-20 text-center text-sm text-slate-500">No colleges match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="bg-slate-900/80 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-5 py-3.5">College</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Time</th>
                    <th className="px-5 py-3.5">Photo</th>
                    <th className="px-5 py-3.5">Notes</th>
                  </tr>
                  <tr>
                    <td colSpan={5} className="h-px bg-slate-800/70 p-0" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const timeLabel = formatTimeOnly(
                      row.submission?.submission_time ?? null,
                      row.submission?.created_at ?? null
                    );
                    return (
                      <tr key={asId(row.institution.id)} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-4 align-middle">
                          <p className="font-semibold text-slate-100">{row.institution.name}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-indigo-400">
                              {row.institution.code}
                            </span>
                            {regionName(row.institution) && (
                              <span className="text-[11px] text-slate-500">{regionName(row.institution)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusPill(row.displayStatus)}`}>
                            {statusLabel(row.displayStatus)}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          {row.submission && timeLabel ? (
                            <div>
                              <p className="text-sm font-medium text-slate-200">{timeLabel}</p>
                              <p
                                className={`mt-0.5 text-[11px] font-medium ${
                                  row.displayStatus === 'late' ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {row.displayStatus === 'late' ? `Late · after ${CUTOFF_LABEL}` : 'On time'}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">Awaiting capture</p>
                          )}
                        </td>
                        <td className="px-5 py-4 align-middle">
                          {row.submission?.image_url ? (
                            <button
                              type="button"
                              onClick={() => openLightbox(row)}
                              className="group block h-14 w-[4.5rem] overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40"
                              aria-label={`Inspect photo for ${row.institution.name}`}
                            >
                              <img
                                src={row.submission.image_url}
                                alt=""
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                              />
                            </button>
                          ) : (
                            <div className="flex h-14 w-[4.5rem] items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/40 text-slate-600">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 align-middle text-xs text-slate-500">
                          {row.submission?.remarks || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {lightboxRow?.submission?.image_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-2xl">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-400">
                  {lightboxRow.institution.code}
                </span>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-50">{lightboxRow.institution.name}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(
                    lightboxRow.submission.submission_date,
                    lightboxRow.submission.submission_time || lightboxRow.submission.created_at
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}
                  className="rounded-xl border border-slate-800/80 p-2 text-slate-300 transition hover:border-slate-700/60 hover:bg-slate-800/40"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
                  className="rounded-xl border border-slate-800/80 p-2 text-slate-300 transition hover:border-slate-700/60 hover:bg-slate-800/40"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxRow(null)}
                  className="rounded-xl border border-slate-800/80 p-2 text-slate-300 transition hover:border-slate-700/60 hover:bg-slate-800/40"
                  aria-label="Close inspection"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              className="flex-1 overflow-auto bg-slate-950/40 px-5 py-4"
              onWheel={(event) => {
                event.preventDefault();
                setZoom((value) => Math.min(3, Math.max(1, Number((value + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))));
              }}
            >
              <img
                src={lightboxRow.submission.image_url}
                alt={`Assembly photo for ${lightboxRow.institution.name}`}
                className="mx-auto max-h-[58vh] origin-center rounded-2xl object-contain shadow-2xl transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>

            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Inspect the capture, then approve a compliant assembly or flag it for follow-up.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(lightboxRow.submission!.id, 'verified')}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
                    lightboxRow.submission.status === 'verified'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(lightboxRow.submission!.id, 'flagged')}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
                    lightboxRow.submission.status === 'flagged'
                      ? 'bg-rose-500 text-white'
                      : 'border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                  }`}
                >
                  <Flag className="h-4 w-4" />
                  Flag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SindhCrest() {
  return (
    <div
      className="flex h-[3.35rem] w-[3.35rem] shrink-0 items-center justify-center rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-800/80 to-slate-950 shadow-inner"
      aria-hidden
    >
      <Shield className="h-6 w-6 text-indigo-400" />
    </div>
  );
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  hint,
  accent = 'text-slate-50',
  percent,
  percentClass,
  progress,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  percent?: string;
  percentClass?: string;
  progress?: number;
}) {
  return (
    <div className={`${SURFACE} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>{icon}</div>
        {percent && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${percentClass}`}>
            {percent}
          </span>
        )}
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1.5 text-[1.85rem] font-semibold leading-none tracking-tight ${accent}`}>{value}</p>
      {hint && <p className="mt-2 text-[11px] text-slate-500">{hint}</p>}
      {typeof progress === 'number' && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-950/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
