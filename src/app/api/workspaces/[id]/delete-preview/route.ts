import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildWorkspaceDeletionPreview } from '@/lib/workspace-deletion';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const preview = buildWorkspaceDeletionPreview(getDb(), id);
    if (!preview) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({
      workspace: preview.workspace,
      protected: preview.protected,
      counts: preview.counts,
      warnings: preview.warnings,
    });
  } catch (error) {
    console.error('Failed to build workspace delete preview:', error);
    return NextResponse.json({ error: 'Failed to build delete preview' }, { status: 500 });
  }
}
