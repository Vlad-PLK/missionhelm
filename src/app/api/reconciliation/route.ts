import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runReconciliation } from '@/lib/reconciliation';

export const dynamic = 'force-dynamic';

const ReconciliationRequestSchema = z.object({
  mode: z.enum(['dry-run', 'apply']).default('dry-run'),
  workspace_id: z.string().min(1).optional(),
  write_artifact: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let parsedBody: unknown = {};

    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    const validation = ReconciliationRequestSchema.safeParse(parsedBody);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const input = validation.data;
    const report = await runReconciliation({
      mode: input.mode,
      scope: {
        workspaceId: input.workspace_id,
      },
      writeArtifact: input.write_artifact ?? input.mode === 'apply',
    });

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    console.error('Failed to run reconciliation:', error);
    return NextResponse.json(
      { error: 'Failed to run reconciliation' },
      { status: 500 }
    );
  }
}
