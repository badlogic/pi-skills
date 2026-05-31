# Submitting book-to-skill to pi-skills

This document contains instructions for submitting the `book-to-skill` skill to the [badlogic/pi-skills](https://github.com/badlogic/pi-skills) repository.

## Pre-submission Checklist

- [x] `SKILL.md` with valid frontmatter (name, description)
- [x] `README.md` with installation and usage instructions
- [x] `LICENSE` file (MIT)
- [x] `scripts/extract.py` working and tested
- [x] Skill name matches directory name
- [x] Description under 1024 characters
- [x] No invalid characters in name (lowercase a-z, 0-9, hyphens only)

## Submission Steps

### Option 1: Manual PR (Recommended)

```bash
# 1. Fork and clone the pi-skills repository
git clone https://github.com/badlogic/pi-skills
cd pi-skills

# 2. Copy the skill
cp -r /path/to/book-to-skill ./book-to-skill

# 3. Create a feature branch
git checkout -b feature/add-book-to-skill

# 4. Add the skill
git add book-to-skill/

# 5. Commit
git commit -m "Add book-to-skill: Convert books/documents into agent skills

- Supports PDF, EPUB, DOCX, HTML, Markdown, TXT, RTF, MOBI/AZW
- Extracts frameworks, mental models, principles, and techniques
- Creates structured skills with chapters, glossary, patterns, cheatsheet
- Cost-optimized for large books (>50k tokens)
- Compatible with pi, Claude Code, Amp, and Droid"

# 6. Push
git push origin feature/add-book-to-skill

# 7. Open a Pull Request at:
# https://github.com/badlogic/pi-skills/compare
```

### Option 2: Use publish-skills CLI

```bash
# Install the publishing tool
npm install -g publish-skills

# Login to GitHub
npx publish-skills login

# Validate the skill
npx publish-skills validate ~/.pi/agent/skills/book-to-skill

# Publish (creates PR automatically)
npx publish-skills publish ~/.pi/agent/skills/book-to-skill
```

## PR Description Template

```markdown
## book-to-skill

A skill that converts books and documents into structured agent skills.

### Features

- **Multi-format support**: PDF, EPUB, DOCX, HTML, Markdown, TXT, RTF, MOBI/AZW
- **Structure-aware extraction**: Preserves tables, code blocks, and formulas (technical mode)
- **Cost-optimized**: Uses REPL-style access for large books (>50k tokens)
- **Complete output**: Generates SKILL.md, chapter summaries, glossary, patterns, and cheatsheet
- **Agent-agnostic**: Compatible with pi, Claude Code, Amp, and Droid

### Requirements

- Python 3.6+
- Optional: `PyPDF2`, `python-docx`, `ebooklib`, `beautifulsoup4`, `docling`
- Optional: Calibre (for MOBI/AZW formats)

### Testing

Tested with:
- Technical books (programming, architecture)
- Non-fiction (management, productivity)
- Various formats (PDF, EPUB, DOCX)

### Files Added

- `book-to-skill/SKILL.md` - Main skill definition
- `book-to-skill/README.md` - Documentation
- `book-to-skill/LICENSE` - MIT license
- `book-to-skill/scripts/extract.py` - Text extraction script
```

## After PR is Merged

Users can install the skill with:

```bash
# Clone the pi-skills repository
git clone https://github.com/badlogic/pi-skills ~/.pi/agent/skills/pi-skills

# Or symlink just this skill
ln -s ~/.pi/agent/skills/pi-skills/book-to-skill ~/.pi/agent/skills/book-to-skill
```

Then use with:

```bash
/skill:book-to-skill /path/to/book.pdf my-skill-name
```

## Maintenance

To update the skill after it's published:

1. Update files in your local copy
2. Sync to `~/.pi/agent/skills/book-to-skill/`
3. Submit a PR to update the skill in pi-skills repo

## Support

For issues or questions:
- Open an issue in your fork
- Contact the pi-skills maintainers: @badlogic, @terrorobe
