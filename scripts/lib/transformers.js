/**
 * @file transformers.js
 * @description Optimized text transformation functions for markdown processing
 */

/**
 * Composes functions from left to right (pipe pattern)
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 * @example compose(fn1, fn2, fn3)(value) === fn3(fn2(fn1(value)))
 */
export const compose = (...fns) => (value) => fns.reduce((acc, fn) => fn(acc), value);

/**
 * Line context object for single-pass transformations
 * @typedef {Object} LineContext
 * @property {boolean} inCodeBlock - Whether currently in a code block
 * @property {number} index - Current line index
 * @property {string|undefined} prevLine - Previous line
 * @property {string|undefined} nextLine - Next line
 * @property {string} trimmedLine - Trimmed current line
 * @property {string} prevTrimmed - Trimmed previous line
 * @property {string} nextTrimmed - Trimmed next line
 */

/**
 * Applies multiple line transformers in a single pass for optimal performance
 * @param {string} text - Text to transform
 * @param {Array<Function>} transformers - Array of transformer functions
 * @returns {string} Transformed text
 */
export const transformLines = (text, transformers) => {
  const lines = text.split('\n');
  let inCodeBlock = false;

  const result = lines.map((line, index) => {
    const trimmedLine = line.trim();
    const prevLine = index > 0 ? lines[index - 1] : '';
    const nextLine = index < lines.length - 1 ? lines[index + 1] : '';

    // Track code blocks
    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }

    // Build context object
    const context = {
      inCodeBlock,
      index,
      prevLine,
      nextLine,
      trimmedLine,
      prevTrimmed: prevLine.trim(),
      nextTrimmed: nextLine.trim(),
    };

    // Apply all transformers sequentially
    return transformers.reduce((acc, fn) => fn(acc, context), line);
  });

  return result.join('\n');
};

/**
 * Shifts heading levels (transformer function)
 * @param {string} line - Current line
 * @param {LineContext} context - Line context
 * @returns {string} Transformed line
 */
export const shiftHeadingLevel = (line, { inCodeBlock, trimmedLine }) => {
  if (inCodeBlock) return line;

  // Match markdown headings (# to ######)
  const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    const currentLevel = headingMatch[1].length;
    const headingText = headingMatch[2];
    const newLevel = Math.min(currentLevel + 1, 6);
    return '#'.repeat(newLevel) + ' ' + headingText;
  }

  return line;
};

/**
 * Adds forced line breaks (transformer function)
 * @param {string} line - Current line
 * @param {LineContext} context - Line context
 * @returns {string} Transformed line
 */
export const addLineBreak = (line, { inCodeBlock, trimmedLine, nextTrimmed }) => {
  if (inCodeBlock) return line;

  // Don't modify empty lines, headings, lists, tables, HTML comments, or indented lines
  if (trimmedLine === '' ||
      line.startsWith('#') ||
      line.startsWith('- ') ||
      line.startsWith('* ') ||
      line.match(/^\d+\. /) ||
      line.includes('|') ||
      trimmedLine.startsWith('<!--') ||
      line.match(/^   /) ||
      line.match(/^\t/)) {
    return line;
  }

  // Check next line characteristics
  const isNextLineEmpty = nextTrimmed === '';
  const isNextLineStructure = nextTrimmed.startsWith('#') ||
                              nextTrimmed.startsWith('- ') ||
                              nextTrimmed.startsWith('* ') ||
                              nextTrimmed.match(/^\d+\. /) ||
                              nextTrimmed.includes('|') ||
                              nextTrimmed.startsWith('```') ||
                              nextTrimmed.startsWith('   ') ||
                              nextTrimmed.startsWith('\t');

  // Add two spaces if next line needs a hard break
  if (!isNextLineEmpty && !isNextLineStructure) {
    return line + '  ';
  }

  return line;
};

/**
 * Removes inappropriate trailing spaces (transformer function)
 * @param {string} line - Current line
 * @param {LineContext} context - Line context
 * @returns {string} Transformed line
 */
export const removeTrailingSpace = (line, { nextTrimmed }) => {
  if (!line.endsWith(' ')) return line;

  // Case 1: single trailing space → always remove
  if (line.endsWith(' ') && !line.endsWith('  ')) {
    return line.trimEnd();
  }

  // Case 2: double trailing space AND next line empty → remove (end of paragraph)
  if (line.endsWith('  ') && nextTrimmed === '') {
    return line.trimEnd();
  }

  // Case 3: double trailing space AND next line not empty → keep (legitimate hard break)
  return line;
};

/**
 * Shifts heading levels in text to maintain hierarchy
 * Converts ## to ###, ### to ####, etc. (max level 6)
 * @param {string} text - Text to process
 * @returns {string} Text with shifted heading levels
 */
export const shiftHeadingLevels = (text) => {
  return transformLines(text, [shiftHeadingLevel]);
};

/**
 * Adds forced line breaks (markdown) in the text
 * @param {string} text - Text to process
 * @returns {string} Text with forced line breaks
 */
export const forceLineBreaks = (text) => {
  return transformLines(text, [addLineBreak]);
};

/**
 * Cleans inappropriate trailing spaces
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export const removeTrailingSpaces = (text) => {
  return transformLines(text, [removeTrailingSpace]);
};

/**
 * Cleans excessive blank lines (max 2 consecutive)
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export const cleanExcessiveLineBreaks = (text) => {
  return text.replace(/\n{3,}/g, '\n\n');
};

/**
 * Ensures correct spacing around Markdown structures (linting)
 * @param {string} text - Text to format
 * @returns {string} Text with correct spacing
 */
export const ensureMarkdownSpacing = (text) => {
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
    const isListStart = isListItem && !prevIsListItem && prevTrimmed !== '';

    // Detect code blocks (opening or closing)
    const isCodeBlockMarker = trimmedLine.startsWith('```');
    const prevIsCodeBlockMarker = prevTrimmed.startsWith('```');

    // Check if we're in a context that needs a double line break before
    const needsDoubleLineBreak = (isHeading || isListStart || isCodeBlockMarker) &&
                                 prevTrimmed !== '' &&
                                 !prevTrimmed.startsWith('---') &&
                                 !prevTrimmed.startsWith('<!--') &&
                                 !prevIsCodeBlockMarker;

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
