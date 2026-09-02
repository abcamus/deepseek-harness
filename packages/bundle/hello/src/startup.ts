/**
 * The hello app's command-line provider: it parses the --help flag and
 * publishes the hello startup service.
 * @module @deepseek-ai/dsh-hello/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'hello-startup'

/** Services required before the hello startup can resolve. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the hello runner. */
export const HELLO_STARTUP_SERVICE = 'helloStartup'

/** What the hello runner reads from {@link HELLO_STARTUP_SERVICE}. */
export interface HelloStartupValues {
  /** The message to display. */
  message: string
}

/**
 * This app's command: the message positional, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function helloCommand(): Command {
  return new Command()
    .name('dsh hello')
    .description('Display hello, world with an optional custom message.')
    .helpOption('-h, --help', 'show this help')
    .option('--message <text>', 'custom message to display', 'Hello, World!')
    .addHelpText('after', `
Examples:
  dsh hello                           display "Hello, World!"
  dsh hello --message "Hi there!"     display "Hi there!"
`)
}

/**
 * Parse and provide the hello message as an ordinary Cordis service.
 * The command's action publishes the message; a missing or whitespace-only
 * message defaults to "Hello, World!".
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = helloCommand()
  program.action(() => {
    const message = program.opts<{ message?: string }>().message ?? 'Hello, World!'
    ctx.provide(HELLO_STARTUP_SERVICE, { message } satisfies HelloStartupValues)
  })
  parseCmdline(ctx, program)
  console.log('Hello, startup.')
}
