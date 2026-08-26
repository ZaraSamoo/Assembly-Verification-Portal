'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  ImageOff,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type StatusTab = 'all' | 'submitted' | 'missing';
type DisplayStatus = 'submitted' | 'verified' | 'pending' | 'missing';

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
  created_at: string;
}

interface CollegeRow {
  institution: Institution;
  submission: Submission | null;
  displayStatus: DisplayStatus;
}

const GLASS =
  'bg-[#121829]/70 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]';

function karachiISO(value?: Date) {
  return (value ?? new Date()).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

function karachiClock(iso?: string | null) {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function karachiNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function msUntilCutoff(now = new Date()) {
  const p = karachiNowParts(now);
  const current = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  const cutoff = 15 * 60 * 60 * 1000;
  return cutoff - current;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return 'Window closed';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
    created_at: createdAt,
  };
}

function isWindowClosed(value = new Date()) {
  const localTimeStr = value.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour12: false });
  const [hour] = localTimeStr.split(':').map(Number);
  return hour >= 15;
}

function absenceStatus(selectedDate: string, now = new Date()): 'pending' | 'missing' {
  const today = karachiISO(now);
  if (selectedDate < today) return 'missing';
  if (selectedDate > today) return 'pending';
  return isWindowClosed(now) ? 'missing' : 'pending';
}

function resolveStatus(submission: Submission | null, absence: 'pending' | 'missing'): DisplayStatus {
  if (!submission) return absence;
  return submission.status.toLowerCase() === 'verified' ? 'verified' : 'submitted';
}

function statusCopy(status: DisplayStatus) {
  if (status === 'pending') return 'Pending';
  if (status === 'missing') return 'Not Submitted / Missing';
  return 'Submitted / Verified';
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

  let institutions = !instRes?.error ? ((instRes.data as Institution[]) || []) : [];
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

function areaPath(values: number[], width: number, height: number) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 16) - 8;
    return { x, y };
  });
  if (!points.length) return { line: '', area: '', points };
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;
  return { line, area, points };
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(karachiISO);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lightboxRow, setLightboxRow] = useState<CollegeRow | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [hoverDay, setHoverDay] = useState<number | null>(null);

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
    const poll = window.setInterval(() => void loadData(true), 12000);
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
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
      return {
        institution,
        submission,
        displayStatus: resolveStatus(submission, absenceStatus(selectedDate, now)),
      };
    });
  }, [registered, submissions, selectedDate, now]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const submitted = rows.filter((row) => row.displayStatus === 'submitted' || row.displayStatus === 'verified').length;
    const outstanding = total - submitted;
    const compliance = total === 0 ? 0 : (submitted / total) * 100;
    const absence = absenceStatus(selectedDate, now);
    return { total, submitted, outstanding, compliance, absence };
  }, [rows, selectedDate, now]);

  const query = (search || headerSearch).trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusTab === 'submitted' && row.displayStatus !== 'submitted' && row.displayStatus !== 'verified') return false;
      if (statusTab === 'missing' && row.displayStatus !== 'pending' && row.displayStatus !== 'missing') return false;
      if (!query) return true;
      return row.institution.name.toLowerCase().includes(query) || row.institution.code.toLowerCase().includes(query);
    });
  }, [rows, search, headerSearch, statusTab, query]);

  const trend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = format(subDays(parseISO(selectedDate), 6 - index), 'yyyy-MM-dd');
      const unique = new Set<string>();
      for (const submission of submissions) {
        if (submissionDay(submission) === date) unique.add(asId(submission.institution_id));
      }
      return {
        date,
        submitted: unique.size,
        label: format(parseISO(date), 'EEE'),
        pct: registered.length === 0 ? 0 : (unique.size / registered.length) * 100,
      };
    });
    return days;
  }, [submissions, selectedDate, registered.length]);

  const chart = areaPath(trend.map((day) => day.submitted), 320, 128);

  const exportCsv = () => {
    const headers = ['College Code', 'Name', 'Submission Date', 'Submission Time PKT', 'Status', 'Photo URL'];
    const body = filteredRows.map((row) =>
      [
        row.institution.code,
        row.institution.name,
        row.submission?.submission_date || selectedDate,
        karachiClock(row.submission?.submission_time || row.submission?.created_at),
        row.displayStatus === 'pending' || row.displayStatus === 'missing' ? statusCopy(row.displayStatus) : 'Submitted / Verified',
        row.submission?.image_url || '',
      ]
        .map((value) => csvEscape(String(value)))
        .join(',')
    );
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assembly-report-${selectedDate}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const cutoffMs = msUntilCutoff(now);
  const pktNow = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const circumference = 2 * Math.PI * 42;
  const dash = (metrics.compliance / 100) * circumference;
  const nav = [
    { label: 'Dashboard', icon: LayoutDashboard, active: true },
    { label: 'Institutions', icon: Building2, active: false },
    { label: 'Reports', icon: FileText, active: false },
    { label: 'Analytics', icon: BarChart3, active: false },
    { label: 'Settings', icon: Settings, active: false },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B101E] text-slate-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 75% 15%, rgba(59, 130, 246, 0.18) 0%, transparent 50%), radial-gradient(circle at 10% 80%, rgba(99, 102, 241, 0.15) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1440px] gap-5 p-4 md:p-6">
        <aside className={`${GLASS} hidden w-[248px] shrink-0 flex-col p-4 lg:flex`}>
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.45)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">Sindh ED</p>
              <p className="text-sm font-semibold leading-tight text-slate-100">Assembly Verification</p>
            </div>
          </div>
          <nav className="space-y-1.5">
            {nav.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${
                  item.active
                    ? 'border border-blue-500/30 bg-blue-600/30 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.18)]'
                    : 'text-slate-400'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-5">
          <header className={`${GLASS} flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between`}>
            <p className="text-xs text-slate-400">
              Home <span className="text-slate-600">/</span> Dashboard <span className="text-slate-600">/</span>{' '}
              <span className="text-blue-400">Today (PKT)</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={headerSearch}
                  onChange={(event) => setHeaderSearch(event.target.value)}
                  placeholder="Quick search"
                  className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-500"
                />
              </label>
              <label className="flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3">
                <Calendar className="h-4 w-4 text-blue-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="bg-transparent text-sm outline-none"
                />
              </label>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inset-0 rounded-full bg-emerald-400 ${live ? 'animate-ping opacity-70' : 'opacity-0'}`} />
                  <span className={`relative h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                </span>
                Feed Active
              </span>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_0_20px_rgba(37,99,235,0.45)] transition hover:bg-blue-500"
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
            </div>
          </header>

          <section className="px-1">
            <h1 className="text-3xl font-semibold tracking-tight text-transparent md:text-4xl" style={{ backgroundImage: 'linear-gradient(180deg,#f8fbff 20%,#93c5fd 100%)', WebkitBackgroundClip: 'text' }}>
              Daily Assembly Verification
            </h1>
            <p className="mt-2 text-sm text-slate-400">Real-time compliance monitoring for Government Colleges across Sindh.</p>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.9fr)]">
            <section className={`${GLASS} p-4 md:p-5`}>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['all', `All Colleges (${metrics.total})`],
                      ['submitted', `Submitted Today (${metrics.submitted})`],
                      ['pending', `Not Submitted (${metrics.pending})`],
                    ] as [StatusTab, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatusTab(id)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                        statusTab === id
                          ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.45)]'
                          : 'border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search college name or code (KQ…)"
                    className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-500"
                  />
                </label>
              </div>

              {errorMessage && (
                <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorMessage}</div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                  <p className="text-sm text-slate-500">Syncing live submissions…</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="py-20 text-center text-sm text-slate-500">No colleges match the current filters.</div>
              ) : (
                <div className="max-h-[68vh] space-y-2.5 overflow-y-auto pr-1">
                  {filteredRows.map((row) => {
                    const pending = row.displayStatus === 'pending';
                    return (
                      <article
                        key={asId(row.institution.id)}
                        className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3 transition hover:border-blue-500/20 hover:bg-white/[0.05]"
                      >
                        <span className="shrink-0 rounded-full border border-blue-500/30 bg-blue-600/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-blue-300 shadow-[0_0_16px_rgba(37,99,235,0.25)]">
                          {row.institution.code}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-100">{row.institution.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {row.submission
                              ? karachiClock(row.submission.submission_time || row.submission.created_at)
                              : 'Awaiting capture'}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            pending
                              ? 'border border-amber-400/20 bg-amber-500/10 text-amber-300'
                              : 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.2)]'
                          }`}
                        >
                          {pending ? 'Pending / Missing' : row.displayStatus === 'verified' ? 'Verified' : 'Submitted'}
                        </span>
                        {row.submission?.image_url ? (
                          <button
                            type="button"
                            onClick={() => setLightboxRow(row)}
                            className="h-12 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08]"
                            aria-label={`Inspect ${row.institution.name}`}
                          >
                            <img src={row.submission.image_url} alt="" className="h-full w-full object-cover transition duration-300 hover:scale-110" />
                          </button>
                        ) : (
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] text-slate-600">
                            <ImageOff className="h-4 w-4" />
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="space-y-5">
              <article className={`${GLASS} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Today’s Executive Summary</p>
                <div className="mt-5 flex items-center gap-5">
                  <svg viewBox="0 0 108 108" className="h-28 w-28 shrink-0">
                    <circle cx="54" cy="54" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                    <circle
                      cx="54"
                      cy="54"
                      r="42"
                      fill="none"
                      stroke="url(#gauge)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${circumference}`}
                      transform="rotate(-90 54 54)"
                    />
                    <defs>
                      <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#818cf8" />
                      </linearGradient>
                    </defs>
                    <text x="54" y="52" textAnchor="middle" fill="#f8fafc" fontSize="18" fontWeight="700">
                      {metrics.compliance.toFixed(0)}%
                    </text>
                    <text x="54" y="68" textAnchor="middle" fill="#93c5fd" fontSize="8">
                      compliance
                    </text>
                  </svg>
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-400">
                      Active colleges <span className="float-right font-semibold text-slate-100">{metrics.total}</span>
                    </p>
                    <p className="text-slate-400">
                      Submitted <span className="float-right font-semibold text-emerald-300">{metrics.submitted}</span>
                    </p>
                    <p className="text-slate-400">
                      Missing <span className="float-right font-semibold text-amber-300">{metrics.pending}</span>
                    </p>
                  </div>
                </div>
              </article>

              <article className={`${GLASS} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">7-Day Compliance Velocity</p>
                <div className="relative mt-4">
                  <svg viewBox="0 0 320 128" className="h-36 w-full overflow-visible">
                    <defs>
                      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={chart.area} fill="url(#areaFill)" />
                    <path d={chart.line} fill="none" stroke="#60a5fa" strokeWidth="2.5" />
                    {chart.points.map((point, index) => (
                      <circle
                        key={trend[index]?.date}
                        cx={point.x}
                        cy={point.y}
                        r={hoverDay === index ? 5 : 3.5}
                        fill="#93c5fd"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoverDay(index)}
                        onMouseLeave={() => setHoverDay(null)}
                      />
                    ))}
                  </svg>
                  {hoverDay !== null && trend[hoverDay] && (
                    <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-[#121829]/90 px-3 py-1.5 text-xs text-slate-200">
                      {trend[hoverDay].label}: {trend[hoverDay].submitted} submitted · {trend[hoverDay].pct.toFixed(0)}%
                    </div>
                  )}
                  <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-slate-500">
                    {trend.map((day) => (
                      <span key={day.date}>{day.label}</span>
                    ))}
                  </div>
                </div>
              </article>

              <article className={`${GLASS} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Cutoff Timer</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">{formatCountdown(cutoffMs)}</p>
                <p className="mt-1 text-sm text-slate-400">Until 3:00 PM PKT · now {pktNow}</p>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Submissions are accepted until 3:00 PM Pakistan Standard Time. Captures after the window remain visible without late tags.
                </p>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(37,99,235,0.45)] hover:bg-blue-500"
                >
                  <Download className="h-4 w-4" />
                  Instant report download
                </button>
              </article>
            </aside>
          </div>
        </div>
      </div>

      {lightboxRow?.submission?.image_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B101E]/80 p-4 backdrop-blur-2xl" onClick={() => setLightboxRow(null)}>
          <div className={`${GLASS} max-h-[92vh] w-full max-w-4xl overflow-hidden`} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <span className="rounded-full border border-blue-500/30 bg-blue-600/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-blue-300">
                  {lightboxRow.institution.code}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-slate-50">{lightboxRow.institution.name}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {karachiClock(lightboxRow.submission.submission_time || lightboxRow.submission.created_at)} PKT
                </p>
              </div>
              <button type="button" onClick={() => setLightboxRow(null)} className="rounded-full border border-white/[0.08] p-2 text-slate-300" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 pb-5">
              <img
                src={lightboxRow.submission.image_url}
                alt={`Assembly photo for ${lightboxRow.institution.name}`}
                className="max-h-[70vh] w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
