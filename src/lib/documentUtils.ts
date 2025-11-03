import type { Document, DocumentType } from '../data/types';

/**
 * Detect file type based on file name and MIME type
 */
export function detectDocumentType(fileName: string, mimeType: string): DocumentType {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeLower = mimeType.toLowerCase();

  // PDF
  if (extension === 'pdf' || mimeLower === 'application/pdf') {
    return 'pdf';
  }

  // Word documents
  if (
    ['doc', 'docx'].includes(extension) ||
    mimeLower === 'application/msword' ||
    mimeLower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extension === 'doc' ? 'doc' : 'docx';
  }

  // Excel files
  if (
    ['xls', 'xlsx'].includes(extension) ||
    mimeLower === 'application/vnd.ms-excel' ||
    mimeLower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return extension === 'xls' ? 'xls' : 'xlsx';
  }

  // PowerPoint files
  if (
    ['ppt', 'pptx'].includes(extension) ||
    mimeLower === 'application/vnd.ms-powerpoint' ||
    mimeLower === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return extension === 'ppt' ? 'ppt' : 'pptx';
  }

  // Text and Markdown
  if (extension === 'txt' || mimeLower === 'text/plain') {
    return 'txt';
  }
  if (extension === 'md' || mimeLower === 'text/markdown') {
    return 'md';
  }

  return 'other';
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file icon based on document type
 */
export function getDocumentIcon(type: DocumentType): string {
  const icons: Record<DocumentType, string> = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    xls: '📊',
    xlsx: '📊',
    ppt: '📽️',
    pptx: '📽️',
    txt: '📃',
    md: '📝',
    other: '📎',
  };

  return icons[type];
}

/**
 * Create a document record from a File object
 */
export async function createDocumentFromFile(
  file: File,
  options?: {
    path?: string;
    tags?: string[];
    description?: string;
  }
): Promise<Omit<Document, 'id'>> {
  const type = detectDocumentType(file.name, file.type);

  return {
    name: file.name,
    type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    path: options?.path,
    mimeType: file.type || 'application/octet-stream',
    tags: options?.tags,
    description: options?.description,
  };
}

/**
 * Read file as text (for text-based files)
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target?.result as string);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Read file as ArrayBuffer (for binary files)
 */
export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target?.result as ArrayBuffer);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get relative path from a full path
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  // Remove leading slash and normalize
  const normalizedFull = fullPath.replace(/^\/+/, '');
  const normalizedBase = basePath.replace(/^\/+/, '');

  if (normalizedFull.startsWith(normalizedBase)) {
    return normalizedFull.slice(normalizedBase.length).replace(/^\/+/, '');
  }

  return normalizedFull;
}

