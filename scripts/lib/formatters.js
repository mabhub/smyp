/**
 * @file formatters.js
 * @description Formatting functions for chat session content
 */

import { MARKERS, VISUAL_MARKERS, TERMINAL_COMMAND_PATTERN } from './constants.js';
import { compose, shiftHeadingLevels, forceLineBreaks } from './transformers.js';

/**
 * Extracts filename from a path
 * @param {string} path - Full path
 * @returns {string} Filename
 */
const extractFilename = (path) => {
  const cleanPath = path.split(/[#?]/)[0];
  const parts = cleanPath.split('/');
  return parts[parts.length - 1] || path;
};

/**
 * Safely decodes a URI component
 * @param {string} uri - URI to decode
 * @returns {string} Decoded URI or original if decoding fails
 */
const safeDecodeURI = (uri) => {
  try {
    return decodeURIComponent(uri);
  } catch {
    console.warn(`Failed to decode URI: ${uri}`);
    return uri;
  }
};

/**
 * Formats an action link with readable filename
 * @param {string} action - Raw action (e.g., "Read [](file:///path)")
 * @param {string} projectRoot - Project root
 * @returns {string} Formatted action
 */
export const formatActionLink = (action, projectRoot) => {
  if (!projectRoot) return action;

  return action.replace(
    /(\w+) \[\]\((file:\/\/\/[^)#\s]+)/g,
    (match, actionType, fileUrl) => {
      try {
        const pathMatch = fileUrl.match(/file:\/\/\/(.+)/);
        if (!pathMatch) return match;

        let path = pathMatch[1];
        if (!path.startsWith('/')) {
          path = '/' + path;
        }

        path = safeDecodeURI(path);
        const filename = extractFilename(path);
        const simplifiedPath = path.startsWith(projectRoot)
          ? path.replace(projectRoot, '')
          : path;

        return `${actionType} [${filename}](${simplifiedPath}`;
      } catch (error) {
        console.warn(`Failed to format action link: ${action}`, error.message);
        return match;
      }
    }
  );
};

/**
 * Optimized context references formatter using a unified regex
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
export const formatContextReferences = (text) => {
  // Unified regex for all context reference patterns
  return text.replace(
    /#(file|folder|dir|sym):([^\s]+)|#(selection)\b/g,
    (match, type, path, selection) => {
      if (selection) {
        return '`🔎 selection`';
      }

      const emojiMap = {
        file: '📄',
        folder: '📁',
        dir: '📁',
        sym: '🔣',
      };

      const emoji = emojiMap[type] || '📎';
      return `\`${emoji} ${path}\``;
    }
  );
};

/**
 * Formats terminal commands inline in the response text
 * @param {string} text - Text to format
 * @returns {string} Text with formatted terminal commands
 */
export const formatTerminalCommands = (text) => {
  const lines = text.split('\n');
  const result = [];

  for (const line of lines) {
    const match = line.match(TERMINAL_COMMAND_PATTERN);
    if (match) {
      const command = match[1];
      result.push(`▶️ **Terminal command:**\n\`\`\`bash\n${command}\n\`\`\``);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
};

/**
 * Formats a section into enhanced Markdown
 * @param {object} section - Section to format
 * @param {string} projectRoot - Project root
 * @returns {string} Formatted Markdown
 */
export const formatSection = (section, projectRoot) => {
  const { type, content, actions } = section;

  switch (type) {
    case 'user-prompt': {
      const promptText = Array.isArray(content) ? content.join('\n') : (content || '');
      const formattedText = compose(
        formatContextReferences,
        forceLineBreaks
      )(promptText);

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
            .filter(action => action)
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

      const formattedText = compose(
        formatContextReferences,
        shiftHeadingLevels,
        formatTerminalCommands,
        forceLineBreaks
      )(responseText);

      return `${MARKERS.AGENT_RESPONSE}
${VISUAL_MARKERS.AGENT_RESPONSE}

${formattedText}

`;
    }

    case 'agent-action': {
      // This case shouldn't happen anymore with the new merge
      const actionsList = Array.isArray(content) ? content : [content];
      const formattedActions = actionsList
        .filter(action => action)
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
 * @param {string} options.projectRoot - Project root path
 * @param {string} options.inputFile - Input file name
 * @param {string} options.processedDate - Processing date
 * @returns {string} YAML frontmatter
 */
export const generateFrontmatter = ({ projectRoot, inputFile, processedDate }) => {
  return `---
type: chat-session
projectRoot: ${projectRoot || 'N/A'}
sourceFile: ${inputFile}
processedDate: ${processedDate}
---
${MARKERS.PROCESSED}

`;
};
