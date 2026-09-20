import { NextResponse } from 'next/server'
import { EgressStatus, WebhookReceiver } from 'livekit-server-sdk'
import { prisma } from '@eduverse/db'

export async function POST(request: Request) {
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return new NextResponse('media not configured', { status: 503 })
  try {
    const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
    const event = await receiver.receive(await request.text(), request.headers.get('authorization') || undefined)
    const egress = event.egressInfo
    if (!egress?.egressId) return new NextResponse(null, { status: 204 })
    const status = egress.status === EgressStatus.EGRESS_COMPLETE ? 'COMPLETE'
      : [EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED, EgressStatus.EGRESS_LIMIT_REACHED].includes(egress.status) ? 'FAILED'
      : egress.status === EgressStatus.EGRESS_ENDING ? 'STOPPING'
      : egress.status === EgressStatus.EGRESS_ACTIVE ? 'ACTIVE' : 'STARTING'
    await prisma.recording.updateMany({
      where: { egressId: egress.egressId },
      data: { status, ...(['COMPLETE', 'FAILED'].includes(status) ? { endedAt: new Date() } : {}) },
    })
    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse('invalid webhook', { status: 401 })
  }
}
