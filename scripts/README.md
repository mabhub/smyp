# 📝 Format Chat Session

Script for cleaning and formatting raw chat sessions saved as Markdown.

## 🎯 Objective

Transform raw chat session transcripts (like those exported from GitHub Copilot) into structured, readable, and maintainable Markdown documents.

## ✨ Features

### Automatic Formatting

- **YAML Frontmatter**: document metadata (type, project root, processing date)
- **Visually Distinct Sections**:
  - 👤 User prompts
  - 🤖 Agent responses
  - 🔧 Technical actions (collapsible with `<details>`)
- **Simplified Paths**: `/home/user/projects/my-project/src/file.js` → `/src/file.js`
- **URL Decoding**: `%C3%8E` → `Î`

### Idempotent Execution

- **Automatic Detection**: identifies already processed content
- **Preservation**: doesn't reprocess already formatted sections
- **`--force` Option**: allows reprocessing if needed

### Information Preservation

- **HTML Comments**: technical metadata preserved
- **Complete Content**: no data loss
- **Semantic Structure**: facilitates search and navigation

## 📦 Installation

No external dependencies. The script uses only native Node.js modules.

## 🚀 Usage

### Syntax

```bash
node scripts/format-chat-session.js <input-file> [output-file] [options]
```

### Arguments

- `input-file`: Raw Markdown file to process (required)
- `output-file`: Output file (optional, overwrites input by default)

### Options

- `--force`: Force reprocessing even if already formatted
- `--help`, `-h`: Display help

### Examples

#### Format in place (overwrites source file)

```bash
node scripts/format-chat-session.js prompts/session.md
```

#### Format to a new file

```bash
node scripts/format-chat-session.js prompts/session.md prompts/session-formatted.md
```

#### Force reprocessing of an already formatted file

```bash
node scripts/format-chat-session.js prompts/session.md --force
```

## 📄 Output Format

### General Structure

```markdown
---
type: chat-session
projectRoot: /home/user/projects/my-project
sourceFile: session.md
processedDate: 2025-11-13T14:00:00.000Z
---
<!-- formatted-chat-session -->

<!-- user-prompt -->
## 👤 User Prompt

Prompt content...

<!-- agent-response -->
## 🤖 Response

Response content with explanation...

<!-- agent-action -->
<details><summary>🔧 Technical Actions</summary>

- Created [file.js](/src/file.js)
- Read [readme.md](/docs/readme.md)

</details>

More response content after actions...
```

**Note**: Technical actions are integrated within agent response sections (not as separate sections) to maintain a natural reading flow. They appear as collapsible `<details>` blocks embedded in the response text.

### HTML Markers

The following markers are used to structure the document:

- `<!-- formatted-chat-session -->`: indicates the document has been processed
- `<!-- user-prompt -->`: marks a user prompt
- `<!-- agent-response -->`: marks an agent response
- `<!-- agent-action -->`: marks a technical action sequence

These markers enable:

- Detection of already processed content
- Easier navigation
- Future extensibility (parsing, search, etc.)

## 🔍 Detected Patterns

### User Prompts

```
username: <prompt content>
```

The username is automatically detected from the file content.

### Agent Responses

```
GitHub Copilot: <response content>
```

### Technical Actions

The script automatically detects the following actions:

- `Read [](file:///.../path/to/file)`
- `Created [](file:///.../path/to/file)`
- `Using "Replace String in File"`
- `Searched text for ...`
- `Updated todo list`
- `Completed (n/m) ...`
- `Made changes.`
- `Summarized conversation history`
- `Created n todos`

These actions are condensed into collapsible `<details>` blocks to avoid cluttering the reading flow.

## 🎨 Customization

### Modify Display Texts

In the `format-chat-session.js` file, `TEXTS` constant:

```javascript
const TEXTS = {
  // Console messages
  DETECTED_PROJECT_ROOT: '📁 Detected project root:',
  DETECTED_USER_ID: '👤 Detected user identifier:',
  // ... etc
};
```

All display texts (console messages, error messages, CLI help) are centralized in this constant for easy translation.

### Modify Visual Section Headers

In the `format-chat-session.js` file, `VISUAL_MARKERS` constant:

```javascript
const VISUAL_MARKERS = {
  USER_PROMPT: '## 👤 User Prompt',
  AGENT_RESPONSE: '## 🤖 Response',
  AGENT_ACTION: '<details><summary>🔧 Technical Actions</summary>',
  AGENT_ACTION_END: '</details>',
};
```

These markers define how sections appear in the formatted output.

### Add New Action Patterns

`ACTION_PATTERNS` section:

```javascript
const ACTION_PATTERNS = [
  /^Read \[\]\(file:\/\/(.+?)\)/,
  /^Created \[\]\(file:\/\/(.+?)\)/,
  // Add your patterns here
];
```

## 🔧 Recommended Workflow

### 1. Copy the Raw Session

After a productive chat session, copy the raw content into a `.md` file:

```bash
# Create file with session content
cat > prompts/my-session-$(date +%Y%m%d).md
# Paste content then Ctrl+D
```

### 2. Format Automatically

```bash
node scripts/format-chat-session.js prompts/my-session-20251113.md
```

### 3. Continue the Session

You can add new raw content at the end of the file, then re-run the script:

```bash
# Add new content
cat >> prompts/my-session-20251113.md
# Paste new content then Ctrl+D

# Reformat (processes only new sections)
node scripts/format-chat-session.js prompts/my-session-20251113.md
```

The script will only process new unformatted sections.

## 📊 Statistics

The script displays useful statistics after processing:

```
📁 Detected project root: /home/user/projects/my-project
👤 Detected user identifier: username
🔍 Analyzing content...
   Found: 92 sections (raw)
   After merge: 42 sections
   - 7 user prompts
   - 35 agent responses
   - 0 action sequences
✨ Formatting content...
✅ Formatted file saved: /path/to/output.md
```

**Note**: The "action sequences" counter shows 0 after merge because technical actions are integrated within agent responses rather than remaining as separate sections. This is by design to maintain better reading flow.

## 🐛 Known Limitations

### Nested Code Blocks

Markdown code blocks (` ``` `) are preserved as-is. Technical actions inside them are not simplified.

### projectRoot Detection

Automatic detection of the project root path relies on analyzing `file:///` paths in actions. If no path is found, `projectRoot: N/A` will be written in the frontmatter and paths won't be simplified.

### Special Characters in Paths

URL-encoded characters (`%20`, `%C3%A9`, etc.) are automatically decoded. In case of decoding error, the path is preserved as-is.
