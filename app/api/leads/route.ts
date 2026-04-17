import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';
import { LeadSchema, formatZodErrors } from '@/lib/validation';
import { ZodError } from 'zod';

// ─── Rate limit configuration ──────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;

// In-memory store for rate limiting (use Redis/Upstash in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getRateLimitHeaders(
  remaining: number,
  resetAt: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
    'X-RateLimit-Policy': `${RATE_LIMIT_MAX_REQUESTS};w=60`,
  };
}

function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  rateLimitStore.set(identifier, record);
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - record.count,
    resetAt: record.resetAt,
  };
}

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `leads:${ip}`;
}

// ─── POST /api/leads ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { allowed, remaining, resetAt } = checkRateLimit(identifier);
  const rateLimitHeaders = getRateLimitHeaders(remaining, resetAt);

  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'יותר מדי בקשות. אנא המתן דקה ונסה שוב.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          'Retry-After': '60',
        },
      }
    );
  }

  // ── Parse request body ──────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'גוף הבקשה אינו JSON תקין.',
        code: 'INVALID_JSON',
      },
      { status: 400, headers: rateLimitHeaders }
    );
  }

  // ── Validate with Zod ───────────────────────────────────────────────────
  let validatedData: ReturnType<typeof LeadSchema.parse>;
  try {
    validatedData = LeadSchema.parse(rawBody);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'נתונים שגויים. אנא בדוק את הטופס ונסה שוב.',
          code: 'VALIDATION_ERROR',
          fields: formatZodErrors(err),
        },
        { status: 422, headers: rateLimitHeaders }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: 'שגיאת אימות בלתי צפויה.',
        code: 'UNKNOWN_VALIDATION_ERROR',
      },
      { status: 422, headers: rateLimitHeaders }
    );
  }

  // ── Enrich with metadata ────────────────────────────────────────────────
  const userAgent = request.headers.get('user-agent') ?? null;
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;

  const insertPayload = {
    full_name: validatedData.full_name,
    phone: validatedData.phone,
    email: validatedData.email || null,
    subject: validatedData.subject,
    message: validatedData.message || null,
    consent_gdpr: validatedData.consent_gdpr,
    source: validatedData.source,
    referrer_url: validatedData.referrer_url || null,
    ip_address: ipAddress,
    user_agent: userAgent,
    status: 'new',
  };

  // ── Insert into Supabase (parameterized via client SDK) ─────────────────
  const supabase = getSupabaseServiceClient();

  const { data, error: dbError } = await supabase
    .from('leads')
    .insert(insertPayload)
    .select('id, created_at')
    .single();

  if (dbError) {
    console.error('[POST /api/leads] Supabase insert error:', dbError);

    // Duplicate phone within short window — friendly message
    if (dbError.code === '23505') {
      return NextResponse.json(
        {
          success: false,
          error:
            'כבר קיבלנו פנייה ממספר זה לאחרונה. ניצור איתך קשר בהקדם.',
          code: 'DUPLICATE_LEAD',
        },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'אירעה שגיאה בשמירת הפנייה. אנא נסה שוב או צור קשר ישירות.',
        code: 'DB_INSERT_ERROR',
      },
      { status: 500, headers: rateLimitHeaders }
    );
  }

  // ── Success ─────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      success: true,
      message:
        'תודה! פנייתך התקבלה בהצלחה. עורך הדין יחזור אליך בהקדם האפשרי.',
      lead_id: data.id,
      created_at: data.created_at,
    },
    {
      status: 201,
      headers: {
        ...rateLimitHeaders,
        'Cache-Control': 'no-store',
      },
    }
  );
}

// ─── OPTIONS — CORS preflight ───────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
