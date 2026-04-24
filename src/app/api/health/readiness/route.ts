import { NextResponse } from 'next/server';
import { getDbStartupStatus } from '@/lib/db';
import { APP_DISPLAY_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getDbStartupStatus();
  const httpStatus = status.ready ? 200 : 503;

  return NextResponse.json(
    {
      ready: status.ready,
      databasePath: status.databasePath,
      initializedAt: status.initializedAt,
      isNewDatabase: status.isNewDatabase,
      migration: status.migration,
      preflight: status.preflight,
      actions: status.ready
        ? []
        : [
            'Inspect the preflight receipt for missing tables or columns.',
            'Fix any filesystem or SQLite permission issues blocking additive repair.',
            `Restart ${APP_DISPLAY_NAME} after the database is writable again.`,
          ],
    },
    { status: httpStatus }
  );
}
