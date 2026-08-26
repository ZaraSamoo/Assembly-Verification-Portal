'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertOctagon,
  Loader2,
  Building,
  ShieldCheck,
  RotateCcw,
  Clock,
  Sparkles,
  AlertTriangle,
  FileCheck
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { compressAssemblyImage, CompressionResult } from '@/utils/imageCompression';

interface Institution {
  id: number;
  name: string;
  code: string;
  short_code?: string;
}

export default function MagicLinkAccessPage() {
  const params = useParams();
  const code = (params?.code as string) || '';

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalidLink, setInvalidLink] = useState(false);
  const [alreadySubmittedToday, setAlreadySubmittedToday] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileResult, setFileResult] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraTriggeredRef = useRef(false);

  const loadInstitution = useCallback(async () => {
    if (!code) {
      setInvalidLink(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();

      // Case-insensitive query on institutions where short_code matches parameter
      const queryInst: any = supabase.from('institutions');
      let { data, error } = await queryInst
        .select('id, name, code, short_code')
        .ilike('short_code', code)
        .maybeSingle();

      if (error || !data) {
        // Fallback to code column if short_code doesn't return
        const fallbackRes = await queryInst
          .select('id, name, code, short_code')
          .ilike('code', code)
          .maybeSingle();
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error || !data) {
        setInvalidLink(true);
        setLoading(false);
        return;
      }

      setInstitution(data as Institution);

      // Check if submission already exists today for this institution
      const todayDate = new Date().toISOString().split('T')[0];
      const querySub: any = supabase.from('assembly_submissions');
      const { data: existingSub } = await querySub
        .select('id')
        .eq('institution_id', data.id)
        .eq('submission_date', todayDate)
        .maybeSingle();

      if (existingSub) {
        setAlreadySubmittedToday(true);
      }
    } catch (err) {
      console.error('Error fetching institution for magic link:', err);
      setInvalidLink(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    loadInstitution();
  }, [loadInstitution]);

  // Automatically trigger native camera prompt upon page load if not yet captured or submitted
  useEffect(() => {
    if (institution && !alreadySubmittedToday && !isSubmitted && !fileResult && !cameraTriggeredRef.current) {
      cameraTriggeredRef.current = true;
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [institution, alreadySubmittedToday, isSubmitted, fileResult]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setCompressing(true);
    try {
      const result = await compressAssemblyImage(file);
      setFileResult(result);
    } catch (err) {
      console.error('Photo processing/compression error:', err);
      const previewUrl = URL.createObjectURL(file);
      setFileResult({
        compressedFile: file,
        previewUrl,
        originalSizeKB: Math.round(file.size / 1024),
        compressedSizeKB: Math.round(file.size / 1024),
      });
    } finally {
      setCompressing(false);
    }
  };

  const triggerRetake = () => {
    setFileResult(null);
    setErrorMessage(null);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handleSubmitPhoto = async () => {
    if (!fileResult || !institution) return;

    setUploading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const todayDate = new Date().toISOString().split('T')[0];
      const now = new Date();
      const fileName = `${institution.code}_${todayDate}_${Date.now()}.webp`;

      // 1. Upload file to Supabase Storage bucket 'assembly-photos'
      const { storageData, error: storageError }: any = await supabase.storage
        .from('assembly-photos')
        .upload(fileName, fileResult.compressedFile, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      // 2. Fetch public URL
      const { data: urlData } = supabase.storage
        .from('assembly-photos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // 3. Cut-off time check (10:30 AM)
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      const is_late = now > cutoff;

      // 4. Insert record into assembly_submissions table matching exact column names
      const queryInsert: any = supabase.from('assembly_submissions');
      const { error: insertError } = await queryInsert.insert({
        institution_id: institution.id,
        submission_date: todayDate,
        submission_time: now.toISOString(),
        image_url: publicUrl,
        is_late,
        status: 'submitted',
        remarks: 'Submitted via Principal Magic Link',
      });

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      // Clear temporary state and transition UI to instant session completion
      setFileResult(null);
      setIsSubmitted(true);
    } catch (err: any) {
      console.error('Submit photo error:', err);
      setErrorMessage(err?.message || 'Failed to submit photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Loading Screen
  if (loading) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex flex-col items-center justify-center space-y-4">
        <div className="p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs font-medium text-slate-400">Verifying Magic Link...</p>
        </div>
      </main>
    );
  }

  // Invalid or Expired Link
  if (invalidLink || !institution) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex items-center justify-center">
        <div className="w-full p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-2xl text-center space-y-4">
          <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 w-fit mx-auto">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Invalid or Expired Link</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            The assembly verification access link is either invalid, expired, or the institution code could not be found. Please request a new link from your administrator.
          </p>
        </div>
      </main>
    );
  }

  // Success / Session Completed Card
  if (isSubmitted || alreadySubmittedToday) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-8 max-w-md mx-auto flex items-center justify-center font-sans">
        <div className="w-full p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-emerald-500/30 shadow-2xl text-center space-y-5 relative overflow-hidden">
          <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit mx-auto">
            <ShieldCheck className="w-10 h-10" />
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 inline-block mb-2">
              Assembly Verified
            </span>
            <h2 className="text-xl font-bold text-slate-100">Today's verification photo uploaded successfully</h2>
            <p className="text-xs text-slate-400 pt-1">
              Your assembly verification record has been securely submitted and logged.
            </p>
          </div>

          {/* College Badge */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-left">
            <div className="flex items-center gap-2.5">
              <Building className="w-4 h-4 text-indigo-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-200 block">{institution.name}</span>
                <span className="text-[10px] text-slate-400">Institution Code</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-xs font-bold">
              {institution.code}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 text-xs text-slate-400 flex items-center justify-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>Session complete • No further action required</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto space-y-5 relative overflow-hidden font-sans flex flex-col justify-center"
      style={{
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 60%)',
      }}
    >
      {/* Hidden Native Camera File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {/* Header & College Badge */}
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-slate-100 tracking-tight">
              Assembly Verification
            </h1>
            <p className="text-xs text-slate-400">Public Principal Camera Flow</p>
          </div>
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        {/* College Name & College Code Header Badge */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-indigo-500/30 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                College Campus
              </span>
              <h2 className="text-sm font-bold text-slate-100 leading-tight">
                {institution.name}
              </h2>
            </div>
          </div>
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 shrink-0">
            {institution.code}
          </span>
        </div>
      </header>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 backdrop-blur-xl shadow-lg">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Camera Capture & Preview Card */}
      <section className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4 text-center">
        {compressing && (
          <div className="py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-xs font-medium text-slate-300">Processing captured photo...</p>
          </div>
        )}

        {!fileResult && !compressing && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-indigo-500/80 transition-colors rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer group bg-slate-950/50 space-y-3"
          >
            <div className="p-4 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Take Assembly Photo</p>
              <p className="text-xs text-slate-400 mt-0.5">Click to trigger native camera prompt</p>
            </div>
          </div>
        )}

        {/* Image Preview Container & Action Buttons */}
        {fileResult && !compressing && (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-md">
              <img
                src={fileResult.previewUrl}
                alt="Assembly capture preview"
                className="w-full h-56 object-cover"
              />
              <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[10px] text-indigo-300 font-mono">
                {fileResult.compressedSizeKB} KB WebP
              </div>
            </div>

            {/* Action Buttons: Retake Photo & Submit Photo */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={triggerRetake}
                disabled={uploading}
                className="py-3 px-4 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-900 disabled:opacity-50 text-slate-200 flex items-center justify-center gap-2 text-xs transition-all border border-slate-700 shadow-md"
              >
                <RotateCcw className="w-4 h-4" />
                Retake Photo
              </button>

              <button
                type="button"
                onClick={handleSubmitPhoto}
                disabled={uploading}
                className="py-3 px-4 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-indigo-600/30"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Submit Photo
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
