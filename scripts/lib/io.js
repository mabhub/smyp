/**
 * @file io.js
 * @description I/O utilities with robust error handling
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Reads from stdin and returns the content as a string
 * @returns {Promise<string>} Content from stdin
 */
export const readStdin = () => {
  return new Promise((resolve, reject) => {
    let data = '';
    const timeout = setTimeout(() => {
      reject(new Error('Stdin read timeout after 30 seconds'));
    }, 30000);

    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });

    process.stdin.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
};

/**
 * Checks if stdin has data available (is being piped)
 * @returns {boolean} True if stdin is piped
 */
export const isStdinPiped = () => {
  return !process.stdin.isTTY;
};

/**
 * Safely reads a file with error handling
 * @param {string} filePath - Path to the file
 * @returns {string} File content
 * @throws {Error} If file cannot be read
 */
export const safeReadFile = (filePath) => {
  try {
    const absolutePath = resolve(filePath);
    return readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${filePath}`);
    } else if (error.code === 'EISDIR') {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    } else {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }
};

/**
 * Safely writes a file with error handling
 * @param {string} filePath - Path to the file
 * @param {string} content - Content to write
 * @throws {Error} If file cannot be written
 */
export const safeWriteFile = (filePath, content) => {
  try {
    const absolutePath = resolve(filePath);
    writeFileSync(absolutePath, content, 'utf-8');
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${filePath}`);
    } else if (error.code === 'ENOSPC') {
      throw new Error(`No space left on device: ${filePath}`);
    } else if (error.code === 'EISDIR') {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    } else {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }
};
