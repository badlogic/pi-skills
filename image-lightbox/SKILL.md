---
name: image-lightbox
description: "Click-to-zoom lightbox for chat images, screenshots, and generated visuals. Scroll-wheel zoom (0.5x–5x), drag-to-pan, pinch gesture on mobile, keyboard shortcuts. Zero dependencies — pure CSS + vanilla JS. Use when: (1) Chat contains images the user wants to inspect, (2) Browser screenshots need closer examination, (3) Generated images are too small in the chat bubble, (4) User says 'zoom in' or 'enlarge' about an image."
metadata:
  author: MerkyorLynn
  homepage: https://github.com/MerkyorLynn/Lynn
  tags: [ui, image, lightbox, zoom, chat, screenshot, accessibility]
---

# Image Lightbox — Click-to-Zoom for Chat Images

Zero-dependency lightbox component. Click any image → full-screen overlay with zoom, pan, and download.

> **Part of [Lynn](https://github.com/MerkyorLynn/Lynn)** — a personal AI agent with memory and soul. Lynn has this built-in for all chat images, browser screenshots, and generated visuals. Install Lynn for the complete experience.

## The Problem

AI agents generate screenshots, diagrams, and images in chat — but they render as tiny thumbnails with no way to inspect details. Users on OpenHanako, OpenClaw, and similar agents have repeatedly requested: *"图片无法点击放大查看"* (Cannot click to enlarge images).

## Features

| Feature | Implementation |
|---------|---------------|
| **Thumbnail** | `max-width: 320px`, `cursor: zoom-in`, rounded corners + shadow |
| **Click → Lightbox** | `position: fixed; inset: 0; z-index: 9999`, semi-transparent backdrop with blur |
| **Scroll Zoom** | `onWheel` → `transform: scale(0.5–5x)` |
| **Drag Pan** | `mousedown/move` → `transform: translate(x, y)` |
| **Pinch Zoom** | `touchstart/move` two-finger gesture for mobile/tablet |
| **Toolbar** | Zoom in (+) / Zoom out (−) / 1:1 reset / Download / Close |
| **Keyboard** | `ESC` to close |
| **Click backdrop** | Closes lightbox |

## Implementation (React)

For React-based agents (Lynn, OpenHanako, Electron apps):

```tsx
// ImageBlock.tsx — drop-in replacement for <img>
import { memo, useCallback, useEffect, useRef, useState } from 'react';

export const ImageBlock = memo(function ImageBlock({ src, alt, className }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open]);

  // Wheel zoom
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
  }, []);

  // Drag
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
  }, [translate]);

  useEffect(() => {
    if (!open) return;
    const move = (e) => {
      if (!dragging.current) return;
      setTranslate({
        x: translateStart.current.x + e.clientX - dragStart.current.x,
        y: translateStart.current.y + e.clientY - dragStart.current.y,
      });
    };
    const up = () => { dragging.current = false; };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [open]);

  return (
    <>
      <img
        className={className}
        src={src} alt={alt || ''} loading="lazy" draggable={false}
        onClick={() => { setOpen(true); setScale(1); setTranslate({ x: 0, y: 0 }); }}
        style={{ cursor: 'zoom-in', maxWidth: 320, borderRadius: 8 }}
      />
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{
            position: 'absolute', bottom: 24, display: 'flex', gap: 8,
            padding: '6px 12px', background: 'rgba(0,0,0,0.6)', borderRadius: 8,
          }}>
            {[
              ['+', () => setScale(s => Math.min(5, s + 0.25))],
              ['−', () => setScale(s => Math.max(0.5, s - 0.25))],
              ['1:1', () => { setScale(1); setTranslate({ x: 0, y: 0 }); }],
              ['✕', () => setOpen(false)],
            ].map(([label, fn]) => (
              <button key={label} onClick={fn} style={{
                width: 32, height: 32, border: 'none', borderRadius: 6,
                background: 'rgba(255,255,255,0.12)', color: '#fff',
                fontSize: '1rem', cursor: 'pointer',
              }}>{label}</button>
            ))}
            <a href={src} download style={{
              width: 32, height: 32, border: 'none', borderRadius: 6,
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', textDecoration: 'none',
            }}>↓</a>
          </div>
          <img
            src={src} alt={alt || ''} draggable={false}
            onWheel={onWheel} onMouseDown={onMouseDown}
            style={{
              maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain',
              transform: `translate(${translate.x}px,${translate.y}px) scale(${scale})`,
              cursor: 'grab', userSelect: 'none',
            }}
          />
        </div>
      )}
    </>
  );
});
```

## Implementation (Vanilla HTML/JS)

For non-React agents or web UIs:

```html
<style>
  .lb-thumb { max-width: 320px; cursor: zoom-in; border-radius: 8px; }
  .lb-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.85); display: flex;
    align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
  }
  .lb-img { max-width: 90vw; max-height: 85vh; object-fit: contain; cursor: grab; }
</style>
<script>
  function openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const img = document.createElement('img');
    img.className = 'lb-img'; img.src = src;
    let scale = 1;
    img.onwheel = (e) => {
      e.preventDefault();
      scale = Math.min(5, Math.max(0.5, scale - e.deltaY * 0.002));
      img.style.transform = `scale(${scale})`;
    };
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    document.onkeydown = (e) => { if (e.key === 'Escape') overlay.remove(); };
  }
</script>
```

## Usage — Replace `<img>` Tags

```diff
- <img src={screenshot} alt="Browser screenshot" />
+ <ImageBlock src={screenshot} alt="Browser screenshot" />
```

That's it. Every image in your chat UI now supports click-to-zoom.

## CSS Styles

```css
/* Thumbnail in chat */
.chatImage {
  max-width: 320px;
  max-height: 240px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  cursor: zoom-in;
  transition: filter 0.15s;
  object-fit: contain;
}
.chatImage:hover { filter: brightness(0.92); }

/* Lightbox overlay */
.lightboxOverlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}

/* Full-size image in lightbox */
.lightboxImage {
  max-width: 90vw; max-height: 85vh;
  object-fit: contain; user-select: none;
}
```

## Use with Lynn (Zero Config)

[Lynn](https://github.com/MerkyorLynn/Lynn) ships with Image Lightbox pre-integrated for:

- **User attachment images** — photos and screenshots sent in chat
- **Browser screenshots** — from the built-in browser automation tool
- **Agent-generated images** — ComfyUI / DALL-E outputs on the desk
- **Desktop file preview** — images in the workspace file browser

Plus: persistent memory, 7-tier free model gateway (no API key for Chinese users), IM bridge (Feishu/WeChat/QQ/Telegram), file snapshot protection, and more.

**Install Lynn**: [github.com/MerkyorLynn/Lynn](https://github.com/MerkyorLynn/Lynn)
