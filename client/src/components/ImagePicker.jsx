import { useEffect, useRef, useState } from 'react';
import { validateImageFile } from '../utils/image.js';
import { formatBytes } from '../utils/format.js';
import Icon from './Icon.jsx';

/**
 * Dropzone -> preview. `scanning` (set by the page while the request is in flight) overlays the scan line
 * on the preview and locks the controls.
 */
export default function ImagePicker({ file, onChange, disabled, scanning = false }) {
  const camera = useRef(null);
  const gallery = useRef(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url); // no leaked blobs
  }, [file]);

  function accept(f) {
    if (!f) return;
    const problem = validateImageFile(f);
    setError(problem);
    if (!problem) onChange(f);
  }
  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    accept(f);
  }
  function drop(e) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) accept(e.dataTransfer?.files?.[0]);
  }
  const over = (e) => { e.preventDefault(); if (!disabled) setDragging(true); };

  return (
    <section aria-labelledby="photo-h" className="picker">
      <h2 id="photo-h" className="sr-only">Photo of the affected leaf</h2>

      {error && (
        <div className="notice notice--bad" role="alert">
          <Icon name="alert" size={22} />
          <div><strong>Unable to use this image</strong><p>{error}</p></div>
        </div>
      )}

      {preview ? (
        <figure className={`picker__preview ${scanning ? 'is-scanning' : ''}`}>
          <img src={preview} alt="Selected paddy leaf preview" />
          {scanning && <span className="scanline" aria-hidden="true" />}
          <figcaption>
            <Icon name="file" size={18} />
            <span className="picker__name">{file?.name}</span>
            <span className="muted small">{formatBytes(file?.size)}</span>
          </figcaption>
        </figure>
      ) : (
        <div
          className={`dropzone ${dragging ? 'is-over' : ''}`}
          data-empty="true"
          onDragOver={over}
          onDragEnter={over}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <span className="dropzone__icon"><Icon name={dragging ? 'image' : 'camera'} size={34} /></span>
          <h3>{dragging ? 'Drop image here' : 'Upload a photo of the leaf'}</h3>
          <p className="muted">{dragging ? 'Release to use this image.' : 'Drag and drop an image here, or choose one from your device. Fill the frame with one leaf, in daylight.'}</p>
          <div className="row row--center">
            <button type="button" className="btn btn--primary" onClick={() => gallery.current.click()} disabled={disabled}>
              <Icon name="image" size={18} /> Choose image
            </button>
            <button type="button" className="btn" onClick={() => camera.current.click()} disabled={disabled}>
              <Icon name="camera" size={18} /> Take photo
            </button>
          </div>
          <p className="muted small">JPG, JPEG or PNG · up to 10 MB</p>
        </div>
      )}

      {file && !scanning && (
        <div className="row">
          <button type="button" className="btn" onClick={() => gallery.current.click()} disabled={disabled}>
            <Icon name="refresh" size={18} /> Replace image
          </button>
          <button type="button" className="btn btn--danger" onClick={() => { setError(null); onChange(null); }} disabled={disabled}>
            <Icon name="trash" size={18} /> Remove
          </button>
        </div>
      )}

      <input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={pick} data-testid="camera-input" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png" hidden onChange={pick} data-testid="gallery-input" />
    </section>
  );
}
