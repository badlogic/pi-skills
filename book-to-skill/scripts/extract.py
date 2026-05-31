#!/usr/bin/env python3
"""
Book-to-Skill Text Extractor

Extracts text from various document formats (PDF, EPUB, DOCX, HTML, Markdown, etc.)
with optional structure-aware extraction for technical documents.

Usage:
    python extract.py <book_path> --mode <technical|text> --install-missing <ask|yes|no>
"""

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Optional imports - will be imported on-demand based on format
def try_import(module_name: str, install_name: Optional[str] = None) -> Optional[object]:
    """Try to import a module, return None if not available."""
    try:
        return __import__(module_name, fromlist=[''])
    except ImportError:
        return None

def check_install_missing(module_name: str, install_name: Optional[str] = None, 
                          install_mode: str = 'ask') -> bool:
    """Check if module is installed, optionally prompt to install."""
    if try_import(module_name):
        return True
    
    if install_mode == 'no':
        return False
    
    install_name = install_name or module_name
    if install_mode == 'ask':
        response = input(f"{module_name} not installed. Install now? (y/n): ").strip().lower()
        if response != 'y':
            return False
    
    # Try to install
    import subprocess
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', install_name, '-q'])
        # Clear the import cache
        if module_name in sys.modules:
            del sys.modules[module_name]
        return try_import(module_name) is not None
    except subprocess.CalledProcessError:
        print(f"Warning: Failed to install {install_name}", file=sys.stderr)
        return False

def get_work_dir() -> Path:
    """Get the working directory for extraction output."""
    workdir = os.environ.get('BOOK_SKILL_WORKDIR')
    if workdir:
        path = Path(workdir)
    else:
        path = Path(tempfile.gettempdir()) / 'book_skill_work'
    path.mkdir(parents=True, exist_ok=True)
    return path

def estimate_tokens(text: str) -> int:
    """Estimate token count from text (rough approximation: 1 token ≈ 4 chars)."""
    return len(text) // 4

def extract_pdf_pdftotext(file_path: Path) -> Tuple[str, str]:
    """Extract text from PDF using pdftotext (fast, plain text)."""
    import subprocess
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', str(file_path), '-'],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            return result.stdout, 'pdftotext'
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None, None

def extract_pdf_pypdf2(file_path: Path) -> Tuple[str, str]:
    """Extract text from PDF using PyPDF2."""
    pypdf2 = try_import('PyPDF2')
    if not pypdf2:
        return None, None
    
    text_parts = []
    try:
        with open(file_path, 'rb') as f:
            reader = pypdf2.PdfReader(f)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
        return '\n\n'.join(text_parts), 'PyPDF2'
    except Exception:
        return None, None

def extract_pdf_pdfminer(file_path: Path) -> Tuple[str, str]:
    """Extract text from PDF using pdfminer.six."""
    pdfminer = try_import('pdfminer')
    if not pdfminer:
        return None, None
    
    try:
        from pdfminer.high_level import extract_text
        text = extract_text(str(file_path))
        return text, 'pdfminer.six'
    except Exception:
        return None, None

def extract_pdf_docling(file_path: Path) -> Tuple[str, str]:
    """Extract text from PDF using Docling (structure-aware, preserves tables/code)."""
    docling = try_import('docling')
    if not docling:
        return None, None
    
    try:
        from docling.document_converter import DocumentConverter
        converter = DocumentConverter()
        result = converter.convert(str(file_path))
        # Convert to markdown
        md_text = result.document.export_to_markdown()
        return md_text, 'Docling'
    except Exception as e:
        print(f"Docling extraction error: {e}", file=sys.stderr)
        return None, None

def extract_pdf(file_path: Path, mode: str, install_mode: str) -> Tuple[str, str]:
    """Extract text from PDF with mode-specific strategy."""
    text = None
    method = None
    
    if mode == 'technical':
        # Try Docling first for structure-aware extraction
        if check_install_missing('docling', install_mode=install_mode):
            text, method = extract_pdf_docling(file_path)
        if not text:
            print("⚠️  Docling not available, falling back to text extraction", file=sys.stderr)
    
    # Text mode fallback chain
    if not text:
        text, method = extract_pdf_pdftotext(file_path)
    if not text:
        if check_install_missing('PyPDF2', install_mode=install_mode):
            text, method = extract_pdf_pypdf2(file_path)
    if not text:
        if check_install_missing('pdfminer.six', 'pdfminer-six', install_mode=install_mode):
            text, method = extract_pdf_pdfminer(file_path)
    
    if not text:
        raise RuntimeError("No suitable PDF extractor available")
    
    return text, method

def extract_epub(file_path: Path, install_mode: str) -> Tuple[str, str]:
    """Extract text from EPUB file."""
    # Try ebooklib + BeautifulSoup first
    ebooklib = try_import('ebooklib')
    bs4 = try_import('bs4')
    
    if ebooklib and bs4:
        try:
            from ebooklib import epub
            from bs4 import BeautifulSoup
            
            book = epub.read_epub(str(file_path))
            text_parts = []
            
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    soup = BeautifulSoup(item.get_content(), 'html.parser')
                    text = soup.get_text(separator='\n', strip=True)
                    if text:
                        text_parts.append(text)
            
            if text_parts:
                return '\n\n'.join(text_parts), 'ebooklib+bs4'
        except Exception:
            pass
    
    # Fallback: treat as ZIP and extract HTML
    try:
        text_parts = []
        with zipfile.ZipFile(file_path, 'r') as zf:
            for name in zf.namelist():
                if name.endswith('.html') or name.endswith('.xhtml'):
                    content = zf.read(name).decode('utf-8', errors='ignore')
                    # Simple HTML tag stripping
                    text = re.sub(r'<[^>]+>', ' ', content)
                    text = re.sub(r'\s+', ' ', text).strip()
                    if text:
                        text_parts.append(text)
        
        if text_parts:
            return '\n\n'.join(text_parts), 'zip+regex'
    except Exception:
        pass
    
    raise RuntimeError("No suitable EPUB extractor available")

def extract_docx(file_path: Path, install_mode: str) -> Tuple[str, str]:
    """Extract text from DOCX file."""
    # Try python-docx first
    docx = try_import('docx')
    if docx:
        try:
            doc = docx.Document(str(file_path))
            text_parts = [para.text for para in doc.paragraphs if para.text.strip()]
            if text_parts:
                return '\n\n'.join(text_parts), 'python-docx'
        except Exception:
            pass
    
    # Fallback: treat as ZIP and extract XML
    try:
        text_parts = []
        with zipfile.ZipFile(file_path, 'r') as zf:
            if 'word/document.xml' in zf.namelist():
                content = zf.read('word/document.xml').decode('utf-8', errors='ignore')
                # Extract text from XML
                text = re.sub(r'<[^>]+>', ' ', content)
                text = re.sub(r'\s+', ' ', text).strip()
                if text:
                    return text, 'zip+xml'
    except Exception:
        pass
    
    raise RuntimeError("No suitable DOCX extractor available")

def extract_html(file_path: Path, install_mode: str) -> Tuple[str, str]:
    """Extract text from HTML file."""
    bs4 = try_import('bs4')
    if bs4:
        try:
            from bs4 import BeautifulSoup
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                soup = BeautifulSoup(f.read(), 'html.parser')
                # Remove script and style
                for tag in soup(['script', 'style']):
                    tag.decompose()
                text = soup.get_text(separator='\n', strip=True)
                return text, 'BeautifulSoup'
        except Exception:
            pass
    
    # Fallback: simple regex
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            text = re.sub(r'<[^>]+>', ' ', content)
            text = re.sub(r'\s+', ' ', text).strip()
            return text, 'regex'
    except Exception:
        raise RuntimeError("No suitable HTML extractor available")

def extract_rtf(file_path: Path, install_mode: str) -> Tuple[str, str]:
    """Extract text from RTF file."""
    striprtf = try_import('striprtf')
    if striprtf:
        try:
            from striprtf.striprtf import rtf_to_text
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                rtf_content = f.read()
                text = rtf_to_text(rtf_content)
                return text, 'striprtf'
        except Exception:
            pass
    
    # Fallback: basic regex (very limited)
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            # Remove RTF control sequences
            text = re.sub(r'\\[a-z]+\d?\s?', ' ', content)
            text = re.sub(r'[{}]', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            return text, 'regex (limited)'
    except Exception:
        raise RuntimeError("No suitable RTF extractor available")

def extract_mobi_azw(file_path: Path, install_mode: str) -> Tuple[str, str]:
    """Extract text from MOBI/AZW files using Calibre."""
    import subprocess
    
    # Check for Calibre's ebook-convert
    try:
        result = subprocess.run(['ebook-convert', '--version'], 
                              capture_output=True, text=True)
        if result.returncode != 0:
            raise FileNotFoundError("Calibre not installed")
    except FileNotFoundError:
        if install_mode == 'ask':
            print("⚠️  Calibre (ebook-convert) is required for MOBI/AZW extraction.")
            print("   Install from: https://calibre-ebook.com/download")
            print("   Or use: sudo apt install calibre (Linux) / brew install calibre (macOS)")
            response = input("   Continue anyway? (y/n): ").strip().lower()
            if response != 'y':
                sys.exit(1)
        elif install_mode == 'yes':
            print("⚠️  Calibre must be installed manually. See: https://calibre-ebook.com/download")
        raise RuntimeError("Calibre ebook-convert not available")
    
    # Convert to text via temporary file
    work_dir = get_work_dir()
    temp_txt = work_dir / 'temp_mobi.txt'
    
    try:
        result = subprocess.run(
            ['ebook-convert', str(file_path), str(temp_txt)],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode == 0 and temp_txt.exists():
            text = temp_txt.read_text(encoding='utf-8', errors='ignore')
            temp_txt.unlink()
            return text, 'Calibre'
    except subprocess.TimeoutExpired:
        pass
    
    raise RuntimeError("Calibre conversion failed")

def extract_text_file(file_path: Path) -> Tuple[str, str]:
    """Read plain text files directly."""
    encodings = ['utf-8', 'latin-1', 'cp1252']
    for encoding in encodings:
        try:
            text = file_path.read_text(encoding=encoding)
            return text, f'native ({encoding})'
        except UnicodeDecodeError:
            continue
    raise RuntimeError("Could not decode text file")

def extract_document(file_path: Path, mode: str, install_mode: str) -> Tuple[str, str, Dict]:
    """
    Extract text from a document based on its format.
    
    Returns:
        Tuple of (text, extraction_method, metadata)
    """
    ext = file_path.suffix.lower().lstrip('.')
    
    # Map extensions to extractors
    extractors = {
        'pdf': lambda: extract_pdf(file_path, mode, install_mode),
        'epub': lambda: extract_epub(file_path, install_mode),
        'docx': lambda: extract_docx(file_path, install_mode),
        'html': lambda: extract_html(file_path, install_mode),
        'htm': lambda: extract_html(file_path, install_mode),
        'txt': lambda: (extract_text_file(file_path)),
        'md': lambda: (extract_text_file(file_path)),
        'markdown': lambda: (extract_text_file(file_path)),
        'rst': lambda: (extract_text_file(file_path)),
        'adoc': lambda: (extract_text_file(file_path)),
        'asciidoc': lambda: (extract_text_file(file_path)),
        'rtf': lambda: extract_rtf(file_path, install_mode),
        'mobi': lambda: extract_mobi_azw(file_path, install_mode),
        'azw': lambda: extract_mobi_azw(file_path, install_mode),
        'azw3': lambda: extract_mobi_azw(file_path, install_mode),
    }
    
    if ext not in extractors:
        raise ValueError(f"Unsupported format: .{ext}")
    
    # Extract
    text, method = extractors[ext]()
    
    # Build metadata
    metadata = {
        'source_file': str(file_path),
        'format': ext,
        'extraction_method': method,
        'mode': mode,
        'file_size_bytes': file_path.stat().st_size,
        'word_count': len(text.split()),
        'estimated_tokens': estimate_tokens(text),
    }
    
    # Estimate pages (rough: 250-300 words per page)
    metadata['estimated_pages'] = max(1, metadata['word_count'] // 275)
    
    return text, method, metadata

def main():
    parser = argparse.ArgumentParser(description='Extract text from documents for book-to-skill')
    parser.add_argument('book_path', type=str, help='Path to the book/document')
    parser.add_argument('--mode', type=str, choices=['technical', 'text'], 
                       default='text', help='Extraction mode')
    parser.add_argument('--install-missing', type=str, choices=['ask', 'yes', 'no'],
                       default='ask', help='Whether to install missing packages')
    
    args = parser.parse_args()
    
    # Validate input
    book_path = Path(args.book_path)
    if not book_path.exists():
        print(f"Error: File not found: {book_path}", file=sys.stderr)
        sys.exit(1)
    
    print(f"📖 Extracting: {book_path.name}")
    print(f"   Mode: {args.mode}")
    print(f"   Install missing: {args.install_missing}")
    
    try:
        # Extract text
        text, method, metadata = extract_document(book_path, args.mode, args.install_missing)
        
        # Write output
        work_dir = get_work_dir()
        output_path = work_dir / 'full_text.txt'
        output_path.write_text(text, encoding='utf-8')
        metadata['output_text'] = str(output_path)
        
        metadata_path = work_dir / 'metadata.json'
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
        
        # Report
        print(f"\n✅ Extraction complete!")
        print(f"   Method: {method}")
        print(f"   Output: {output_path}")
        print(f"   Words: ~{metadata['word_count']:,}")
        print(f"   Estimated pages: ~{metadata['estimated_pages']}")
        print(f"   Estimated tokens: ~{metadata['estimated_tokens']:,}")
        
    except Exception as e:
        print(f"\n❌ Extraction failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
