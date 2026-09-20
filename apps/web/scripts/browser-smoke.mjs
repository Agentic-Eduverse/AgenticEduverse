import { mkdir } from 'node:fs/promises'
import playwright from 'file:///C:/Users/oh/AppData/Local/Temp/eduverse-playwright/node_modules/playwright-core/index.js'

const { chromium } = playwright

const baseURL = process.env.EDUVERSE_BASE_URL || 'http://172.18.115.27:3000'
const password = process.env.EDUVERSE_TEST_PASSWORD || 'Eduverse123!'
const outputDir = process.env.EDUVERSE_OUTPUT_DIR || 'C:/Users/oh/AppData/Local/Temp/eduverse-validation'
await mkdir(outputDir, { recursive: true })

const browser = await chromium.connectOverCDP(process.env.EDUVERSE_CDP_URL || 'http://127.0.0.1:9222')
const results = []

async function login(role, email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  await page.goto(`${baseURL}/login?role=${role}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.getByLabel('邮箱').first().fill(email)
  await page.getByLabel('密码').first().fill(password)
  await Promise.all([
    page.waitForURL(new RegExp(`/${role}/dashboard`), { timeout: 30_000 }),
    page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click(),
  ])
  await page.waitForLoadState('networkidle')
  return { context, page, errors }
}

function luminance([r, g, b]) {
  const values = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  return match ? match.slice(1, 4).map(Number) : null
}

async function lowContrastButtons(page) {
  const rows = await page.locator('button:visible').evaluateAll((buttons) => buttons.map((button) => {
    const foreground = getComputedStyle(button).color
    let node = button
    let background = 'rgba(0, 0, 0, 0)'
    while (node) {
      const candidate = getComputedStyle(node).backgroundColor
      if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') { background = candidate; break }
      node = node.parentElement
    }
    return { text: button.textContent?.trim().replace(/\s+/g, ' ') || '', foreground, background, disabled: button.disabled }
  }))
  return rows.flatMap((row) => {
    const fg = parseRgb(row.foreground)
    const bg = parseRgb(row.background)
    if (!fg || !bg) return []
    const ratio = (Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05)
    return !row.disabled && row.text && ratio < 3 ? [{ ...row, ratio: Number(ratio.toFixed(2)) }] : []
  })
}

try {
  const teacher = await login('teacher', 'teacher@eduverse.local')
  const teacherClasses = await teacher.page.evaluate(async () => (await fetch('/api/classes').then((response) => response.json())).data.classes)
  if (!teacherClasses.length) throw new Error('Teacher has no real class records for smoke test')
  const classId = process.argv[2] || process.env.EDUVERSE_CLASS_ID || teacherClasses[0].id
  await teacher.page.goto(`${baseURL}/teacher/class/${classId}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await teacher.page.getByRole('button', { name: '发起测验' }).click()
  await teacher.page.getByRole('tab', { name: '手动出题' }).click()
  const emptyEditor = await teacher.page.getByText('编辑器为空，请点击“添加题目”开始出题。').isVisible()
  const filesStatus = await teacher.page.evaluate(async (id) => {
    const response = await fetch(`/api/classes/${id}/files`)
    return { status: response.status, body: await response.json() }
  }, classId)
  const aiStatus = await teacher.page.evaluate(async () => fetch('/api/ai/status').then((response) => response.json()))
  const contrast = await lowContrastButtons(teacher.page)
  await teacher.page.screenshot({ path: `${outputDir}/teacher-class-light-ui.png`, fullPage: true })
  await teacher.page.keyboard.press('Escape')
  await teacher.page.goto(`${baseURL}/teacher/class/${classId}/analytics`, { waitUntil: 'networkidle', timeout: 30_000 })
  const analyticsIsFactual = await teacher.page.getByText('仅展示数据库中已有的课堂、出勤、互动和成绩记录。', { exact: false }).isVisible()
  await teacher.page.screenshot({ path: `${outputDir}/teacher-analytics.png`, fullPage: true })
  results.push({ role: 'teacher', classId, emptyEditor, filesStatus: filesStatus.status, aiConfigured: aiStatus.data?.configured, analyticsIsFactual, lowContrastButtons: contrast, errors: teacher.errors })

  const student = await login('student', 'student@eduverse.local')
  await student.page.goto(`${baseURL}/student/class/${classId}`, { waitUntil: 'networkidle', timeout: 30_000 })
  const studentText = await student.page.locator('body').innerText()
  await student.page.screenshot({ path: `${outputDir}/student-class-light-ui.png`, fullPage: true })
  results.push({ role: 'student', containsPresetQuiz: /固定三道题|示例测验|测试题/.test(studentText), lowContrastButtons: await lowContrastButtons(student.page), errors: student.errors })

  await teacher.page.goto(`${baseURL}/teacher/class/${classId}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await student.page.getByRole('button', { name: '举手', exact: true }).click()
  await teacher.page.getByRole('button', { name: /辅导队列 \(1\)/ }).waitFor({ timeout: 10_000 })
  await teacher.page.getByRole('button', { name: /辅导队列 \(1\)/ }).click()
  await teacher.page.getByRole('button', { name: '开始辅导' }).click()
  await Promise.all([
    teacher.page.getByText('私密辅导会话已建立，但音视频服务尚未配置。', { exact: false }).waitFor({ timeout: 10_000 }),
    student.page.getByText('私密辅导会话已建立，但音视频服务尚未配置。', { exact: false }).waitFor({ timeout: 10_000 }),
  ])
  await teacher.page.getByRole('button', { name: '结束辅导' }).click()
  results[0].privateTutoring = true
  await teacher.page.getByRole('button', { name: '结束课堂' }).click()
  await teacher.page.getByText('本节课堂已结束，出勤记录已结算').waitFor({ timeout: 10_000 })
  results[0].classEnded = true

  const parent = await login('parent', 'parent@eduverse.local')
  const parentText = await parent.page.locator('body').innerText()
  await parent.page.screenshot({ path: `${outputDir}/parent-dashboard.png`, fullPage: true })
  results.push({ role: 'parent', hasEmptyOrRealChildState: /暂无|孩子|课堂|成绩/.test(parentText), containsFabricatedFocus: /专注度|参与评分/.test(parentText), errors: parent.errors })

  await Promise.all([teacher.context.close(), student.context.close(), parent.context.close()])
  console.log(JSON.stringify({ ok: results.every((item) => item.errors.length === 0), results }, null, 2))
} finally {
  await browser.close()
}
