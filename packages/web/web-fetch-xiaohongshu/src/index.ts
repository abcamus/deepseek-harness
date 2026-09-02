/**
 * Xiaohongshu (Little Red Book) video direct link extractor tool.
 * Registers a `xiaohongshu_video_extract` tool on `ctx.tools` that fetches
 * a Xiaohongshu post page and extracts the direct video URL.
 *
 * @module @deepseek-ai/dsh-web-fetch-xiaohongshu
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { WebError } from '@deepseek-ai/dsh-web'
import type {} from '@deepseek-ai/dsh-web'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-fetch-xiaohongshu'

/** Services required before this plugin can register its tool. */
export const inject = ['tools', 'web']

/** Plugin config. */
export interface Config {
  /** Fetch timeout in milliseconds. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(30_000),
})

/**
 * Extract video direct link from Xiaohongshu page HTML.
 * Looks for common patterns: JSON-LD, meta tags, video player config.
 */
function extractVideoUrl(html: string): string | undefined {
  // Pattern 1: JSON-LD with video object
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch?.[1] !== undefined) {
    try {
      const data = JSON.parse(jsonLdMatch[1]) as Record<string, unknown>
      const video = data.embedUrl ?? data.contentUrl
      if (typeof video === 'string' && video.startsWith('http')) return video
    } catch { /* ignore parse errors */ }
  }

  // Pattern 2: meta video tag
  const metaVideoMatch = html.match(/<meta[^>]*property="og:video(?::url)?"[^>]*content="([^"]+)"/i)
    ?? html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:video(?::url)?"/i)
  if (metaVideoMatch?.[1] !== undefined) return metaVideoMatch[1]

  // Pattern 3: video src in player embed
  const videoSrcMatch = html.match(/<video[^>]*src="([^"]+\.(?:mp4|m3u8)[^"]*)"/i)
  if (videoSrcMatch?.[1] !== undefined) return videoSrcMatch[1]

  // Pattern 4: XHS player config in script (common pattern: "originVideoKey" or "videoUrl")
  const scriptMatch = html.match(/"originVideoKey"\s*:\s*"([^"]+)"/)
    ?? html.match(/"videoUrl"\s*:\s*"([^"]+)"/)
    ?? html.match(/"url"\s*:\s*"(https?:\/\/[^"]*\.mp4[^"]*)"/)
  if (scriptMatch?.[1] !== undefined) {
    const url = scriptMatch[1]
    return url.startsWith('http') ? url : `https:${url}`
  }

  // Pattern 5: xsec video URL in page data
  const xsecMatch = html.match(/(https?:\/\/[a-z0-9\-]+\.xhscdn\.com\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i)
  if (xsecMatch?.[1] !== undefined) return xsecMatch[1]

  return undefined
}

/**
 * Extract note ID from various Xiaohongshu URL formats.
 * Supports:
 * - https://www.xiaohongshu.com/explore/ID
 * - https://www.xiaohongshu.com/discovery/item/ID
 * - https://xhslink.com/xxx (short link, returns as-is)
 */
function parseNoteId(url: string): string | null {
  // Short link — return as-is, needs redirect resolution
  if (/xhslink\.com/i.test(url)) return url

  // Standard explore/discovery URL
  const match = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-f0-9]+)/i)
  return match?.[1] ?? null
}

/** Register the Xiaohongshu video extraction tool. */
export function apply(ctx: Context, config: Config): void {
  const timeoutMs = config.timeoutMs ?? 30_000

  ctx.tools.register(defineTool({
    name: 'xiaohongshu_video_extract',
    description:
      'Extract the direct video download URL from a Xiaohongshu (Little Red Book) post link. '
      + 'Returns the video direct link (.mp4) that can be used for download or playback.',
    parameters: {
      url: {
        type: 'string',
        // required: true,
        description: 'The Xiaohongshu post URL (e.g. https://www.xiaohongshu.com/explore/xxx)',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          videoUrl: { type: 'string', description: 'Direct video URL (.mp4)' },
          noteId: { type: 'string', description: 'Extracted note ID' },
          title: { type: 'string', description: 'Post title if found' },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `**Video URL:** ${value.videoUrl}\n${value.noteId !== undefined ? `**Note ID:** ${value.noteId}` : ''}${value.title !== undefined ? `\n**Title:** ${value.title}` : ''}` },
      ],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const url = args.url ?? ''
      if (!url.includes('xiaohongshu.com') && !url.includes('xhslink.com')) {
        throw new WebError('not a valid Xiaohongshu URL', 'WEB_FETCH_INVALID_URL')
      }

      const noteId = parseNoteId(url)

      // Fetch the page via ctx.web
      const result = await ctx.web.fetch({ url }, exec.signal)
      if (result.statusCode !== 200) {
        throw new WebError(`HTTP ${result.statusCode} fetching Xiaohongshu page`, 'WEB_PROVIDER_ERROR')
      }

      const html = result.body.content
      const videoUrl = extractVideoUrl(html)

      if (videoUrl === undefined) {
        throw new WebError(
          'could not extract video URL from this Xiaohongshu post; the post may not contain a video',
          'WEB_PROVIDER_ERROR',
        )
      }

      // Try to extract title
      const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
        ?? html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)

      return {
        videoUrl,
        ...(noteId !== null ? { noteId } : {}),
        ...(titleMatch?.[1] !== undefined ? { title: titleMatch[1] } : {}),
      }
    },
  }))
}
