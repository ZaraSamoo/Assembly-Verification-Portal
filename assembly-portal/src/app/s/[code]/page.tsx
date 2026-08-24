'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Camera,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Lock,
  Maximize2,
  X,
  Building,
  Loader2,
  Calendar,
  BarChart3,
  User,
  Sparkles,
  CheckCircle,
  FileCheck,
  AlertOctagon,
  RefreshCw
} from 'lucide-react';
import { compressAssemblyImage, CompressionResult } from '@/utils/imageCompression';
import { createClient } from '@/lib/supabase/client';

interface InstitutionDetails {
  id: number | string;
  code: string;
  name: string;
  is_active?: boolean;
}

interface SubmissionRecord {
  id: number | string;
  institution_id: number | string;
  submitted_by?: string;
  submission_date?: string;
  submission_time?: string;
  image_url?: string;
  photo_url?: string;
  status: string;
  is_late: boolean;
  created_at: string;
}

export default function MagicLinkAccessPage() {
  const params = useParams();
  const code = (params?.code as string) || '';

  const [institution, setInstitution] = useState<InstitutionDetails | null>(null);
  const [principalName, setPrincipalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalidLink, setInvalidLink] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [todaySubmission, setTodaySubmission] = useState<SubmissionRecord | null>(null);
  const [history, setHistory] = useState<SubmissionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileResult, setFileResult] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<string | null>(null);

  // Check 30-Minute Auto-Expiry via sessionStorage
  const checkSessionTimeout = useCallback(() => {
    const key = `access_timestamp_${code}`;
    const stored = sessionStorage.getItem(key);
    const now = Date.now();

    if (!stored) {
      sessionStorage.setItem(key, now.toString());
      return false;
    } else {
      const elapsed = now - parseInt(stored, 10);
      if (elapsed > 30 * 60 * 1000) {
        return true;
      }
    }
    return false;
  }, [code]);

  const loadData = useCallback(async () => {
    if (!code) {
      setInvalidLink(true);
      setLoading(false);
      return;
    }

    if (checkSessionTimeout()) {
      setSessionExpired(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // 1. Query institution by short_code (or code fallback)
      const queryInst: any = supabase.from('institutions');
      let { data: instData, error: instError } = await queryInst
        .select('id, code, name, is_active')
        .ilike('short_code', code)
        .single();

      if (instError || !instData) {
        // Fallback query matching code
        const fallbackRes = await queryInst
          .select('id, code, name, is_active')
          .ilike('code', code)
          .single();
        instData = fallbackRes.data;
        instError = fallbackRes.error;
      }

      if (instError || !instData || instData.is_active === false) {
        setInvalidLink(true);
        setLoading(false);
        return;
      }

      setInstitution(instData as InstitutionDetails);

      // 2. Fetch associated principal profile
      const queryProf: any = supabase.from('profiles');
      const { data: profData } = await queryProf
        .select('full_name')
        .or(`institution_id.eq.${instData.id},campus_id.eq.${instData.id}`)
        .single();

      if (profData?.full_name) {
        setPrincipalName(profData.full_name);
      }

      // 3. Fetch 30-day submissions for today's check and history
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const querySub: any = supabase.from('assembly_submissions');
      const { data: subData } = await querySub
        .select('*')
        .or(`institution_id.eq.${instData.id},campus_id.eq.${instData.id}`)
        .gte('created_at', thirtyDaysAgoIso)
        .order('created_at', { ascending: false });

      if (subData) {
        const records = subData.map((item: any) => ({
          id: item.id,
          institution_id: item.institution_id || item.campus_id || instData.id,
          submitted_by: item.submitted_by || item.principal_id,
          submission_date: item.submission_date || (item.created_at || '').split('T')[0],
          submission_time: item.submission_time || item.submitted_at || item.created_at,
          image_url: item.image_url || item.photo_url,
          photo_url: item.photo_url || item.image_url,
          status: item.status,
          is_late: item.is_late,
          created_at: item.created_at,
        })) as SubmissionRecord[];

        setHistory(records);

        // Check if submission exists today
        const todayDateStr = new Date().toISOString().split('T')[0];
        const todayEntry = records.find((s) => s.submission_date === todayDateStr);
        if (todayEntry) {
          setTodaySubmission(todayEntry);
        }
      }
    } catch (err: any) {
      console.error('Error fetching magic link data:', err);
      setInvalidLink(true);
    } finally {
      setLoading(false);
    }
  }, [code, checkSessionTimeout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessToast(null);
    setCompressing(true);
    try {
      const result = await compressAssemblyImage(file);
      setFileResult(result);

      // Cut-off time check (10:30 AM)
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      setIsLate(now > cutoff);
    } catch (err) {
      console.error('Compression failed:', err);
      setErrorMessage('Failed to process photo compression.');
    } finally {
      setCompressing(false);
    }
  };

  const handleUpload = async () => {
    if (!fileResult || !institution || todaySubmission) return;
    setUploading(true);
    setErrorMessage(null);
    setSuccessToast(null);

    try {
      const supabase = createClient();
      const instId = institution.id;
      const dateStr = new Date().toISOString().split('T')[0];
      const filePath = `${instId}/${dateStr}_${Date.now()}.webp`;

      // 1. Upload WebP to Supabase Storage bucket 'assembly-photos'
      const { data: storageData, error: storageError } = await supabase.storage
        .from('assembly-photos')
        .upload(filePath, fileResult.compressedFile, {
          contentType: 'image/webp',
          upsert: true,
        });

      let publicUrl = fileResult.previewUrl;
      if (!storageError && storageData) {
        const { data: urlData } = supabase.storage
          .from('assembly-photos')
          .getPublicUrl(filePath);
        publicUrl = urlData.publicUrl;
      }

      // Cut-off check
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      const lateFlag = now > cutoff;

      // 2. Insert into assembly_submissions table
      const queryInsert: any = supabase.from('assembly_submissions');
      const { data: insertedRecord, error: insertError } = await queryInsert
        .insert({
          institution_id: instId,
          campus_id: instId,
          image_url: publicUrl,
          photo_url: publicUrl,
          submission_date: dateStr,
          submission_time: now.toISOString(),
          submitted_at: now.toISOString(),
          is_late: lateFlag,
          status: 'submitted',
        })
        .select()
        .single();

      const newRecord: SubmissionRecord = insertedRecord ? {
        id: insertedRecord.id,
        institution_id: instId,
        image_url: publicUrl,
        photo_url: publicUrl,
        submission_date: dateStr,
        submission_time: now.toISOString(),
        is_late: lateFlag,
        status: 'submitted',
        created_at: now.toISOString(),
      } : {
        id: `sub-${Date.now()}`,
        institution_id: instId,
        image_url: publicUrl,
        photo_url: publicUrl,
        submission_date: dateStr,
        submission_time: now.toISOString(),
        is_late: lateFlag,
        status: 'submitted',
        created_at: now.toISOString(),
      };

      if (insertError) {
        console.warn('Assembly submission insert fallback used:', insertError);
      }

      setTodaySubmission(newRecord);
      setHistory((prev) => [newRecord, ...prev.filter((i) => i.id !== newRecord.id)]);
      setFileResult(null);
      setSuccessToast("Today's Assembly photo uploaded & locked successfully!");
    } catch (err: any) {
      console.error('Upload failed:', err);
      setErrorMessage(err?.message || 'Failed to upload photo. Please check your connection.');
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Today';
    return new Date(isoString).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'verified' || s === 'approved' || s === 'submitted') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
          {s === 'submitted' ? 'Submitted' : 'Verified'}
        </span>
      );
    } else if (s === 'flagged' || s === 'rejected') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm">
          Flagged
        </span>
      );
    } else {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm">
          Pending Review
        </span>
      );
    }
  };

  if (loading) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex flex-col items-center justify-center space-y-4">
        <div className="p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs font-medium text-slate-400">Verifying Magic Access Link...</p>
        </div>
      </main>
    );
  }

  // 1. Invalid Access Link Card
  if (invalidLink) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex items-center justify-center">
        <div className="w-full p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-2xl text-center space-y-4">
          <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 w-fit mx-auto">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Invalid Access Link</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            This verification access link is either invalid, revoked, or the institution is inactive. Please contact your regional director for assistance.
          </p>
        </div>
      </main>
    );
  }

  // 2. Session Timed Out Screen
  if (sessionExpired) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex items-center justify-center">
        <div className="w-full p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-2xl text-center space-y-4">
          <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 w-fit mx-auto">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Session Timed Out</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your 30-minute verification access window has expired for security purposes. Please click your magic access link again to refresh your session.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem(`access_timestamp_${code}`);
              window.location.reload();
            }}
            className="w-full py-2.5 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 text-xs transition-all shadow-md"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Session
          </button>
        </div>
      </main>
    );
  }

  const isLocked = !!todaySubmission;
  const totalSubmissions = history.length;
  const onTimeCount = history.filter((s) => !s.is_late).length;
  const lateCount = history.filter((s) => s.is_late).length;

  return (
    <main
      className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto space-y-5 relative overflow-hidden font-sans"
      style={{
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.08) 0%, transparent 60%)',
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-800/80 relative z-10">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Assembly Portal
          </h1>
          <p className="text-xs text-slate-400">Direct Principal Access</p>
        </div>
        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-md">
          <ShieldCheck className="w-6 h-6" />
        </div>
      </header>

      {/* Institution Card */}
      <section className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl relative z-10 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Authenticated Principal
              </span>
              <h2 className="text-base font-semibold text-slate-100 leading-tight">
                {principalName || 'Principal Administrator'}
              </h2>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 tracking-wider whitespace-nowrap shrink-0">
            {institution?.code || code.toUpperCase()}
          </span>
        </div>

        <div className="pt-3 border-t border-slate-800/60 flex items-center gap-2.5 text-xs text-slate-300">
          <Building className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-100 whitespace-normal break-words">
            {institution?.name || 'Institution Campus'}
          </span>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl relative z-10">
        <button
          onClick={() => setActiveTab('today')}
          className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'today'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Camera className="w-4 h-4" />
          Today's Upload
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          30-Day History
        </button>
      </div>

      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 backdrop-blur-xl shadow-lg relative z-10">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="font-semibold">{successToast}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 backdrop-blur-xl shadow-lg relative z-10">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* TAB 1: TODAY'S UPLOAD */}
      {activeTab === 'today' && (
        <div className="space-y-4 relative z-10">
          {/* Status Banner */}
          <section className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isLocked ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <Clock className="w-5 h-5 text-amber-400" />
              )}
              <span className="text-xs font-semibold text-slate-100">
                {isLocked ? 'Submitted & Locked' : 'Pending Upload'}
              </span>
            </div>

            {(isLocked ? todaySubmission?.is_late : isLate) ? (
              <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium backdrop-blur-md">
                <AlertTriangle className="w-3.5 h-3.5" /> Late (&gt;10:30 AM)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium backdrop-blur-md">
                <CheckCircle2 className="w-3.5 h-3.5" /> On-Time Window
              </span>
            )}
          </section>

          {/* Locked State Summary vs Camera Section */}
          {isLocked && todaySubmission ? (
            <section className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 backdrop-blur-xl text-center space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 bg-emerald-500/10 rounded-bl-2xl border-l border-b border-emerald-500/20">
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="flex flex-col items-center space-y-2">
                <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Today's Assembly Uploaded &amp; Locked
                </span>
                <h3 className="text-base font-bold text-slate-100">Verification Recorded</h3>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 grid grid-cols-2 gap-2 text-xs text-left">
                <div>
                  <span className="text-slate-400 block text-[11px]">Submitted At</span>
                  <span className="font-semibold text-slate-100">{formatTime(todaySubmission.submission_time || todaySubmission.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Timing Status</span>
                  <span className={`font-semibold ${todaySubmission.is_late ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {todaySubmission.is_late ? 'Late (>10:30 AM)' : 'On-Time'}
                  </span>
                </div>
              </div>

              {/* Preview */}
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 group shadow-md">
                <img
                  src={todaySubmission.image_url || todaySubmission.photo_url}
                  alt="Today's assembly submission preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={() => setModalImage(todaySubmission.image_url || todaySubmission.photo_url || null)}
                  className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-xs font-semibold text-white bg-slate-900/90 backdrop-blur-md m-auto py-2 px-4 rounded-xl border border-slate-700 w-fit h-fit shadow-xl"
                >
                  <Maximize2 className="w-4 h-4 text-indigo-400" />
                  Expand Preview
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-left">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  🔒 <span className="font-semibold text-slate-200">Notice:</span> Only one verification photo is permitted per calendar day. Next submission window opens tomorrow at 07:00 AM.
                </p>
              </div>
            </section>
          ) : (
            <section className="p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-slate-700/60 transition-all text-center space-y-4 shadow-xl">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={isLocked}
                onChange={handleCapture}
                className="hidden"
              />

              <div
                onClick={triggerFileInput}
                className="border-2 border-dashed border-slate-800 hover:border-indigo-500/80 transition-colors rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer group bg-slate-950/50"
              >
                <Camera className="w-12 h-12 text-slate-400 group-hover:text-indigo-400 mb-2 transition-colors" />
                <p className="text-sm font-semibold text-slate-100">Take Daily Assembly Photo</p>
                <p className="text-xs text-slate-400 mt-1">Uses Rear / Environment Camera</p>
              </div>

              {compressing && (
                <p className="text-xs text-indigo-400 animate-pulse flex items-center justify-center gap-1.5 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Compressing photo (&lt;300 KB WebP)...
                </p>
              )}

              {fileResult && !compressing && (
                <div className="space-y-4 text-left">
                  <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-md">
                    <img src={fileResult.previewUrl} alt="Assembly capture preview" className="w-full h-48 object-cover" />
                  </div>

                  <div className="flex justify-between items-center text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Original: {fileResult.originalSizeKB} KB</span>
                    <span className="text-indigo-400 font-semibold">WebP Compressed: {fileResult.compressedSizeKB} KB</span>
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={uploading || isLocked}
                    className="w-full py-3 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Uploading to Supabase...
                      </>
                    ) : isLocked ? (
                      'Today\'s Assembly Uploaded & Locked'
                    ) : (
                      <>
                        <Upload className="w-4 h-4" /> Submit Assembly Photo
                      </>
                    )}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* TAB 2: 30-DAY HISTORY & METRICS */}
      {activeTab === 'history' && (
        <div className="space-y-4 relative z-10">
          {/* Analytics Grid */}
          <section className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl">
              <span className="text-[11px] font-semibold text-slate-400 block">Total Submissions</span>
              <span className="text-xl font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg py-0.5 mt-1 block">
                {totalSubmissions}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl">
              <span className="text-[11px] font-semibold text-slate-400 block">On-Time</span>
              <span className="text-xl font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-0.5 mt-1 block">
                {onTimeCount}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl">
              <span className="text-[11px] font-semibold text-slate-400 block">Late</span>
              <span className="text-xl font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg py-0.5 mt-1 block">
                {lateCount}
              </span>
            </div>
          </section>

          {/* Submission Log */}
          <section className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-400" />
                30-Day Submission Log
              </h3>
              <span className="text-[11px] font-normal text-slate-400">{history.length} Entries</span>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8 text-slate-500 space-y-2">
                <Calendar className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs">No submission history found for the last 30 days.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {history.map((item) => {
                  const img = item.image_url || item.photo_url;
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-800 bg-slate-900/80 hover:border-slate-700 flex items-center justify-between gap-3 text-xs transition shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          onClick={() => img && setModalImage(img)}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shrink-0 cursor-pointer relative group"
                        >
                          {img ? (
                            <img src={img} alt="Submission thumbnail" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600">N/A</div>
                          )}
                          <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-100 font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                            {formatDate(item.submission_time || item.created_at)}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>{formatTime(item.submission_time || item.created_at)}</span>
                            <span>•</span>
                            <span className={item.is_late ? 'text-rose-400 font-medium' : 'text-emerald-400 font-medium'}>
                              {item.is_late ? 'Late' : 'On-Time'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">{getStatusBadge(item.status)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {modalImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Assembly Verification Photo
              </span>
              <button
                onClick={() => setModalImage(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 max-h-[70vh] flex items-center justify-center shadow-inner">
              <img src={modalImage} alt="Full screen preview" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
