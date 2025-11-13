/**
 * @file constants.js
 * @description Configuration constants for chat session formatting
 */

export const MARKERS = {
  PROCESSED: '<!-- formatted-chat-session -->',
  USER_PROMPT: '<!-- user-prompt -->',
  AGENT_RESPONSE: '<!-- agent-response -->',
  AGENT_ACTION: '<!-- agent-action -->',
  CODE_BLOCK: '<!-- code-block -->',
  ORIGINAL_PATH: '<!-- original-path: ',
};

export const VISUAL_MARKERS = {
  USER_PROMPT: '## 👤 User Prompt',
  AGENT_RESPONSE: '## 🤖 Response',
  AGENT_ACTION: '<details><summary>🔧 Technical Actions</summary>',
  AGENT_ACTION_END: '</details>',
};

export const TEXTS = {
  // Console messages
  DETECTED_PROJECT_ROOT: '📁 Detected project root:',
  DETECTED_USER_ID: '👤 Detected user identifier:',
  ANALYZING_CONTENT: '🔍 Analyzing content...',
  FOUND_SECTIONS: '   Found:',
  SECTIONS_RAW: 'sections (raw)',
  AFTER_MERGE: '   After merge:',
  SECTIONS: 'sections',
  USER_PROMPTS: 'user prompts',
  AGENT_RESPONSES: 'agent responses',
  ACTION_SEQUENCES: 'action sequences',
  FORMATTING_CONTENT: '✨ Formatting content...',
  FILE_SAVED: '✅ Formatted file saved:',

  // Error messages
  ALREADY_PROCESSED: '⚠️  File already processed. Use --force to reprocess.',
  ERROR_PROCESSING: '❌ Error processing file:',
  NO_USER_ID: '❌ Could not detect user identifier in the file.\n' +
              '   Expected pattern: "username:" at the start of a line.\n' +
              '   Make sure the file contains user prompts in the format "username: <content>".',

  // CLI help
  CLI_USAGE: 'Usage: node scripts/format-chat-session.js <input-file> [output-file] [options]',
  CLI_DESC: 'Formats a raw chat session Markdown file into a structured and readable document.',
  CLI_ARGS: 'Arguments:',
  CLI_INPUT: '  <input-file>    Raw Markdown file to process (required)',
  CLI_OUTPUT: '  [output-file]   Output file (optional, overwrites input by default)',
  CLI_OPTIONS: 'Options:',
  CLI_FORCE: '  --force         Force reprocessing even if already formatted',
  CLI_HELP: '  --help, -h      Display this help',
  CLI_EXAMPLES: 'Examples:',
  CLI_EX1: '  node scripts/format-chat-session.js prompts/session.md',
  CLI_EX2: '  node scripts/format-chat-session.js prompts/session.md prompts/formatted.md',
  CLI_EX3: '  node scripts/format-chat-session.js prompts/session.md --force',
};

// Technical actions to detect and condense
export const ACTION_PATTERNS = [
  /^Read \[\]\(file:\/\/(.+?)\)/,
  /^Created \[\]\(file:\/\/(.+?)\)/,
  /^Using "Replace String in File"/,
  /^Searched text for/,
  /^Updated todo list/,
  /^Completed \(\d+\/\d+\)/,
  /^Made changes\./,
  /^Summarized conversation history/,
  /^Created \d+ todos/,
];

// Pattern to detect terminal commands (kept visible in response flow)
export const TERMINAL_COMMAND_PATTERN = /^Ran terminal command: (.+)$/;

// Noise patterns to ignore (UI artifacts from long chat sessions)
export const NOISE_PATTERNS = [
  /^Continue to iterate\?$/,
  /^\[object Object\]$/,
];

// Patterns for user prompts to ignore (continuation confirmations)
export const IGNORE_USER_PROMPTS = [
  /^@agent Continue:/,
  /^Continue:/,
];
