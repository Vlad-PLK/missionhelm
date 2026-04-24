import { NextResponse } from 'next/server';
import { APP_DISPLAY_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    demo: process.env.DEMO_MODE === 'true',
    message: process.env.DEMO_MODE === 'true'
      ? `This is a live demo of ${APP_DISPLAY_NAME}. All actions are simulated.`
      : undefined,
    github: 'https://github.com/Vlad-PLK/missionhelm',
  });
}
