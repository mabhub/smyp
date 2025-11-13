/**
 * @file parsers.js
 * @description Parsing functions for chat session content
 */

import { MARKERS, ACTION_PATTERNS, NOISE_PATTERNS, IGNORE_USER_PROMPTS } from './constants.js';

/**
 * Safely decodes a URI component
 * @param {string} uri - URI to decode
 * @returns {string} Decoded URI or original if decoding fails
 */
const safeDecodeURI = (uri) => {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
};

/**
 * Detects if the file has already been processed
 * @param {string} content - File content
 * @returns {boolean}
 */
export const isAlreadyProcessed = (content) => {
  return content.includes(MARKERS.PROCESSED);
};

/**
 * Extracts the project root path from content
 * @param {string} content - File content
 * @returns {string|null} Detected root path or null
 */
export const extractProjectRoot = (content) => {
  try {
    const match = content.match(/file:\/\/\/(.+?)[)#\s]/);
    if (!match) return null;

    let fullPath = match[1];
    if (!fullPath.startsWith('/')) {
      fullPath = '/' + fullPath;
    }

    fullPath = safeDecodeURI(fullPath);

    // Break down the path: /home/user/folder/project/...
    const parts = fullPath.split('/').filter(Boolean);
    // Take the first 4 segments: home, user, folder, project
    if (parts.length >= 4) {
      return '/' + parts.slice(0, 4).join('/');
    }

    return null;
  } catch (error) {
    console.error('Error extracting project root:', error.message);
    return null;
  }
};

/**
 * Detects the user identifier from content
 * @param {string} content - File content
 * @returns {string|null} Detected user identifier or null
 */
export const extractUserIdentifier = (content) => {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
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
 * Parses raw content into sections
 * @param {string} content - Raw content
 * @param {string} userIdentifier - User identifier to detect prompts
 * @returns {Array<{type: string, content: Array<string>, raw: string}>}
 */
export const parseContent = (content, userIdentifier) => {
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
      inAction = false;
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
        // Empty line - Continue accumulating actions
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
 * Flushes accumulated agent content into the merged sections array
 * @param {Array} merged - Array to push merged sections into
 * @param {Object} state - Current state with agentContent and agentActions
 */
const flushAgentContent = (merged, state) => {
  if (state.agentContent.length === 0 && state.agentActions.length === 0) {
    return;
  }

  const fusedContent = [];
  const fusedActions = [];
  let contentIndex = 0;
  let actionIndex = 0;

  // Interleave content and actions in the order they appeared
  while (contentIndex < state.agentContent.length || actionIndex < state.agentActions.length) {
    if (contentIndex < state.agentContent.length) {
      fusedContent.push(state.agentContent[contentIndex]);
      contentIndex++;
    }

    if (actionIndex < state.agentActions.length) {
      fusedContent.push(`__ACTION_PLACEHOLDER_${fusedActions.length}__`);
      fusedActions.push(state.agentActions[actionIndex]);
      actionIndex++;
    }
  }

  merged.push({
    type: 'agent-response',
    content: fusedContent,
    actions: fusedActions,
  });

  // Reset state
  state.agentContent = [];
  state.agentActions = [];
};

/**
 * Merges consecutive sections between user prompts (simplified state machine)
 * @param {Array} sections - Sections to merge
 * @returns {Array} Merged sections
 */
export const mergeSections = (sections) => {
  const merged = [];
  const state = {
    currentPrompt: null,
    agentContent: [],
    agentActions: [],
  };

  for (const section of sections) {
    if (section.type === 'user-prompt') {
      // Flush previous agent content
      flushAgentContent(merged, state);

      // Add the prompt
      merged.push(section);
      state.currentPrompt = section;
    } else if (section.type === 'agent-response') {
      const text = Array.isArray(section.content)
        ? section.content.join('\n')
        : section.content;
      state.agentContent.push(text);
    } else if (section.type === 'agent-action') {
      state.agentActions.push(section);
    }
  }

  // Flush remaining agent content
  flushAgentContent(merged, state);

  return merged;
};
