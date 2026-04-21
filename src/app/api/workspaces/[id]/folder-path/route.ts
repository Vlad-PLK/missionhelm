import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = getDb();
    const workspace = db.prepare(
      'SELECT id, name, slug, folder_path FROM workspaces WHERE id = ? OR slug = ?'
    ).get(id, id) as { id: string; name: string; slug: string; folder_path?: string | null } | undefined;

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      folder_path: workspace.folder_path || null,
    });
  } catch (error) {
    console.error('Failed to fetch workspace folder path:', error);
    return NextResponse.json({ error: 'Failed to fetch workspace folder path' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const folderPath = typeof body.folder_path === 'string' && body.folder_path.trim().length > 0
      ? body.folder_path.trim()
      : null;

    const db = getDb();
    const workspace = db.prepare(
      'SELECT id, name, slug FROM workspaces WHERE id = ? OR slug = ?'
    ).get(id, id) as { id: string; name: string; slug: string } | undefined;

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    db.prepare(
      `UPDATE workspaces
       SET folder_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(folderPath, workspace.id);

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      folder_path: folderPath,
    });
  } catch (error) {
    console.error('Failed to update workspace folder path:', error);
    return NextResponse.json({ error: 'Failed to update workspace folder path' }, { status: 500 });
  }
}
