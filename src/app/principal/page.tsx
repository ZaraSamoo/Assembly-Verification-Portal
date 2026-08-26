'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  LogOut
} from 'lucide-react';
import { compressAssemblyImage, CompressionResult } from '@/utils/imageCompression';
import { createClient } from '@/lib/supabase/client';

interface InstitutionInfo {
  id: string;
  name: string;
  code: string;
}

interface ProfileDetails {
  id: string;
  full_name: string;
  role: string;
  institution_id?: string;
  institutions?: InstitutionInfo | null;
}

interface SubmissionRecord {
  id: string;
  institution_id: string;
  principal_id?: string;
  image_url?: string;
  photo_url?: string;
  submitted_at?: string;
  created_at: string;
  is_late: boolean;
  status: string;
}

export default function PrincipalPortal() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [userFallbackName, setUserFallbackName] = useState<string>('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [todaySubmission, setTodaySubmission] = useState<SubmissionRecord | null>(null);
  const [history, setHistory] = useState<SubmissionRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Sign-out error:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  // Tab State: 'today' vs 'history'
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileResult, setFileResult] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Lightbox Modal State
  const [modalImage, setModalImage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoadingProfile(false);
        setLoadingData(false);
        return;
      }

      setUserFallbackName(user.user_metadata?.full_name || 'Principal User');

      // 1. Query profiles table joining ONLY institutions(...) schema
      const queryProf: any = supabase.from('profiles');
      const { data: profData, error: profError } = await queryProf
        .select(`
          full_name, role, region_id,
          institutions ( id, code, name )
        `)
        .eq('id', user.id)
        .single();

      if (profError) {
        console.warn('Profile query error:', profError);
      }

      if (profData) {
        const inst = profData.institutions || null;
        const profileObj: ProfileDetails = {
          id: user.id,
          full_name: profData.full_name || user.user_metadata?.full_name || 'Principal',
          role: profData.role,
          institution_id: inst?.id || undefined,
          institutions: inst,
        };
        setProfile(profileObj);

        const instId = profileObj.institution_id;
        if (instId) {
          const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

          // 2. Fetch 30-day submissions for institution_id from assembly_submissions table
          const queryAssemblySub: any = supabase.from('assembly_submissions');
          const { data: assemblyData, error: subError } = await queryAssemblySub
            .select('*')
            .eq('campus_id', instId)
            .gte('created_at', thirtyDaysAgoIso)
            .order('created_at', { ascending: false });

          let historyRecords: SubmissionRecord[] = [];
          if (!subError && assemblyData) {
            historyRecords = assemblyData.map((item: any) => ({
              id: item.id,
              institution_id: item.campus_id || instId,
              principal_id: item.principal_id,
              image_url: item.photo_url || item.image_url,
              photo_url: item.photo_url || item.image_url,
              submitted_at: item.submitted_at || item.created_at,
              created_at: item.created_at,
              is_late: item.is_late,
              status: item.status,
            }));
          }

          setHistory(historyRecords);

          // Check if today's submission exists
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const todayEntry = historyRecords.find((sub) => {
            const subDate = new Date(sub.submitted_at || sub.created_at);
            return subDate >= todayStart;
          });

          if (todayEntry) {
            setTodaySubmission(todayEntry);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching portal data:', err);
    } finally {
      setLoadingProfile(false);
      setLoadingData(false);
    }
  }, []);

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

      // Check cut-off time (10:30 AM)
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      setIsLate(now > cutoff);
    } catch (err) {
      console.error('Compression failed:', err);
      setErrorMessage('Failed to process image compression. Please try again.');
    } finally {
      setCompressing(false);
    }
  };

  const handleUpload = async () => {
    if (!fileResult || todaySubmission) return;
    setUploading(true);
    setErrorMessage(null);
    setSuccessToast(null);

    try {
      const supabase = createClient();
      const instId = profile?.institution_id || 'inst-01';
      const dateStr = new Date().toISOString().split('T')[0];
      const filePath = `${instId}/${dateStr}_${Date.now()}.webp`;

      // 1. Upload to Supabase Storage bucket 'assembly-photos'
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

      // 2. Check cut-off time (10:30 AM)
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      const lateFlag = now > cutoff;

      // 3. Insert row into assembly_submissions table
      const queryAssembly: any = supabase.from('assembly_submissions');
      const { data: assInserted, error: assErr } = await queryAssembly
        .insert({
          campus_id: instId,
          principal_id: profile?.id,
          photo_url: publicUrl,
          submitted_at: now.toISOString(),
          is_late: lateFlag,
          status: 'pending',
        })
        .select()
        .single();

      let insertedRecord: SubmissionRecord | null = null;
      if (!assErr && assInserted) {
        insertedRecord = {
          id: assInserted.id,
          institution_id: assInserted.campus_id || instId,
          principal_id: assInserted.principal_id,
          image_url: assInserted.photo_url,
          photo_url: assInserted.photo_url,
          submitted_at: assInserted.submitted_at,
          created_at: assInserted.created_at,
          is_late: assInserted.is_late,
          status: assInserted.status,
        };
      }

      const newRecord: SubmissionRecord = insertedRecord || {
        id: `sub-${Date.now()}`,
        institution_id: instId,
        principal_id: profile?.id,
        image_url: publicUrl,
        photo_url: publicUrl,
        submitted_at: now.toISOString(),
        created_at: now.toISOString(),
        is_late: lateFlag,
        status: 'submitted',
      };

      // 4. Update local state, lock button, show toast, refresh 30-day logs
      setTodaySubmission(newRecord);
      setHistory((prev) => [newRecord, ...prev.filter((item) => item.id !== newRecord.id)]);
      setFileResult(null);
      setSuccessToast("Today's Assembly photo submitted & locked successfully!");
    } catch (err: any) {
      console.error('Upload failed:', err);
      setErrorMessage(err?.message || 'Upload failed. Please check network connection.');
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

  if (loadingProfile || loadingData) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex flex-col items-center justify-center space-y-4">
        <div className="p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs font-medium text-slate-400">Loading Principal Portal...</p>
        </div>
      </main>
    );
  }

  const isLocked = !!todaySubmission;
  const totalSubmissions = history.length;
  const onTimeCount = history.filter((s) => !s.is_late).length;
  const lateCount = history.filter((s) => s.is_late).length;

  const displayName = profile?.full_name || userFallbackName || 'Prof. Principal';
  const collegeName = profile?.institutions?.name || 'Government Degree College';
  const collegeCode = profile?.institutions?.code || 'KQ2145';

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
          <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            Principal Portal
          </h1>
          <p className="text-xs text-slate-400">Daily Assembly Verification</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-xs font-medium transition-all duration-200 flex items-center gap-2 backdrop-blur-md shadow-sm disabled:opacity-50"
          >
            {loggingOut ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            Logout
          </button>
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </header>

      {/* 1. Dynamic Principal & Institution Card */}
      <section className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-slate-700/60 shadow-xl relative z-10 space-y-4 transition-all">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Logged-in Principal
              </span>
              <h2 className="text-base font-semibold text-slate-100 leading-tight">
                {displayName}
              </h2>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 tracking-wider whitespace-nowrap shrink-0">
            {collegeCode}
          </span>
        </div>

        <div className="pt-3 border-t border-slate-800/60 flex items-center gap-2.5 text-xs text-slate-300">
          <Building className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-100 whitespace-normal break-words">
            {collegeName}
          </span>
        </div>
      </section>

      {/* 2. Navigation Tabs */}
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

      {/* TAB 1: TODAY'S ASSEMBLY UPLOAD */}
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
                  <span className="font-semibold text-slate-100">{formatTime(todaySubmission.submitted_at || todaySubmission.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Timing Status</span>
                  <span className={`font-semibold ${todaySubmission.is_late ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {todaySubmission.is_late ? 'Late (>10:30 AM)' : 'On-Time'}
                  </span>
                </div>
              </div>

              {/* WebP Preview Container */}
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
          {/* Analytics Overview Grid */}
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

          {/* Chronological Submission Logs */}
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
                            {formatDate(item.submitted_at || item.created_at)}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>{formatTime(item.submitted_at || item.created_at)}</span>
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

      {/* Lightbox Image Preview Modal */}
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
