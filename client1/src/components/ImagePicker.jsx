import { useEffect, useRef, useState } from 'react';
import { validateImageFile } from '../utils/image.js';

function UploadIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M15 39h18" />
      <path d="M24 35V10" />
      <path d="m15 19 9-9 9 9" />
      <rect x="6" y="7" width="36" height="34" rx="7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.7-4L3 10" />
      <path d="M3 5v5h5" />
      <path d="M4 13a8 8 0 0 0 14.7 4L21 14" />
      <path d="M21 19v-5h-5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m7 7 1 13h8l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

export default function ImagePicker({ file, onChange, disabled }) {
  const camera = useRef(null);
  const gallery = useRef(null);

  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  function processFile(f) {
    if (!f) return;

    const problem = validateImageFile(f);

    setError(problem);

    if (!problem) {
      onChange(f);
    }
  }

  function pick(e) {
    const f = e.target.files?.[0];

    e.target.value = '';

    if (!f) return;

    processFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();

    setDragging(false);

    if (disabled) return;

    const f = e.dataTransfer.files?.[0];

    if (!f) return;

    processFile(f);
  }

  function removeImage() {
    setError(null);
    onChange(null);
  }

  return (
    <section className="loumi-upload-section" aria-labelledby="photo-h">
      <div className="loumi-upload-heading">
        <div>
          <span className="loumi-eyebrow">AI CROP HEALTH</span>

          <h1 id="photo-h">Check your crop health</h1>

          <p>
            Upload a clear image of your crop or leaf and our AI will look
            for possible signs of disease.
          </p>
        </div>

        <span className="loumi-step">
          Step 1 of 2
        </span>
      </div>

      {!preview ? (
        <div
          className={`loumi-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="loumi-dropzone__icon">
            <UploadIcon />
          </div>

          <h2>Upload crop image</h2>

          <p>
            Drag & drop an image here or
            <br />
            choose one from your device.
          </p>

          <div className="loumi-upload-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => gallery.current?.click()}
              disabled={disabled}
            >
              <ImageIcon />
              Choose Image
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => camera.current?.click()}
              disabled={disabled}
            >
              <CameraIcon />
              Take Photo
            </button>
          </div>

          <small>
            JPG, JPEG or PNG · Up to 10 MB
          </small>
        </div>
      ) : (
        <div className="loumi-selected-image">
          <div className="loumi-selected-image__label">
            Selected Image
          </div>

          <div className="loumi-selected-image__preview">
            <img
              src={preview}
              alt="Selected crop"
            />

            <button
              type="button"
              className="loumi-image-close"
              onClick={removeImage}
              disabled={disabled}
              aria-label="Remove selected image"
            >
              ×
            </button>
          </div>

          <div className="loumi-selected-image__info">
            <strong>
              {file.name}
            </strong>

            <span>
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </span>
          </div>

          <div className="loumi-selected-image__actions">
            <button
              type="button"
              className="btn"
              onClick={() => gallery.current?.click()}
              disabled={disabled}
            >
              <RefreshIcon />
              Replace Image
            </button>

            <button
              type="button"
              className="btn loumi-danger-button"
              onClick={removeImage}
              disabled={disabled}
            >
              <TrashIcon />
              Remove
            </button>
          </div>
        </div>
      )}

      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        hidden
        onChange={pick}
        data-testid="camera-input"
      />

      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={pick}
        data-testid="gallery-input"
      />

      {error && (
        <div className="loumi-upload-error" role="alert">
          <strong>Unable to use this image</strong>
          <span>{error}</span>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => gallery.current?.click()}
            disabled={disabled}
          >
            Choose Another Image
          </button>
        </div>
      )}
    </section>
  );
}