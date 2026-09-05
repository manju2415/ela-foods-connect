import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  fileType?: string;
}

const defaultOptions: CompressionOptions = {
  maxSizeMB: 0.3, // Max 300KB for faster loads
  maxWidthOrHeight: 1920,
  useWebWorker: true,
};

/**
 * Compress an image file before upload.
 * Converts to WebP when supported for smaller file sizes.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Skip compression for already small files (under 50KB)
  if (file.size < 50 * 1024) {
    console.log(`Image ${file.name} is already small (${formatFileSize(file.size)}), skipping compression`);
    return file;
  }

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    console.log(`Compressing ${file.name}: ${formatFileSize(file.size)}`);

    const compressedFile = await imageCompression(file, {
      maxSizeMB: mergedOptions.maxSizeMB!,
      maxWidthOrHeight: mergedOptions.maxWidthOrHeight!,
      useWebWorker: mergedOptions.useWebWorker!,
      fileType: mergedOptions.fileType || 'image/webp',
      initialQuality: 0.8,
    });

    const savings = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
    console.log(
      `Compressed ${file.name}: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)} (${savings}% smaller)`
    );

    return compressedFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    return file;
  }
}

/**
 * Compress multiple image files
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {}
): Promise<File[]> {
  return Promise.all(files.map(file => compressImage(file, options)));
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
