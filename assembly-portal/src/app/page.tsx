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
  ImageOff,
  Loader2,
  Search,
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
  'bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)]';

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
  if (status === 'missing') return 'Pending / Missing';
  return 'Verified';
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

function computeSplinePath(values: number[], width = 500, height = 180) {
  const max = Math.max(1, ...values);
  const padding = 20;
  const availHeight = height - padding * 2;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((val, idx) => ({
    x: Math.round(idx * step * 100) / 100,
    y: Math.round((height - padding - (val / max) * availHeight) * 100) / 100,
  }));

  if (points.length === 0) return { d: '', areaD: '', points };
  if (points.length === 1) {
    return {
      d: `M 0 ${points[0].y} L ${width} ${points[0].y}`,
      areaD: `M 0 ${points[0].y} L ${width} ${points[0].y} L ${width} ${height} L 0 ${height} Z`,
      points,
    };
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cp1x = curr.x + (next.x - curr.x) / 2;
    const cp1y = curr.y;
    const cp2x = curr.x + (next.x - curr.x) / 2;
    const cp2y = next.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }

  const areaD = `${d} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;
  return { d, areaD, points };
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

  const query = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusTab === 'submitted' && row.displayStatus !== 'submitted' && row.displayStatus !== 'verified') return false;
      if (statusTab === 'missing' && row.displayStatus !== 'pending' && row.displayStatus !== 'missing') return false;
      if (!query) return true;
      return row.institution.name.toLowerCase().includes(query) || row.institution.code.toLowerCase().includes(query);
    });
  }, [rows, search, statusTab, query]);

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

  const chart = useMemo(
    () => computeSplinePath(trend.map((day) => day.submitted), 500, 180),
    [trend]
  );

  const exportCsv = () => {
    const headers = ['College Code', 'Name', 'Submission Date', 'Submission Time PKT', 'Status', 'Photo URL'];
    const body = filteredRows.map((row) =>
      [
        row.institution.code,
        row.institution.name,
        row.submission?.submission_date || selectedDate,
        karachiClock(row.submission?.submission_time || row.submission?.created_at),
        row.displayStatus === 'pending' || row.displayStatus === 'missing' ? statusCopy(row.displayStatus) : 'Verified',
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

  const isClosedNow = isWindowClosed(now);

  return (
    <div className="bg-[#110B24] text-slate-100 min-h-screen p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans relative overflow-hidden">
      {/* Background Velvet Plum Ambient Radial Mesh Glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 10%, rgba(217, 70, 239, 0.12) 0%, transparent 60%), radial-gradient(circle at 15% 90%, rgba(99, 102, 241, 0.14) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 space-y-6">
        {/* 3. Header & Controls Layout */}
        <header className="bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-fuchsia-400">
                Government of Sindh
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs font-semibold text-slate-400">College Education Department</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-fuchsia-300 bg-clip-text text-transparent leading-relaxed">
              Assembly Verification Portal
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-10 items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#1E1442]/80 px-3.5 text-xs text-slate-200 shadow-inner">
              <Calendar className="h-4 w-4 text-fuchsia-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent font-semibold outline-none text-white cursor-pointer"
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
              className="bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white rounded-2xl px-4 py-2 text-xs font-bold shadow-lg shadow-fuchsia-600/25 transition active:scale-[0.98] cursor-pointer inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export Audit CSV
            </button>
          </div>
        </header>

        {/* 2. Fix 4-Column Grid: Responsive 4-column grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Colleges (Coral Accent) */}
          <div className="bg-gradient-to-br from-[#FF6B6B]/15 via-[#231849]/60 to-[#191136]/90 border border-[#FF6B6B]/25 rounded-3xl p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#FF8E53]">Total Colleges</p>
              <p className="text-3xl font-extrabold text-white leading-tight">{metrics.total}</p>
              <p className="text-[11px] text-slate-300/70 leading-relaxed">Registered Campuses</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6B6B]/20 text-[#FF6B6B] border border-[#FF6B6B]/40 shadow-inner shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
          </div>

          {/* Card 2: Submitted Today (Fuchsia Accent) */}
          <div className="bg-gradient-to-br from-[#E056FD]/15 via-[#231849]/60 to-[#191136]/90 border border-[#E056FD]/25 rounded-3xl p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#E056FD]">Submitted Today</p>
              <p className="text-3xl font-extrabold text-emerald-300 leading-tight">
                {metrics.submitted} <span className="text-xs font-bold text-emerald-400/80 font-normal">({metrics.submitted} ({metrics.compliance.toFixed(0)}%))</span>
              </p>
              <p className="text-[11px] text-slate-300/70 leading-relaxed">Verified Logged Photos</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E056FD]/20 text-[#E056FD] border border-[#E056FD]/40 shadow-inner shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>

          {/* Card 3: Pending / Missing (Lavender Accent) */}
          <div className="bg-gradient-to-br from-[#a29bfe]/15 via-[#231849]/60 to-[#191136]/90 border border-[#a29bfe]/25 rounded-3xl p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#a29bfe]">Pending / Missing</p>
              <p className="text-3xl font-extrabold text-amber-300 leading-tight">{metrics.pending}</p>
              <p className="text-[11px] text-slate-300/70 leading-relaxed">Awaiting Verification</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6C5CE7]/20 text-[#a29bfe] border border-[#6C5CE7]/40 shadow-inner shrink-0">
              <Clock className="h-6 w-6" />
            </div>
          </div>

          {/* Card 4: Compliance Rate (Cyan Accent with Smooth Progress Bar) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#00d2d3]/15 via-[#231849]/60 to-[#191136]/90 border border-[#00d2d3]/25 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex items-center justify-between">
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#00d2d3]">Compliance Rate</p>
                <TrendingUp className="h-5 w-5 text-[#00d2d3]" />
              </div>
              <p className="text-3xl font-extrabold text-white leading-tight">{metrics.compliance.toFixed(1)}%</p>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#00d2d3] to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, metrics.compliance))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-300/70 leading-relaxed">{metrics.submitted} of {metrics.total} colleges</p>
            </div>
          </div>
        </section>

        {/* ANALYTICS & SUBMISSIONS SECTION (2-Column Asymmetric Grid) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Daily Compliance Breakdown Bar (2 Columns) */}
          <article className="lg:col-span-2 bg-[#1D143D]/70 border border-white/[0.08] rounded-3xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-fuchsia-400" />
                  7-Day Compliance Breakdown
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Daily institutional submission performance in PKT</p>
              </div>
              <span className="text-[10px] font-bold text-fuchsia-300 uppercase tracking-wider bg-fuchsia-500/10 px-3 py-1 rounded-full border border-fuchsia-500/20">
                PKT Analytics
              </span>
            </div>

            {/* Strict Fixed-Height Area Spline Chart Container */}
            <div className="h-56 w-full relative">
              <svg viewBox="0 0 500 180" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="plumGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E056FD" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#E056FD" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="0" y1="130" x2="500" y2="130" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                <path d={chart.areaD} fill="url(#plumGradient)" />
                <path d={chart.d} fill="none" stroke="#E056FD" strokeWidth="3" />

                {chart.points.map((point, index) => (
                  <g key={trend[index]?.date}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={hoverDay === index ? 6 : 4}
                      fill="#ffffff"
                      stroke="#E056FD"
                      strokeWidth="2.5"
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoverDay(index)}
                      onMouseLeave={() => setHoverDay(null)}
                    />
                  </g>
                ))}
              </svg>

              {hoverDay !== null && trend[hoverDay] && (
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-[#1E1442]/95 px-3.5 py-2 text-xs text-white shadow-xl backdrop-blur-md">
                  <span className="font-bold text-fuchsia-300">{trend[hoverDay].label}</span> ({trend[hoverDay].date}):{' '}
                  <span className="font-bold text-emerald-300">{trend[hoverDay].submitted}</span> submitted ({trend[hoverDay].pct.toFixed(0)}%)
                </div>
              )}
            </div>

            <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-1">
              {trend.map((day) => (
                <span key={day.date} className="hover:text-fuchsia-300 transition-colors">
                  {day.label}
                </span>
              ))}
            </div>
          </article>

          {/* Right: Policy & Cutoff Card with clear window status (1 Column) */}
          <article className="lg:col-span-1 bg-[#1D143D]/70 border border-white/[0.08] rounded-3xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-fuchsia-400" />
                Policy &amp; Cutoff Rules
              </h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                isClosedNow
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              }`}>
                {isClosedNow ? 'Window Closed' : 'Window Active'}
              </span>
            </div>

            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Daily Cutoff Window:</span>
                <span className="text-xs font-bold text-fuchsia-300 font-mono">3:00 PM PKT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Timezone Evaluation:</span>
                <span className="text-xs font-bold text-white font-mono">Asia/Karachi (UTC+5)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Binary Status Policy:</span>
                <span className="text-xs font-bold text-emerald-300">Submitted vs Missing</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#170E33]/80 border border-white/[0.06] text-xs text-slate-300 space-y-2 leading-relaxed">
              <p className="font-semibold text-white">Cutoff Evaluation Rule:</p>
              <p className="text-[11px] text-slate-400">
                Submissions captured prior to 3:00 PM PKT display as Verified or Pending. After 3:00 PM PKT, unsubmitted institutions transition strictly to Missing / Absent status.
              </p>
            </div>
          </article>
        </section>

        {/* Institutional Submissions Feed */}
        <section className="bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Segmented Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', `All (${metrics.total})`],
                  ['submitted', `Submitted (${metrics.submitted})`],
                  ['missing', `Pending / Missing (${metrics.pending})`],
                ] as [StatusTab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusTab(id)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                    statusTab === id
                      ? 'bg-fuchsia-600/30 border border-fuchsia-500/40 text-fuchsia-200 shadow-[0_0_20px_rgba(217,70,239,0.25)]'
                      : 'border border-white/[0.08] bg-[#20183F]/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Dark Pill Search Input */}
            <label className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search college name or code..."
                className="bg-[#1E1442] border border-white/10 rounded-full px-4 py-2.5 pl-9.5 text-xs text-white placeholder-slate-400 outline-none focus:border-fuchsia-500/50 w-full transition-all"
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
                    className="bg-[#1D143D]/70 hover:bg-[#251B4E] border border-white/[0.06] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="bg-[#2E245C] text-fuchsia-300 border border-fuchsia-500/20 px-3 py-1 rounded-xl text-xs font-bold font-mono tracking-wider shrink-0 shadow-sm">
                        {row.institution.code}
                      </span>

                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-relaxed">{row.institution.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                          {row.submission
                            ? `Logged at ${karachiClock(row.submission.submission_time || row.submission.created_at)} PKT`
                            : 'Awaiting daily assembly capture'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                          isPending
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-[0_0_14px_rgba(16,185,129,0.2)]'
                        }`}
                      >
                        {statusCopy(row.displayStatus)}
                      </span>

                      {row.submission?.image_url ? (
                        <button
                          type="button"
                          onClick={() => setLightboxRow(row)}
                          className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] hover:border-fuchsia-500/40 transition-all cursor-pointer"
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
      </div>

      {/* High-Resolution Lightbox Inspection Modal */}
      {lightboxRow?.submission?.image_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B081A]/85 p-4 backdrop-blur-2xl"
          onClick={() => setLightboxRow(null)}
        >
          <div
            className="bg-[#1D143D]/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl max-h-[92vh] w-full max-w-4xl overflow-hidden shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b border-white/[0.08]">
              <div>
                <span className="bg-[#2E245C] text-fuchsia-300 border border-fuchsia-500/20 px-3 py-1 rounded-xl text-xs font-bold font-mono">
                  {lightboxRow.institution.code}
                </span>
                <h3 className="mt-2 text-lg font-bold text-white leading-relaxed">{lightboxRow.institution.name}</h3>
                <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                  Submission Timestamp: {karachiClock(lightboxRow.submission.submission_time || lightboxRow.submission.created_at)} PKT
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxRow(null)}
                className="rounded-full border border-white/[0.08] p-2 text-slate-300 hover:bg-white/10 transition-colors cursor-pointer"
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
    </div>
  );
}
