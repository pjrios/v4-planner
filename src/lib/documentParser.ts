import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { DocumentType } from '../data/types';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ParseResult {
  text: string;
  pageCount?: number;
  error?: string;
}

/**
 * Parse text from various document types
 */
export async function parseDocument(file: File, type: DocumentType): Promise<ParseResult> {
  switch (type) {
    case 'pdf':
      return parsePDF(file);
    case 'doc':
    case 'docx':
      return parseWord(file);
    case 'xls':
    case 'xlsx':
      return parseExcel(file);
    case 'txt':
    case 'md':
      return parseText(file);
    case 'ppt':
    case 'pptx':
      return parsePowerPoint(file);
    default:
      return { text: '', error: 'Unsupported file type' };
  }
}

/**
 * Parse PDF files using pdf.js
 */
async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const numPages = pdf.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    return {
      text: fullText.trim(),
      pageCount: numPages,
    };
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
    };
  }
}

/**
 * Parse Word documents using mammoth
 */
async function parseWord(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    return {
      text: result.value.trim(),
    };
  } catch (error) {
    console.error('Error parsing Word document:', error);
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Failed to parse Word document',
    };
  }
}

/**
 * Parse Excel files using SheetJS (xlsx)
 */
async function parseExcel(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    let fullText = '';
    
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      fullText += `Sheet: ${sheetName}\n${csv}\n\n`;
    });

    return {
      text: fullText.trim(),
    };
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Failed to parse Excel file',
    };
  }
}

/**
 * Parse text files (TXT, MD)
 */
async function parseText(file: File): Promise<ParseResult> {
  try {
    const text = await file.text();
    return {
      text: text.trim(),
    };
  } catch (error) {
    console.error('Error parsing text file:', error);
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Failed to parse text file',
    };
  }
}

/**
 * Parse PowerPoint files
 * Note: Basic implementation - PowerPoint parsing in browser is limited
 */
async function parsePowerPoint(file: File): Promise<ParseResult> {
  try {
    // PowerPoint files (PPTX) are ZIP archives with XML files
    // For now, we'll try to extract basic text from the file structure
    const arrayBuffer = await file.arrayBuffer();
    
    // Basic attempt to read as ZIP and find slide text
    // This is a simplified approach - full parsing would require more complex logic
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Try to find text content in the XML structure
    let text = '';
    const textPattern = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    const decoder = new TextDecoder('utf-8');
    const fileContent = decoder.decode(uint8Array);
    
    let match;
    while ((match = textPattern.exec(fileContent)) !== null) {
      text += match[1] + ' ';
    }

    return {
      text: text.trim() || '[PowerPoint content preview not fully supported]',
    };
  } catch (error) {
    console.error('Error parsing PowerPoint file:', error);
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Failed to parse PowerPoint file',
    };
  }
}

/**
 * Chunk text into smaller segments for embedding
 * @param text - The full text to chunk
 * @param chunkSize - Maximum chunk size in characters
 * @param overlap - Number of characters to overlap between chunks
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    let chunk = text.slice(start, end);

    // Try to break at sentence boundaries for better chunk quality
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > chunkSize * 0.5) {
        chunk = text.slice(start, start + breakPoint + 1);
        start = start + breakPoint + 1 - overlap;
      } else {
        start = end - overlap;
      }
    } else {
      start = text.length;
    }

    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }
  }

  return chunks;
}

