'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { api, type ClientClass, type ClientRolePlayScenario } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function RolePlayPage() {
  const { data: session } = useSession()
  const [scenarios, setScenarios] = useState<Array<ClientRolePlayScenario & { className: string }>>([])
  const [classes, setClasses] = useState<ClientClass[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [roles, setRoles] = useState([{ name: '', background: '', objective: '', secretObjective: '' }])

  const load = () => api.roleplay.list().then(setScenarios).catch(() => setScenarios([])).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  useEffect(() => { if (session?.user?.role === 'TEACHER') api.classes.list().then((items) => { setClasses(items); setClassId(items[0]?.id || '') }).catch(() => setClasses([])) }, [session?.user?.role])

  const create = async () => {
    if (!classId || !title.trim() || !description.trim() || roles.some((role) => !role.name.trim() || !role.background.trim() || !role.objective.trim())) return toast.error('请完整填写场景和角色信息')
    try {
      await api.roleplay.create({ classId, title: title.trim(), description: description.trim(), roles })
      toast.success('场景已创建')
      setOpen(false)
      setTitle(''); setDescription(''); setRoles([{ name: '', background: '', objective: '', secretObjective: '' }])
      load()
    } catch {}
  }

  return (
    <main className="light-ui min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">角色扮演课堂</h1><p className="mt-2 text-slate-600">这里只显示你有权访问的真实课堂场景。</p></div>{session?.user?.role === 'TEACHER' && <Button onClick={() => setOpen(true)}>创建场景</Button>}</div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">{loading ? <p>加载中…</p> : scenarios.length ? scenarios.map((scenario) => <Card key={scenario.id}><CardHeader><CardTitle>{scenario.title}</CardTitle></CardHeader><CardContent><p className="line-clamp-3 text-sm text-slate-700">{scenario.description}</p><p className="mt-2 text-xs text-slate-500">{scenario.className} · {scenario.roles.length} 个角色</p><Button asChild className="mt-4"><Link href={`/roleplay/${scenario.id}`}>进入场景</Link></Button></CardContent></Card>) : <Card className="md:col-span-2"><CardContent className="py-12 text-center text-slate-600">暂无已创建的角色扮演场景。</CardContent></Card>}</div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="light-ui max-w-2xl bg-white text-slate-900"><DialogClose onClick={() => setOpen(false)} /><DialogHeader><DialogTitle>创建角色扮演场景</DialogTitle></DialogHeader><div className="space-y-3"><select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">选择班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="场景标题" /><textarea className="min-h-24 w-full rounded-md border border-slate-300 bg-white p-3" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="场景背景与任务" />{roles.map((role, index) => <section key={index} className="space-y-2 rounded-lg border border-slate-200 p-3"><div className="flex justify-between"><strong>角色 {index + 1}</strong><Button variant="ghost" className="text-red-700" disabled={roles.length === 1} onClick={() => setRoles((items) => items.filter((_, itemIndex) => itemIndex !== index))}>删除</Button></div>{(['name', 'background', 'objective', 'secretObjective'] as const).map((field) => <Input key={field} value={role[field]} onChange={(event) => setRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))} placeholder={{ name: '角色名', background: '角色背景', objective: '公开目标', secretObjective: '秘密任务（可选）' }[field]} />)}</section>)}<Button variant="outline" onClick={() => setRoles((items) => [...items, { name: '', background: '', objective: '', secretObjective: '' }])}>添加角色</Button></div><DialogFooter><Button onClick={create}>创建场景</Button></DialogFooter></DialogContent></Dialog>
    </main>
  )
}
