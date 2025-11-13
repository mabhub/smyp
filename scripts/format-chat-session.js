#!/usr/bin/env node
/**
 * @file format-chat-session.js
 * @description Raw chat session formatting and cleaning script.
 *
 * Transforms a raw Markdown file containing a chat session into a structured
 * and readable document with:
 * - YAML frontmatter with metadata
 * - Visually distinct sections for prompts/responses/actions
 * - Simplified file paths
 * - HTML comments to preserve technical metadata
 * - Idempotent execution (can be re-run without altering already processed content)
 *
 * @usage node scripts/format-chat-session.js <input-file> [output-file]
 * @example node scripts/format-chat-session.js prompts/session.md prompts/session-formatted.md
 */

import { basename } from 'path';
import { TEXTS } from './lib/constants.js';
import {
  isAlreadyProcessed,
  extractProjectRoot,
  extractUserIdentifier,
  parseContent,
  mergeSections,
} from './lib/parsers.js';
import { formatSection, generateFrontmatter } from './lib/formatters.js';
import {
  compose,
  ensureMarkdownSpacing,
  removeTrailingSpaces,
  cleanExcessiveLineBreaks,
} from './lib/transformers.js';
import { readStdin, isStdinPiped, safeReadFile, safeWriteFile } from './lib/io.js';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Processes raw chat session content into formatted markdown
 * @param {string} content - Raw content to process
 * @param {object} options - Processing options
 * @param {boolean} [options.force=false] - Force reprocessing even if already processed
 * @param {boolean} [options.silent=false] - Suppress console output
 * @param {string} [options.inputFile='stdin'] - Input file name for metadata
 * @returns {string} Formatted content
 */
const processContent = (content, { force = false, silent = false, inputFile = 'stdin' } = {}) => {
  const log = silent ? () => {} : console.log;
  const logError = silent ? () => {} : console.error;

  // Check if already processed
  if (isAlreadyProcessed(content) && !force) {
    log(TEXTS.ALREADY_PROCESSED);
    return content;
  }

  // If force and already processed, remove existing frontmatter
  if (isAlreadyProcessed(content) && force) {
    content = content.replace(/^---[\s\S]*?---\n\n/, '');
    log('🔄 Forced reprocessing: existing frontmatter removed.');
  }

  // Extract root path
  const projectRoot = extractProjectRoot(content);
  log(`${TEXTS.DETECTED_PROJECT_ROOT} ${projectRoot || 'None'}`);

  // Extract user identifier
  const userIdentifier = extractUserIdentifier(content);
  if (!userIdentifier) {
    logError(TEXTS.NO_USER_ID);
    if (!silent) process.exit(1);
    return null;
  }
  log(`${TEXTS.DETECTED_USER_ID} ${userIdentifier}`);

  // Parse content
  log(TEXTS.ANALYZING_CONTENT);
  let sections = parseContent(content, userIdentifier);
  log(`   ${TEXTS.FOUND_SECTIONS} ${sections.length} ${TEXTS.SECTIONS_RAW}`);

  // Merge consecutive sections
  sections = mergeSections(sections);
  log(`   ${TEXTS.AFTER_MERGE} ${sections.length} ${TEXTS.SECTIONS}`);

  // Statistics
  const stats = {
    userPrompts: sections.filter(s => s.type === 'user-prompt').length,
    agentResponses: sections.filter(s => s.type === 'agent-response').length,
    agentActions: sections.filter(s => s.type === 'agent-action').length,
  };
  log(`   - ${stats.userPrompts} ${TEXTS.USER_PROMPTS}`);
  log(`   - ${stats.agentResponses} ${TEXTS.AGENT_RESPONSES}`);
  log(`   - ${stats.agentActions} ${TEXTS.ACTION_SEQUENCES}`);

  // Formatting
  log(TEXTS.FORMATTING_CONTENT);
  const frontmatter = generateFrontmatter({
    projectRoot,
    inputFile: basename(inputFile),
    processedDate: new Date().toISOString(),
  });

  const formattedSections = sections
    .map(section => formatSection(section, projectRoot))
    .join('');

  let formattedContent = frontmatter + formattedSections;

  // Apply Markdown linting rules
  formattedContent = compose(
    ensureMarkdownSpacing,
    removeTrailingSpaces,
    cleanExcessiveLineBreaks
  )(formattedContent);

  return formattedContent;
};

/**
 * Formats a chat session file
 * @param {object} options - Processing options
 * @param {string} options.inputFile - Input file path
 * @param {string} [options.outputFile] - Output file path
 * @param {boolean} [options.force=false] - Force reprocessing even if already processed
 */
const formatChatSession = ({ inputFile, outputFile, force = false }) => {
  try {
    // Read file
    const content = safeReadFile(inputFile);

    // Process content
    const formattedContent = processContent(content, {
      force,
      silent: false,
      inputFile,
    });

    if (!formattedContent) {
      process.exit(1);
    }

    // Write
    const output = outputFile || inputFile;
    safeWriteFile(output, formattedContent);
    console.log(`${TEXTS.FILE_SAVED} ${output}`);
  } catch (error) {
    console.error(`${TEXTS.ERROR_PROCESSING} ${error.message}`);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
};// ============================================================================
// CLI
// ============================================================================

const main = async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  // Check if stdin is being piped
  if (isStdinPiped() && args.length === 0) {
    // Stdin mode: read from stdin, write to stdout, silent
    try {
      const content = await readStdin();
      const formattedContent = processContent(content, {
        force,
        silent: true,
        inputFile: 'stdin',
      });

      if (!formattedContent) {
        process.exit(1);
      }

      process.stdout.write(formattedContent);
      process.exit(0);
    } catch (error) {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exit(1);
    }
    return;
  }

  // File mode: show help if no args
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${TEXTS.CLI_USAGE}

${TEXTS.CLI_DESC}

${TEXTS.CLI_ARGS}
  ${TEXTS.CLI_INPUT}
  ${TEXTS.CLI_OUTPUT}

${TEXTS.CLI_OPTIONS}
  ${TEXTS.CLI_FORCE}
  ${TEXTS.CLI_HELP}

${TEXTS.CLI_EXAMPLES}
  ${TEXTS.CLI_EX1}
  ${TEXTS.CLI_EX2}
  ${TEXTS.CLI_EX3}

Pipe mode:
  cat session.md | smyp > formatted.md
`);
    process.exit(0);
  }

  // File mode: process files
  const inputFile = args[0];
  const outputFile = args.find((arg, i) => i > 0 && !arg.startsWith('--'));

  formatChatSession({ inputFile, outputFile, force });
};

main();
