import { useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

interface Props {
  allNames: string[];
  onMatch: (names: string[]) => void;
  onClear: () => void;
  active: boolean;
}

// Strip accents, lowercase, keep only letters + spaces
function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[j], dp[j-1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function tokenMatches(ocr: string, name: string): boolean {
  if (ocr === name) return true;
  const tol = Math.min(ocr.length, name.length) >= 6 ? 1 : 0;
  return editDistance(ocr, name) <= tol;
}

function matchNamesInOCR(ocrText: string, allNames: string[]): string[] {
  const normText = normalise(ocrText);
  const tokens = normText.split(' ').filter(Boolean);
  const matched = new Set<string>();

  for (const fullName of allNames) {
    const parts = normalise(fullName).split(' ').filter(Boolean);
    if (parts.length < 2) continue;

    const first = parts[0];
    const lastParts = parts.slice(1); // supports multi-word last names

    let found = false;

    // ── Strategy 1: adjacent "First Last" ────────────────────────────────
    for (let i = 0; i < tokens.length - lastParts.length && !found; i++) {
      if (tokenMatches(tokens[i], first)) {
        if (lastParts.every((lp, j) => tokenMatches(tokens[i + 1 + j] ?? '', lp))) {
          found = true;
        }
      }
    }

    // ── Strategy 2: first + last within a 4-token window ─────────────────
    // Handles "Connor C EDM McDavid", numbers between names, etc.
    if (!found) {
      for (let i = 0; i < tokens.length && !found; i++) {
        if (tokenMatches(tokens[i], first)) {
          for (let gap = 1; gap <= 3 && !found; gap++) {
            const j = i + gap;
            if (lastParts.every((lp, k) => tokenMatches(tokens[j + k] ?? '', lp))) {
              found = true;
            }
          }
        }
      }
    }

    // ── Strategy 3: full-name substring on normalised text ────────────────
    // Catches OCR that collapses spaces: "ConnorMcDavid"
    if (!found) {
      const nameStr = parts.join(' ');
      if (normText.includes(nameStr)) found = true;
    }

    // ── Strategy 4: last name present + first initial nearby ─────────────
    // Catches "C McDavid" or "McDavid C" when OCR drops full first name
    if (!found && first.length >= 1) {
      const initial = first[0];
      const lastName = lastParts[lastParts.length - 1];
      for (let i = 0; i < tokens.length && !found; i++) {
        if (tokenMatches(tokens[i], lastName)) {
          const window = tokens.slice(Math.max(0, i - 3), i + 4);
          if (window.some((t) => t === initial || tokenMatches(t, first))) {
            found = true;
          }
        }
      }
    }

    if (found) matched.add(fullName);
  }

  return Array.from(matched);
}

export default function ScreenshotImport({ allNames, onMatch, onClear, active }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [matchedList, setMatchedList] = useState<string[]>([]);
  const [rawOcr, setRawOcr] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setLoading(true);
    setStatus('Reading image…');
    setMatchedList([]);
    setRawOcr('');

    try {
      const worker = await createWorker('eng', 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setStatus(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      setRawOcr(text);
      const found = matchNamesInOCR(text, allNames);

      if (found.length === 0) {
        setStatus('No player names detected. Check raw OCR below to see what was read.');
      } else {
        setStatus(`Found ${found.length} player${found.length !== 1 ? 's' : ''}`);
        setMatchedList(found);
        onMatch(found);
      }
    } catch {
      setStatus('OCR failed. Try a higher-resolution image.');
    }
    setLoading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handleFile(file);
  }

  function handleClear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setStatus('');
    setMatchedList([]);
    setRawOcr('');
    setShowRaw(false);
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  }

  const isError = status.startsWith('No player') || status.startsWith('OCR failed');

  return (
    <div className="screenshot-panel">
      <div className="screenshot-header">
        <span className="screenshot-title">📷 Import from Screenshot</span>
        <div className="screenshot-header-actions">
          {rawOcr && (
            <button className="clear-btn" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Hide' : 'Show'} raw OCR
            </button>
          )}
          {active && (
            <button className="clear-btn" onClick={handleClear}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div
        className={`drop-zone ${loading ? 'loading' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !loading && inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="preview" className="drop-preview" />
        ) : (
          <div className="drop-placeholder">
            <span className="drop-icon">⬆</span>
            <span>Drop a screenshot or click to upload</span>
            <span className="drop-hint">PNG · JPG · WEBP — expects "First Last" format</span>
          </div>
        )}
        {loading && <div className="drop-overlay"><div className="spinner" /></div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {status && (
        <div className={`ocr-status ${isError ? 'error' : 'ok'}`}>
          <span>{status}</span>
          {matchedList.length > 0 && (
            <div className="matched-chips">
              {matchedList.map((name) => (
                <span key={name} className="matched-chip">{name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {showRaw && rawOcr && (
        <div className="raw-ocr-box">
          <div className="raw-ocr-label">Raw OCR output — check if names appear correctly below:</div>
          <pre className="raw-ocr-text">{rawOcr}</pre>
        </div>
      )}
    </div>
  );
}
