#!/bin/bash
# Submit book-to-skill to the pi-skills repository
# Usage: ./submit-pr.sh [pi-skills-repo-path]

set -e

PI_SKILLS_REPO="${1:-$HOME/projects/pi-skills}"
SKILL_NAME="book-to-skill"
SKILL_SOURCE="$HOME/.pi/agent/skills/$SKILL_NAME"

echo "📚 Submitting $SKILL_NAME to pi-skills repository"
echo ""

# Check if source exists
if [ ! -d "$SKILL_SOURCE" ]; then
    echo "❌ Skill not found at: $SKILL_SOURCE"
    exit 1
fi

# Check if pi-skills repo exists
if [ ! -d "$PI_SKILLS_REPO" ]; then
    echo "📥 Cloning pi-skills repository..."
    git clone https://github.com/badlogic/pi-skills "$PI_SKILLS_REPO"
fi

cd "$PI_SKILLS_REPO"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Uncommitted changes in pi-skills repo. Please commit or stash them."
    exit 1
fi

# Create feature branch
BRANCH_NAME="feature/add-$SKILL_NAME"
echo "🌿 Creating branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

# Copy skill files
echo "📁 Copying skill files..."
rm -rf "$PI_SKILLS_REPO/$SKILL_NAME"
cp -r "$SKILL_SOURCE" "$PI_SKILLS_REPO/$SKILL_NAME"

# Show what will be committed
echo ""
echo "📋 Files to commit:"
git status --short

# Stage the skill
git add "$SKILL_NAME/"

# Commit
echo ""
echo "💾 Creating commit..."
git commit -m "Add $SKILL_NAME: Convert books/documents into agent skills

- Supports PDF, EPUB, DOCX, HTML, Markdown, TXT, RTF, MOBI/AZW
- Extracts frameworks, mental models, principles, and techniques
- Creates structured skills with chapters, glossary, patterns, cheatsheet
- Cost-optimized for large books (>50k tokens)
- Compatible with pi, Claude Code, Amp, and Droid

License: MIT
"

echo ""
echo "✅ Commit created successfully!"
echo ""
echo "📤 To push and create PR, run:"
echo ""
echo "   cd $PI_SKILLS_REPO"
echo "   git push -u origin $BRANCH_NAME"
echo ""
echo "   Then open a PR at:"
echo "   https://github.com/badlogic/pi-skills/compare/$BRANCH_NAME?expand=1"
echo ""
echo "📝 PR Description Template:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat << 'TEMPLATE'
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

### Files Added

- `book-to-skill/SKILL.md` - Main skill definition
- `book-to-skill/README.md` - Documentation
- `book-to-skill/LICENSE` - MIT license
- `book-to-skill/scripts/extract.py` - Text extraction script
TEMPLATE
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
