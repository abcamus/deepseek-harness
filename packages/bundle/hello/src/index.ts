/**
 * @deepseek-ai/dsh-hello — a simple hello world DSH app that displays
 * hello, world. This bundle provides a minimal example of a DSH app
 * with command-line parsing and output.
 *
 * @module @deepseek-ai/dsh-hello
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'hello-runner'

/** Core services required before the hello runner can start. */
export const inject = ['helloStartup']

/** Plugin config: the message resolved from this app's injected startup service. */
export interface Config {
  /** The message to display. */
  message: string
}

/**
 * The hello runner plugin: displays the hello message to stdout.
 * @param ctx - plugin context carrying the startup service.
 */
export function apply(ctx: Context): void {
  const startup = ctx.get('helloStartup') as { message?: string } | undefined
  if (startup === undefined || startup.message === undefined) {
    console.log('Hello, World!')
    return
  }

  console.log(startup.message)
}
