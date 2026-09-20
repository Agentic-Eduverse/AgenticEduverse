'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type Participant } from 'livekit-client'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import {
  clearActiveRecording,
  getActiveRecording,
  setActiveRecording,
  startBrowserRecording,
  type RecorderStats,
} from '@/lib/browser-recorder'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

type DeviceKind = 'camera' | 'microphone' | 'screen'
type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

const DEVICE_LABEL: Record<DeviceKind, string> = {
  camera: '摄像头',
  microphone: '麦克风',
  screen: '屏幕共享',
}

/**
 * Browsers only expose getUserMedia on a secure context. `localhost` counts, a LAN IP does
 * not - and when it is missing the failure looks like a generic permission error, which is
 * how "无法开启摄像头" ended up with no explanation at all.
 */
function mediaEnvironmentOk(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** Chrome/Edge expose camera+microphone state here. Safari/Firefox may not - hence 'unknown'. */
async function queryPermissionState(kind: 'camera' | 'microphone'): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: kind as PermissionName })
    return status.state as PermissionState
  } catch {
    return 'unknown'
  }
}

function permissionSettingsUrl(kind: 'camera' | 'microphone'): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const scheme = /Edg\//.test(ua) ? 'edge' : 'chrome'
  return `${scheme}://settings/content/${kind}`
}

/**
 * A previously denied camera/microphone is remembered as "blocked" and the browser stops
 * prompting forever - the address bar then only offers 「重置权限」, never 「允许」. Telling the
 * user to "click the icon and allow" is useless in that state, so the permission state is
 * queried first and the advice changes accordingly.
 */
async function describeDeviceError(error: unknown, kind: DeviceKind): Promise<string> {
  const label = DEVICE_LABEL[kind]
  const name = (error as { name?: string })?.name ?? ''
  const message = (error as { message?: string })?.message ?? ''

  if (!mediaEnvironmentOk()) {
    return `浏览器只在 https 或 localhost 下开放${label}，也就是说不论怎么授权都不会生效。请改用 http://localhost:3000 访问，别用本机局域网 IP。`
  }

  const policyDocument = document as Document & {
    permissionsPolicy?: { allowsFeature: (feature: string) => boolean }
    featurePolicy?: { allowsFeature: (feature: string) => boolean }
  }
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy
  if (kind !== 'screen' && policy && !policy.allowsFeature(kind)) {
    return `本站的页面权限策略禁止使用${label}，不是你没有点允许。请管理员检查 Permissions-Policy 响应头或嵌入页面的权限设置；修复后需要重新加载课堂页面。`
  }

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': {
      if (kind === 'screen') {
        return `屏幕共享被拒绝。可能是在选择共享窗口时点了「取消」。请重试并选中一个窗口或标签页。`
      }
      const state = await queryPermissionState(kind)
      const settings = permissionSettingsUrl(kind)
      if (state === 'denied') {
        return (
          `${label}访问被拒绝；可能来自站点权限、系统隐私设置或浏览器管理策略，不能仅凭此状态确定原因。\n` +
          `解决办法一：点地址栏最右侧的那个图标（被划掉的相机 / 滑块 / 锁），选「重置权限」，然后刷新页面重试。\n` +
          `解决办法二：打开 ${settings} ，在「不允许使用${label}的网站」里删掉 localhost，再刷新页面。`
        )
      }
      if (state === 'prompt') {
        return (
          `浏览器没有给出${label}授权框。请先检查 Windows 系统级隐私开关：设置 → 隐私和安全性 → ${label === '麦克风' ? '麦克风' : '相机'} → ` +
          `打开「${label === '麦克风' ? '麦克风' : '相机'}访问」和「允许桌面应用访问${label === '麦克风' ? '麦克风' : '相机'}」。\n` +
          `也可能是授权弹窗被其他窗口挡住了 —— 看看浏览器窗口上方有没有一个待处理的权限提示。`
        )
      }
      return (
        `${label}权限显示为「已允许」，但仍然打不开：通常是系统级隐私开关关闭、设备被其他程序独占，` +
        `或浏览器企业策略限制。可打开 ${settings} 检查。`
      )
    }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return `没有检测到可用的${label}设备。请确认设备已连接、驱动正常，并且没有被禁用。`
    case 'NotReadableError':
    case 'TrackStartError':
      return `${label}被其他程序占用（会议软件、相机应用等），请关闭后重试。`
    case 'OverconstrainedError':
      return `当前${label}不支持所请求的参数，请换一个设备试试。`
    case 'SecurityError':
      return `${label}被浏览器安全策略阻止，请确认使用 https 或 localhost 访问。`
    case 'AbortError':
      return `${label}启动被中断，请重试。`
    default:
      return `${label}启动失败${message ? '：' + message : ''}`
  }
}

interface Diagnostics {
  origin: string
  secure: boolean
  mediaDevices: boolean
  cameraPermission: PermissionState
  microphonePermission: PermissionState
  cameras: number
  microphones: number
  settingsCamera: string
  settingsMicrophone: string
}

async function collectDiagnostics(): Promise<Diagnostics> {
  let cameras = 0
  let microphones = 0
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras = devices.filter((device) => device.kind === 'videoinput').length
    microphones = devices.filter((device) => device.kind === 'audioinput').length
  } catch {
    // enumerateDevices can reject before any permission has been granted; counts stay 0.
  }
  const [cameraPermission, microphonePermission] = await Promise.all([
    queryPermissionState('camera'),
    queryPermissionState('microphone'),
  ])
  return {
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    secure: mediaEnvironmentOk(),
    mediaDevices: typeof navigator !== 'undefined' && typeof navigator.mediaDevices !== 'undefined',
    cameraPermission,
    microphonePermission,
    cameras,
    microphones,
    settingsCamera: permissionSettingsUrl('camera'),
    settingsMicrophone: permissionSettingsUrl('microphone'),
  }
}

const PERMISSION_TEXT: Record<PermissionState, string> = {
  granted: '已允许',
  denied: '已屏蔽（不会再弹授权框）',
  prompt: '未决定（应会弹授权框）',
  unknown: '浏览器未提供该状态',
}

/**
 * Stops a running recording and uploads it. Lives outside the component so it can still run
 * after the panel unmounts - which is exactly what happens when the teacher leaves the
 * classroom or opens a private tutoring room, and the reason a lesson could previously be
 * lost while its database row stayed stuck on ACTIVE.
 */
async function finalizeRecording(classId: string, reason = ''): Promise<void> {
  const active = getActiveRecording(classId)
  if (!active) return
  clearActiveRecording(classId)
  try {
    const blob = await active.session.stop()
    if (!blob.size) throw new Error('EMPTY_RECORDING')
    const result = await api.media.uploadRecording(active.recordingId, blob)
    window.dispatchEvent(new Event('recordings-changed'))
    toast.success(`课堂录像已保存（${Math.max(1, Math.round(result.size / 1024))} KB）${reason}`)
  } catch (error) {
    console.error('[MediaRoomPanel] recording save failed:', error)
    await api.media.stopRecording(active.recordingId).catch(() => undefined)
    window.dispatchEvent(new Event('recordings-changed'))
    const empty = error instanceof Error && error.message === 'EMPTY_RECORDING'
    toast.error(empty ? '录制内容为空，已标记为失败（请检查摄像头是否开启）' : '录像保存失败，该条录制已标记为失败')
  }
}

export default function MediaRoomPanel({ classId, isTeacher, tutoringId }: { classId: string; isTeacher: boolean; tutoringId?: string }) {
  const { t } = useI18n()
  const roomRef = useRef<Room | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(new Map<string, HTMLElement>())
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [camera, setCamera] = useState(false)
  const [microphone, setMicrophone] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [previewCount, setPreviewCount] = useState(0)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [stats, setStats] = useState<RecorderStats | null>(null)
  const [secureOk] = useState(() => typeof window === 'undefined' || mediaEnvironmentOk())
  const [recordingError, setRecordingError] = useState<string | null>(null)
  // A device failure needs to stay on screen: a toast disappears after a few seconds and the
  // instructions ("reset the permission") take longer than that to follow.
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const canPublish = isTeacher || Boolean(tutoringId)

  const refreshDiagnostics = useCallback(() => {
    void collectDiagnostics().then(setDiagnostics).catch(() => setDiagnostics(null))
  }, [])

  useEffect(() => {
    // Permission state is only meaningful once the page knows its origin and devices.
    refreshDiagnostics()
  }, [refreshDiagnostics])

  const reportDeviceError = useCallback(async (error: unknown, kind: DeviceKind) => {
    const detail = await describeDeviceError(error, kind)
    setDeviceError(detail)
    refreshDiagnostics()
    toast.error(`无法开启${DEVICE_LABEL[kind]}，面板里给出了原因和解决方法`)
  }, [refreshDiagnostics])

  /**
   * Renders one labelled tile per published video track, local included. The previous
   * implementation only reacted to `TrackSubscribed` (remote tracks), so a teacher who
   * enabled their own camera got no preview at all - it read as "摄像头打不开".
   */
  const syncPreview = useCallback(() => {
    const container = previewRef.current
    const room = roomRef.current
    if (!container || !room) return

    const seen = new Set<string>()
    const participants: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())]

    for (const participant of participants) {
      const label = participant.name || participant.identity
      const isLocal = participant.identity === room.localParticipant.identity
      const sources: Array<[string, ReturnType<Participant['getTrackPublication']>]> = [
        ['camera', participant.getTrackPublication(Track.Source.Camera)],
        ['screen', participant.getTrackPublication(Track.Source.ScreenShare)],
      ]
      for (const [source, publication] of sources) {
        const track = publication?.track
        const sid = track?.sid
        if (!track || !sid || track.isMuted) continue
        seen.add(sid)

        if (attachedRef.current.has(sid)) continue
        const figure = document.createElement('figure')
        figure.className = 'relative overflow-hidden rounded bg-black'
        const element = track.attach() as HTMLMediaElement
        element.setAttribute('playsinline', 'true')
        // Never play the local microphone back through the speakers.
        element.muted = isLocal
        element.autoplay = true
        element.style.cssText = 'display:block;width:100%;max-height:19rem;object-fit:cover'
        const caption = document.createElement('figcaption')
        caption.className = 'absolute left-1.5 top-1.5 rounded bg-slate-900/60 px-1.5 py-0.5 text-[11px] text-slate-100'
        caption.textContent = label + (source === 'screen' ? ' · 屏幕共享' : '')
        figure.appendChild(element)
        figure.appendChild(caption)
        container.appendChild(figure)
        attachedRef.current.set(sid, figure)
        void element.play?.().catch(() => undefined)
      }
    }

    for (const [sid, figure] of attachedRef.current) {
      if (seen.has(sid)) continue
      figure.querySelectorAll('video, audio').forEach((element) => {
        ;(element as HTMLMediaElement).srcObject = null
      })
      figure.remove()
      attachedRef.current.delete(sid)
    }

    setPreviewCount(attachedRef.current.size)
  }, [])

  const clearPreview = useCallback(() => {
    for (const figure of attachedRef.current.values()) {
      figure.querySelectorAll('video, audio').forEach((element) => {
        ;(element as HTMLMediaElement).srcObject = null
      })
      figure.remove()
    }
    attachedRef.current.clear()
    setPreviewCount(0)
  }, [])

  // Re-attach to a recording that is still running. The panel remounts when the teacher
  // enters or leaves a private tutoring room, which used to throw the recorder away while
  // the database row stayed ACTIVE - the lesson could never be saved.
  useEffect(() => {
    const existing = getActiveRecording(classId)
    if (!existing) return
    existing.claimed = true
    setRecordingId(existing.recordingId)
  }, [classId])

  useEffect(() => {
    if (!recordingId) {
      setStats(null)
      return
    }
    const tick = () => setStats(getActiveRecording(classId)?.session.stats() ?? null)
    tick()
    const handle = window.setInterval(tick, 1_000)
    return () => window.clearInterval(handle)
  }, [recordingId, classId])

  // Warn before losing an in-flight recording to a page reload or an accidental close.
  useEffect(() => {
    if (!recordingId) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [recordingId])

  // Tell the server the recording is still alive, so an orphaned row can be garbage-collected
  // instead of permanently blocking the class from recording again.
  useEffect(() => {
    if (!recordingId) return
    const beat = () => void api.media.heartbeatRecording(recordingId).catch(() => undefined)
    beat()
    const handle = window.setInterval(beat, 20_000)
    return () => window.clearInterval(handle)
  }, [recordingId])

  useEffect(
    () => () => {
      const active = getActiveRecording(classId)
      if (active) {
        active.claimed = false
        // The recording lives outside React, and would otherwise keep running with no UI
        // left to stop it - so finalise it once we are sure no new panel reclaimed it (a
        // tutoring-room switch remounts within milliseconds; React StrictMode double-mounts
        // on first render too).
        window.setTimeout(() => {
          const latest = getActiveRecording(classId)
          if (latest && !latest.claimed) void finalizeRecording(classId, '（已离开课堂）')
        }, 1_200)
      }
      roomRef.current?.disconnect()
      roomRef.current = null
      clearPreview()
    },
    [classId, clearPreview]
  )

  const connect = async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const { token, url } = await api.media.token(classId, tutoringId)
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        toast.error('当前页面不是安全上下文，摄像头和麦克风不会生效。请改用 http://localhost:3000 访问。')
      } else if (/^wss?:\/\/(localhost|127\.0\.0\.1)/.test(url) && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
        // The server handed us a localhost LiveKit address, which from this browser means
        // "this machine" - only correct when the page is served from here too.
        toast.warning('音视频服务地址指向 localhost，可能与当前访问地址不匹配。')
      }

      const room = new Room({ adaptiveStream: true, dynacast: true })
      room
        .on(RoomEvent.TrackSubscribed, syncPreview)
        .on(RoomEvent.TrackUnsubscribed, syncPreview)
        .on(RoomEvent.LocalTrackPublished, syncPreview)
        .on(RoomEvent.LocalTrackUnpublished, syncPreview)
        .on(RoomEvent.ParticipantConnected, syncPreview)
        .on(RoomEvent.ParticipantDisconnected, syncPreview)
        .on(RoomEvent.MediaDevicesError, (error: Error) => {
          void reportDeviceError(error, 'camera')
        })
        .on(RoomEvent.Disconnected, () => {
          setConnected(false)
          setCamera(false)
          setMicrophone(false)
          setSharing(false)
          clearPreview()
        })
      await room.connect(url, token)
      roomRef.current = room
      setConnected(true)
      syncPreview()
      toast.success('音视频课堂已连接')
    } catch (error) {
      setConnected(false)
      const message = error instanceof Error ? error.message : String(error)
      toast.error('连接音视频课堂失败：' + message)
    } finally {
      setConnecting(false)
    }
  }

  const toggleCamera = async () => {
    const room = roomRef.current
    if (!room || !canPublish) return
    const next = !camera
    try {
      await room.localParticipant.setCameraEnabled(next)
      setCamera(next)
      setDeviceError(null)
      syncPreview()
    } catch (error) {
      setCamera(false)
      await reportDeviceError(error, 'camera')
    }
  }

  const toggleMicrophone = async () => {
    const room = roomRef.current
    if (!room || !canPublish) return
    const next = !microphone
    try {
      await room.localParticipant.setMicrophoneEnabled(next)
      setMicrophone(next)
      setDeviceError(null)
      syncPreview()
    } catch (error) {
      setMicrophone(false)
      await reportDeviceError(error, 'microphone')
    }
  }

  const toggleShare = async () => {
    const room = roomRef.current
    if (!room || !canPublish) return
    const next = !sharing
    try {
      await room.localParticipant.setScreenShareEnabled(next)
      setSharing(next)
      syncPreview()
    } catch (error) {
      setSharing(false)
      await reportDeviceError(error, 'screen')
    }
  }

  const stopRecording = async () => {
    const activeId = recordingId
    setUploading(true)
    try {
      if (getActiveRecording(classId)) {
        // Normal path: stop the recorder and upload what it captured.
        await finalizeRecording(classId)
      } else if (activeId) {
        // The recorder is gone (the page was reloaded mid-recording) but the database row is
        // still open. Close it out instead of leaving it on "处理中" forever.
        await api.media.stopRecording(activeId).catch(() => undefined)
        window.dispatchEvent(new Event('recordings-changed'))
        toast.error('本次录制没有拿到本机画面，已标记为失败')
      }
    } finally {
      setRecordingId(null)
      setUploading(false)
    }
  }

  const toggleRecording = async () => {
    if (recordingId) {
      await stopRecording()
      return
    }

    setRecordingError(null)
    const room = roomRef.current
    if (!room) {
      toast.error('请先连接音视频课堂，再开始录制')
      return
    }
    if (!camera) {
      toast.warning('尚未开启摄像头，录像将只包含头像占位画面')
    }
    try {
      // Start the local encoder first. If the browser cannot create a recorder, no database row
      // is created and the next click is not blocked by a phantom ACTIVE recording.
      const session = await startBrowserRecording(room)
      try {
        const result = await api.media.startRecording(classId)
        setActiveRecording({ recordingId: result.recording.id, classId, session, startedAt: Date.now(), claimed: true })
        setRecordingId(result.recording.id)
        window.dispatchEvent(new Event('recordings-changed'))
        toast.success('课堂录制已开始，录制期间请保持本页面打开')
      } catch (error) {
        await session.stop().catch(() => undefined)
        throw error
      }
    } catch (error) {
      window.dispatchEvent(new Event('recordings-changed'))
      const message = error instanceof Error ? error.message : '未知错误'
      setRecordingError(message)
      toast.error('无法开始录制：' + message)
    }
  }

  const elapsedLabel = stats
    ? `${String(Math.floor(stats.elapsedMs / 60000)).padStart(2, '0')}:${String(Math.floor((stats.elapsedMs % 60000) / 1000)).padStart(2, '0')}`
    : null

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 text-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto text-sm">{tutoringId ? t('classroom.privateTutoring') : t('classroom.mediaClass')}</strong>
        {!connected ? (
          <Button size="sm" onClick={connect} disabled={connecting}>{connecting ? t('classroom.connecting') : tutoringId ? t('classroom.connectTutoring') : t('classroom.connectMedia')}</Button>
        ) : (
          <span className="text-sm font-medium text-emerald-700">已连接</span>
        )}
        {(isTeacher || Boolean(tutoringId)) && connected && (
          <>
            <Button size="sm" variant={camera ? 'default' : 'outline'} onClick={toggleCamera}>{camera ? t('classroom.cameraOff') : t('classroom.cameraOn')}</Button>
            <Button size="sm" variant={microphone ? 'default' : 'outline'} onClick={toggleMicrophone}>{microphone ? '静音' : '开启麦克风'}</Button>
            <Button size="sm" variant={sharing ? 'default' : 'outline'} onClick={toggleShare}>{sharing ? '停止共享' : '共享屏幕'}</Button>
          </>
        )}
        {/* A recording must always be stoppable: it outlives this component, so hiding the
            button when the panel switches to a tutoring room used to strand it on ACTIVE. */}
        {isTeacher && (!tutoringId || Boolean(recordingId)) && (
          <Button data-testid="recording-toggle" size="sm" variant={recordingId ? 'destructive' : 'outline'} onClick={toggleRecording} disabled={uploading}>
            {uploading ? t('classroom.saving') : recordingId ? t('classroom.stopRecording') : t('classroom.startRecording')}
          </Button>
        )}
      </div>

      {!secureOk && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          当前页面不是安全上下文，浏览器不会开放摄像头和麦克风。请改用 <code className="font-mono">http://localhost:3000</code> 访问（局域网 IP 或 http 域名都不行）。
        </p>
      )}

      {recordingError && !recordingId && (
        <p className="mt-2 rounded border border-rose-300 bg-rose-50 p-2 text-xs leading-relaxed text-rose-900">
          <span className="font-semibold">录制没有启动：</span>{recordingError}。请确认已连接音视频课堂；如仍失败，请刷新页面后重试。
        </p>
      )}

      {recordingId && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-rose-600" />
          <span className="font-medium">录制中 {elapsedLabel}</span>
          <span>· 画面 {stats?.liveTiles ?? 0} 路 / 在线 {stats?.participants ?? 0} 人</span>
          <span>· {stats?.withAudio ? '含声音' : '无声音（已降级为纯画面）'}</span>
          <span>· 已缓存 {Math.round((stats?.bytes ?? 0) / 1024)} KB</span>
          <span className="text-rose-700">保持本页面打开，关闭或刷新会丢失本次录制</span>
          {stats && stats.liveTiles === 0 && (
            <span className="font-medium">摄像头未推流，录到的是占位画面</span>
          )}
        </p>
      )}

      {deviceError && (
        <div className="mt-2 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          <p className="font-semibold">设备打不开，原因如下</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">{deviceError}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDeviceError(null)}>知道了</Button>
            <span className="text-rose-700">处理完之后，重新点一次「开启摄像头 / 开启麦克风」即可。</span>
          </div>
        </div>
      )}

      <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
        <summary className="cursor-pointer font-medium">{t('classroom.diagnostics')}</summary>
        {diagnostics ? (
          <div className="mt-2 space-y-1">
            <p>访问地址：<code className="font-mono">{diagnostics.origin}</code>（{diagnostics.secure ? '安全上下文 ✓' : '不是安全上下文 ✗'}）</p>
            <p>浏览器是否提供设备接口：{diagnostics.mediaDevices ? '是 ✓' : '否 ✗'}</p>
            <p>摄像头权限：{PERMISSION_TEXT[diagnostics.cameraPermission]}；麦克风权限：{PERMISSION_TEXT[diagnostics.microphonePermission]}</p>
            <p>检测到设备：{diagnostics.cameras} 个摄像头 / {diagnostics.microphones} 个麦克风</p>
            <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
              <p className="font-medium">如果权限显示「已屏蔽」，按顺序做：</p>
              <p>1. 点浏览器地址栏最右侧的图标（被划掉的相机 / 滑块 / 锁），选「重置权限」；</p>
              <p>2. 刷新本页面（F5）；</p>
              <p>3. 再点「开启摄像头」，这次浏览器会弹出授权框，选「允许」。</p>
              <p className="pt-1">也可以在浏览器里手动删除屏蔽记录：</p>
              <p><code className="font-mono break-all">{diagnostics.settingsCamera}</code></p>
              <p><code className="font-mono break-all">{diagnostics.settingsMicrophone}</code></p>
              <p className="pt-1">若权限是「未决定」却依然打不开，通常是 Windows 系统级开关：设置 → 隐私和安全性 → 相机 / 麦克风 → 打开访问权限，并勾选「允许桌面应用访问」。</p>
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={refreshDiagnostics}>重新检测</Button>
          </div>
        ) : (
          <p className="mt-2">正在检测…</p>
        )}
      </details>

      <div ref={previewRef} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" />
      {connected && previewCount === 0 && (
        <p className="mt-3 rounded border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
          {t('classroom.noVideo')}
        </p>
      )}
    </section>
  )
}
