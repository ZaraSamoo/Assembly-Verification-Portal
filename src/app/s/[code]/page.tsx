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
  FileCheck,
  CheckCircle,
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

// Client-side HTML5 Canvas Image Compression
function compressImageCanvas(file: File, maxDimension = 1280, quality = 0.7): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image in canvas'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down maintaining aspect ratio
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
          return reject(new Error('Failed to create 2d canvas context'));
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

export default function MagicLinkAccessPage() {
  const params = useParams();
  const code = (params?.code as string) || '';

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalidLink, setInvalidLink] = useState(false);
  const [alreadySubmittedToday, setAlreadySubmittedToday] = useState(false);

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

      // Case-insensitive lookup on short_code
      const queryInst: any = supabase.from('institutions');
      let { data, error } = await queryInst
        .select('id, name, code, short_code')
        .ilike('short_code', code)
        .maybeSingle();

      if (error || !data) {
        // Fallback to code column
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

      // Check if submission exists today for this institution
      const todayDate = new Date().toISOString().split('T')[0];
      const querySub: any = supabase.from('assembly_submissions');
      const { data: existingSub } = await querySub
        .select('id, submission_time, created_at')
        .eq('institution_id', data.id)
        .eq('submission_date', todayDate)
        .maybeSingle();

      if (existingSub) {
        setAlreadySubmittedToday(true);
        const subTime = existingSub.submission_time || existingSub.created_at;
        if (subTime) {
          setSubmissionTimeFormatted(
            new Date(subTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
          );
        }
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

  // Auto trigger native camera prompt upon page load if not yet captured or submitted
  useEffect(() => {
    if (institution && !alreadySubmittedToday && !isSubmitted && !compressedImage && !cameraTriggeredRef.current) {
      cameraTriggeredRef.current = true;
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [institution, alreadySubmittedToday, isSubmitted, compressedImage]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setOptimizing(true);

    try {
      const result = await compressImageCanvas(file, 1280, 0.7);
      setCompressedImage(result);
    } catch (err: any) {
      console.error('Canvas compression error:', err);
      // Direct fallback preview if canvas fails
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

    setUploading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const todayDate = new Date().toISOString().split('T')[0];
      const now = new Date();
      const fileName = `${institution.code}_${todayDate}_${Date.now()}.jpg`;

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

      // 3. Cut-off time check (10:30 AM)
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      const is_late = now > cutoff;

      // 4. Insert into assembly_submissions table matching exact schema
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

      const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
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

  // Loading Screen
  if (loading) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 max-w-md mx-auto flex flex-col items-center justify-center font-sans">
        <div className="p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-2xl flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs font-semibold text-slate-300">Verifying Principal Access Link...</p>
        </div>
      </main>
    );
  }

  // Invalid or Expired Link Card
  if (invalidLink || !institution) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 max-w-md mx-auto flex items-center justify-center font-sans">
        <div className="w-full p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-rose-500/20 shadow-2xl text-center space-y-4">
          <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 w-fit mx-auto">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-100">Invalid or Expired Link</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              This assembly verification link is invalid, expired, or the college code was not found. Please contact your regional director for assistance.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Polished Success State Screen
  if (isSubmitted || alreadySubmittedToday) {
    return (
      <main className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto flex items-center justify-center font-sans relative overflow-hidden">
        <div className="w-full p-6 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-emerald-500/30 shadow-2xl text-center space-y-5 relative">
          <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit mx-auto">
            <CheckCircle className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 inline-block mb-1">
              Assembly Verified
            </span>
            <h2 className="text-xl font-bold text-white leading-snug">
              Today's Assembly Logged Successfully
            </h2>
            <p className="text-xs text-slate-400">
              Session securely closed. Your verification record is saved.
            </p>
          </div>

          {/* College Info Card */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">College Details</span>
              <span className="px-2.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-xs font-bold">
                {institution.code}
              </span>
            </div>
            <h3 className="text-sm font-bold text-white leading-tight">
              {institution.name}
            </h3>
            {submissionTimeFormatted && (
              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" /> Logged Time:
                </span>
                <span className="font-semibold text-slate-200">{submissionTimeFormatted}</span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-400 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Government of Sindh • College Education Department</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="bg-[#0B0F17] min-h-screen text-slate-100 p-4 md:p-6 max-w-md mx-auto space-y-5 relative font-sans flex flex-col justify-center"
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

      {/* Official Top Header */}
      <header className="space-y-3">
        <div className="flex items-center justify-between pb-1">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
              Government of Sindh
            </span>
            <h1 className="text-base font-bold text-slate-100 tracking-tight">
              College Education Department
            </h1>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-md">
            <Award className="w-5 h-5" />
          </div>
        </div>

        {/* Prominent Badge & College Name Banner */}
        <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Institution Campus
            </span>
            <span className="px-3 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-mono text-xs font-bold tracking-wider">
              {institution.code}
            </span>
          </div>
          <h2 className="text-base md:text-lg font-bold text-white leading-snug break-words">
            {institution.name}
          </h2>
        </div>
      </header>

      {/* Error Message Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 backdrop-blur-xl shadow-lg">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Camera / Preview Container */}
      <section className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-xl space-y-4 text-center">
        {optimizing && (
          <div className="py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-300">Optimizing photo...</p>
            <p className="text-[10px] text-slate-500">Compressing for fast mobile submission</p>
          </div>
        )}

        {!compressedImage && !optimizing && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-indigo-500/80 transition-all rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer group bg-slate-950/50 space-y-3"
          >
            <div className="p-4 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Tap to Snap Assembly Photo</p>
              <p className="text-xs text-slate-400 mt-1">Triggers device camera prompt</p>
            </div>
          </div>
        )}

        {/* Captured Image Preview & Action Buttons */}
        {compressedImage && !optimizing && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950 shadow-lg aspect-[4/3]">
              <img
                src={compressedImage.previewUrl}
                alt="Captured assembly preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[10px] text-indigo-300 font-mono font-semibold">
                {compressedImage.sizeKB} KB Optimized
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={triggerRetake}
                disabled={uploading}
                className="py-3 px-4 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-900 disabled:opacity-50 text-slate-200 flex items-center justify-center gap-2 text-xs transition-all border border-slate-700 shadow-md"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>

              <button
                type="button"
                onClick={handleSubmitPhoto}
                disabled={uploading}
                className="py-3 px-4 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-indigo-600/30"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Submit Daily Verification
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
