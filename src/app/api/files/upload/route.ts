/**
 * File Upload API
 * Accepts file content over HTTP and saves it to the server filesystem.
 * This enables remote agents to create files on
 * the La Citadel server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync, existsSync, realpathSync, lstatSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Base directory for all uploaded project files
// Set via PROJECTS_PATH env var (e.g., ~/projects or /var/www/projects)
const PROJECTS_BASE = (process.env.PROJECTS_PATH || '~/projects').replace(/^~/, process.env.HOME || '');
const parsedUploadLimit = Number(process.env.FILE_UPLOAD_MAX_BYTES);
const MAX_UPLOAD_BYTES = Number.isFinite(parsedUploadLimit) && parsedUploadLimit > 0
  ? parsedUploadLimit
  : 2 * 1024 * 1024; // 2MB default
const ALLOWED_ENCODINGS: BufferEncoding[] = ['utf-8', 'utf8', 'ascii', 'base64'];

interface UploadRequest {
  // Path relative to PROJECTS_BASE (e.g., "dashboard-redesign/index.html")
  relativePath: string;
  // File content (text)
  content: string;
  // Optional: encoding (default: utf-8)
  encoding?: BufferEncoding;
}

/**
 * POST /api/files/upload
 * Upload a file to the server
 */
export async function POST(request: NextRequest) {
  try {
    const body: UploadRequest = await request.json();
    const { relativePath, content, encoding = 'utf-8' } = body;

    if (!relativePath || content === undefined) {
      return NextResponse.json(
        { error: 'relativePath and content are required' },
        { status: 400 }
      );
    }

    if (!ALLOWED_ENCODINGS.includes(encoding)) {
      return NextResponse.json(
        { error: `Unsupported encoding. Allowed: ${ALLOWED_ENCODINGS.join(', ')}` },
        { status: 400 }
      );
    }

    const uploadSize = Buffer.byteLength(content, encoding);
    if (uploadSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes` },
        { status: 413 }
      );
    }

    // Security: Prevent path traversal attacks
    const normalizedPath = path.normalize(relativePath);
    if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/')) {
      return NextResponse.json(
        { error: 'Invalid path: must be relative and cannot traverse upward' },
        { status: 400 }
      );
    }

    // Build full path
    const fullPath = path.join(PROJECTS_BASE, normalizedPath);

    // Ensure base directory exists
    if (!existsSync(PROJECTS_BASE)) {
      mkdirSync(PROJECTS_BASE, { recursive: true });
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(fullPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Resolve paths and enforce base containment (symlink-safe)
    let resolvedBase: string;
    let resolvedTarget: string;
    try {
      resolvedBase = realpathSync(PROJECTS_BASE);
      resolvedTarget = realpathSync(parentDir);
    } catch (error) {
      console.error('[FILE UPLOAD] Error resolving upload path:', error);
      return NextResponse.json(
        { error: 'Invalid upload target path' },
        { status: 400 }
      );
    }

    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
      console.warn(`[SECURITY] Upload path outside PROJECTS_BASE blocked: ${fullPath}`);
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Deny writing through symlinks and enforce final target containment
    if (existsSync(fullPath)) {
      const existingStat = lstatSync(fullPath);
      if (existingStat.isSymbolicLink()) {
        console.warn(`[SECURITY] Symlink overwrite blocked: ${fullPath}`);
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      try {
        const resolvedExistingFile = realpathSync(fullPath);
        if (!resolvedExistingFile.startsWith(resolvedBase + path.sep) && resolvedExistingFile !== resolvedBase) {
          console.warn(`[SECURITY] Existing file escapes PROJECTS_BASE: ${fullPath} -> ${resolvedExistingFile}`);
          return NextResponse.json(
            { error: 'Access denied' },
            { status: 403 }
          );
        }
      } catch (error) {
        console.error('[FILE UPLOAD] Error resolving existing target file:', error);
        return NextResponse.json(
          { error: 'Invalid upload target path' },
          { status: 400 }
        );
      }
    }

    // Write the file
    writeFileSync(fullPath, content, { encoding });

    console.log(`[FILE UPLOAD] Created: ${fullPath}`);

    return NextResponse.json({
      success: true,
      path: fullPath,
      relativePath: normalizedPath,
      size: Buffer.byteLength(content, encoding),
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/files/upload
 * Get info about the upload endpoint
 */
export async function GET() {
  return NextResponse.json({
    description: 'File upload endpoint for remote agents',
    basePath: PROJECTS_BASE,
    usage: {
      method: 'POST',
      body: {
        relativePath: 'project-name/filename.html',
        content: '<html>...</html>',
        encoding: 'utf-8 (optional)',
      },
    },
  });
}
