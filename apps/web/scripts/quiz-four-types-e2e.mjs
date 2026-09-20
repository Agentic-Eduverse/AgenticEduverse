import playwright from 'file:///C:/Users/oh/AppData/Local/Temp/eduverse-playwright/node_modules/playwright-core/index.js'

const { chromium } = playwright
const baseURL = process.env.EDUVERSE_BASE_URL || 'http://172.18.115.27:3000'
const password = process.env.EDUVERSE_TEST_PASSWORD || 'Eduverse123!'
const classId = process.argv[2]
if (!classId) throw new Error('Pass an enrolled class ID')

const browser = await chromium.connectOverCDP(process.env.EDUVERSE_CDP_URL || 'http://127.0.0.1:9222')
const errors = []

async function login(role, email) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`${role} pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${role} console: ${message.text()}`) })
  page.on('response', async (response) => {
    if (response.url().includes('/api/quiz') && !response.ok()) errors.push(`${role} ${response.status()} ${response.url()}: ${await response.text().catch(() => '')}`)
  })
  await page.goto(`${baseURL}/login?role=${role}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.getByLabel('邮箱').first().fill(email)
  await page.getByLabel('密码').first().fill(password)
  await Promise.all([
    page.waitForURL(new RegExp(`/${role}/dashboard`), { timeout: 30_000 }),
    page.locator('form').first().getByRole('button', { name: '登录', exact: true }).click(),
  ])
  await page.waitForLoadState('networkidle')
  return { context, page }
}

async function addQuestion(dialog, input) {
  await dialog.getByRole('button', { name: '添加题目' }).click()
  const section = dialog.locator('section').last()
  await section.locator('select').selectOption(input.type)
  await section.getByPlaceholder('题干').fill(input.text)
  if (input.type === 'short_answer') {
    await section.getByPlaceholder('参考答案').fill(input.answer)
  } else {
    const optionInputs = section.locator('input[placeholder^="选项"]')
    for (let index = 0; index < input.options.length; index += 1) await optionInputs.nth(index).fill(input.options[index])
    const selectors = section.locator(input.type === 'multiple_choice' ? 'input[type="checkbox"]' : 'input[type="radio"]')
    for (const index of input.correct) await selectors.nth(index).check()
  }
  await section.getByLabel('题目分值').fill(String(input.points))
  await section.getByPlaceholder('答案解析（可选）').fill(input.explanation)
}

try {
  const teacher = await login('teacher', 'teacher@eduverse.local')
  const student = await login('student', 'student@eduverse.local')
  await teacher.page.goto(`${baseURL}/teacher/class/${classId}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await student.page.goto(`${baseURL}/student/class/${classId}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await teacher.page.getByRole('button', { name: '发起测验' }).click()
  const manager = teacher.page.getByRole('dialog')
  await manager.getByRole('tab', { name: '手动出题' }).click()
  const title = `四题型回归-${Date.now()}`
  await manager.getByPlaceholder('测验标题').fill(title)
  await addQuestion(manager, { type: 'single_choice', text: '单选：选择甲', options: ['甲', '乙', '丙', '丁'], correct: [0], points: 2, explanation: '单选解析' })
  await addQuestion(manager, { type: 'multiple_choice', text: '多选：选择甲和乙', options: ['甲', '乙', '丙', '丁'], correct: [0, 1], points: 3, explanation: '多选解析' })
  await addQuestion(manager, { type: 'true_false', text: '判断：此陈述正确', options: ['正确', '错误'], correct: [0], points: 1, explanation: '判断解析' })
  await addQuestion(manager, { type: 'short_answer', text: '简答：输入 EduVerse', options: [], correct: [], answer: 'EduVerse', points: 4, explanation: '简答解析' })
  await manager.getByRole('button', { name: '保存并发起' }).click()

  const studentDialog = student.page.getByRole('dialog')
  await studentDialog.getByText(title).waitFor({ timeout: 20_000 })
  await studentDialog.getByText('甲', { exact: true }).click()
  await studentDialog.getByRole('button', { name: '下一题' }).click()
  await studentDialog.getByText('甲', { exact: true }).click()
  await studentDialog.getByText('乙', { exact: true }).click()
  const multiHint = await studentDialog.getByText('本题可选择多个答案').isVisible()
  await studentDialog.getByRole('button', { name: '下一题' }).click()
  await studentDialog.getByText('正确', { exact: true }).click()
  await studentDialog.getByRole('button', { name: '下一题' }).click()
  await studentDialog.getByPlaceholder('输入你的答案').fill('eduverse')
  await studentDialog.getByRole('button', { name: '提交答案' }).click()
  await studentDialog.getByText('答案已提交，等待教师结束测验后公布结果。').waitFor({ timeout: 10_000 })

  const teacherDialog = teacher.page.getByRole('dialog')
  await teacherDialog.getByRole('button', { name: '提前结束' }).click()
  await student.page.getByText('你的成绩').waitFor({ timeout: 20_000 })
  const scoreVisible = await student.page.getByText('100 分', { exact: true }).isVisible()
  const explanations = await student.page.getByText(/解析：/).count()
  await teacher.page.getByRole('button', { name: '结束课堂' }).click()

  await Promise.all([teacher.context.close(), student.context.close()])
  console.log(JSON.stringify({ ok: multiHint && scoreVisible && explanations === 4 && errors.length === 0, multiHint, scoreVisible, explanations, errors }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ errors }, null, 2))
  throw error
} finally {
  await browser.close()
}
