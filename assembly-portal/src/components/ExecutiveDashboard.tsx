'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Flag,
  ImageOff,
  Loader2,
  LogOut,
  Radio,
  Search,
  Timer,
  TrendingUp,
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
const GLASS = 'bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-xl';

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
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
  return value.split('T')[0];
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
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
    case 'late':
      return 'bg-rose-500/15 text-rose-300 border-rose-400/30';
    case 'missing':
      return 'bg-slate-500/15 text-slate-300 border-white/10';
    case 'flagged':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
    default:
      return 'bg-sky-500/15 text-sky-300 border-sky-400/30';
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
  const router = useRouter();
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

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const supabase = createClient() as any;

      const { data: instData, error: instError } = await supabase
        .from('institutions')
        .select('id, name, code, region_id, is_active, regions ( id, name )')
        .eq('is_active', true)
        .order('code', { ascending: true });

      if (instError) {
        const fallback = await supabase
          .from('institutions')
          .select('id, name, code, region_id, is_active')
          .eq('is_active', true)
          .order('code', { ascending: true });
        if (fallback.error) throw fallback.error;
        setInstitutions((fallback.data || []) as Institution[]);
      } else {
        setInstitutions((instData || []) as Institution[]);
      }

      const { data: subData, error: subError } = await supabase
        .from('assembly_submissions')
        .select('id, institution_id, submission_date, submission_time, image_url, remarks, status, is_late, created_at')
        .eq('submission_date', date)
        .order('submission_time', { ascending: false });

      if (subError) {
        const fallback = await supabase
          .from('assembly_submissions')
          .select('*')
          .order('created_at', { ascending: false });
        if (fallback.error) throw fallback.error;
        const filtered = ((fallback.data || []) as Submission[]).filter((row) => {
          const rowDate = parseDatePart(row.submission_date) || parseDatePart(row.submission_time) || parseDatePart(row.created_at);
          return rowDate === date;
        });
        setSubmissions(filtered);
      } else {
        setSubmissions((subData || []) as Submission[]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load monitoring data.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedDate);
  }, [loadData, selectedDate]);

  useEffect(() => {
    const supabase = createClient() as any;
    const channel = supabase
      .channel('executive-assembly-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assembly_submissions' },
        () => {
          void loadData(selectedDate);
        }
      )
      .subscribe((status: string) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, selectedDate]);

  const rows = useMemo<CollegeRow[]>(() => {
    const latestByInstitution = new Map<string, Submission>();
    for (const submission of submissions) {
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

    return institutions.map((institution) => {
      const submission = latestByInstitution.get(asId(institution.id)) ?? null;
      return {
        institution,
        submission,
        displayStatus: resolveStatus(submission),
      };
    });
  }, [institutions, submissions]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusTab === 'submitted' && (row.displayStatus === 'missing')) return false;
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
    const onTime = submitted - late;
    const compliance = total === 0 ? 0 : (submitted / total) * 100;
    return { total, submitted, pending, late, onTime, compliance };
  }, [rows]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

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
      const supabase = createClient() as any;
      const { error } = await supabase.from('assembly_submissions').update({ status: nextStatus }).eq('id', submissionId);
      if (error) {
        setErrorMessage(error.message);
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
    { id: 'pending', label: 'Pending / Missing' },
    { id: 'late', label: 'Late' },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050811] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[12%] h-[28rem] w-[28rem] rounded-full bg-indigo-600/25 blur-[140px]" />
        <div className="absolute top-[30%] right-[-8%] h-[32rem] w-[32rem] rounded-full bg-blue-600/20 blur-[160px]" />
        <div className="absolute bottom-[-10%] left-[30%] h-80 w-80 rounded-full bg-sky-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <header className={`${GLASS} flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between`}>
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              <Radio className={`h-3.5 w-3.5 ${live ? 'text-emerald-400' : 'text-slate-400'}`} />
              {live ? 'Live tracking' : 'Connecting live feed'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Regional &amp; Finance Monitoring Portal — Daily Assembly Compliance
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Real-time attendance analytics, photo inspection, and audit export. Cutoff {CUTOFF_LABEL}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-3.5 py-2">
              <Calendar className="h-4 w-4 text-indigo-300" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none"
                aria-label="Filter by submission date"
              />
            </label>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500"
            >
              <Download className="h-4 w-4" />
              Export CSV / Report
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-500/30 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<Building2 className="h-8 w-8 text-indigo-300" />} label="Total Institutions" value={metrics.total} />
          <MetricCard icon={<CheckCircle2 className="h-8 w-8 text-emerald-300" />} label="Submitted Today" value={metrics.submitted} accent="text-emerald-300" />
          <MetricCard icon={<Clock className="h-8 w-8 text-amber-300" />} label="Pending Today" value={metrics.pending} accent="text-amber-300" />
          <MetricCard
            icon={<Timer className="h-8 w-8 text-sky-300" />}
            label="On-Time vs Late"
            value={`${metrics.onTime} / ${metrics.late}`}
            hint={`On-time · Late after ${CUTOFF_LABEL}`}
          />
          <MetricCard
            icon={<TrendingUp className="h-8 w-8 text-sky-300" />}
            label="Overall Compliance"
            value={`${metrics.compliance.toFixed(1)}%`}
            accent="text-sky-300"
            hint={`${metrics.submitted} of ${metrics.total} colleges`}
          />
        </section>

        <section className={`${GLASS} overflow-hidden`}>
          <div className="flex flex-col gap-4 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Live Verification Feed</h2>
              <p className="text-xs text-slate-400">{filteredRows.length} colleges in current view</p>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusTab(tab.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                      statusTab === tab.id
                        ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
                        : 'border-white/10 bg-slate-950/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search college name or code (e.g. KQ2218)"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400/40"
                />
              </label>
            </div>
          </div>

          {errorMessage && (
            <div className="mx-4 mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 md:mx-5">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
              <p className="text-sm text-slate-400">Loading live assembly compliance…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">No colleges match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 font-semibold">College</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Date &amp; Time</th>
                    <th className="px-5 py-3 font-semibold">Photo</th>
                    <th className="px-5 py-3 font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {filteredRows.map((row) => (
                    <tr key={asId(row.institution.id)} className="transition hover:bg-white/5">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-100">{row.institution.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-indigo-300">{row.institution.code}</p>
                        {regionName(row.institution) && (
                          <p className="mt-1 text-[11px] text-slate-500">{regionName(row.institution)}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusPill(row.displayStatus)}`}>
                          {statusLabel(row.displayStatus)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {row.submission
                          ? formatDateTime(row.submission.submission_date, row.submission.submission_time || row.submission.created_at)
                          : format(new Date(`${selectedDate}T00:00:00`), 'MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-4">
                        {row.submission?.image_url ? (
                          <button
                            type="button"
                            onClick={() => openLightbox(row)}
                            className="block h-14 w-20 overflow-hidden rounded-xl border border-white/10"
                            aria-label={`Inspect photo for ${row.institution.name}`}
                          >
                            <img src={row.submission.image_url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <div className="flex h-14 w-20 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-500">
                            <ImageOff className="h-4 w-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        <div className="flex flex-col gap-1">
                          {row.displayStatus === 'late' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-300">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Late after {CUTOFF_LABEL}
                            </span>
                          )}
                          <span className="text-xs">{row.submission?.remarks || '—'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {lightboxRow?.submission?.image_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className={`${GLASS} flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden`}>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
              <div>
                <p className="font-mono text-xs text-indigo-300">{lightboxRow.institution.code}</p>
                <h3 className="text-lg font-semibold text-white">{lightboxRow.institution.name}</h3>
                <p className="text-xs text-slate-400">
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
                  className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
                  className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxRow(null)}
                  className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5"
                  aria-label="Close inspection"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              className="flex-1 overflow-auto bg-slate-950/50 p-4"
              onWheel={(event) => {
                event.preventDefault();
                setZoom((value) => Math.min(3, Math.max(1, Number((value + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))));
              }}
            >
              <img
                src={lightboxRow.submission.image_url}
                alt={`Assembly photo for ${lightboxRow.institution.name}`}
                className="mx-auto max-h-[58vh] origin-center rounded-2xl object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Officer action: approve a compliant photo or flag it for follow-up.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(lightboxRow.submission!.id, 'verified')}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                    lightboxRow.submission.status === 'verified'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(lightboxRow.submission!.id, 'flagged')}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                    lightboxRow.submission.status === 'flagged'
                      ? 'bg-rose-500 text-white'
                      : 'border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
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

function MetricCard({
  icon,
  label,
  value,
  hint,
  accent = 'text-white',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className={`${GLASS} flex items-center justify-between p-5`}>
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className={`mt-1 text-3xl font-extrabold ${accent}`}>{value}</p>
        {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
      </div>
      {icon}
    </div>
  );
}
