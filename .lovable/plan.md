

## Problem

Chrome blocks the inline PDF iframe because the Supabase storage URL sets `X-Frame-Options` headers that prevent embedding. The current code uses a direct iframe to the storage URL for PDFs, which Chrome blocks. Office files already have no inline preview but the "open in window" link using Microsoft Office Online may also fail.

## Solution

Use **Google Docs Viewer** (`https://docs.google.com/gview?url=...&embedded=true`) as the inline iframe for all document types (PDF, PPT, DOC). Google Docs Viewer is designed to be embedded and does not set restrictive frame headers. This provides a single, reliable inline preview for all document formats.

## Changes

**File: `src/components/AttachmentViewer.tsx`**

1. Add a Google Docs Viewer URL: `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
2. For PDF, PPT, PPTX, DOC, DOCX: show an inline iframe using the Google Docs Viewer URL instead of the direct Supabase URL
3. Remove the separate Office-only "open externally" prompt section -- all documents now get the same inline viewer
4. Keep the "open in window" button (using Google Docs Viewer URL for all docs) and "download" button in the header bar
5. Keep image preview as-is (direct `<img>` tag, no iframe needed)

The iframe will use `sandbox="allow-scripts allow-same-origin"` to ensure it loads properly while maintaining security.

## Technical Details

```text
Before:
  PDF  → direct iframe to storage URL (BLOCKED by Chrome)
  PPT  → no inline preview, only "open externally" link
  DOC  → no inline preview, only "open externally" link

After:
  PDF/PPT/DOC → Google Docs Viewer iframe (embedded=true, works in Chrome)
  Images      → direct <img> tag (unchanged)
```

