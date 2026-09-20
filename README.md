# Agentic EduVerse

一个面向教师、学生与家长的本地优先（local-first）智能课堂平台。项目把班级管理、实时课堂、音视频、白板、教材、测验、课堂录制、AI 学伴、翻译、家长报告和多语言界面放在同一个 pnpm monorepo 中。

> 当前仓库首先面向本地开发、演示和原型验证。生产部署前必须替换所有开发密钥、使用 HTTPS、启用真实 Redis/数据库，并完成安全与容量评估。

---

## 目录

- [核心能力](#核心能力)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [仓库结构](#仓库结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [数据库](#数据库)
- [AI 学伴与 ZenMux](#ai-学伴与-zenmux)
- [音视频与录制](#音视频与录制)
- [实时课堂](#实时课堂)
- [权限与角色](#权限与角色)
- [多语言](#多语言)
- [测试与质量检查](#测试与质量检查)
- [部署建议](#部署建议)
- [安全注意事项](#安全注意事项)
- [常见问题](#常见问题)
- [Git 工作流](#git-工作流)
- [项目边界](#项目边界)

---

## 核心能力

### 教师端

- 创建和管理班级，生成 6 位房间码，可设置加入密码。
- 开启/结束课堂，查看参与者、情绪反馈、举手和课堂聊天。
- 实时音视频、摄像头、麦克风和屏幕共享。
- 共享白板：笔画、清空、撤销和跨客户端同步。
- 上传课堂教材，学生端通过 Socket 通知立即刷新，也有轮询兜底。
- 创建手工测验或通过 AI 从教材生成测验。
- 课堂热力图、个别辅导队列和角色扮演活动。
- 浏览器端合成录制，上传到本地磁盘，支持回放和 Range 请求。
- 生成家长邀请：24 小时有效、一次性使用、绑定指定邮箱。
- 课前预习与课后课堂分析（配置服务端 AI 后启用）。

### 学生端

- 使用房间码和可选密码加入班级。
- 查看自己的班级、学习统计、金币和课堂入口。
- 课堂中观看/收听教师、参与聊天、白板、测验、情绪反馈和举手。
- 五个独立 AI 学伴：通用、数学、语文、英语、编程。
- 每个学伴独立保存会话历史，切换学伴不会串历史。
- ZenMux 模型切换：仅展示四个产品选定模型的友好名称。
- AI 回答流式显示；练习题、解析和相关视频在完整结果后补充。
- 每次回答可展示最多 5 个知识点讲解视频，点击打开外部视频页面。
- 内置翻译器：自动检测、双向互换、复制译文、近期翻译。
- 虚拟人物/头像配置和金币激励。

### 家长端

- 通过教师邀请链接或邀请码绑定孩子。
- 查看孩子的出勤、学习时长、情绪趋势、测验表现和金币。
- 生成基于真实课堂数据的 AI 周报。
- 绑定流程校验邀请邮箱，避免任意认领学生。

### 平台级能力

- 三角色单账号隔离：教师、学生、家长分别进入对应门户。
- 8 种界面语言：中文、英文、德语、法语、意大利语、俄语、西班牙语、日语。
- Cookie + localStorage 保存语言；服务端首屏按 Cookie 渲染，减少语言闪烁。
- SQLite + Prisma 数据层，共 20 个业务模型。
- Socket.IO 实时课堂和 LiveKit 音视频相互独立，通过 `classId` 关联。

---

## 系统架构

```text
Browser
  |
  | HTTP / NextAuth / NDJSON stream
  v
apps/web (Next.js :3000)
  |-- pages and React UI
  |-- Next.js API routes
  |-- auth, class APIs, AI proxy, files, recordings
  |-- Prisma -> SQLite
  |
  | Socket.IO ticket
  v
apps/server (Express + Socket.IO :4000)
  |-- classroom rooms: class:<classId>
  |-- chat / whiteboard / quiz / emotion / hand raise
  |-- Redis or memory:// state
  |
  | LiveKit JWT
  v
LiveKit (:7880)
  |-- media rooms: class-<classId>
  |-- private rooms: tutoring-<tutoringId>

Shared workspace packages
  packages/shared  shared TS contracts and socket events
  packages/db      Prisma client and database entry
  packages/ai      server-side AI calls, schemas and memory
```

### 两套“房间”

| 系统 | 命名 | 用途 |
|---|---|---|
| Socket.IO | `class:<classId>` | 聊天、白板、测验、情绪、在线状态等数据事件 |
| LiveKit | `class-<classId>` | 音视频和屏幕共享 |

二者是独立连接。Socket 断开不一定中断媒体，媒体断开也不必然中断白板和聊天。

---

## 技术栈

| 层 | 技术 |
|---|---|
| Web | Next.js 14.2、React 18、TypeScript、Tailwind CSS |
| 认证 | Auth.js / NextAuth 5 beta、Credentials 登录、bcrypt |
| 实时课堂 | Express、Socket.IO、一次性 HMAC 票据 |
| 音视频 | LiveKit client + server SDK、本地 LiveKit Server |
| 数据库 | SQLite、Prisma 6.19 |
| AI | ZenMux OpenAI-compatible API、WorkBuddy Cloud SDK、Zod |
| 动画/视觉 | Framer Motion、PixiJS、Recharts、Lucide |
| 包管理 | pnpm workspace 9.15.9 |

---

## 仓库结构

```text
E:/apps
├─ apps/
│  ├─ web/                 Next.js 页面和 API 路由
│  │  ├─ src/app/          App Router 页面与 API
│  │  ├─ src/components/   页面与业务组件
│  │  ├─ src/lib/          API 客户端、AI、录制、i18n 等
│  │  ├─ scripts/          浏览器测试、ZenMux 配置工具
│  │  └─ .env.example
│  ├─ server/              Express + Socket.IO 实时后端
│  │  ├─ src/index.ts
│  │  ├─ src/socket-handlers.ts
│  │  └─ .env.example
│  ├─ infra/media/         LiveKit / Docker 媒体栈配置
│  └─ database/migrations/ 手工 SQLite SQL 迁移
├─ packages/
│  ├─ ai/                  AI 调用、SSE 解析、Zod 输出校验
│  ├─ db/                  Prisma Client 与 schema
│  └─ shared/              前后端共享类型及 Socket 事件
├─ data/                   本地数据库、教材和录像（被 Git 忽略）
├─ docs/                   功能清单和路演材料
├─ pnpm-workspace.yaml
├─ start-dev.bat           Windows 本地三服务启动器
└─ README.md
```

依赖方向建议保持：`apps/* -> packages/*`，共享包不要反向依赖具体应用。

---

## 快速开始

### 前置要求

- Windows 10/11（当前本地媒体启动器针对 Windows）。
- Node.js 20+（当前验证使用 Node 22）。
- pnpm 9.15.9。
- 可选：本地 LiveKit Windows 二进制。
- Docker 仅用于完整 LiveKit + Egress + MinIO + Caddy 栈，基础本地模式不需要 Docker。

### 1. 安装依赖

```powershell
cd E:\apps
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
```

如果官方 npm registry 在当前网络不可达，可临时指定镜像：

```powershell
pnpm install --registry=https://registry.npmmirror.com
```

不要混用 npm 与 pnpm。本仓库只维护 `pnpm-lock.yaml`，`package-lock.json` 已被忽略。

### 2. 创建本地环境文件

```powershell
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\server\.env.example apps\server\.env
```

至少修改：

- SQLite 绝对路径。
- `NEXTAUTH_SECRET`。
- Web/Socket 相同的 `SOCKET_TICKET_SECRET`。
- LiveKit 地址、Key、Secret（需要音视频时）。
- ZenMux Key（需要第三方 AI 时）。

### 3. 生成 Prisma Client

```powershell
$env:DATABASE_URL = "file:E:/apps/data/eduverse.db"
pnpm db:generate
```

从 Linux 复制到 Windows 的项目必须重新生成 Prisma Client，否则 Prisma 原生引擎平台不匹配。

### 4. 启动

Windows 推荐：

```powershell
E:\apps\start-dev.bat
```

会分别启动：

- Web：`http://localhost:3000`
- Socket.IO：`http://localhost:4000/health`
- LiveKit：`ws://localhost:7880`（本地二进制存在时）

也可分别启动：

```powershell
pnpm dev:web
pnpm dev:server
```

若 pnpm 包装脚本或 PATH 不可用，可直接从应用目录运行实际入口。

### 5. 健康检查

```powershell
Invoke-WebRequest http://localhost:3000/login
Invoke-WebRequest http://localhost:4000/health
Invoke-WebRequest http://localhost:7880/
```

Socket 健康响应应为：

```json
{"status":"ok"}
```

---

## 环境变量

### Web：`apps/web/.env`

| 变量 | 必需 | 说明 |
|---|---:|---|
| `DATABASE_URL` | 是 | Prisma SQLite URL，例如 `file:E:/apps/data/eduverse.db` |
| `NEXTAUTH_SECRET` | 是 | Auth.js 签名密钥，至少 32 个随机字符 |
| `NEXTAUTH_URL` | 是 | 本地为 `http://localhost:3000` |
| `NEXT_PUBLIC_SOCKET_URL` | 是 | Socket 服务地址，本地为 `http://localhost:4000` |
| `SOCKET_TICKET_SECRET` | 是 | 一次性 Socket 票据密钥，必须与 server 一致 |
| `ZENMUX_API_KEY` | 学伴使用时 | ZenMux 私密 Key，只能存在服务端环境变量中 |
| `ZENMUX_MODEL` | 否 | 学伴默认模型，当前推荐 `openai/gpt-5.6-luna` |
| `AI_BASE_URL` | 其他服务端 AI 时 | OpenAI-compatible base URL，通常包含 `/v1` |
| `AI_MODEL` | 同上 | 通用服务端 AI 模型 ID |
| `AI_API_KEY` | 同上 | 通用服务端 AI Key |
| `LIVEKIT_URL` | 音视频时 | 服务端访问 LiveKit 的 HTTP/HTTPS 地址 |
| `NEXT_PUBLIC_LIVEKIT_URL` | 音视频时 | 浏览器访问的 `ws://`/`wss://` 地址 |
| `LIVEKIT_API_KEY` | 音视频时 | LiveKit API Key |
| `LIVEKIT_API_SECRET` | 音视频时 | LiveKit API Secret |
| `UPLOAD_ROOT` | 推荐 | 教材及浏览器录制上传的磁盘根目录 |

`NEXT_PUBLIC_*` 会进入浏览器包，绝不能给 Secret 或第三方 API Key 加这个前缀。

### Socket server：`apps/server/.env`

| 变量 | 必需 | 说明 |
|---|---:|---|
| `DATABASE_URL` | 是 | 应与 Web 指向同一数据库 |
| `REDIS_URL` | 是 | 单机开发可用 `memory://`；生产使用真实 Redis |
| `SOCKET_TICKET_SECRET` | 是 | 必须与 Web 完全一致 |
| `WEB_ORIGINS` | 是 | 允许的 Web Origin，可按实现配置多个 |

### 生成安全随机值

PowerShell 示例：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

不要将 `.env`、数据库、LiveKit 本机配置或任何 API Key 提交到 Git。

---

## 数据库

### 默认数据库

开发模式使用 SQLite：

```text
data/eduverse.db
```

该目录完全被 Git 忽略，因为里面包含真实账号、密码哈希、课堂记录、邀请、历史聊天和上传路径。

### Prisma schema

```text
packages/db/prisma/schema.prisma
```

当前业务模型包括：

- `User`, `Class`, `Enrollment`, `Session`
- `EmotionLog`, `Message`, `Attendance`, `RewardLedger`
- `Material`, `ClassFile`, `WhiteboardEvent`
- `Quiz`, `Submission`
- `AgentMemory`
- `RolePlayScenario`, `RolePlayMessage`
- `Recording`, `TutoringSession`
- `ParentInvitation`, `ParentStudentLink`

### Schema 同步

开发环境可使用：

```powershell
$env:DATABASE_URL = "file:E:/apps/data/eduverse.db"
pnpm exec prisma db push --schema packages/db/prisma/schema.prisma
pnpm db:generate
```

`db push` 适合原型开发，不建议替代生产迁移流程。

### 手工 SQL 迁移

`apps/database/migrations` 中的 SQL **不是幂等的**，必须按文件名顺序且每个文件只执行一次。执行前备份数据库，并建立迁移记录。回滚策略主要是恢复备份，而不是删除新增列。

---

## AI 学伴与 ZenMux

### 调用链路

```text
Student browser
  -> POST /api/ai/tutor (authenticated)
  -> packages/ai
  -> ZenMux OpenAI-compatible endpoint
  -> SSE upstream
  -> NDJSON same-origin stream
  -> browser incrementally updates answer
```

### 流式输出

- 模型按 JSON 输出，要求 `answer` 字段位于前部。
- 服务端从 SSE 增量累积 JSON，并只提取 `answer` 的可见部分。
- 浏览器收到 NDJSON `answer` 事件后实时更新聊天气泡。
- 完整 JSON 校验成功后，才补上练习题、答案解析和视频关键词。
- 完成后保存到当前学伴自己的历史桶。
- 超时、网络断开、非正常 `finish_reason` 或缺少 `[DONE]` 会标记为中断。
- 中断时可保留部分正文，但不保存，也不作为下轮上下文。

### 模型选择

网页只展示产品选定的四个模型：

| UI 名称 | ZenMux model ID |
|---|---|
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` |
| Gemini 3.8 Flash | `google/gemini-3.8-flash` |
| GPT 5.6 Luna | `openai/gpt-5.6-luna` |
| GPT 5.6 Terra | `openai/gpt-5.6-terra` |

选项保存在当前浏览器的 localStorage，但服务端会再次校验，只允许上述四项。模型出现在目录中不代表账户一定有权限，也不代表上游线路始终可用。

### 一键持久填写 ZenMux Key

不要在聊天、Issue、截图或命令参数中粘贴 Key。使用交互式脚本：

```powershell
& "C:\Users\ThinkBook\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" `
  "E:\apps\apps\web\scripts\configure-zenmux.cjs"
```

脚本会：

- 隐藏 Key 输入。
- 原子更新 `apps/web/.env`。
- 保留其他环境变量。
- 不回显 Key，也不生成额外密钥备份。

修改 Key 后重启 Web 服务。

### 相关视频

完整回答包含 1–3 个短知识点词。Web 服务通过 B 站公开搜索页查找真实视频，解析标题、BV 号、封面、时长和作者，并最多展示 5 条。该能力依赖外部网页结构，平台改版可能导致解析失效；当前过滤不是人工审核，不应宣称所有视频均已教育安全审核。

### 翻译器

翻译器使用独立的 WorkBuddy Cloud 浏览器通道，不会自动跟随 ZenMux 学伴模型切换。其历史目前只保留在页面内，不写入 `AgentMemory`。

---

## 音视频与录制

### 本地 LiveKit

基础本地模式使用 Windows 原生 LiveKit Server：

```text
apps/infra/media/bin/livekit-server.exe
apps/infra/media/livekit.local.yaml
```

这两个文件被 Git 忽略：二进制体积大，本地 YAML 含密钥。

### 浏览器安全上下文

开发时必须使用：

```text
http://localhost:3000
```

不要使用 `http://192.168.x.x:3000` 等局域网 HTTP 地址。浏览器只在 HTTPS 或 localhost 下开放 `getUserMedia`。若要让其他设备使用摄像头和麦克风，必须部署 HTTPS，并使用 `wss://` LiveKit。

Web 响应头应允许本站设备权限：

```text
Permissions-Policy: camera=(self), microphone=(self), geolocation=()
```

### 当前发布权限

- 教师：可以发布摄像头、麦克风和屏幕共享。
- 普通学生：只订阅，不能发布摄像头和麦克风。
- 私密辅导：按 token 权限允许参与者发布。

### 浏览器端录制

当前本地方案不依赖 LiveKit Egress：

1. 教师浏览器把参与者视频绘制到 Canvas。
2. `MediaRecorder` 录制 WebM。
3. 停止后上传到 `UPLOAD_ROOT/recordings/...`。
4. 数据库记录转为 `COMPLETE`。
5. 回放路由支持 HTTP Range，播放器可拖动。

录制器使用模块级注册表，可跨组件重挂载存活；每 20 秒更新数据库心跳，长时间无心跳的 `ACTIVE` 行会被回收。站内离开课堂会尝试自动保存。整页崩溃、系统断电仍可能造成损失，因此生产环境建议部署服务端 Egress。

### 完整 Docker 媒体栈

`apps/infra/media/docker-compose.yml` 包括 Redis、LiveKit、Egress、MinIO 和 Caddy。参见 `apps/infra/media/README.md`。仓库里的共享 YAML 只能包含开发占位值；生产必须全部替换。

---

## 实时课堂

### Socket 认证

1. Web 使用登录会话请求 `/api/socket-ticket`。
2. 服务端签发短期 HMAC 票据。
3. Socket server 验证签名、过期时间和一次性 `jti`。
4. 加入课堂时再次查询数据库：教师必须拥有班级，学生必须已入班。

生产必须使用真实 Redis，才能在多实例之间共享票据防重放、在线状态和课堂状态。`memory://` 只适合单进程开发。

### 主要实时事件

- 课堂加入/离开和参与者列表。
- 课堂消息和聊天历史。
- 情绪反馈、举手和教师公告。
- 白板状态与操作。
- 测验开始、答题、结果、结束。
- 角色扮演和个别辅导。
- 教材列表变化通知。
- 课堂结束。

事件类型统一定义在 `packages/shared/src/index.ts`，修改事件时应同时更新服务器和客户端。

---

## 权限与角色

### 用户角色

- `TEACHER`
- `STUDENT`
- `PARENT`

一个账号只有一个角色。入口选择不会改变已有账号的角色；角色与入口不一致时，会引导退出并使用正确账号，而不是静默跳回学生端。

### 主要资源权限

| 资源 | 教师 | 学生 | 家长 |
|---|---|---|---|
| 班级管理 | 仅自己创建的班级 | 通过房间码加入 | 无 |
| 实时课堂数据 | 自己的班级 | 已入班且课堂开启 | 无 |
| 音视频 | 自己的班级 | 已入班；默认只订阅 | 无 |
| 教材 | 上传/下载自己的班级 | 已入班可下载 | 无 |
| 录像 | 管理/发布自己的班级 | 按发布策略查看 | 无 |
| 学伴 | 无 | 自己使用 | 无 |
| 学习报告 | 为班级学生生成相关数据 | 无 | 仅已绑定孩子 |

---

## 多语言

界面语言定义于：

```text
apps/web/src/lib/i18n/locales/
```

`zh.ts` 是键结构真源；其他语言通过 TypeScript 类型保证键完整。新增文案时：

1. 在中文字典添加键。
2. 在全部七个其他字典添加对应翻译。
3. 在组件中使用 `useI18n().t('path.key')`。
4. 运行 TypeScript 检查。

目前主路径已国际化，部分课堂深层组件和 API 错误文案仍可能含中文，新增功能应继续消除硬编码文案。

---

## 测试与质量检查

### 类型检查

```powershell
pnpm typecheck
```

若根脚本因为环境 PATH 找不到 `pnpm`，可直接运行前端 TypeScript：

```powershell
& "C:\path\to\node.exe" "E:\apps\apps\web\node_modules\typescript\bin\tsc" `
  --noEmit -p "E:\apps\apps\web\tsconfig.json"
```

### 后端测试

```powershell
pnpm --filter server test
```

### 构建

```powershell
pnpm --filter web build
pnpm --filter server build
```

### 浏览器/E2E 脚本

```text
apps/web/scripts/browser-smoke.mjs
apps/web/scripts/quiz-four-types-e2e.mjs
```

这些脚本可能需要本地服务、测试账号和浏览器 CDP，不应直接在生产数据库运行。

### 提交前建议

```powershell
git diff --check
git status
git diff --cached
pnpm typecheck
```

绝不能在命令输出、测试报告或截图中打印真实 API Key。

---

## 部署建议

### 不拆仓库，拆服务部署

单仓库不等于单进程。推荐继续保持 monorepo，但分别部署：

- `apps/web`：Next.js Web + API。
- `apps/server`：Socket.IO。
- LiveKit：独立服务。
- Redis：托管 Redis。
- 数据库：生产数据库（建议 PostgreSQL；需要设计迁移）。
- 对象存储：生产录制和教材建议使用 S3-compatible storage。

### 生产必做

- HTTPS + WSS。
- 替换全部开发密钥并建立密钥轮换机制。
- 真实 Redis；不要使用 `memory://`。
- 不要把 SQLite 放在多个无状态实例之间共享。
- 限制文件上传类型、大小和病毒扫描。
- AI 请求配额、成本、超时、审计和内容安全。
- 外部视频源的白名单或人工审核策略。
- 日志脱敏，不记录 Key、密码、完整 token 和未成年人敏感信息。
- 数据备份、恢复演练和迁移记录。
- 录制和学生数据的保留期限、访问审计和删除流程。

---

## 安全注意事项

- `.env`、数据库、上传目录、LiveKit 本地密钥均被 `.gitignore` 排除。
- `apps/web/scripts/configure-zenmux.cjs` 使用隐藏输入，但 `.env` 仍是磁盘上的明文秘密文件。
- Socket ticket 是短期一次性凭证，不应替代数据库授权检查。
- 家长邀请 token 在数据库中保存哈希，且绑定邮箱、过期时间和兑换状态。
- 新建班级密码使用 bcrypt；历史明文密码在成功加入后迁移为哈希。
- AI 的结构化输出必须经过 Zod 校验；流式中断内容不进入历史和后续上下文。
- 模型 ID 必须在服务端精选列表中，不能相信浏览器传入的任意 ID。

如果 Key 曾经出现在聊天、截图、提交历史或公开日志中，应立即在供应商控制台撤销并重新生成。

---

## 常见问题

### 1. 摄像头/麦克风没有授权框

检查：

- 地址必须是 `http://localhost:3000` 或 HTTPS。
- `Permissions-Policy` 是否允许 `camera=(self), microphone=(self)`。
- Edge/Chrome 站点设置是否屏蔽 localhost。
- Windows 隐私设置是否允许桌面应用访问相机/麦克风。
- 设备是否被会议软件占用。

### 2. Next dev 启动时触发 safe-delete 错误

某些受保护环境会阻止 Next 删除大量 `.next` 文件。不要绕过保护；将旧 `.next` **改名备份**，再启动生成新缓存。`.next.backup-*` 已被 Git 忽略。

### 3. Tailwind 提示 `border-border` 不存在

通常是从错误工作目录启动 Next，导致 Tailwind 找不到配置。请在 `apps/web` 目录启动，或确保进程工作目录指向该目录。

### 4. Prisma 报原生引擎平台不匹配

删除/移走复制来的依赖并在当前系统重新安装，然后执行：

```powershell
pnpm db:generate
```

### 5. 学伴显示已配置但回答失败

- 确认 ZenMux Key 有效、余额充足。
- 确认所选模型对账户开放。
- 查看 ZenMux 调用日志。
- `500 internal_server_error` 可能是上游线路错误，重启本地服务不一定解决。
- 模型列表只保留四项，不表示四项都保证可用。

### 6. 流式回答出现一半后中断

该条会标记“部分内容未保存”，不会污染历史。常见原因：上游超时、网络断开、非正常 `finish_reason`、缺失 `[DONE]` 或最终 JSON 不合法。重新提问即可；不要把部分答案当作已验证结果。

### 7. 学生看不到教师上传的教材

确认学生已经加入班级，并成功加入 Socket 房间。教师上传后会广播 `class-files-changed`，学生重新请求文件列表；即使广播失败，页面也有轮询和手动刷新兜底。

### 8. 录制黑屏或无法保存

- 先开启摄像头并确认页面中存在视频预览。
- 即使没有视频轨，也应录到占位画面而非纯黑。
- 保持课堂标签页打开。
- 检查 `UPLOAD_ROOT` 权限和磁盘空间。
- 检查数据库是否存在长期无心跳的录制记录。

### 9. 学生不能开摄像头/麦克风

这是当前产品规则：普通课堂学生 token 为 subscribe-only。若要允许学生发布，需要修改产品权限并重新评估课堂管理和录制布局。

### 10. `E:\apps\AgenticEduverse` 是什么

这是迁移 Git 元数据前创建的空子仓库目录。Git 根现在是 `E:\apps`；该空目录已被忽略，不要在里面再次复制项目。

---

## Git 工作流

仓库根目录：

```text
E:\apps
```

当前分支：`main`。

推荐流程：

```powershell
git status
git switch -c feature/<short-name>
# edit + test
git add <specific-files>
git diff --cached
git commit -m "Describe the change"
```

当前没有默认远程地址。配置远程前先确认仓库可见性，并再次检查敏感信息：

```powershell
git remote add origin <REMOTE_URL>
git remote -v
git push -u origin main
```

不要强制推送，不要提交 `.env`，不要用 `git add -f` 绕过忽略规则。

---

## 项目边界

当前实现已经可以完整本地演示，但以下内容仍属于生产化工作：

- 多实例 Socket/Redis 和数据库高可用。
- 服务端 LiveKit Egress、可靠转码和对象存储。
- 全站每个深层页面和 API 文案的完整国际化。
- 视频推荐内容审核与稳定官方 API。
- AI 成本控制、内容审核、模型回退和供应商 SLA。
- 移动端、无障碍、弱网优化和正式负载测试。
- 未成年人隐私、地区法规和学校数据治理流程。

---

## 许可证与贡献

当前 `package.json` 标记为 private，仓库未声明开源许可证。未经项目所有者确认，不应公开发布或复制为开源项目。

提交功能前请确保：

1. 需求和角色权限明确。
2. 前后端共享类型同步。
3. 类型检查和相关测试通过。
4. 不包含密钥、数据库和个人数据。
5. README 或相关说明在行为改变时同步更新。
