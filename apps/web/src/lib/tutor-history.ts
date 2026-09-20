// Shared shape + parsing for the student tutor history stored in AgentMemory.
// Used by both the tutor chat route and the tutor history route.
//
// History is scoped PER COMPANION: the student tutor page exposes five companions
// (general / math / chinese / english / code) and each one keeps its own bucket, so a
// question asked of the maths companion never shows up under the general one.

import { getMemory } from '@eduverse/ai'

export interface TutorHistoryEntry {
  userMessage: string
  subject: string | null
  response: {
    answer: string
    practiceExercises?: Array<{ question: string; options?: string[]; answer: string; explanation: string }>
  }
  timestamp: string
}

/** Legacy, unscoped key. Still read as a fallback so older conversations survive. */
export const TUTOR_HISTORY_KEY = 'tutor_history'
export const TUTOR_HISTORY_LIMIT = 50

export const TUTOR_AGENT_IDS = ['general', 'math', 'chinese', 'english', 'code'] as const
export type TutorAgentId = (typeof TUTOR_AGENT_IDS)[number]
export const DEFAULT_TUTOR_AGENT: TutorAgentId = 'general'

/** Narrows any incoming value to a known companion, defaulting to the general one. */
export function normalizeTutorAgent(value: unknown): TutorAgentId {
  return typeof value === 'string' && (TUTOR_AGENT_IDS as readonly string[]).includes(value)
    ? (value as TutorAgentId)
    : DEFAULT_TUTOR_AGENT
}

/** Memory key holding one companion's history. */
export function tutorHistoryKey(agentId: TutorAgentId): string {
  return `${TUTOR_HISTORY_KEY}:${agentId}`
}

/** Subject label stored in legacy entries -> companion it belonged to. */
const SUBJECT_TO_AGENT: Record<string, TutorAgentId> = {
  数学: 'math',
  语文: 'chinese',
  英语: 'english',
  编程: 'code',
}

/** Legacy entries carry no agent id, so derive it from the subject label they stored. */
export function agentIdOfEntry(entry: { subject: string | null }): TutorAgentId {
  if (!entry.subject) return 'general'
  return SUBJECT_TO_AGENT[entry.subject] ?? 'general'
}

export function parseTutorHistory(value: unknown): TutorHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const candidate = entry as Partial<TutorHistoryEntry>
      if (
        typeof candidate.userMessage !== 'string' ||
        typeof candidate.timestamp !== 'string' ||
        !candidate.response ||
        typeof candidate.response.answer !== 'string'
      ) {
        return []
      }
      return [
        {
          userMessage: candidate.userMessage,
          subject: typeof candidate.subject === 'string' ? candidate.subject : null,
          response: {
            answer: candidate.response.answer,
            practiceExercises: Array.isArray(candidate.response.practiceExercises)
              ? candidate.response.practiceExercises
              : undefined,
          },
          timestamp: candidate.timestamp,
        },
      ]
    })
    .slice(-TUTOR_HISTORY_LIMIT)
}

/**
 * Reads one companion's history.
 *
 * Falls back to the pre-existing single-bucket key when the companion has no scoped
 * bucket yet: entries recorded before history was split are routed to the companion they
 * were actually asked of (via their subject), so nothing is lost and nothing leaks
 * sideways. Once the companion records a new exchange it owns a scoped bucket and this
 * fallback is no longer consulted for it.
 */
export async function readTutorHistory(userId: string, agentId: TutorAgentId): Promise<TutorHistoryEntry[]> {
  const scoped = await getMemory(userId, 'STUDENT', tutorHistoryKey(agentId))
  if (scoped !== null && scoped !== undefined) return parseTutorHistory(scoped)

  const legacy = parseTutorHistory(await getMemory(userId, 'STUDENT', TUTOR_HISTORY_KEY))
  return legacy.filter((entry) => agentIdOfEntry(entry) === agentId)
}
