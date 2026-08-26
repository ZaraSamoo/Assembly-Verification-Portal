'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  Flag,
  ImageOff,
  Loader2,
  Search,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type StatusTab = 'all' | 'submitted' | 'pending' | 'late';
type DisplayStatus = 'submitted' | 'verified' | 'late' | 'missing' | 'flagged';

interface Institution {
  id: number | string;
  name: string;
  code: string;
  is_active?: boolean | null;
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

const CUTOFF = '10:30 AM';
const CARD =
  'bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-xl hover:border-slate-700/60 transition-all';

function karachiISO(value?: Date) {
  return (value ?? new Date()).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

function asId(value: number | string) {
  return String(value);
}

function submissionDay(item: Submission) {
  return (
    (item.submission_date && String(item.submission_date).slice(0, 10)) ||
    (item.submission_time && String(item.submission_time).slice(0, 10)) ||
    (item.created_at && String(item.created_at).slice(0, 10)) ||
    ''
  );
}

function normalizeSubmission(item: Record<string, unknown>): Submission {
  const createdAt = String(item.created_at || '');
  const submissionTime = (item.submission_time as string | null) ?? (item.submitted_at as string | null) ?? createdAt;
  const submissionDate =
    (item.submission_date as string | null) ??
    (submissionTime ? String(submissionTime).slice(0, 10) : null) ??
    (createdAt ? createdAt.slice(0, 10) : null);
  return {
    id: item.id as number | string,
    institution_id: (item.institution_id ?? item.campus_id) as number | string,
    submission_date: submissionDate,
    submission_time: submissionTime,
    image_url: ((item.image_url as string | null) ?? (item.photo_url as string | null)) || null,
    remarks: ((item.remarks as string | null) ?? (item.notes as string | null)) || null,
    status: String(item.status || 'submitted'),
    is_late: Boolean(item.is_late),
    created_at: createdAt,
  };
}

function isAfterCutoff(iso: string | null) {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getHours() > 10 || (parsed.getHours() === 10 && parsed.getMinutes() >= 30);
}

function resolveStatus(submission: Submission | null): DisplayStatus {
  if (!submission) return 'missing';
  if (submission.is_late || isAfterCutoff(submission.submission_time || submission.created_at)) return 'late';
  const status = submission.status.toLowerCase();
  if (status === 'verified') return 'verified';
  if (status === 'flagged') return 'flagged';
  return 'submitted';
}

function statusClass(status: DisplayStatus) {
  if (status === 'late') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  if (status === 'missing' || status === 'flagged') return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
}

function statusLabel(status: DisplayStatus) {
  if (status === 'verified') return 'Verified';
  if (status === 'late') return 'Late';
  if (status === 'missing') return 'Pending';
  if (status === 'flagged') return 'Flagged';
  return 'Submitted';
}

function formatClock(iso: string | null) {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'hh:mm a');
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function loadInstitutionsAndSubmissions(fromDate: string) {
  const supabase = createClient() as any;
  const instRes = await supabase.from('institutions').select('id, name, code, is_active').order('code');
  let subRes = await supabase.from('assembly_submissions').select('*').gte('submission_date', fromDate);

  if (subRes?.error) {
    subRes = await supabase.from('assembly_submissions').select('*');
  }

  const directOk = !instRes?.error;
  let institutions = directOk ? (instRes.data as Institution[]) || [] : [];
  let submissions = !subRes?.error ? ((subRes.data || []) as Record<string, unknown>[]).map(normalizeSubmission) : [];

  if (!institutions.length || instRes?.error) {
    const api = await fetch(`/api/monitoring?from=${fromDate}`, { cache: 'no-store' });
    const payload = await api.json();
    if (!api.ok) {
      throw new Error(payload.error || instRes?.error?.message || 'Failed to load monitoring data.');
    }
    if (!institutions.length) institutions = payload.institutions || [];
    if (!submissions.length) {
      submissions = ((payload.submissions || []) as Record<string, unknown>[]).map(normalizeSubmission);
    }
  }

  return { institutions, submissions };
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(karachiISO);
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

  const fromDate = useMemo(() => {
    try {
      return format(subDays(parseISO(selectedDate), 6), 'yyyy-MM-dd');
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setErrorMessage(null);
      }
      try {
        const data = await loadInstitutionsAndSubmissions(fromDate);
        setInstitutions(data.institutions);
        setSubmissions(data.submissions);
        setLive(true);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load monitoring data.');
        setLive(false);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [fromDate]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadData(true), 12000);
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

  const registered = useMemo(
    () => institutions.filter((item) => item.is_active !== false),
    [institutions]
  );

  const rows = useMemo<CollegeRow[]>(() => {
    const latest = new Map<string, Submission>();
    for (const submission of submissions) {
      if (submissionDay(submission) !== selectedDate) continue;
      const key = asId(submission.institution_id);
      const existing = latest.get(key);
      const nextTs = new Date(submission.submission_time || submission.created_at).getTime();
      const prevTs = existing ? new Date(existing.submission_time || existing.created_at).getTime() : 0;
      if (!existing || nextTs > prevTs) latest.set(key, submission);
    }

    return registered.map((institution) => {
      const submission = latest.get(asId(institution.id)) ?? null;
      return { institution, submission, displayStatus: resolveStatus(submission) };
    });
  }, [registered, submissions, selectedDate]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const submitted = rows.filter((row) => row.displayStatus !== 'missing').length;
    const pending = total - submitted;
    const late = rows.filter((row) => row.displayStatus === 'late').length;
    const onTime = submitted - late;
    const compliance = total === 0 ? 0 : (submitted / total) * 100;
    return { total, submitted, pending, late, onTime, compliance };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusTab === 'submitted' && row.displayStatus === 'missing') return false;
      if (statusTab === 'pending' && row.displayStatus !== 'missing') return false;
      if (statusTab === 'late' && row.displayStatus !== 'late') return false;
      if (!query) return true;
      return row.institution.name.toLowerCase().includes(query) || row.institution.code.toLowerCase().includes(query);
    });
  }, [rows, search, statusTab]);

  const trend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = format(subDays(parseISO(selectedDate), 6 - index), 'yyyy-MM-dd');
      const dayRows = new Map<string, Submission>();
      for (const submission of submissions) {
        if (submissionDay(submission) !== date) continue;
        dayRows.set(asId(submission.institution_id), submission);
      }
      const submitted = dayRows.size;
      const late = [...dayRows.values()].filter((item) => resolveStatus(item) === 'late').length;
      const onTimePct = submitted === 0 ? 0 : ((submitted - late) / submitted) * 100;
      return { date, submitted, late, onTimePct, label: format(parseISO(date), 'EEE d') };
    });
    const max = Math.max(1, ...days.map((day) => day.submitted));
    return { days, max };
  }, [submissions, selectedDate]);

  const exportCsv = () => {
    const headers = ['College Code', 'Name', 'Submission Date', 'Submission Time', 'Timing Status', 'Verification Link'];
    const body = filteredRows.map((row) =>
      [
        row.institution.code,
        row.institution.name,
        row.submission?.submission_date || selectedDate,
        formatClock(row.submission?.submission_time || row.submission?.created_at || null),
        row.displayStatus === 'missing' ? 'Missing' : row.displayStatus === 'late' ? 'Late' : 'On-Time',
        row.submission?.image_url || '',
      ]
        .map((value) => csvEscape(String(value)))
        .join(',')
    );
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assembly-audit-${selectedDate}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const updateStatus = async (id: number | string, status: 'verified' | 'flagged') => {
    setActionBusy(true);
    try {
      const response = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload.error || 'Failed to update status.');
        return;
      }
      setSubmissions((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
      setLightboxRow((current) =>
        current?.submission?.id === id
          ? {
              ...current,
              submission: { ...current.submission, status },
              displayStatus: resolveStatus({ ...current.submission, status }),
            }
          : current
      );
    } finally {
      setActionBusy(false);
    }
  };

  const yesterday = format(subDays(parseISO(karachiISO()), 1), 'yyyy-MM-dd');
  const onTimePct = metrics.total === 0 ? 0 : (metrics.onTime / metrics.total) * 100;
  const latePct = metrics.total === 0 ? 0 : (metrics.late / metrics.total) * 100;
  const missingPct = metrics.total === 0 ? 0 : (metrics.pending / metrics.total) * 100;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070A12] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl space-y-8 p-4 md:p-8">
        <header className={CARD}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-800/80 bg-slate-950/50 text-indigo-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Government of Sindh • College Education Department
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 md:text-[1.85rem]">
                  Assembly Compliance &amp; Verification Directorate
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-xs text-slate-300">
                {format(parseISO(selectedDate), 'EEE, d MMM yyyy')}
              </span>
              <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400">
                Session 2026–27
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inset-0 rounded-full bg-emerald-400 ${live ? 'animate-ping opacity-70' : 'opacity-0'}`} />
                  <span className={`relative h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                </span>
                {live ? 'Live Feed Active' : 'Feed Offline'}
              </span>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className={CARD}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
              <Building2 className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Total Registered Colleges</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">{metrics.total}</p>
          </article>
          <article className={CARD}>
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                {metrics.compliance.toFixed(1)}%
              </span>
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Verified Today</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-400">{metrics.submitted}</p>
          </article>
          <article className={CARD}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pending Submissions</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-400">{metrics.pending}</p>
            <p className="mt-1 text-xs text-slate-500">Count remaining</p>
          </article>
          <article className={CARD}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Late Submissions</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-400">{metrics.late}</p>
            <p className="mt-1 text-xs text-slate-500">After {CUTOFF}</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <article className={`${CARD} lg:col-span-1`}>
            <h2 className="text-sm font-semibold text-slate-100">Compliance breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">On-time vs late vs missing for {format(parseISO(selectedDate), 'd MMM')}</p>
            <div className="mt-6 flex items-center justify-center">
              <svg viewBox="0 0 160 160" className="h-44 w-44">
                <circle cx="80" cy="80" r="58" fill="none" stroke="#0f172a" strokeWidth="14" />
                <circle
                  cx="80"
                  cy="80"
                  r="58"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="14"
                  strokeDasharray={`${onTimePct * 3.64} 364`}
                  strokeLinecap="round"
                  transform="rotate(-90 80 80)"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="58"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="14"
                  strokeDasharray={`${latePct * 3.64} 364`}
                  strokeDashoffset={`${-onTimePct * 3.64}`}
                  transform="rotate(-90 80 80)"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="58"
                  fill="none"
                  stroke="#fb7185"
                  strokeWidth="14"
                  strokeDasharray={`${missingPct * 3.64} 364`}
                  strokeDashoffset={`${-(onTimePct + latePct) * 3.64}`}
                  transform="rotate(-90 80 80)"
                />
                <text x="80" y="76" textAnchor="middle" fill="#f8fafc" fontSize="22" fontWeight="600">
                  {metrics.compliance.toFixed(0)}%
                </text>
                <text x="80" y="94" textAnchor="middle" fill="#94a3b8" fontSize="10">
                  compliance
                </text>
              </svg>
            </div>
            <div className="mt-2 space-y-2 text-xs">
              <LegendRow color="bg-emerald-400" label="On-time" value={`${metrics.onTime} · ${onTimePct.toFixed(1)}%`} />
              <LegendRow color="bg-amber-400" label="Late" value={`${metrics.late} · ${latePct.toFixed(1)}%`} />
              <LegendRow color="bg-rose-400" label="Missing" value={`${metrics.pending} · ${missingPct.toFixed(1)}%`} />
            </div>
          </article>

          <article className={`${CARD} lg:col-span-2`}>
            <h2 className="text-sm font-semibold text-slate-100">7-day submission velocity</h2>
            <p className="mt-1 text-xs text-slate-500">Daily volume and on-time share</p>
            <div className="mt-6 h-52">
              <svg viewBox="0 0 640 208" className="h-full w-full" preserveAspectRatio="none">
                {trend.days.map((day, index) => {
                  const slot = 640 / 7;
                  const x = index * slot + 18;
                  const barWidth = slot - 36;
                  const height = (day.submitted / trend.max) * 140;
                  const y = 168 - height;
                  return (
                    <g key={day.date}>
                      <rect x={x} y={y} width={barWidth} height={Math.max(height, 3)} rx="8" fill="#4f46e5" opacity="0.9" />
                      <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fill="#cbd5e1" fontSize="11">
                        {day.submitted}
                      </text>
                      <text x={x + barWidth / 2} y="186" textAnchor="middle" fill="#64748b" fontSize="11">
                        {day.label}
                      </text>
                      <text x={x + barWidth / 2} y="202" textAnchor="middle" fill="#818cf8" fontSize="10">
                        {day.onTimePct.toFixed(0)}% OT
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </article>
        </section>

        <section className={`${CARD} space-y-4`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/40 px-3">
                <Calendar className="h-4 w-4 text-indigo-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="bg-transparent text-sm text-slate-200 outline-none"
                  aria-label="Filter by date"
                />
              </label>
              <button
                type="button"
                onClick={() => setSelectedDate(karachiISO())}
                className={`h-11 rounded-xl px-3 text-xs font-semibold transition ${
                  selectedDate === karachiISO()
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700/60'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(yesterday)}
                className={`h-11 rounded-xl px-3 text-xs font-semibold transition ${
                  selectedDate === yesterday
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700/60'
                }`}
              >
                Yesterday
              </button>
            </div>

            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search college name or code (KQ…)"
                className="h-11 w-full rounded-xl border border-slate-800/80 bg-slate-950/40 py-2 pl-10 pr-3 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500/40"
              />
            </label>

            <div className="flex h-11 items-center gap-1 overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40 p-1">
              {(
                [
                  ['all', `All (${metrics.total})`],
                  ['submitted', `Submitted (${metrics.submitted})`],
                  ['pending', `Pending (${metrics.pending})`],
                  ['late', `Late (${metrics.late})`],
                ] as [StatusTab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusTab(id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    statusTab === id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
            >
              <Download className="h-4 w-4" />
              Export Audit CSV
            </button>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{errorMessage}</div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              <p className="text-sm text-slate-500">Loading live compliance register…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">No colleges match the current filters.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-slate-950/30">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">College Code</th>
                    <th className="px-4 py-3">Institution Name</th>
                    <th className="px-4 py-3">Submission Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const clock = formatClock(row.submission?.submission_time || row.submission?.created_at || null);
                    return (
                      <tr key={asId(row.institution.id)} className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/40">
                        <td className="px-4 py-4">
                          <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-400">
                            {row.institution.code}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-medium text-slate-100">{row.institution.name}</td>
                        <td className="px-4 py-4">
                          {clock ? (
                            <div>
                              <p className="text-sm text-slate-200">{clock}</p>
                              <p className={`text-[11px] font-medium ${row.displayStatus === 'late' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {row.displayStatus === 'late' ? `Late · after ${CUTOFF}` : 'On time'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.displayStatus)}`}>
                            {statusLabel(row.displayStatus)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {row.submission?.image_url ? (
                            <button
                              type="button"
                              onClick={() => {
                                setZoom(1);
                                setLightboxRow(row);
                              }}
                              className="group h-12 w-16 overflow-hidden rounded-xl border border-slate-800/80"
                              aria-label={`Inspect ${row.institution.name}`}
                            >
                              <img src={row.submission.image_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                            </button>
                          ) : (
                            <div className="flex h-12 w-16 items-center justify-center rounded-xl border border-slate-800/80 text-slate-600">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
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
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-400">
                  {lightboxRow.institution.code}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-slate-50">{lightboxRow.institution.name}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {formatClock(lightboxRow.submission.submission_time || lightboxRow.submission.created_at)} · {statusLabel(lightboxRow.displayStatus)}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))} className="rounded-xl border border-slate-800/80 p-2 text-slate-300 hover:border-slate-700/60" aria-label="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} className="rounded-xl border border-slate-800/80 p-2 text-slate-300 hover:border-slate-700/60" aria-label="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setLightboxRow(null)} className="rounded-xl border border-slate-800/80 p-2 text-slate-300 hover:border-slate-700/60" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-950/40 p-5">
              <img
                src={lightboxRow.submission.image_url}
                alt={`Assembly photo for ${lightboxRow.institution.name}`}
                className="mx-auto max-h-[56vh] origin-center rounded-2xl object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Review the capture, then approve or flag for follow-up.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(lightboxRow.submission!.id, 'verified')}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(lightboxRow.submission!.id, 'flagged')}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-400"
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

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-950/40 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-slate-300">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-medium text-slate-200">{value}</span>
    </div>
  );
}
