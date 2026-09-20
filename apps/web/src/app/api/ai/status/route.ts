import { NextResponse } from 'next/server'
import { isAIConfigured, isTutorAIConfigured, tutorModelName } from '@eduverse/ai'
import type { ApiResponse } from '@eduverse/shared'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: { configured: isAIConfigured(), model: isAIConfigured() ? process.env.AI_MODEL : null, tutorConfigured: isTutorAIConfigured(), tutorModel: tutorModelName() },
    message: isAIConfigured() ? 'AI 已配置' : 'AI 尚未配置',
    statusCode: 200,
  } as ApiResponse)
}
