import { NextRequest } from 'next/server';
import { db } from '@/db';
import { users, opportunities, savedOpportunities, applications, notifications } from '@/db/schema';
import { and, eq, desc, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createSession, getUser, publicUser, errorResponse } from '@/lib/auth';
import { ensureSeeded, matchOpportunity } from '@/lib/opportunities';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
export const dynamic = 'force-dynamic';
const body = async (req: NextRequest) => { try { return await req.json(); } catch { return {}; } };
const params = (req: NextRequest) => {
  const p = new URLSearchParams(req.nextUrl.searchParams);
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  if (!p.has('resource') && parts[0] === 'api' && parts[1] !== 'platform') {
    p.set('resource', parts[1] === 'auth' ? (parts[2] === 'google' && parts[3] === 'callback' ? 'google-callback' : parts[2] || '') : parts[1]);
    if (parts[1] !== 'auth' && parts[2]) p.set('id', parts[2]);
  }
  return p;
};
const validId = (v: string | null | undefined) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const accountSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(200), password: z.string().min(8).max(100) });
const opportunitySchema = z.object({ title:z.string().min(3), company:z.string().min(2), type:z.string().min(2), description:z.string().min(10), location:z.string().min(2), mode:z.string().min(2), salary:z.string().min(1), skills:z.array(z.string()).default([]), experience:z.string().default('Fresher'), deadline:z.coerce.date(), applicationUrl:z.url(), source:z.string().default('Company careers'), responsibilities:z.string().default(''), requirements:z.string().default(''), eligibility:z.string().default(''), verified:z.boolean().default(true), featured:z.boolean().default(false) });
const statuses = ['Saved','Applied','Assessment','Interview','Shortlisted','Rejected','Offer'];
const publicOrigin = (req: NextRequest) => process.env.APP_URL?.replace(/\/$/, '') || `${req.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')}://${req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host}`;
export async function GET(req: NextRequest) {
  const p = params(req), root = p.get('resource'), id = p.get('id');
  if (root === 'google') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return Response.redirect(new URL('/?authError=Google%20sign-in%20is%20not%20configured%20on%20this%20deployment', publicOrigin(req)));
    const state = randomBytes(24).toString('hex');
    (await cookies()).set('intop_oauth_state', state, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', maxAge:600, path:'/' });
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
    auth.searchParams.set('redirect_uri', `${publicOrigin(req)}/api/auth/google/callback`);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', 'openid email profile');
    auth.searchParams.set('state', state);
    auth.searchParams.set('prompt', 'select_account');
    return Response.redirect(auth);
  }
  if (root === 'google-callback') {
    const jar = await cookies();
    const state = jar.get('intop_oauth_state')?.value;
    jar.delete('intop_oauth_state');
    const fail = () => Response.redirect(new URL('/?authError=Google%20sign-in%20could%20not%20be%20completed', publicOrigin(req)));
    if (!state || state !== p.get('state') || !p.get('code') || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return fail();
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({code:p.get('code')!,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:`${publicOrigin(req)}/api/auth/google/callback`,grant_type:'authorization_code'}) });
      if (!response.ok) return fail();
      const tokens = await response.json();
      const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
      const { payload } = await jwtVerify(tokens.id_token, jwks, { audience:process.env.GOOGLE_CLIENT_ID, issuer:['https://accounts.google.com','accounts.google.com'] });
      if (payload.email_verified !== true || typeof payload.email !== 'string') return fail();
      const email = payload.email.toLowerCase();
      let [account] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!account) {
        [account] = await db.insert(users).values({name:typeof payload.name==='string'?payload.name:email.split('@')[0], email, passwordHash:await bcrypt.hash(randomBytes(32).toString('hex'),12)}).returning();
        await db.insert(notifications).values({userId:account.id,title:'Welcome to INTOP',message:'Complete your profile to discover opportunities that match your ambitions.'});
      }
      await createSession(account.id);
      return Response.redirect(new URL('/', publicOrigin(req)));
    } catch { return fail(); }
  }
  const user = await getUser();
  if (root === 'me') return Response.json({ user: user ? publicUser(user) : null, googleEnabled:!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
  if (root === 'opportunities') {
    await ensureSeeded();
    if (id) {
      const [item] = await db.select().from(opportunities).where(eq(opportunities.id, validId(id))).limit(1);
      return item ? Response.json({ opportunity: item, match: matchOpportunity(item, user) }) : errorResponse('Opportunity not found', 404);
    }
    const search = p.get('search')?.trim(), type = p.get('type'), location = p.get('location'), mode = p.get('mode');
    const conditions = [];
    if (search) conditions.push(or(ilike(opportunities.title, `%${search}%`), ilike(opportunities.company, `%${search}%`), ilike(opportunities.location, `%${search}%`), ilike(opportunities.description, `%${search}%`))!);
    if (type && type !== 'All') conditions.push(eq(opportunities.type, type));
    if (location && location !== 'All') conditions.push(ilike(opportunities.location, `%${location}%`));
    if (mode && mode !== 'All') conditions.push(eq(opportunities.mode, mode));
    const rows = await db.select().from(opportunities).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(opportunities.featured), desc(opportunities.createdAt));
    const skillSearch = search?.toLowerCase();
    const allRows = skillSearch && rows.length === 0 ? await db.select().from(opportunities).orderBy(desc(opportunities.createdAt)) : rows;
    const filtered = skillSearch && rows.length === 0 ? allRows.filter(o => o.skills.some(s => s.toLowerCase().includes(skillSearch))) : rows;
    return Response.json({ opportunities: filtered.map(o => ({ ...o, match: matchOpportunity(o, user) })) });
  }
  if (!user) return errorResponse('Please sign in to continue', 401);
  if (root === 'profile') return Response.json({ user: publicUser(user) });
  if (root === 'saved') {
    const rows = await db.select({ id:savedOpportunities.id, opportunityId:savedOpportunities.opportunityId, notes:savedOpportunities.notes, createdAt:savedOpportunities.createdAt, opportunity:opportunities }).from(savedOpportunities).innerJoin(opportunities, eq(savedOpportunities.opportunityId, opportunities.id)).where(eq(savedOpportunities.userId, user.id)).orderBy(desc(savedOpportunities.createdAt));
    return Response.json({ saved: rows });
  }
  if (root === 'applications') {
    const rows = await db.select({ id:applications.id, opportunityId:applications.opportunityId, status:applications.status, notes:applications.notes, appliedAt:applications.appliedAt, opportunity:opportunities }).from(applications).innerJoin(opportunities, eq(applications.opportunityId, opportunities.id)).where(eq(applications.userId, user.id)).orderBy(desc(applications.appliedAt));
    return Response.json({ applications: rows });
  }
  if (root === 'notifications') return Response.json({ notifications:await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)) });
  if (root === 'admin') {
    if (user.role !== 'admin') return errorResponse('Administrator access required', 403);
    const [people, items, apps] = await Promise.all([db.select().from(users), db.select().from(opportunities), db.select().from(applications)]);
    return Response.json({ users: people.map(publicUser), opportunities: items, applications: apps });
  }
  return errorResponse('Not found', 404);
}
export async function POST(req: NextRequest) {
  const root = params(req).get('resource'), data = await body(req);
  if (root === 'register') {
    const parsed = accountSchema.safeParse(data);
    if (!parsed.success) return errorResponse('Enter a valid name, email and password (at least 8 characters).');
    const email = parsed.data.email.toLowerCase();
    const [existing] = await db.select({id:users.id}).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return errorResponse('An account with this email already exists', 409);
    const [user] = await db.insert(users).values({ name:parsed.data.name, email, passwordHash:await bcrypt.hash(parsed.data.password, 12) }).returning();
    await createSession(user.id);
    await db.insert(notifications).values({ userId:user.id, title:'Welcome to INTOP', message:'Your next chapter starts here. Complete your profile to unlock better matches.' });
    return Response.json({ user:publicUser(user) }, { status:201 });
  }
  if (root === 'login') {
    const email = String(data.email || '').toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !await bcrypt.compare(String(data.password || ''), user.passwordHash)) return errorResponse('Invalid email or password', 401);
    await createSession(user.id);
    return Response.json({ user:publicUser(user) });
  }
  if (root === 'logout') { (await cookies()).delete('intop_session'); return Response.json({ ok:true }); }
  const user = await getUser();
  if (!user) return errorResponse('Please sign in to continue', 401);
  if (root === 'saved') {
    const opportunityId = validId(String(data.opportunityId));
    const [op] = await db.select({id:opportunities.id}).from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    if (!op) return errorResponse('Opportunity not found', 404);
    await db.insert(savedOpportunities).values({ userId:user.id, opportunityId }).onConflictDoNothing();
    return Response.json({ ok:true });
  }
  if (root === 'applications') {
    const opportunityId = validId(String(data.opportunityId));
    const [op] = await db.select({id:opportunities.id, title:opportunities.title}).from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    if (!op) return errorResponse('Opportunity not found', 404);
    const status = statuses.includes(data.status) ? data.status : 'Applied';
    await db.insert(applications).values({ userId:user.id, opportunityId, status }).onConflictDoUpdate({ target:[applications.userId, applications.opportunityId], set:{ status } });
    await db.insert(notifications).values({ userId:user.id, title:'Application tracked', message:`${op.title} was added to your tracker.` });
    return Response.json({ ok:true });
  }
  if (root === 'opportunities') {
    if (user.role !== 'admin') return errorResponse('Administrator access required', 403);
    const parsed = opportunitySchema.safeParse(data);
    if (!parsed.success) return errorResponse('Please complete all required opportunity fields.');
    const [item] = await db.insert(opportunities).values(parsed.data).returning();
    return Response.json({ opportunity:item }, { status:201 });
  }
  if (root === 'assistant') {
    const message = String(data.message || '').slice(0, 1000).trim();
    if (!message) return errorResponse('Enter a message');
    await ensureSeeded();
    const all = await db.select().from(opportunities);
    const words = message.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !['find','help','with','what','about','show','some','looking'].includes(w));
    const matches = all.filter(o => words.some(w => `${o.title} ${o.company} ${o.skills.join(' ')} ${o.location} ${o.type}`.toLowerCase().includes(w))).slice(0, 3);
    let reply = '';
    if (/resume|cv/i.test(message)) reply = 'A strong resume leads with impact. Quantify your projects, mirror relevant skills from the role description, and keep your most relevant experience near the top. Open Resume Studio for a personalized checklist.';
    else if (/interview/i.test(message)) reply = 'For interviews, practice explaining two projects end-to-end, review core fundamentals for your target role, and prepare concise STAR stories.';
    else if (/skill|learn|gap|career path/i.test(message)) reply = `For ${user.desiredRole || 'your target role'}, focus on one strong portfolio project and the core tools listed in roles you like. Your current skills: ${user.skills?.join(', ') || 'not added yet'}. Add skills in your profile for sharper guidance.`;
    else reply = matches.length ? `I found ${matches.length} opportunities worth a closer look: ${matches.map(o => `${o.title} at ${o.company}`).join('; ')}. Save your favorites and I’ll help you prioritize them.` : 'Explore opportunities that align with your interests. Add your skills and career goal in your profile, then search by role, technology, or location for a more focused shortlist.';
    return Response.json({ reply, opportunityIds:matches.map(o => o.id), provider:'INTOP guidance engine' });
  }
  if (root === 'resume') {
    const filename = String(data.filename || '').slice(0, 200);
    if (!/\.(pdf|docx)$/i.test(filename)) return errorResponse('Upload a PDF or DOCX resume.');
    const encoded = String(data.content || '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length > 7000000 || encoded.length < 100) return errorResponse('Invalid file or file exceeds 5MB.');
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length > 5 * 1024 * 1024) return errorResponse('File must be under 5MB.');
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    if (isPdf ? buffer.subarray(0, 4).toString() !== '%PDF' : buffer.subarray(0, 2).toString() !== 'PK') return errorResponse('File content does not match its extension.');
    let text = '';
    try {
      if (isPdf) {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
      } else {
        const mammoth = await import('mammoth');
        text = (await mammoth.extractRawText({ buffer })).value;
      }
    } catch { return errorResponse('We could not read this document. Try another PDF or DOCX file.'); }
    if (text.trim().length < 50) return errorResponse('Not enough readable text found. Try a text-based resume instead of a scanned image.');
    text = text.slice(0, 30000);
    const lower = text.toLowerCase();
    const found = (user.skills || []).filter(skill => lower.includes(skill.toLowerCase()));
    const evidence = ['experience','education','projects','skills'].filter(section => lower.includes(section));
    const impact = /\d+%|\d+\s*(users|customers|projects|hours|people)/i.test(text);
    const score = Math.min(96, 42 + evidence.length * 8 + Math.min(found.length, 4) * 5 + (impact ? 10 : 0) + (text.length > 1200 ? 5 : 0));
    const suggestions = [!impact ? 'Quantify project outcomes with measurable results.' : 'Great use of measurable impact. Keep your strongest results near the top.', evidence.length < 3 ? 'Add clear headings for experience, education, projects, and skills.' : 'Your key sections are present. Tailor their order to each role.', found.length < 2 ? 'Make your relevant technical skills easier to find.' : 'Highlight hands-on projects using your strongest skills.'];
    return Response.json({ score, found, suggestions, note:'Heuristic analysis of extracted resume text. Your file is processed in memory and is not stored.' });
  }
  return errorResponse('Not found', 404);
}
export async function PUT(req: NextRequest) {
  const root = params(req).get('resource'), id = params(req).get('id'), user = await getUser();
  if (!user) return errorResponse('Please sign in to continue', 401);
  const data = await body(req);
  if (root === 'profile') {
    const schema = z.object({ name:z.string().min(2).max(100).optional(), college:z.string().max(150).optional(), degree:z.string().max(100).optional(), branch:z.string().max(100).optional(), graduationYear:z.coerce.number().int().min(2020).max(2045).nullable().optional(), desiredRole:z.string().max(100).optional(), domain:z.string().max(100).optional(), skills:z.array(z.string().max(50)).max(30).optional(), interests:z.array(z.string().max(50)).max(30).optional(), location:z.string().max(100).optional(), workMode:z.string().max(30).optional(), experience:z.string().max(50).optional(), salaryPreference:z.number().int().min(0).optional(), opportunityTypes:z.array(z.string()).optional(), resumeName:z.string().max(200).optional(), onboardingComplete:z.boolean().optional() });
    const parsed = schema.safeParse(data);
    if (!parsed.success) return errorResponse('Please check your profile details.');
    const [updated] = await db.update(users).set(parsed.data).where(eq(users.id, user.id)).returning();
    return Response.json({ user:publicUser(updated) });
  }
  if (root === 'applications') {
    const status = String(data.status || '');
    if (!statuses.includes(status)) return errorResponse('Invalid application status');
    const [item] = await db.update(applications).set({ status, notes:String(data.notes ?? '').slice(0, 2000) }).where(and(eq(applications.id, validId(id)), eq(applications.userId, user.id))).returning();
    return item ? Response.json({ application:item }) : errorResponse('Application not found', 404);
  }
  if (root === 'saved') {
    const [item] = await db.update(savedOpportunities).set({ notes:String(data.notes || '').slice(0, 2000) }).where(and(eq(savedOpportunities.id, validId(id)), eq(savedOpportunities.userId, user.id))).returning();
    return item ? Response.json({ saved:item }) : errorResponse('Saved item not found', 404);
  }
  if (root === 'notifications') { await db.update(notifications).set({ read:true }).where(eq(notifications.userId, user.id)); return Response.json({ ok:true }); }
  if (root === 'opportunities') {
    if (user.role !== 'admin') return errorResponse('Administrator access required', 403);
    const parsed = opportunitySchema.partial().safeParse(data);
    if (!parsed.success) return errorResponse('Invalid opportunity details');
    const [item] = await db.update(opportunities).set(parsed.data).where(eq(opportunities.id, validId(id))).returning();
    return item ? Response.json({ opportunity:item }) : errorResponse('Opportunity not found', 404);
  }
  return errorResponse('Not found', 404);
}
export async function DELETE(req: NextRequest) {
  const root = params(req).get('resource'), id = params(req).get('id'), user = await getUser();
  if (!user) return errorResponse('Please sign in to continue', 401);
  if (root === 'saved') { await db.delete(savedOpportunities).where(and(eq(savedOpportunities.opportunityId, validId(id)), eq(savedOpportunities.userId, user.id))); return Response.json({ ok:true }); }
  if (root === 'opportunities') { if (user.role !== 'admin') return errorResponse('Administrator access required', 403); await db.delete(opportunities).where(eq(opportunities.id, validId(id))); return Response.json({ ok:true }); }
  return errorResponse('Not found', 404);
}
