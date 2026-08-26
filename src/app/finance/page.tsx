'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertOctagon, Calendar, AlertTriangle, Filter, Loader2, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface AssemblySubmissionRecord {
  id: number | string;
  institution_id?: number | string;
  submitted_by?: string;
  submission_date?: string;
  submission_time?: string;
  image_url?: string;
  remarks?: string | null;
  status: 'submitted' | 'verified' | 'flagged' | string;
  is_late: boolean;
  created_at: string;
  institutions?: {
    id: number | string;
    code: string;
    name: string;
  } | null;
}

export default function FinanceOfficerPortal() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [submissions, setSubmissions] = useState<AssemblySubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const query: any = supabase.from('assembly_submissions');
      
      const { data, error } = await query
        .select(`
          id,
          institution_id,
          submitted_by,
          submission_date,
          submission_time,
          image_url,
          remarks,
          status,
          is_late,
          created_at,
          institutions (
            id,
            code,
            name
          )
        `)
        .order('submission_time', { ascending: false });

      if (error) {
        console.error('Error fetching assembly_submissions:', error);
        setErrorMessage(error.message);
      } else if (data) {
        setSubmissions(data as AssemblySubmissionRecord[]);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setErrorMessage(err?.message || 'Failed to fetch submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleAction = async (id: number | string, newStatus: 'verified' | 'flagged') => {
    try {
      const supabase = createClient();
      const query: any = supabase.from('assembly_submissions');

      const { error } = await query
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        console.error('Failed to update submission status:', error);
        alert(`Failed to update status: ${error.message}`);
        return;
      }

      setSubmissions((prev) =>
        prev.map((sub) => (sub.id === id ? { ...sub, status: newStatus } : sub))
      );
    } catch (err: any) {
      console.error('Action error:', err);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  // Filter by selected date
  const filteredSubmissions = submissions.filter((s) => {
    const dateStr = s.submission_date || (s.submission_time || s.created_at || '').split('T')[0];
    return !selectedDate || dateStr === selectedDate;
  });

  const delinquentCount = filteredSubmissions.filter((s) => s.is_late || s.status === 'flagged').length;
  const pendingCount = filteredSubmissions.filter((s) => s.status === 'submitted' || s.status === 'pending').length;
  const verifiedCount = filteredSubmissions.filter((s) => s.status === 'verified').length;

  return (
    <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">Finance Verification Dashboard</h1>
          <p className="text-sm text-slate-400">Region: Verification & Governance</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Historical Date Picker Filter */}
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3.5 py-2 rounded-xl">
            <Calendar className="w-4 h-4 text-sky-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-200"
            />
          </div>

          <button
            onClick={handleLogout}
            className="px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-xs font-semibold transition-all flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Delinquency & Metric Counters */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-slate-400 font-medium">Delinquency Count</p>
            <p className="text-2xl font-bold text-rose-400">{delinquentCount} Submissions</p>
          </div>
          <AlertOctagon className="w-8 h-8 text-rose-400/80" />
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-slate-400 font-medium">Pending Verifications</p>
            <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
          </div>
          <Filter className="w-8 h-8 text-amber-400/80" />
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-slate-400 font-medium">Verified Assemblies</p>
            <p className="text-2xl font-bold text-emerald-400">{verifiedCount}</p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-400/80" />
        </div>
      </section>

      {/* Verification Photo Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Daily Verification Photo Grid</h2>
          <span className="text-xs text-slate-400">{filteredSubmissions.length} Submissions</span>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            <p className="text-xs text-slate-400">Loading live assembly submissions...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
            <p className="text-sm">No submissions recorded for {selectedDate}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSubmissions.map((sub) => {
              const photo = sub.image_url || '';
              const instName = sub.institutions?.name || 'Institution';
              const instCode = sub.institutions?.code || 'INST-CODE';
              const rawTime = sub.submission_time || sub.created_at;
              const timeStr = rawTime
                ? new Date(rawTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                : '--:--';

              return (
                <div
                  key={sub.id}
                  className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl"
                >
                  <div className="relative bg-slate-950">
                    <img src={photo} alt={instName} className="w-full h-48 object-cover" />
                    {sub.is_late && (
                      <span className="absolute top-3 right-3 bg-rose-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 backdrop-blur-md">
                        <AlertTriangle className="w-3.5 h-3.5" /> Late Submission
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">{instName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Code: <span className="font-mono text-sky-400 font-semibold">{instCode}</span> • Time: {timeStr}
                      </p>
                    </div>

                    {/* 1-Click Verification Actions */}
                    <div className="flex gap-2 pt-3 border-t border-slate-800">
                      <button
                        onClick={() => handleAction(sub.id, 'verified')}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                          sub.status === 'verified'
                            ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                            : 'bg-slate-800/80 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verify
                      </button>

                      <button
                        onClick={() => handleAction(sub.id, 'flagged')}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                          sub.status === 'flagged'
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                            : 'bg-slate-800/80 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        <AlertOctagon className="w-3.5 h-3.5" />
                        Flag
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
