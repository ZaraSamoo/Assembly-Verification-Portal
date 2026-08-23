import imageCompression from 'browser-image-compression';

export interface CompressionResult {
  compressedFile: File;
  previewUrl: string;
  originalSizeKB: number;
  compressedSizeKB: number;
}

export async function compressAssemblyImage(file: File): Promise<CompressionResult> {
  const options = {
    maxSizeMB: 0.3, // Target <300 KB
    maxWidthOrHeight: 1280, // Max dimension 1280px
    useWebWorker: true,
    fileType: 'image/webp',
  };

  const originalSizeKB = Math.round(file.size / 1024);
  const compressedBlob = await imageCompression(file, options);
  
  // Convert blob back to File object preserving standard webp naming
  const compressedFile = new File(
    [compressedBlob],
    file.name.replace(/\.[^/.]+$/, "") + ".webp",
    { type: 'image/webp' }
  );
  
  const compressedSizeKB = Math.round(compressedFile.size / 1024);
  const previewUrl = URL.createObjectURL(compressedFile);

  return {
    compressedFile,
    previewUrl,
    originalSizeKB,
    compressedSizeKB,
  };
}
