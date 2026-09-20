import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-utils'
import { takeRateLimit } from '@/lib/rate-limit'
import { searchExplanationVideos } from '@/lib/video-search'
import type { ApiResponse } from '@eduverse/shared'

/**
 * Returns third-party explanation videos for a knowledge point so the tutor can offer them
 * under its answer.
 *
 * This route only fetches video listings from a public search page - it never touches the model,
 * so it stays clear of the cloud-channel rule that forbids proxying model calls through a Node
 * route (see lib/cloud-llm.ts).
 */
export async function GET(request: Request) {
  try {
    const user = await requireRole('STUDENT')
    if (!takeRateLimit(`tutor-videos:${user.id}`, 30, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试', statusCode: 429 } as ApiResponse,
        { status: 429 }
      )
    }

    const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
    if (query.length < 2) {
      return NextResponse.json({ success: true, data: { videos: [] }, message: '缺少检索词', statusCode: 200 } as ApiResponse)
    }

    const videos = await searchExplanationVideos(query, 5)
    return NextResponse.json({
      success: true,
      data: { videos },
      message: videos.length ? '相关讲解视频获取成功' : '暂时没有找到相关讲解视频',
      statusCode: 200,
    } as ApiResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message === '未登录' ? 401 : message.startsWith('权限不足') ? 403 : 500
    return NextResponse.json(
      {
        success: false,
        error: status === 500 ? 'INTERNAL_ERROR' : message,
        message: status === 500 ? '相关讲解视频获取失败' : message,
        statusCode: status,
      } as ApiResponse,
      { status }
    )
  }
}
