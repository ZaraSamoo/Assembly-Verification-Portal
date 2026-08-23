'use client';

import React, { useState } from 'react';
import { Camera, Upload, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { compressAssemblyImage, CompressionResult } from '@/utils/imageCompression';

export default function PrincipalPortal() {
  const [fileResult, setFileResult] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [isLate, setIsLate] = useState(false);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const result = await compressAssemblyImage(file);
      setFileResult(result);
      
      // Check if current time is after 10:30 AM
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(10, 30, 0, 0);
      setIsLate(now > cutoff);
    } catch (err) {
      console.error('Compression failed:', err);
    } finally {
      setCompressing(false);
    }
  };

  const handleUpload = async () => {
    if (!fileResult) return;
    setUploading(true);

    try {
      // Direct upload logic to Supabase Storage bucket `assembly-photos`
      // Demo delay simulation for scaffolding context
      await new Promise((res) => setTimeout(res, 1200));
      setSubmissionSuccess(true);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-emerald-400">Principal Portal</h1>
          <p className="text-xs text-slate-400">Daily Assembly Verification</p>
        </div>
        <ShieldCheck className="w-6 h-6 text-emerald-400" />
      </header>

      {/* Real-time Status Card */}
      <section className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {submissionSuccess ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <Clock className="w-5 h-5 text-amber-400" />
            )}
            <span className="text-sm font-semibold">
              Status: {submissionSuccess ? 'Submitted' : 'Pending Upload'}
            </span>
          </div>

          {isLate && (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Late (&gt;10:30 AM)
            </span>
          )}
        </div>
      </section>

      {/* HTML5 Camera Capture Section */}
      <section className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-4">
        <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 transition-colors rounded-xl p-8 flex flex-col items-center justify-center relative cursor-pointer group">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <Camera className="w-12 h-12 text-slate-400 group-hover:text-emerald-400 mb-2 transition-colors" />
          <p className="text-sm font-medium text-slate-200">Take Daily Assembly Photo</p>
          <p className="text-xs text-slate-500 mt-1">Uses Rear / Environment Camera</p>
        </div>

        {compressing && (
          <p className="text-xs text-emerald-400 animate-pulse">Compressing photo (&lt;300 KB WebP)...</p>
        )}

        {fileResult && !compressing && (
          <div className="space-y-4 text-left">
            <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
              {/* Image Preview */}
              <img src={fileResult.previewUrl} alt="Assembly capture preview" className="w-full h-48 object-cover" />
            </div>

            <div className="flex justify-between items-center text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400">Original: {fileResult.originalSizeKB} KB</span>
              <span className="text-emerald-400 font-semibold">WebP Compressed: {fileResult.compressedSizeKB} KB</span>
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || submissionSuccess}
              className="w-full py-3 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-slate-950 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading to Supabase...' : submissionSuccess ? 'Uploaded Successfully' : 'Submit Assembly Photo'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
