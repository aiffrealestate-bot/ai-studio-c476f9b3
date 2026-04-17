import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'aviv-iasso-law-api',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
    },
    {
      status: 200,
      headers: {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '99',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
        'Cache-Control': 'no-store',
      },
    }
  );
}
