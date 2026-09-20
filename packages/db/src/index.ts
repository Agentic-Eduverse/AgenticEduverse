import { PrismaClient } from '../generated/client'

const globalForPrisma = globalThis as unknown as { eduversePrisma?: PrismaClient }

export const prisma = globalForPrisma.eduversePrisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.eduversePrisma = prisma

export * from '../generated/client'
