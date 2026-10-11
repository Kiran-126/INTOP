import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || process.env.DATABASE_URL || 'development-only-change-me');
export async function createSession(userId: number) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('14d').sign(secret);
  (await cookies()).set('intop_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 14 });
}
export async function getUser() {
  const token = (await cookies()).get('intop_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const id = Number(payload.userId);
    if (!Number.isInteger(id)) return null;
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user || null;
  } catch { return null; }
}
export function publicUser(user: NonNullable<Awaited<ReturnType<typeof getUser>>>) {
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}
export function errorResponse(message: string, status = 400) { return Response.json({ error: message }, { status }); }
