import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { getOpenClawGatewayUrl } from '@/lib/branding';

export const dynamic = 'force-dynamic';

// GET /api/openclaw/status - Check OpenClaw connection status
export async function GET() {
  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        return NextResponse.json({
          connected: false,
          error: 'Failed to connect to OpenClaw Gateway',
          gateway_url: getOpenClawGatewayUrl(),
        });
      }
    }

    // Try to list sessions to verify connection
    try {
      const sessions = await client.listSessions();
      return NextResponse.json({
        connected: true,
        sessions_count: sessions.length,
        sessions: sessions,
        gateway_url: getOpenClawGatewayUrl(),
      });
    } catch (err) {
      return NextResponse.json({
        connected: true,
        error: 'Connected but failed to list sessions',
        gateway_url: getOpenClawGatewayUrl(),
      });
    }
  } catch (error) {
    console.error('OpenClaw status check failed:', error);
    return NextResponse.json(
      {
        connected: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
