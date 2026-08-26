'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertOctagon,
  Loader2,
  Building2,
  ShieldCheck,
  RotateCcw,
  Clock,
  Sparkles,
  AlertTriangle,
  Award
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Institution {
  id: number;
  name: string;
  code: string;
  short_code?: string;
}

interface CompressedImage {
  file: File;
  previewUrl: string;
  sizeKB: number;
}

// Client-side HTML5 Canvas Image Compression (<250 KB)
function compressImageCanvas(file: File, maxDimension = 1280, quality = 0.72): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image into canvas'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down proportionally if larger than maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get 2D canvas context'));
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Canvas compression failed'));
            }
            const fileName = file.name.replace(/\.[^/.]+$/, '') + '_opt.jpg';
            const compressedFile = new File([blob], fileName, { type: 'image/jpeg' });
            const previewUrl = URL.createObjectURL(compressedFile);
            const sizeKB = Math.round(compressedFile.size / 1024);
            resolve({ file: compressedFile, previewUrl, sizeKB });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function pktDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d);
}

function isWindowClosed(d = new Date()) {
  const localTimeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour12: false });
  const [hour] = localTimeStr.split(':').map(Number);
  return hour >= 15;
}

export default function MagicLinkAccessPage() {
  const params = useParams();
  const code = (params?.code as string) || '';

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalidLink, setInvalidLink] = useState(false);
  const [alreadySubmittedToday, setAlreadySubmittedToday] = useState(false);
  const [windowClosed, setWindowClosed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressedImage, setCompressedImage] = useState<CompressedImage | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionTimeFormatted, setSubmissionTimeFormatted] = useState<string | null>(null);
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
        // Fallback matching code column
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

      const localDate = pktDate();
      const querySub: any = supabase.from('assembly_submissions');
      const { data: existingSub } = await querySub
        .select('id, submission_time, created_at')
        .eq('institution_id', data.id)
        .eq('submission_date', localDate)
        .maybeSingle();

      if (existingSub) {
        setAlreadySubmittedToday(true);
        const subTime = existingSub.submission_time || existingSub.created_at;
        if (subTime) {
          setSubmissionTimeFormatted(
            new Date(subTime).toLocaleTimeString('en-US', {
              timeZone: 'Asia/Karachi',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          );
        }
      }

      if (isWindowClosed()) {
        setWindowClosed(true);
      }
    } catch (err) {
      console.error('Error fetching institution:', err);
      setInvalidLink(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    loadInstitution();
  }, [loadInstitution]);

  // Auto-trigger native camera on initial mount after institution resolved
  useEffect(() => {
    if (
      institution &&
      !alreadySubmittedToday &&
      !isSubmitted &&
      !compressedImage &&
      !windowClosed &&
      !cameraTriggeredRef.current
    ) {
      cameraTriggeredRef.current = true;
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [institution, alreadySubmittedToday, isSubmitted, compressedImage, windowClosed]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setOptimizing(true);

    try {
      const result = await compressImageCanvas(file, 1280, 0.72);
      setCompressedImage(result);
    } catch (err: any) {
      console.error('Canvas compression error:', err);
      const previewUrl = URL.createObjectURL(file);
      setCompressedImage({
        file,
        previewUrl,
        sizeKB: Math.round(file.size / 1024),
      });
    } finally {
      setOptimizing(false);
    }
  };

  const triggerRetake = () => {
    setCompressedImage(null);
    setErrorMessage(null);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handleSubmitPhoto = async () => {
    if (!compressedImage || !institution) return;

    if (isWindowClosed()) {
      setWindowClosed(true);
      setErrorMessage('Daily Submission Window Closed (Closes at 3:00 PM PKT)');
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const localDate = pktDate();
      const fileName = `${institution.code}_${localDate}_${Date.now()}.jpg`;

      // 1. Upload to Supabase Storage bucket 'assembly-photos'
      const { error: storageError }: any = await supabase.storage
        .from('assembly-photos')
        .upload(fileName, compressedImage.file, {
          contentType: 'image/jpeg',
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
      const isoSubmissionTime = new Date().toISOString();

      // 3. Insert into assembly_submissions table with exact PKT requirements
      const queryInsert: any = supabase.from('assembly_submissions');
      const { error: insertError } = await queryInsert.insert({
        institution_id: institution.id,
        submission_date: localDate,
        submission_time: isoSubmissionTime,
        image_url: publicUrl,
        is_late: false,
        status: 'submitted',
        remarks: 'Submitted via Principal Magic Link',
      });

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      const formattedTime = new Date().toLocaleTimeString('en-US', {
        timeZone: 'Asia/Karachi',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      setSubmissionTimeFormatted(formattedTime);
      setCompressedImage(null);
      setIsSubmitted(true);
    } catch (err: any) {
      console.error('Submit photo error:', err);
      setErrorMessage(err?.message || 'Failed to submit verification photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // 1. Loading Screen (Deep Plum Frosted Spinner)
  if (loading) {
    return (
      <main className="bg-[#110B24] min-h-screen text-slate-100 p-4 max-w-md mx-auto flex flex-col items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-fuchsia-600/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="w-full p-8 rounded-3xl bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.4)] flex flex-col items-center gap-4 text-center relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/25 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-fuchsia-400 animate-spin" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Verifying Magic Access Link</h3>
            <p className="text-xs text-slate-400">Resolving institution &amp; session context...</p>
          </div>
        </div>
      </main>
    );
  }

  // 2. Invalid or Expired Link
  if (invalidLink || !institution) {
    return (
      <main className="bg-[#110B24] min-h-screen text-slate-100 p-4 max-w-md mx-auto flex items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-rose-600/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="w-full p-8 rounded-3xl bg-[#1D143D]/70 backdrop-blur-2xl border border-rose-500/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)] text-center space-y-5 relative z-10">
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-400 w-fit mx-auto shadow-inner">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white">Invalid or Expired Link</h2>
            <p className="text-xs text-slate-300 leading-relaxed px-2">
              This assembly verification link is invalid, expired, or revoked. Please contact your regional administrator to issue a new verification link.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // 3. Success State Screen
  if (isSubmitted || alreadySubmittedToday) {
    return (
      <main className="bg-[#110B24] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto flex items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/15 rounded-full blur-[110px] pointer-events-none" />

        <div className="w-full p-7 rounded-3xl bg-[#1D143D]/70 backdrop-blur-2xl border border-emerald-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.4)] text-center space-y-6 relative z-10">
          {/* Glowing Emerald Badge */}
          <div className="p-4 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 w-fit mx-auto shadow-[0_0_24px_rgba(16,185,129,0.25)]">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold tracking-widest text-emerald-300 uppercase bg-emerald-500/15 px-3.5 py-1 rounded-full border border-emerald-500/30 inline-block">
              Assembly Verified
            </span>
            <h2 className="text-xl font-extrabold text-white leading-snug tracking-tight">
              Today's Assembly Logged Successfully
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your verification photo has been recorded. Session securely closed.
            </p>
          </div>

          {/* College Metadata Pill */}
          <div className="p-4 rounded-2xl bg-[#140C2E]/80 border border-white/[0.08] text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Institution Campus</span>
              <span className="px-3 py-1 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 font-mono text-xs font-bold tracking-wider">
                {institution.code}
              </span>
            </div>
            <h3 className="text-sm font-bold text-white leading-tight">
              {institution.name}
            </h3>
            {submissionTimeFormatted && (
              <div className="pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" /> Logged Timestamp:
                </span>
                <span className="font-bold text-white">{submissionTimeFormatted}</span>
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-[#170E33] border border-white/[0.08] text-[11px] text-slate-300 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Government of Sindh • College Education Department</span>
          </div>
        </div>
      </main>
    );
  }

  // 4. Cutoff Closed Screen
  if (windowClosed) {
    return (
      <main className="bg-[#110B24] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto flex items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-500/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="w-full p-7 rounded-3xl bg-[#1D143D]/70 backdrop-blur-2xl border border-amber-500/25 shadow-[0_12px_40px_rgba(0,0,0,0.4)] text-center space-y-6 relative z-10">
          <div className="p-4 rounded-3xl bg-amber-500/15 border border-amber-500/30 text-amber-400 w-fit mx-auto">
            <Clock className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">
              Daily Submission Window Closed
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Assembly photos for <span className="font-semibold text-fuchsia-300">{institution.code}</span> can only be submitted before 3:00 PM Pakistan Standard Time.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-[#140C2E]/80 border border-white/[0.08] text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Institution Campus</p>
            <h3 className="mt-1 text-sm font-bold text-white">{institution.name}</h3>
          </div>
        </div>
      </main>
    );
  }

  // 5. Active Camera & Submit Form
  return (
    <main className="bg-[#110B24] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto space-y-5 font-sans flex flex-col justify-center relative overflow-hidden">
      {/* Ambient Radial Mesh Glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-fuchsia-600/15 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-64 h-64 bg-indigo-600/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Hidden Native Camera File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {/* Header Section */}
      <header className="space-y-3 relative z-10">
        <div className="flex items-center justify-between pb-1">
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-fuchsia-400 block">
              Government of Sindh
            </span>
            <h1 className="text-base font-bold text-white tracking-tight">
              College Education Department
            </h1>
          </div>
          <div className="p-2.5 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/25 text-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.15)]">
            <Award className="w-5 h-5" />
          </div>
        </div>

        {/* Institution Banner Card */}
        <div className="p-4 rounded-3xl bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.4)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              College Campus
            </span>
            <span className="px-3 py-1 rounded-xl bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 font-mono text-xs font-bold tracking-wider">
              {institution.code}
            </span>
          </div>
          <h2 className="text-base font-bold text-white leading-snug break-words">
            {institution.name}
          </h2>
        </div>
      </header>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-3 backdrop-blur-xl shadow-lg relative z-10">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Camera Capture & Preview Container */}
      <section className="p-5 rounded-3xl bg-[#1D143D]/70 backdrop-blur-2xl border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.4)] space-y-4 text-center relative z-10">
        {optimizing && (
          <div className="py-12 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/25 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-fuchsia-400 animate-spin" />
            </div>
            <p className="text-xs font-semibold text-white">Optimizing photo...</p>
            <p className="text-[10px] text-slate-400">Compressing image for fast mobile upload</p>
          </div>
        )}

        {!compressedImage && !optimizing && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-fuchsia-500/30 hover:border-fuchsia-500/60 transition-all rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer group bg-[#160E33]/60 backdrop-blur-md space-y-3"
          >
            <div className="p-4 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/25 text-fuchsia-400 group-hover:scale-105 transition-transform shadow-[0_0_20px_rgba(217,70,239,0.2)]">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Tap to Snap Assembly Photo</p>
              <p className="text-xs text-slate-400 mt-1">Triggers native rear camera prompt</p>
            </div>
          </div>
        )}

        {/* Captured Image Preview Box & Action Buttons */}
        {compressedImage && !optimizing && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black shadow-2xl aspect-[4/3]">
              <img
                src={compressedImage.previewUrl}
                alt="Captured assembly verification preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 px-3 py-1 rounded-xl bg-[#140C2E]/90 backdrop-blur-md border border-white/10 text-[10px] text-fuchsia-300 font-mono font-bold shadow-md">
                {compressedImage.sizeKB} KB Compressed
              </div>
            </div>

            {/* Action Buttons: Retake Photo & Submit Verification */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={triggerRetake}
                disabled={uploading}
                className="py-3.5 px-4 rounded-2xl font-semibold bg-[#261A4E] hover:bg-[#322366] active:scale-[0.98] disabled:opacity-50 text-slate-200 flex items-center justify-center gap-2 text-xs transition-all border border-white/[0.08] shadow-md cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Retake Photo
              </button>

              <button
                type="button"
                onClick={handleSubmitPhoto}
                disabled={uploading}
                className="py-3.5 px-4 rounded-2xl font-bold bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 shadow-lg shadow-fuchsia-600/25 active:scale-[0.98] disabled:opacity-50 text-white flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Submit Verification
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
