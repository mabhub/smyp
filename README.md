# SMYP

**Show Me Your Prompt!** - A tool to format chat session markdown files.

## 🛠️ Available Scripts

### Format Chat Session

Script for cleaning and formatting raw chat sessions.

**Documentation**: [scripts/README.md](scripts/README.md)

**Quick Usage**:

```bash
# Use with npx (no installation required)
npx smyp prompts/my-session.md

# Or install globally
npm install -g smyp
smyp prompts/my-session.md

# Display help
smyp --help
```

**Features**:

- ✅ Automatic structuring (prompts/responses/actions)
- ✅ File path simplification
- ✅ Idempotent execution (can be re-run safely)
- ✅ Complete information preservation

## 📁 Project Structure

```
smyp/
├── scripts/               # Utility scripts
│   ├── format-chat-session.js
│   └── README.md         # Script documentation
└── package.json
```

## 🚀 Installation

### Option 1: Use with npx (no installation)

```bash
npx smyp prompts/my-session.md
```

### Option 2: Global installation

```bash
npm install -g smyp
smyp prompts/my-session.md
```

### Option 3: Local development

```bash
# Clone the repository
git clone <repository-url>
cd smyp

# Use the script directly
node scripts/format-chat-session.js prompts/my-session.md
```
