# book-to-skill

Convert books and documents into structured agent skills that can be used repeatedly in pi, Claude Code, Amp, and other compatible AI agents.

## Installation

```bash
# Clone the pi-skills repository (includes this skill)
git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills

# Or install just this skill
git clone https://github.com/badlogic/pi-skills.git
ln -s pi-skills/book-to-skill ~/.pi/agent/skills/book-to-skill
```

## Usage

```bash
# In pi, use the skill command
/skill:book-to-skill

# Then provide a book path
/path/to/book.pdf my-skill-name
```

## Supported Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| PDF | `.pdf`, `.PDF` | Fast text extraction or structure-aware (Docling) |
| EPUB | `.epub`, `.EPUB` | Uses ebooklib or ZIP fallback |
| Word | `.docx`, `.DOCX` | Uses python-docx or ZIP/XML fallback |
| Plain Text | `.txt`, `.md`, `.markdown` | Direct read |
| HTML | `.html`, `.htm`, `.HTML` | BeautifulSoup or regex fallback |
| RTF | `.rtf`, `.RTF` | striprtf or regex fallback |
| E-book | `.mobi`, `.azw`, `.azw3` | Requires Calibre |

## Requirements

### Python Dependencies

The extractor will prompt to install missing packages, or pre-install:

```bash
# Core extraction (recommended)
pip install PyPDF2 python-docx ebooklib beautifulsoup4 striprtf

# Technical PDF extraction (structure-aware, preserves tables/code)
pip install docling

# Alternative PDF extraction
pip install pdfminer-six
```

### Calibre (for MOBI/AZW formats)

```bash
# macOS
brew install calibre

# Linux
sudo apt install calibre

# Windows
# Download from https://calibre-ebook.com/download
```

## How It Works

### 1. Extraction
- Validates file format
- Extracts text using the best available method
- Preserves structure for technical documents (tables, code blocks)

### 2. Analysis
- Identifies book title, author, chapter structure
- Extracts frameworks, principles, techniques
- Maps topics to chapters

### 3. Generation
Creates a complete skill with:
- `SKILL.md` - Core frameworks and mental models
- `chapters/` - Individual chapter summaries (loaded on-demand)
- `glossary.md` - All key terms alphabetically
- `patterns.md` - Techniques and design patterns
- `cheatsheet.md` - Quick reference tables

### 4. Cost Optimization

For large books (>50k tokens), uses REPL-style access:
- `grep` to find chapter offsets
- `sed` to extract only needed sections
- Never loads entire book into context

## Output Structure

```
~/.config/agents/skills/{skill-name}/
├── SKILL.md              # Main skill file (~4K tokens)
├── chapters/             # Chapter summaries (on-demand)
│   ├── ch01-intro.md
│   ├── ch02-frameworks.md
│   └── ...
├── glossary.md           # Key terms (~1.5K tokens)
├── patterns.md           # Techniques (~2K tokens)
└── cheatsheet.md         # Quick reference (~1K tokens)
```

## Usage Examples

### After Creating a Skill

```bash
# Load core frameworks
Ask: "{skill-name}"

# Ask about a specific topic
Ask: "{skill-name} about replication"

# Read a specific chapter
Ask: "{skill-name} for ch05"

# Browse all chapters
Ask: "What chapters do you have?"
```

### Integration with Agents

The generated skill is compatible with:
- **pi** (default: `~/.pi/agent/skills/`)
- **Claude Code** (`~/.claude/skills/`)
- **Amp** (`~/.config/agents/skills/`)
- Project-local (`.pi/skills/`, `.agents/skills/`)

## Token Budget Guidelines

| File | Target Size | When Loaded |
|------|-------------|-------------|
| SKILL.md | ~4,000 tokens | Always (skill activation) |
| chapters/* | 800-1,200 each | On-demand only |
| glossary.md | ~1,500 tokens | On-demand only |
| patterns.md | ~2,000 tokens | On-demand only |
| cheatsheet.md | ~1,000 tokens | On-demand only |

**Total skill size**: ~10-15K tokens, but only ~4K loaded by default.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BOOK_SKILL_WORKDIR` | `/tmp/book_skill_work` | Working directory for extraction |
| `BOOK_SKILL_INSTALL_MISSING` | `ask` | Install packages: `yes`/`no`/`ask` |
| `PYTHON_BIN` | `python3` | Python interpreter to use |

## Troubleshooting

### "No suitable extractor available"
Install the required package:
```bash
pip install PyPDF2  # for PDF
pip install ebooklib beautifulsoup4  # for EPUB
pip install python-docx  # for DOCX
```

### "Calibre not installed" (MOBI/AZW)
Install Calibre from https://calibre-ebook.com/download

### Extraction is slow for PDFs
- Text mode: uses fast pdftotext if available
- Technical mode: uses Docling (~1.5s/page) for structure

### Out of memory for large books
Set a custom work directory with more space:
```bash
export BOOK_SKILL_WORKDIR=/path/to/large/disk
```

## Philosophy

This tool extracts **structure, not summaries**:
- Named frameworks with exact formulations
- Actionable principles ("Use X when Y")
- Techniques with step-by-step methods
- Anti-patterns and what to avoid

The goal is to create a **reusable toolkit** from books, not a book report.

## License

MIT
