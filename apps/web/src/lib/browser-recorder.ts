'use client'

import { Room, Track, type Participant, type RemoteTrack, type LocalTrack } from 'livekit-client'

/**
 * In-browser classroom recorder.
 *
 * The original design delegated recording to a LiveKit Egress worker
 * (`startRoomCompositeEgress`). Egress ships only as a Docker image bundling GStreamer and
 * a Chrome build, so it cannot run on this Windows host (no Docker; WSL is blocked).
 * This module reproduces the same "room composite" result client-side: every participant's
 * camera is drawn into a grid on a canvas, all microphones are mixed through WebAudio, and
 * the combined stream is recorded with MediaRecorder.
 *
 * Trade-offs: the recording lives in the teacher's browser, so the classroom tab must stay
 * open for the whole session, and the produced file is webm.
 */

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720
const FRAME_RATE = 25
const VIDEO_BITS_PER_SECOND = 2_500_000
const TIMESLICE_MS = 5_000
/** If the muxer produces nothing by then, the audio mix is assumed to be the blocker. */
const AUDIO_WATCHDOG_MS = 6_000

type VideoTrack = RemoteTrack | LocalTrack

export interface RecorderStats {
  /** Participants whose camera is currently being composited. */
  liveTiles: number
  /** Participants in the room, camera on or off. */
  participants: number
  /** Bytes captured so far. */
  bytes: number
  /** False while the video-only fallback is in effect. */
  withAudio: boolean
  elapsedMs: number
}

export interface RecorderSession {
  stop: () => Promise<Blob>
  stats: () => RecorderStats
}

/**
 * An in-flight recording, decoupled from React so it survives component remounts.
 *
 * The classroom panel remounts whenever the teacher enters or leaves a private tutoring
 * room (`MediaPanel` keys on `tutoringId`). Holding the session in component state meant a
 * remount silently dropped the recorder while the database row stayed ACTIVE - the teacher
 * saw "无法保存" and the lesson was gone. Keeping it in a module-level registry lets the
 * panel re-attach to a recording that is already running, and lets the recorder be
 * finalised by whichever code path notices the panel is gone for good.
 */
export interface ActiveRecording {
  recordingId: string
  classId: string
  session: RecorderSession
  startedAt: number
  /**
   * Set while a mounted panel is showing this recording. A panel that unmounts clears it and
   * schedules finalisation, so a recording is never left running with no way to stop it.
   */
  claimed: boolean
}

const activeRecordings = new Map<string, ActiveRecording>()

export function getActiveRecording(classId: string): ActiveRecording | undefined {
  return activeRecordings.get(classId)
}

export function setActiveRecording(entry: ActiveRecording): void {
  activeRecordings.set(entry.classId, entry)
}

export function clearActiveRecording(classId: string): void {
  activeRecordings.delete(classId)
}

function pickMimeType(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return 'video/webm'
}

function cameraTrackOf(participant: Participant): VideoTrack | undefined {
  const track = participant.getTrackPublication(Track.Source.Camera)?.track
  if (!track || track.isMuted) return undefined
  return track as VideoTrack
}

function initialsOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  // CJK names read better as the last one or two glyphs; latin names as the first letter.
  if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed.slice(-2)
  return trimmed.slice(0, 2).toUpperCase()
}

export async function startBrowserRecording(room: Room): Promise<RecorderSession> {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  // Keep the canvas in the render tree but out of sight: captureStream() needs a composited
  // canvas, and the classroom page already runs a Pixi renderer for its virtual stage.
  canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none'
  document.body.appendChild(canvas)
  const context = canvas.getContext('2d')
  if (!context) {
    canvas.remove()
    throw new Error('RECORDER_NO_CANVAS_CONTEXT')
  }

  // Video elements must stay in the render tree to keep producing frames for drawImage,
  // so they are parked off-screen rather than hidden.
  const videoElements = new Map<string, HTMLVideoElement>()

  const ensureVideoElement = (track: VideoTrack): HTMLVideoElement | null => {
    const sid = track.sid
    if (!sid) return null
    const existing = videoElements.get(sid)
    if (existing) return existing
    const attached = track.attach()
    if (!(attached instanceof HTMLVideoElement)) return null
    attached.muted = true
    attached.playsInline = true
    attached.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none'
    document.body.appendChild(attached)
    videoElements.set(sid, attached)
    return attached
  }

  /** Drops elements whose track left the room, so the grid does not accumulate ghosts. */
  const pruneVideoElements = (activeSids: Set<string>) => {
    for (const [sid, element] of videoElements) {
      if (activeSids.has(sid)) continue
      element.pause()
      element.srcObject = null
      element.remove()
      videoElements.delete(sid)
    }
  }

  const participants = (): Participant[] => [
    room.localParticipant,
    ...Array.from(room.remoteParticipants.values()),
  ]

  // --- audio: mix every participant's microphone into a single track ---
  // A browser that cannot build an AudioContext (no output device, blocked autoplay) must
  // not abort the recording - fall through to video-only.
  let audioContext: AudioContext | null = null
  let audioDestination: MediaStreamAudioDestinationNode | null = null
  const connectedAudio = new Set<string>()
  const audioSources: MediaStreamAudioSourceNode[] = []
  try {
    audioContext = new AudioContext()
    audioDestination = audioContext.createMediaStreamDestination()
  } catch {
    audioContext = null
    audioDestination = null
  }

  const syncAudio = () => {
    if (!audioContext || !audioDestination) return
    for (const participant of participants()) {
      const track = participant.getTrackPublication(Track.Source.Microphone)?.track
      const mediaStreamTrack = track?.mediaStreamTrack
      if (!track || !mediaStreamTrack || track.isMuted) continue
      const key = track.sid ?? mediaStreamTrack.id
      if (connectedAudio.has(key)) continue
      try {
        const source = audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]))
        source.connect(audioDestination)
        audioSources.push(source)
        connectedAudio.add(key)
      } catch {
        // A track that cannot be routed must not abort the whole recording.
      }
    }
  }
  syncAudio()

  // --- video: grid composite ---
  const outputStream = canvas.captureStream(FRAME_RATE)

  const drawFrame = () => {
    context.fillStyle = '#0f172a'
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    const all = participants()
    const activeSids = new Set<string>()
    const tiles: Array<{ element: HTMLVideoElement | null; label: string; identity: string }> = []

    for (const participant of all) {
      const label = participant.name || participant.identity
      const track = cameraTrackOf(participant)
      if (track?.sid) activeSids.add(track.sid)
      const element = track ? ensureVideoElement(track) : null
      tiles.push({ element, label, identity: participant.identity })
    }
    pruneVideoElements(activeSids)

    // Even with every camera off, the frame must show who was in the room. A uniformly
    // dark canvas compressed to ~3 KB/minute and looked like a broken recording.
    if (tiles.length > 0) {
      const columns = Math.ceil(Math.sqrt(tiles.length))
      const rows = Math.ceil(tiles.length / columns)
      const cellWidth = CANVAS_WIDTH / columns
      const cellHeight = CANVAS_HEIGHT / rows
      const GAP = 6

      tiles.forEach((tile, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        const x = column * cellWidth
        const y = row * cellHeight
        const w = cellWidth - GAP
        const h = cellHeight - GAP

        context.fillStyle = '#1e293b'
        context.fillRect(x + GAP / 2, y + GAP / 2, w, h)

        const source = tile.element
        const vw = source?.videoWidth ?? 0
        const vh = source?.videoHeight ?? 0

        if (source && vw > 0 && vh > 0) {
          // "cover" fit so tiles are filled without distortion
          const scale = Math.max(w / vw, h / vh)
          const drawW = vw * scale
          const drawH = vh * scale
          const dx = x + GAP / 2 + (w - drawW) / 2
          const dy = y + GAP / 2 + (h - drawH) / 2
          context.save()
          context.beginPath()
          context.rect(x + GAP / 2, y + GAP / 2, w, h)
          context.clip()
          try {
            context.drawImage(source, dx, dy, drawW, drawH)
          } catch {
            // Frame not ready yet; the next tick will retry.
          }
          context.restore()
        } else {
          // Camera off / not yet publishing: draw a placeholder avatar instead of leaving
          // a black cell.
          const centerX = x + GAP / 2 + w / 2
          const centerY = y + GAP / 2 + h / 2
          const radius = Math.min(w, h) * 0.16
          context.beginPath()
          context.arc(centerX, centerY - radius * 0.35, radius, 0, Math.PI * 2)
          context.fillStyle = '#334155'
          context.fill()
          context.fillStyle = '#cbd5e1'
          context.font = `bold ${Math.round(radius * 1.1)}px sans-serif`
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText(initialsOf(tile.label), centerX, centerY - radius * 0.35)
          context.font = '15px sans-serif'
          context.fillStyle = '#64748b'
          context.fillText('摄像头未开启', centerX, centerY + radius * 1.9)
          context.textAlign = 'start'
          context.textBaseline = 'alphabetic'
        }

        if (tile.label) {
          context.font = '16px sans-serif'
          const textWidth = context.measureText(tile.label).width
          context.fillStyle = 'rgba(15,23,42,0.6)'
          context.fillRect(x + GAP / 2 + 8, y + GAP / 2 + 8, textWidth + 16, 24)
          context.fillStyle = '#f8fafc'
          context.fillText(tile.label, x + GAP / 2 + 16, y + GAP / 2 + 26)
        }
      })
    }

    // Watermark so a recording is always obviously "this lesson, this moment".
    const stamp = new Date().toLocaleString('zh-CN')
    context.font = '15px sans-serif'
    const stampWidth = context.measureText(stamp).width
    context.fillStyle = 'rgba(15,23,42,0.55)'
    context.fillRect(CANVAS_WIDTH - stampWidth - 28, CANVAS_HEIGHT - 34, stampWidth + 20, 26)
    context.fillStyle = '#e2e8f0'
    context.fillText(stamp, CANVAS_WIDTH - stampWidth - 18, CANVAS_HEIGHT - 15)
  }

  // A timer rather than requestAnimationFrame: rAF is paused in background tabs, which
  // would silently freeze the recording when the teacher switches windows.
  drawFrame()
  const drawHandle = window.setInterval(drawFrame, Math.round(1000 / FRAME_RATE))

  const attachAudio = () => {
    if (!audioDestination) return
    for (const audioTrack of audioDestination.stream.getAudioTracks()) {
      outputStream.addTrack(audioTrack)
    }
  }
  attachAudio()

  // Participants can join mid-recording; re-scan audio periodically.
  const audioSyncHandle = window.setInterval(syncAudio, 3_000)

  let chunks: Blob[] = []
  const mimeType = pickMimeType()
  let activeRecorder: MediaRecorder | null = null
  let withAudio = Boolean(audioDestination && audioDestination.stream.getAudioTracks().length)
  const startedAt = Date.now()

  const spawnRecorder = (): MediaRecorder => {
    const recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND })
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
    })
    recorder.start(TIMESLICE_MS)
    activeRecorder = recorder
    return recorder
  }
  spawnRecorder()

  // Some environments (machines with no usable audio device, blocked AudioContext) report a
  // running AudioContext that never advances, so the mixed audio track never carries data
  // and the muxer stalls with zero output. Fall back to a video-only recording rather than
  // losing the lesson.
  const watchdog = window.setTimeout(() => {
    if (chunks.length > 0) return
    const recorder = activeRecorder
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
    for (const track of outputStream.getAudioTracks()) {
      outputStream.removeTrack(track)
      track.stop()
    }
    // Chunks from the stalled run are a header with no clusters - keeping them would build
    // a corrupt file. Discard them and start clean.
    chunks = []
    withAudio = false
    console.warn('[recorder] no data with the audio mix - continuing video-only')
    spawnRecorder()
  }, AUDIO_WATCHDOG_MS)

  let stopped = false
  const cleanup = () => {
    window.clearInterval(drawHandle)
    window.clearInterval(audioSyncHandle)
    window.clearTimeout(watchdog)
    for (const element of videoElements.values()) {
      element.pause()
      element.srcObject = null
      element.remove()
    }
    videoElements.clear()
    canvas.remove()
    for (const source of audioSources) {
      try {
        source.disconnect()
      } catch {
        // already disconnected
      }
    }
    audioDestination?.stream.getTracks().forEach((track) => track.stop())
    outputStream.getTracks().forEach((track) => track.stop())
    void audioContext?.close().catch(() => undefined)
  }

  return {
    stats: () => ({
      liveTiles: videoElements.size,
      participants: participants().length,
      bytes: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
      withAudio,
      elapsedMs: Date.now() - startedAt,
    }),
    stop: async () => {
      if (stopped) return new Blob(chunks, { type: mimeType })
      stopped = true
      window.clearTimeout(watchdog)
      const recorder = activeRecorder
      if (recorder && recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const done = () => resolve()
          recorder.addEventListener('stop', done, { once: true })
          recorder.stop()
          // Never hang the UI on a muxer that refuses to flush.
          window.setTimeout(done, 4_000)
        })
      }
      cleanup()
      return new Blob(chunks, { type: mimeType })
    },
  }
}
