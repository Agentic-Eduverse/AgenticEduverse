/**
 * Looks up third-party explanation videos for a knowledge point.
 *
 * There is no public API for this: Bilibili's open-platform search needs enterprise credentials
 * and `api.bilibili.com/x/web-interface/wbi/search/type` rejects unsigned calls with a 412
 * risk-control page. The HTML search page, however, is server-rendered and carries the whole
 * result set (`bili-video-card` blocks with BV id, cover, title, duration and uploader), so it
 * is fetched and parsed here.
 *
 * Trade-off to keep in mind: this is scraping, so a markup change on their side breaks it. All
 * parsing lives in `parseVideoCards`, which is the only place that needs updating when it does.
 */

export interface ExplanationVideo {
  id: string
  title: string
  url: string
  cover: string | null
  duration: string | null
  author: string | null
  source: 'bilibili'
}

// The `/video` tab renders a different card markup that this parser does not recognise; `/all`
// is the one that server-renders real `bili-video-card` blocks (42 of them for a typical query).
const SEARCH_ENDPOINT = 'https://search.bilibili.com/all'
const REQUEST_TIMEOUT_MS = 8_000
const CACHE_TTL_MS = 30 * 60 * 1000
const CACHE_MAX_ENTRIES = 200
const MAX_QUERY_CHARS = 40

/**
 * Titles that are advertising, off-topic or unsuitable for a classroom. Deliberately small and
 * conservative - it removes obvious junk without pretending to be a moderation system. Anything
 * stricter (allow-listing uploaders, age-appropriate review) is a product decision, not a filter
 * tweak.
 */
const BLOCKED_TITLE_PATTERNS = [
  /微信|加群|私信|扫码|点击链接|免费领取|限时优惠/,
  /代写|代做|兼职|招聘|刷单|返现/,
  /成人|彩票|赌|博彩|小说|漫画|游戏代练/,
]

const QUESTION_WORDS = /^(请问|我想问|想问|什么是|什么叫|怎么|怎样|为什么|如何|请|帮我|讲解一下|解释一下|一下)|[?？!！。，,、\s]+$/g

interface CacheEntry { at: number; videos: ExplanationVideo[] }
const cache = new Map<string, CacheEntry>()

/** Reduces "什么是分数的意义？" to "分数的意义" so the result order can favour on-topic titles. */
export function coreTerm(raw: string): string {
  return raw.replace(QUESTION_WORDS, '').trim().slice(0, MAX_QUERY_CHARS)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function normalizedTitle(value: string): string {
  return decodeEntities(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Splits the page on its card wrapper and pulls the fields out of each block. Returns every
 * video it can find, in the platform's own relevance order.
 */
export function parseVideoCards(html: string): ExplanationVideo[] {
  const videos: ExplanationVideo[] = []
  const seen = new Set<string>()

  for (const chunk of html.split('bili-video-card__wrap')) {
    const bvid = chunk.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]{10})/)
    if (!bvid || seen.has(bvid[1])) continue
    const alt = chunk.match(/<img[^>]+alt="([^"]{2,160})"/)
    if (!alt) continue
    const title = normalizedTitle(alt[1])
    if (!title) continue

    const cover = chunk.match(/<img[^>]+src="(\/\/[^"]+?)"[^>]*alt=/)
    const duration = chunk.match(/bili-video-card__stats__duration[^>]*>([^<]{2,12})</)
    const author = chunk.match(/bili-video-card__info--author[^>]*>([^<]{1,60})</)

    seen.add(bvid[1])
    videos.push({
      id: bvid[1],
      title,
      url: `https://www.bilibili.com/video/${bvid[1]}`,
      cover: cover ? `https:${cover[1]}` : null,
      duration: duration ? duration[1] : null,
      author: author ? normalizedTitle(author[1]) : null,
      source: 'bilibili',
    })
  }

  return videos
}

/** Keeps the platform's ordering inside each group; only lifts on-topic titles to the front. */
function preferOnTopic(videos: ExplanationVideo[], term: string): ExplanationVideo[] {
  if (!term) return videos
  const onTopic = videos.filter((video) => video.title.includes(term))
  const rest = videos.filter((video) => !video.title.includes(term))
  return [...onTopic, ...rest]
}

async function fetchSearchPage(query: string): Promise<string> {
  const response = await fetch(`${SEARCH_ENDPOINT}?keyword=${encodeURIComponent(query)}`, {
    headers: {
      // The page is served differently to unknown clients; a normal desktop UA gets the
      // server-rendered result set.
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'accept-language': 'zh-CN,zh;q=0.9',
      accept: 'text/html,application/xhtml+xml',
      referer: 'https://www.bilibili.com/',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`VIDEO_SEARCH_HTTP_${response.status}`)
  return response.text()
}

/**
 * Returns up to `limit` videos for a knowledge point. Never throws: a source that is down or
 * blocked just yields an empty list, because the chat reply must not depend on it.
 */
export async function searchExplanationVideos(rawQuery: string, limit = 5): Promise<ExplanationVideo[]> {
  const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS)
  if (query.length < 2) return []

  const cacheKey = `${query}::${limit}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.videos

  let html = ''
  try {
    html = await fetchSearchPage(query)
  } catch (error) {
    console.warn('[video-search] fetch failed:', error instanceof Error ? error.message : error)
    return []
  }

  const parsed = parseVideoCards(html).filter(
    (video) => !BLOCKED_TITLE_PATTERNS.some((pattern) => pattern.test(video.title))
  )
  const videos = preferOnTopic(parsed, coreTerm(query)).slice(0, limit)

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now - entry.at >= CACHE_TTL_MS) cache.delete(key)
    }
  }
  cache.set(cacheKey, { at: Date.now(), videos })

  return videos
}
