import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
}

const defaultOptions: CompressionOptions = {
  maxSizeMB: 0.5, // Max 500KB
  maxWidthOrHeight: 1920, // Max dimension
  useWebWorker: true,
};

/**
 * Compress an image file before upload
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns The compressed file
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  // Skip compression for non-image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Skip compression for already small files (under 100KB)
  if (file.size < 100 * 1024) {
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
      fileType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
    });
    
    const savings = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
    console.log(
      `Compressed ${file.name}: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)} (${savings}% smaller)`
    );
    
    return compressedFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    // Return original file if compression fails
    return file;
  }
}

/**
 * Compress multiple image files
 * @param files - Array of files to compress
 * @param options - Compression options
 * @returns Array of compressed files
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
