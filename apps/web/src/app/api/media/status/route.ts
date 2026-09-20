import { NextResponse } from 'next/server'
import { mediaConfigured } from '@/lib/media-auth'
import type { ApiResponse } from '@eduverse/shared'

export async function GET() {
  return NextResponse.json({ success: true, data: { configured: mediaConfigured(), url: mediaConfigured() ? process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL : null }, message: mediaConfigured() ? '音视频服务已配置' : '音视频服务尚未配置', statusCode: 200 } as ApiResponse)
}
