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

import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MARKERS = {
  PROCESSED: '<!-- formatted-chat-session -->',
  USER_PROMPT: '<!-- user-prompt -->',
  AGENT_RESPONSE: '<!-- agent-response -->',
  AGENT_ACTION: '<!-- agent-action -->',
  CODE_BLOCK: '<!-- code-block -->',
  ORIGINAL_PATH: '<!-- original-path: ',
};

const VISUAL_MARKERS = {
  USER_PROMPT: '## 👤 User Prompt',
  AGENT_RESPONSE: '## 🤖 Response',
  AGENT_ACTION: '<details><summary>🔧 Technical Actions</summary>',
  AGENT_ACTION_END: '</details>',
};

// Display texts (for future i18n)
const TEXTS = {
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
const ACTION_PATTERNS = [
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

// Noise patterns to ignore (UI artifacts from long chat sessions)
const NOISE_PATTERNS = [
  /^Continue to iterate\?$/,
  /^\[object Object\]$/,
];

// Patterns for user prompts to ignore (continuation confirmations)
const IGNORE_USER_PROMPTS = [
  /^@agent Continue:/,
  /^Continue:/,
];

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Detects if the file has already been processed
 * @param {string} content - File content
 * @returns {boolean}
 */
const isAlreadyProcessed = (content) => {
  return content.includes(MARKERS.PROCESSED);
};

/**
 * Extracts the project root path from content
 * @param {string} content - File content
 * @returns {string|null} Detected root path or null
 */
const extractProjectRoot = (content) => {
  // Look for a file path in actions (with URL encoding handling)
  const match = content.match(/file:\/\/\/(.+?)[)#\s]/);
  if (match) {
    let fullPath = match[1];
    // Add leading slash if missing
    if (!fullPath.startsWith('/')) {
      fullPath = '/' + fullPath;
    }
    // Decode URL-encoded characters
    try {
      fullPath = decodeURIComponent(fullPath);
    } catch {
      // If decoding fails, keep the path as-is
    }
    // Break down the path: /home/user/folder/project/...
    const parts = fullPath.split('/').filter(Boolean);
    // Take the first 4 segments: home, user, folder, project
    if (parts.length >= 4) {
      return '/' + parts.slice(0, 4).join('/');
    }
  }


  return null;
};

/**
 * Detects the user identifier from content
 * Looks for patterns like "username:" at the start of a line
 * @param {string} content - File content
 * @returns {string|null} Detected user identifier or null
 */
const extractUserIdentifier = (content) => {
  // Look for pattern "something:" at the start of a line, followed by GitHub Copilot:
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Check if line starts with "word:" (user identifier with content or alone)
    const match = line.match(/^([a-zA-Z0-9_-]+):\s/);
    if (match) {
      const identifier = match[1];
      // Check if there's a "GitHub Copilot:" line somewhere after
      const hasAgentResponse = lines.slice(i + 1).some(l =>
        l.trim().startsWith('GitHub Copilot:')
      );
      if (hasAgentResponse) {
        return identifier;
      }
    }
  }
  return null;
};

/**
 * Adds forced line breaks (markdown) in the text
 * @param {string} text - Text to process
 * @returns {string} Text with forced line breaks
 */
const forceLineBreaks = (text) => {
  // Split into lines
  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Detect code blocks (with or without language specified)
    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    // Don't modify lines inside a code block
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Don't modify empty lines, headings, lists, tables, HTML comments, or indented lines
    if (trimmedLine === '' ||
        line.startsWith('#') ||
        line.startsWith('- ') ||
        line.startsWith('* ') ||
        line.match(/^\d+\. /) ||
        line.includes('|') ||  // Markdown tables
        trimmedLine.startsWith('<!--') ||  // HTML comments
        line.match(/^   /) ||  // 3+ spaces = indented code or part of a list
        line.match(/^\t/)) {   // Tabulation
      result.push(line);
      continue;
    }

    // Add two spaces at end of line if the next line is not empty
    // and is not a markdown structure (heading, list, code block, indented line)
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
    const nextTrimmed = nextLine.trim();
    const isNextLineEmpty = nextTrimmed === '';
    const isNextLineStructure = nextLine.startsWith('#') ||
                                nextLine.startsWith('- ') ||
                                nextLine.startsWith('* ') ||
                                nextLine.match(/^\d+\. /) ||
                                nextLine.includes('|') ||  // Markdown tables
                                nextTrimmed.startsWith('```') ||
                                nextLine.match(/^   /) ||
                                nextLine.match(/^\t/);

    if (!isNextLineEmpty && !isNextLineStructure) {
      result.push(line + '  ');
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
};

/**
 * Enlève les doubles espaces en fin de ligne lorsqu'il s'agit de la fin d'un paragraphe
 * (ligne seule ou dernière ligne avant une ligne vide ou la fin de fichier).
 * @param {string} text
 * @returns {string}
 */
/**
 * Cleans inappropriate trailing spaces
 * - Removes ALL single trailing spaces (always unnecessary)
 * - Removes double trailing spaces at end of paragraph (no hard break expected)
 * - Keeps double trailing spaces in the middle of a paragraph (legitimate hard break)
 */
const removeTrailingSpaces = (text) => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.endsWith(' ')) continue; // no trailing space

    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
    const nextTrimmed = nextLine.trim();

    // Case 1: single trailing space → always remove
    if (line.endsWith(' ') && !line.endsWith('  ')) {
      lines[i] = line.trimEnd();
    }
    // Case 2: double trailing space AND next line empty → remove (end of paragraph)
    else if (line.endsWith('  ') && nextTrimmed === '') {
      lines[i] = line.trimEnd();
    }
    // Case 3: double trailing space AND next line not empty → keep (legitimate hard break)
  }

  return lines.join('\n');
};

/**
 * Parses raw content into sections
 * @param {string} content - Raw content
 * @param {string} userIdentifier - User identifier to detect prompts
 * @returns {Array<{type: string, content: string, raw: string}>}
 */
const parseContent = (content, userIdentifier) => {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = { type: 'unknown', content: [], raw: '' };
  let inCodeBlock = false;
  let inAction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip noise patterns (UI artifacts from long sessions)
    if (NOISE_PATTERNS.some(pattern => pattern.test(line.trim()))) {
      continue;
    }

    // Detect code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentSection.content.push(line);
      continue;
    }

    if (inCodeBlock) {
      currentSection.content.push(line);
      continue;
    }

    // Detect user prompt (dynamic user identifier)
    if (line.startsWith(`${userIdentifier}:`)) {
      const promptContent = line.replace(`${userIdentifier}:`, '').trim();

      // Skip continuation prompts (UI artifacts)
      if (IGNORE_USER_PROMPTS.some(pattern => pattern.test(promptContent))) {
        continue;
      }

      if (currentSection.content.length > 0) {
        currentSection.raw = currentSection.content.join('\n');
        sections.push({ ...currentSection });
      }
      currentSection = {
        type: 'user-prompt',
        content: [promptContent],
        raw: '',
      };
      inAction = false; // Important: exit action mode
      continue;
    }

    // Detect agent response
    if (line.startsWith('GitHub Copilot:')) {
      if (currentSection.content.length > 0) {
        currentSection.raw = currentSection.content.join('\n');
        sections.push({ ...currentSection });
      }
      currentSection = {
        type: 'agent-response',
        content: [line.replace('GitHub Copilot:', '').trim()],
        raw: '',
      };
      inAction = false;
      continue;
    }

    // Detect technical actions
    const isAction = ACTION_PATTERNS.some(pattern => pattern.test(line));

    if (isAction && !inAction) {
      // Start of action sequence
      if (currentSection.type === 'agent-response' && currentSection.content.length > 0) {
        currentSection.raw = currentSection.content.join('\n');
        sections.push({ ...currentSection });
      }
      inAction = true;
      currentSection = {
        type: 'agent-action',
        content: [],
        actions: [],
        raw: '',
      };
    }

    if (inAction) {
      if (isAction) {
        currentSection.actions.push(line);
      } else if (line.trim() === '') {
        // Empty line - Continue accumulating actions (don't end the sequence)
        // We'll end when we encounter text or a new prompt/response
        continue;
      } else {
        // Normal text after actions - return to response mode
        if (currentSection.actions?.length > 0) {
          currentSection.content = currentSection.actions;
          currentSection.raw = currentSection.actions.join('\n');
          sections.push({ ...currentSection });
        }
        currentSection = {
          type: 'agent-response',
          content: [line],
          raw: '',
        };
        inAction = false;
      }
      continue;
    }

    // Add line to current content
    currentSection.content.push(line);
  }

  // Add last section
  if (currentSection.content.length > 0) {
    currentSection.raw = currentSection.content.join('\n');
    sections.push({ ...currentSection });
  }

  return sections;
};

/**
 * Extracts filename from a path
 * @param {string} path - Full path
 * @returns {string} Filename
 */
const extractFilename = (path) => {
  // Remove anchors and parameters
  const cleanPath = path.split(/[#?]/)[0];
  const parts = cleanPath.split('/');
  return parts[parts.length - 1] || path;
};

/**
 * Formats an action link with readable filename
 * @param {string} action - Raw action (e.g., "Read [](file:///path)")
 * @param {string} projectRoot - Project root
 * @returns {string} Formatted action
 */
const formatActionLink = (action, projectRoot) => {
  let formatted = action;

  // Simplify paths and add filenames
  if (projectRoot) {
    formatted = formatted.replace(
      /(\w+) \[\]\((file:\/\/\/[^)#\s]+)/g,
      (match, actionType, fileUrl) => {
        try {
          const pathMatch = fileUrl.match(/file:\/\/\/(.+)/);
          if (pathMatch) {
            let path = pathMatch[1];
            if (!path.startsWith('/')) {
              path = '/' + path;
            }
            try {
              path = decodeURIComponent(path);
            } catch {
              // Keep path as-is
            }

            const filename = extractFilename(path);
            const simplifiedPath = path.startsWith(projectRoot)
              ? path.replace(projectRoot, '')
              : path;

            return `${actionType} [${filename}](${simplifiedPath}`;
          }
        } catch {
          // On error, return original match
        }
        return match;
      }
    );
  }

  return formatted;
};

/**
 * Formats context references (#file:, #sym:, etc.) with backticks and emojis
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
const formatContextReferences = (text) => {
  return text
    // #file:path → `📄 path`
    .replace(/#file:([^\s]+)/g, '`📄 $1`')
    // #folder:path or #dir:path → `📁 path`
    .replace(/#(?:folder|dir):([^\s]+)/g, '`📁 $1`')
    // #sym:symbol → `🔣 symbol`
    .replace(/#sym:([^\s]+)/g, '`🔣 $1`')
    // #selection → `🔎 selection`
    .replace(/#selection\b/g, '`🔎 selection`');
};

/**
 * Cleans excessive blank lines (max 2 consecutive)
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
const cleanExcessiveLineBreaks = (text) => {
  // Replace 3+ consecutive blank lines with exactly 2
  return text.replace(/\n{3,}/g, '\n\n');
};

/**
 * Ensures correct spacing around Markdown structures (linting)
 * @param {string} text - Text to format
 * @returns {string} Text with correct spacing
 */
const ensureMarkdownSpacing = (text) => {
  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const prevLine = i > 0 ? lines[i - 1] : '';
    const prevTrimmed = prevLine.trim();

    // Detect headings (# to ######)
    const isHeading = /^#{1,6}\s/.test(trimmedLine);

    // Detect the FIRST element of a list (not in an already started list)
    const isListItem = /^[-*]\s/.test(trimmedLine) || /^\d+\.\s/.test(trimmedLine);
    const prevIsListItem = /^[-*]\s/.test(prevTrimmed) || /^\d+\.\s/.test(prevTrimmed);
    const isListStart = isListItem && !prevIsListItem && prevTrimmed !== ''; // Don't detect as start if preceded by empty line

    // Detect code blocks (opening or closing)
    const isCodeBlockMarker = trimmedLine.startsWith('```');
    const prevIsCodeBlockMarker = prevTrimmed.startsWith('```');

    // Check if we're in a context that needs a double line break before
    const needsDoubleLineBreak = (isHeading || isListStart || isCodeBlockMarker) &&
                                 prevTrimmed !== '' &&
                                 !prevTrimmed.startsWith('---') && // Not after frontmatter
                                 !prevTrimmed.startsWith('<!--') && // Not after HTML comment
                                 !prevIsCodeBlockMarker; // Not right after another code block marker

    // Add empty line if necessary
    if (needsDoubleLineBreak) {
      result.push('');
    }

    result.push(line);

    // Add empty line AFTER a heading if the next line is not empty
    if (isHeading) {
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      if (nextLine.trim() !== '') {
        result.push('');
      }
    }
  }

  return result.join('\n');
};

/**
 * Merges consecutive sections between user prompts
 * @param {Array} sections - Sections to merge
 * @returns {Array} Merged sections
 */
const mergeSections = (sections) => {
  const merged = [];
  let i = 0;

  while (i < sections.length) {
    const section = sections[i];

    if (section.type === 'user-prompt') {
      // Add the prompt
      merged.push(section);
      i++;

      // Collect all responses and actions until the next prompt
      const agentContent = [];
      while (i < sections.length && sections[i].type !== 'user-prompt') {
        agentContent.push(sections[i]);
        i++;
      }

      // Merge into a single "agent-response" section with interspersed actions
      if (agentContent.length > 0) {
        const fusedContent = [];
        const fusedActions = [];

        for (const item of agentContent) {
          if (item.type === 'agent-response') {
            const text = Array.isArray(item.content) ? item.content.join('\n') : item.content;
            fusedContent.push(text);
          } else if (item.type === 'agent-action') {
            // Mark the action location
            fusedContent.push(`__ACTION_PLACEHOLDER_${fusedActions.length}__`);
            fusedActions.push(item);
          }
        }

        // Create the merged section
        merged.push({
          type: 'agent-response',
          content: fusedContent,
          actions: fusedActions,
        });
      }
    } else {
      // Orphan section (shouldn't happen)
      merged.push(section);
      i++;
    }
  }

  return merged;
};

/**
 * Formats a section into enhanced Markdown
 * @param {object} section - Section to format
 * @param {string} projectRoot - Project root
 * @returns {string} Formatted Markdown
 */
const formatSection = (section, projectRoot) => {
  const { type, content, actions } = section;

  switch (type) {
    case 'user-prompt': {
      const promptText = Array.isArray(content) ? content.join('\n') : (content || '');
      const withContextFormatted = formatContextReferences(promptText);
      const formattedText = forceLineBreaks(withContextFormatted);
      return `${MARKERS.USER_PROMPT}
${VISUAL_MARKERS.USER_PROMPT}

${formattedText}

`;
    }

    case 'agent-response': {
      let responseText = Array.isArray(content) ? content.join('\n\n') : (content || '');

      // If actions are present, replace placeholders
      if (actions?.length > 0) {
        actions.forEach((actionSection, index) => {
          if (!actionSection) return;

          const actionContent = Array.isArray(actionSection.content)
            ? actionSection.content
            : [actionSection.content || ''];

          const formattedActions = actionContent
            .filter(action => action) // Filter null/undefined values
            .map(action => {
              const formatted = formatActionLink(action, projectRoot);
              return `- ${formatted}`;
            })
            .join('\n');

          const actionBlock = `

${MARKERS.AGENT_ACTION}
${VISUAL_MARKERS.AGENT_ACTION}

${formattedActions}

${VISUAL_MARKERS.AGENT_ACTION_END}

`;

          responseText = responseText.replace(
            `__ACTION_PLACEHOLDER_${index}__`,
            actionBlock
          );
        });
      }

      const withContextFormatted = formatContextReferences(responseText);
      const formattedText = forceLineBreaks(withContextFormatted);

      return `${MARKERS.AGENT_RESPONSE}
${VISUAL_MARKERS.AGENT_RESPONSE}

${formattedText}

`;
    }

    case 'agent-action': {
      // This case shouldn't happen anymore with the new merge
      const actionsList = Array.isArray(content) ? content : [content];
      const formattedActions = actionsList
        .filter(action => action) // Filter null/undefined values
        .map(action => {
          const formatted = formatActionLink(action, projectRoot);
          return `- ${formatted}`;
        })
        .join('\n');

      return `${MARKERS.AGENT_ACTION}
${VISUAL_MARKERS.AGENT_ACTION}

${formattedActions}

${VISUAL_MARKERS.AGENT_ACTION_END}

`;
    }

    default:
      return (section.raw || '') + '\n\n';
  }
};

/**
 * Generates YAML frontmatter
 * @param {object} options - Generation options
 * @returns {string} YAML frontmatter
 */
const generateFrontmatter = ({ projectRoot, inputFile, processedDate }) => {
  return `---
type: chat-session
projectRoot: ${projectRoot || 'N/A'}
sourceFile: ${inputFile}
processedDate: ${processedDate}
---
${MARKERS.PROCESSED}

`;
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Formats a chat session file
 * @param {object} options - Processing options
 * @param {string} options.inputFile - Input file path
 * @param {string} [options.outputFile] - Output file path
 * @param {boolean} [options.force=false] - Force reprocessing even if already processed
 */
const formatChatSession = ({ inputFile, outputFile, force = false }) => {
  // Read file
  const inputPath = resolve(inputFile);
  let content = readFileSync(inputPath, 'utf-8');

  // Check if already processed
  if (isAlreadyProcessed(content) && !force) {
    console.log(TEXTS.ALREADY_PROCESSED);
    return;
  }

  // If force and already processed, remove existing frontmatter
  if (isAlreadyProcessed(content) && force) {
    // Remove everything from start to end of frontmatter
    content = content.replace(/^---[\s\S]*?---\n\n/, '');
    console.log('🔄 Forced reprocessing: existing frontmatter removed.');
  }

  // Extract root path
  const projectRoot = extractProjectRoot(content);
  console.log(`${TEXTS.DETECTED_PROJECT_ROOT} ${projectRoot || 'None'}`);

  // Extract user identifier
  const userIdentifier = extractUserIdentifier(content);
  if (!userIdentifier) {
    console.error(TEXTS.NO_USER_ID);
    process.exit(1);
  }
  console.log(`${TEXTS.DETECTED_USER_ID} ${userIdentifier}`);

  // Parse content
  console.log(TEXTS.ANALYZING_CONTENT);
  let sections = parseContent(content, userIdentifier);
  console.log(`   ${TEXTS.FOUND_SECTIONS} ${sections.length} ${TEXTS.SECTIONS_RAW}`);

  // Merge consecutive sections
  sections = mergeSections(sections);
  console.log(`   ${TEXTS.AFTER_MERGE} ${sections.length} ${TEXTS.SECTIONS}`);

  // Statistics
  const stats = {
    userPrompts: sections.filter(s => s.type === 'user-prompt').length,
    agentResponses: sections.filter(s => s.type === 'agent-response').length,
    agentActions: sections.filter(s => s.type === 'agent-action').length,
  };
  console.log(`   - ${stats.userPrompts} ${TEXTS.USER_PROMPTS}`);
  console.log(`   - ${stats.agentResponses} ${TEXTS.AGENT_RESPONSES}`);
  console.log(`   - ${stats.agentActions} ${TEXTS.ACTION_SEQUENCES}`);

  // Formatting
  console.log(TEXTS.FORMATTING_CONTENT);
  const frontmatter = generateFrontmatter({
    projectRoot,
    inputFile: basename(inputPath),
    processedDate: new Date().toISOString(),
  });

  const formattedSections = sections
    .map(section => formatSection(section, projectRoot))
    .join('');

  let formattedContent = frontmatter + formattedSections;

  // Apply Markdown linting rules
  formattedContent = ensureMarkdownSpacing(formattedContent);
  // Clean trailing spaces (single always, double at end of paragraph)
  formattedContent = removeTrailingSpaces(formattedContent);
  // Clean excessive blank lines

  // Clean excessive blank lines
  formattedContent = cleanExcessiveLineBreaks(formattedContent);

  // Write
  const output = outputFile ? resolve(outputFile) : inputPath;
  writeFileSync(output, formattedContent, 'utf-8');
  console.log(`${TEXTS.FILE_SAVED} ${output}`);
};

// ============================================================================
// CLI
// ============================================================================

const main = () => {
  const args = process.argv.slice(2);

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
`);
    process.exit(0);
  }

  const inputFile = args[0];
  const force = args.includes('--force');
  const outputFile = args.find((arg, i) => i > 0 && !arg.startsWith('--'));

  try {
    formatChatSession({ inputFile, outputFile, force });
  } catch (error) {
    console.error(`${TEXTS.ERROR_PROCESSING} ${error.message}`);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

main();
