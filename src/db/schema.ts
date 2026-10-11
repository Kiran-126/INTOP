import { pgTable, serial, text, integer, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  college: text('college').default(''),
  degree: text('degree').default(''),
  branch: text('branch').default(''),
  graduationYear: integer('graduation_year'),
  desiredRole: text('desired_role').default(''),
  domain: text('domain').default(''),
  skills: text('skills').array().default([]),
  interests: text('interests').array().default([]),
  location: text('location').default(''),
  workMode: text('work_mode').default(''),
  experience: text('experience').default('Fresher'),
  salaryPreference: integer('salary_preference').default(0),
  opportunityTypes: text('opportunity_types').array().default([]),
  resumeName: text('resume_name').default(''),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const opportunities = pgTable('opportunities', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  company: text('company').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  responsibilities: text('responsibilities').notNull().default(''),
  requirements: text('requirements').notNull().default(''),
  eligibility: text('eligibility').notNull().default(''),
  location: text('location').notNull(),
  mode: text('mode').notNull(),
  salary: text('salary').notNull(),
  skills: text('skills').array().notNull().default([]),
  experience: text('experience').notNull().default('Fresher'),
  deadline: timestamp('deadline').notNull(),
  source: text('source').notNull().default('Company careers'),
  applicationUrl: text('application_url').notNull(),
  verified: boolean('verified').notNull().default(true),
  featured: boolean('featured').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const savedOpportunities = pgTable('saved_opportunities', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  opportunityId: integer('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [uniqueIndex('saved_user_opportunity_idx').on(table.userId, table.opportunityId)]);

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  opportunityId: integer('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('Applied'),
  notes: text('notes').notNull().default(''),
  appliedAt: timestamp('applied_at').defaultNow().notNull(),
}, (table) => [uniqueIndex('application_user_opportunity_idx').on(table.userId, table.opportunityId)]);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
