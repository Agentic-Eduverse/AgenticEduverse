import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import cors from 'cors'
import { verifySocketAuth } from './lib/auth'
import { registerSocketHandlers } from './socket-handlers'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@eduverse/shared'

const PORT = Number(process.env.PORT ?? 4000)
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const ALLOWED_ORIGINS = (process.env.WEB_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be a valid TCP port')
if (!process.env.SOCKET_TICKET_SECRET || process.env.SOCKET_TICKET_SECRET.length < 32) {
  throw new Error('SOCKET_TICKET_SECRET must contain at least 32 characters')
}

async function main(): Promise<void> {
  const app = express()

  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  const httpServer = createServer(app)

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: ALLOWED_ORIGINS,
        credentials: true,
      },
    }
  )

  if (REDIS_URL === 'memory://') {
    console.warn('[server] REDIS_URL=memory:// - using the in-process adapter (single instance only)')
  } else {
    const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })
    const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })
    pub.on('error', (err) => console.error('[redis-pub] error:', err.message))
    sub.on('error', (err) => console.error('[redis-sub] error:', err.message))
    io.adapter(createAdapter(pub, sub))
  }

  io.use((socket, next) => {
    verifySocketAuth(socket, next)
  })

  io.on('connection', (socket) => {
    console.log(`[socket] connected id=${socket.id}`)
    registerSocketHandlers(io, socket)
  })

  httpServer.listen(PORT, () => {
    console.log(`[server] eduverse socket.io server listening on port ${PORT}`)
    console.log(
      `[server] realtime state: ${
        REDIS_URL === 'memory://'
          ? 'in-process (single instance)'
          : REDIS_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
      }`
    )
    console.log(`[server] health endpoint: GET http://localhost:${PORT}/health`)
  })
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err)
  process.exit(1)
})
