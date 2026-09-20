'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { api, type ClientRolePlayRole, type ClientRolePlayScenario } from '@/lib/api-client'
import { useClassroomSocket } from '@/components/classroom/useClassroomSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export default function RolePlayScenarioPage() {
  const scenarioId = String(useParams()?.scenarioId || '')
  const { data: session } = useSession()
  const [scenario, setScenario] = useState<ClientRolePlayScenario | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<{ title: string; description: string; roles: ClientRolePlayRole[] }>({ title: '', description: '', roles: [] })
  const { connected, joinClassroom, rolePlayMessages, sendRolePlayAction } = useClassroomSocket()
  const isTeacher = session?.user?.role?.toUpperCase() === 'TEACHER'

  useEffect(() => { api.roleplay.get(scenarioId).then((loaded) => { setScenario(loaded); setEditDraft({ title: loaded.title, description: loaded.description, roles: loaded.roles }) }).catch(() => setScenario(null)) }, [scenarioId])
  useEffect(() => { if (scenario?.classId && session?.user?.id) joinClassroom(scenario.classId, session.user.id) }, [scenario?.classId, session?.user?.id, joinClassroom])

  const send = () => {
    const message = draft.trim()
    if (!message || !scenario) return
    sendRolePlayAction('message', { scenarioId: scenario.id, message })
    setDraft('')
  }

  const setStatus = async (action: 'start' | 'end') => {
    if (!scenario) return
    try {
      const { scenario: updated } = await api.roleplay.setStatus(scenario.id, action)
      setScenario((current) => current ? { ...current, status: updated.status, startedAt: updated.startedAt, endedAt: updated.endedAt } : current)
      toast.success(action === 'start' ? '活动已开始' : '活动已结束')
    } catch {}
  }

  const updateAssignment = (studentId: string, role: string) => {
    setScenario((current) => current ? { ...current, assignments: { ...(current.assignments || {}), [studentId]: role } } : current)
  }

  const saveAssignments = async () => {
    if (!scenario) return
    try {
      const result = await api.roleplay.assignRoles(scenario.id, scenario.assignments || {})
      setScenario((current) => current ? { ...current, assignments: result.assignments.assignments } : current)
      toast.success('角色分配已保存')
    } catch {}
  }

  const saveDraft = async () => {
    if (!scenario) return
    try {
      const { scenario: updated } = await api.roleplay.update(scenario.id, {
        title: editDraft.title, description: editDraft.description,
        roles: editDraft.roles.map((role) => ({ id: role.id, name: role.name, background: role.background, objective: role.objective || role.goal || '', secretObjective: role.secretObjective })),
      })
      setScenario((current) => current ? { ...current, title: updated.title, description: updated.description, roles: updated.roles } : current)
      setEditing(false)
      toast.success('场景草稿已保存')
    } catch {}
  }

  if (!scenario) return <main className="light-ui min-h-screen bg-slate-50 p-8 text-slate-900"><p>正在加载场景，或你无权访问该场景。</p><Button asChild className="mt-4"><Link href="/roleplay">返回列表</Link></Button></main>
  const history = rolePlayMessages.length ? rolePlayMessages : (scenario.messages || []).map((message) => ({ role: 'user' as const, content: message.content, timestamp: new Date(message.createdAt) }))
  return (
    <main className="light-ui min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[320px_1fr]">
        <aside><Button asChild variant="outline"><Link href="/roleplay">返回场景列表</Link></Button>{isTeacher && scenario.status === 'DRAFT' && <Button className="ml-2" variant="outline" onClick={() => setEditing((value) => !value)}>{editing ? '取消编辑' : '编辑草稿'}</Button>}{editing && <Card className="mt-4"><CardHeader><CardTitle>编辑场景</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} placeholder="场景标题" /><textarea className="min-h-24 w-full rounded border border-slate-300 bg-white p-2" value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} />{editDraft.roles.map((role, index) => <div key={role.id || index} className="space-y-2 rounded border border-slate-200 p-2"><Input value={role.name} onChange={(event) => setEditDraft((current) => ({ ...current, roles: current.roles.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="角色名" /><Input value={role.background} onChange={(event) => setEditDraft((current) => ({ ...current, roles: current.roles.map((item, itemIndex) => itemIndex === index ? { ...item, background: event.target.value } : item) }))} placeholder="角色背景" /><Input value={role.objective || role.goal || ''} onChange={(event) => setEditDraft((current) => ({ ...current, roles: current.roles.map((item, itemIndex) => itemIndex === index ? { ...item, objective: event.target.value } : item) }))} placeholder="公开目标" /><Input value={role.secretObjective || ''} onChange={(event) => setEditDraft((current) => ({ ...current, roles: current.roles.map((item, itemIndex) => itemIndex === index ? { ...item, secretObjective: event.target.value } : item) }))} placeholder="秘密任务（可选）" /></div>)}<Button onClick={saveDraft}>保存草稿</Button></CardContent></Card>}<Card className="mt-4"><CardHeader><CardTitle>{scenario.title}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700">{scenario.description}</p><p className="mt-3 text-xs text-slate-500">状态：{scenario.status === 'ACTIVE' ? '进行中' : scenario.status === 'ENDED' ? '已结束' : '草稿'} · {connected ? '实时连接已建立' : '正在连接课堂'}</p>{isTeacher && <div className="mt-3 flex gap-2">{scenario.status === 'DRAFT' && <Button size="sm" onClick={() => setStatus('start')}>开始活动</Button>}{scenario.status === 'ACTIVE' && <Button size="sm" variant="destructive" onClick={() => setStatus('end')}>结束活动</Button>}</div>}{isTeacher && scenario.status === 'DRAFT' && Boolean(scenario.enrolledStudents?.length) && <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3"><strong className="text-sm">学生角色分配</strong>{scenario.enrolledStudents?.map((student) => <label key={student.userId} className="block text-xs text-slate-700">{student.name}<select className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm" value={scenario.assignments?.[student.userId] || ''} onChange={(event) => updateAssignment(student.userId, event.target.value)}><option value="">请选择角色</option>{scenario.roles.map((role) => <option key={role.id || role.name} value={role.id || role.name}>{role.name}</option>)}</select></label>)}<Button size="sm" variant="outline" onClick={saveAssignments}>保存角色分配</Button></div>}<div className="mt-4 space-y-3">{scenario.roles.map((role, index) => <div key={role.id || `${role.name}-${index}`} className="rounded border border-slate-200 p-3"><strong>{role.name}</strong><p className="mt-1 text-xs text-slate-600">{role.background}</p><p className="mt-1 text-sm">目标：{role.objective || role.goal || '由教师补充'}</p>{role.secretObjective && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{isTeacher ? '秘密任务：' : '你的秘密任务：'}{role.secretObjective}</p>}</div>)}</div></CardContent></Card></aside>
        <Card className="flex min-h-[650px] flex-col"><CardHeader><CardTitle>场景对话</CardTitle></CardHeader><CardContent className="flex flex-1 flex-col"><div className="flex-1 space-y-3 overflow-y-auto rounded-lg bg-slate-100 p-4">{history.length ? history.map((message, index) => <div key={`${message.content}-${index}`} className="rounded-lg bg-white p-3 text-sm text-slate-900 shadow-sm">{message.content}</div>) : <p className="text-center text-slate-600">{scenario.status === 'ACTIVE' ? '暂无对话，发送第一条角色行动。' : '活动开始后才能发送角色行动。'}</p>}</div><div className="mt-4 flex gap-2"><textarea disabled={scenario.status !== 'ACTIVE'} className="min-h-24 flex-1 rounded-md border border-slate-300 bg-white p-3 text-slate-900 disabled:bg-slate-100" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={scenario.status === 'ACTIVE' ? '以角色身份描述你的行动或台词' : '活动尚未开始'} /><Button disabled={!connected || scenario.status !== 'ACTIVE' || !draft.trim()} onClick={send}>发送</Button></div></CardContent></Card>
      </div>
    </main>
  )
}
