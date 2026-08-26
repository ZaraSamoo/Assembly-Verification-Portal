'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  ImageOff,
  LayoutDashboard,
  Loader2,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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

const GLASS_CARD =
  'bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.4)]';

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
  if (ms <= 0) return 'Window Closed';
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
  if (status === 'missing') return 'Missing / Absent';
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
    const y = height - (value / max) * (height - 20) - 10;
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
    const pending = total - submitted;
    const outstanding = pending;
    const compliance = total === 0 ? 0 : (submitted / total) * 100;
    const absence = absenceStatus(selectedDate, now);
    return { total, submitted, pending, outstanding, compliance, absence };
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
        missing: registered.length - unique.size,
        label: format(parseISO(date), 'EEE'),
        pct: registered.length === 0 ? 0 : (unique.size / registered.length) * 100,
      };
    });
    return days;
  }, [submissions, selectedDate, registered.length]);

  const chart = areaPath(trend.map((day) => day.submitted), 360, 140);

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
  const circumference = 2 * Math.PI * 44;
  const dash = (metrics.compliance / 100) * circumference;

  const nav = [
    { label: 'Dashboard', icon: LayoutDashboard, active: true },
    { label: 'Institutions', icon: Building2, active: false },
    { label: 'Reports', icon: FileText, active: false },
    { label: 'Analytics', icon: BarChart3, active: false },
    { label: 'Settings', icon: Settings, active: false },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#110B24] text-slate-100 font-sans">
      {/* Deep Velvet Plum Ambient Radial Mesh Glows */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 10%, rgba(217, 70, 239, 0.14) 0%, transparent 60%), radial-gradient(circle at 15% 90%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Header & Floating Toolbar */}
        <header className={`${GLASS_CARD} flex flex-col gap-4 px-6 py-4.5 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-medium">
              Home <span className="text-slate-600">/</span> Dashboard <span className="text-slate-600">/</span>{' '}
              <span className="text-fuchsia-300 font-semibold">Today (PKT)</span>
            </p>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-fuchsia-300 bg-clip-text text-transparent">
              Government of Sindh • Education Department
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={headerSearch}
                onChange={(event) => setHeaderSearch(event.target.value)}
                placeholder="Quick search..."
                className="h-10 w-full rounded-full border border-white/[0.08] bg-[#20183F]/80 py-2 pl-9.5 pr-4 text-sm text-white placeholder-slate-400 outline-none focus:border-fuchsia-500/50 transition-all"
              />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#20183F]/80 px-3.5 text-xs text-slate-200">
              <Calendar className="h-4 w-4 text-fuchsia-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent font-medium outline-none text-white"
              />
            </label>
            <span className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inset-0 rounded-full bg-emerald-400 ${live ? 'animate-ping opacity-75' : 'opacity-0'}`} />
                <span className={`relative h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              </span>
              Live Feed
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-fuchsia-600/25 transition active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </div>
        </header>

        {/* Hero Section Title */}
        <section className="px-1">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl text-white">
            Daily Assembly Verification
          </h1>
          <p className="mt-1 text-sm text-slate-300/80">
            Real-time compliance monitoring for Government Colleges across Sindh.
          </p>
        </section>

        {/* Accent KPI Gradient Cards (Strict 4-Column Grid) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Colleges (Coral Accents) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#FF6B6B]/15 via-[#231849]/60 to-[#191136]/90 border border-[#FF6B6B]/25 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#FF8E53]">Total Colleges</p>
              <p className="mt-1.5 text-3xl font-extrabold text-white">{metrics.total}</p>
              <p className="mt-1 text-[11px] text-slate-300/70">Registered Campuses</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6B6B]/20 text-[#FF6B6B] border border-[#FF6B6B]/40 shadow-inner">
              <Building2 className="h-6 w-6" />
            </div>
          </div>

          {/* Card 2: Submitted Today (Fuchsia Neon Accents) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#E056FD]/15 via-[#231849]/60 to-[#191136]/90 border border-[#E056FD]/25 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#E056FD]">Submitted Today</p>
              <p className="mt-1.5 text-3xl font-extrabold text-emerald-300">{metrics.submitted}</p>
              <p className="mt-1 text-[11px] text-slate-300/70">Photos Verified & Logged</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E056FD]/20 text-[#E056FD] border border-[#E056FD]/40 shadow-inner">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>

          {/* Card 3: Missing / Pending (Lavender Accents) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#a29bfe]/15 via-[#231849]/60 to-[#191136]/90 border border-[#a29bfe]/25 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#a29bfe]">
                {metrics.absence === 'missing' ? 'Missing / Absent' : 'Pending'}
              </p>
              <p className="mt-1.5 text-3xl font-extrabold text-amber-300">{metrics.pending}</p>
              <p className="mt-1 text-[11px] text-slate-300/70">Awaiting Capture</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6C5CE7]/20 text-[#a29bfe] border border-[#6C5CE7]/40 shadow-inner">
              <Clock className="h-6 w-6" />
            </div>
          </div>

          {/* Card 4: Compliance Rate (Cyan Gradient Progress) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#00d2d3]/15 via-[#231849]/60 to-[#191136]/90 border border-[#00d2d3]/25 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#00d2d3]">Compliance Rate</p>
                <TrendingUp className="h-5 w-5 text-[#00d2d3]" />
              </div>
              <p className="text-3xl font-extrabold text-white">{metrics.compliance.toFixed(1)}%</p>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#00d2d3] to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, metrics.compliance))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-300/70">{metrics.submitted} of {metrics.total} colleges</p>
            </div>
          </div>
        </section>

        {/* Main Grid: 2 Columns */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.95fr)]">
          {/* Left Section: Filter Pills & Live Institutional Feed */}
          <section className={`${GLASS_CARD} p-5 flex flex-col space-y-4`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {/* Filter Pill Tabs */}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', `All Colleges (${metrics.total})`],
                    ['submitted', `Submitted Today (${metrics.submitted})`],
                    ['missing', `${metrics.absence === 'missing' ? 'Missing / Absent' : 'Pending'} (${metrics.pending})`],
                  ] as [StatusTab, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatusTab(id)}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                      statusTab === id
                        ? 'bg-fuchsia-600/30 border border-fuchsia-500/40 text-fuchsia-200 shadow-[0_0_20px_rgba(217,70,239,0.25)]'
                        : 'border border-white/[0.08] bg-[#20183F]/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filter Bar Search Input */}
              <label className="relative min-w-0 flex-1 lg:max-w-xs">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter by name or code (KQ...)"
                  className="h-10 w-full rounded-full border border-white/[0.08] bg-[#20183F]/80 py-2 pl-9.5 pr-4 text-xs text-white placeholder-slate-400 outline-none focus:border-fuchsia-500/50"
                />
              </label>
            </div>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" />
                <p className="text-xs text-slate-400">Syncing live institutional feed...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-400">No colleges match the current search filters.</div>
            ) : (
              <div className="max-h-[64vh] space-y-3 overflow-y-auto pr-1">
                {filteredRows.map((row) => {
                  const isPending = row.displayStatus === 'pending' || row.displayStatus === 'missing';
                  return (
                    <article
                      key={asId(row.institution.id)}
                      className="bg-[#1E173E]/60 hover:bg-[#281F52]/80 border border-white/[0.06] hover:border-fuchsia-500/30 rounded-2xl p-4 transition-all duration-200 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Monospace Code Pill */}
                        <span className="bg-[#2E245C] text-fuchsia-300 border border-fuchsia-500/20 px-3 py-1 rounded-xl text-xs font-bold font-mono tracking-wider shrink-0 shadow-sm">
                          {row.institution.code}
                        </span>

                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{row.institution.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {row.submission
                              ? `Logged at ${karachiClock(row.submission.submission_time || row.submission.created_at)} PKT`
                              : 'Awaiting daily assembly capture'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Glowing Status Badge */}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                            isPending
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-[0_0_14px_rgba(16,185,129,0.2)]'
                          }`}
                        >
                          {statusCopy(row.displayStatus)}
                        </span>

                        {/* Clickable Image Thumbnail */}
                        {row.submission?.image_url ? (
                          <button
                            type="button"
                            onClick={() => setLightboxRow(row)}
                            className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] hover:border-fuchsia-500/40 transition-all"
                            aria-label={`Inspect photo for ${row.institution.name}`}
                          >
                            <img src={row.submission.image_url} alt="" className="h-full w-full object-cover hover:scale-105 transition-transform" />
                          </button>
                        ) : (
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#120D26]/50 text-slate-500">
                            <ImageOff className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Section: Analytics Widgets */}
          <aside className="space-y-5">
            {/* Card 1: Executive Summary Gauge */}
            <article className={`${GLASS_CARD} p-5 space-y-4`}>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Today's Executive Summary</p>
                <Sparkles className="h-4 w-4 text-fuchsia-400" />
              </div>
              <div className="flex items-center gap-5 pt-1">
                <svg viewBox="0 0 108 108" className="h-28 w-28 shrink-0">
                  <circle cx="54" cy="54" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                  <circle
                    cx="54"
                    cy="54"
                    r="44"
                    fill="none"
                    stroke="url(#plumGauge)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference}`}
                    transform="rotate(-90 54 54)"
                  />
                  <defs>
                    <linearGradient id="plumGauge" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#E056FD" />
                      <stop offset="100%" stopColor="#6C5CE7" />
                    </linearGradient>
                  </defs>
                  <text x="54" y="52" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="800">
                    {metrics.compliance.toFixed(0)}%
                  </text>
                  <text x="54" y="68" textAnchor="middle" fill="#f0abfc" fontSize="8" fontWeight="600">
                    compliance
                  </text>
                </svg>
                <div className="space-y-2.5 text-xs flex-1">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Total Active Colleges:</span>
                    <span className="font-bold text-white font-mono">{metrics.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Submitted Today:</span>
                    <span className="font-bold text-emerald-300 font-mono">{metrics.submitted}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>{metrics.absence === 'missing' ? 'Missing / Absent:' : 'Pending:'}</span>
                    <span className="font-bold text-amber-300 font-mono">{metrics.pending}</span>
                  </div>
                </div>
              </div>
            </article>

            {/* Card 2: 7-Day Compliance Velocity Chart */}
            <article className={`${GLASS_CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">7-Day Compliance Velocity</p>
                <BarChart3 className="h-4 w-4 text-fuchsia-400" />
              </div>
              <div className="relative pt-2">
                <svg viewBox="0 0 360 140" className="h-36 w-full overflow-visible">
                  <defs>
                    <linearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E056FD" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#E056FD" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={chart.area} fill="url(#velocityFill)" />
                  <path d={chart.line} fill="none" stroke="#E056FD" strokeWidth="3" />
                  {chart.points.map((point, index) => (
                    <circle
                      key={trend[index]?.date}
                      cx={point.x}
                      cy={point.y}
                      r={hoverDay === index ? 5.5 : 4}
                      fill="#ffffff"
                      stroke="#E056FD"
                      strokeWidth="2"
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoverDay(index)}
                      onMouseLeave={() => setHoverDay(null)}
                    />
                  ))}
                </svg>

                {hoverDay !== null && trend[hoverDay] && (
                  <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-[#1E173E]/95 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md">
                    <span className="font-bold text-fuchsia-300">{trend[hoverDay].label}</span>: {trend[hoverDay].submitted} submitted ({trend[hoverDay].pct.toFixed(0)}%)
                  </div>
                )}

                <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  {trend.map((day) => (
                    <span key={day.date}>{day.label}</span>
                  ))}
                </div>
              </div>
            </article>

            {/* Card 3: Cutoff Timer & Rule Info */}
            <article className={`${GLASS_CARD} p-5 space-y-4`}>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Cutoff Window & Timer</p>
                <Clock className="h-4 w-4 text-fuchsia-400" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white font-mono tracking-tight">{formatCountdown(cutoffMs)}</p>
                <p className="text-xs text-slate-300 mt-1">Until 3:00 PM PKT deadline • current time: <span className="text-fuchsia-300 font-bold">{pktNow}</span></p>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed bg-[#1E173E]/50 p-3 rounded-2xl border border-white/5">
                Submissions are accepted until 3:00 PM Pakistan Standard Time. Captures after 3:00 PM are blocked on magic links and flagged as Missing/Absent.
              </p>
              <button
                type="button"
                onClick={exportCsv}
                className="w-full py-3 rounded-2xl font-bold bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-fuchsia-600/25"
              >
                <Download className="h-4 w-4" />
                Download Today's Report
              </button>
            </article>
          </aside>
        </div>
      </div>

      {/* High-Resolution Lightbox Inspection Modal */}
      {lightboxRow?.submission?.image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B081A]/85 p-4 backdrop-blur-2xl"
          onClick={() => setLightboxRow(null)}
        >
          <div
            className={`${GLASS_CARD} max-h-[92vh] w-full max-w-4xl overflow-hidden`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b border-white/[0.08]">
              <div>
                <span className="bg-[#2E245C] text-fuchsia-300 border border-fuchsia-500/20 px-3 py-1 rounded-xl text-xs font-bold font-mono">
                  {lightboxRow.institution.code}
                </span>
                <h3 className="mt-2 text-lg font-bold text-white">{lightboxRow.institution.name}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Submission Timestamp: {karachiClock(lightboxRow.submission.submission_time || lightboxRow.submission.created_at)} PKT
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxRow(null)}
                className="rounded-full border border-white/[0.08] p-2 text-slate-300 hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 flex justify-center bg-[#130E29]/60">
              <img
                src={lightboxRow.submission.image_url}
                alt={`Assembly photo for ${lightboxRow.institution.name}`}
                className="max-h-[68vh] w-full rounded-2xl object-contain shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
