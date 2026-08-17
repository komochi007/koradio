import { useEffect, useId, useRef, useState, type PointerEvent, type ReactElement } from "react";

interface AvatarCropDialogProps {
  file: File;
  onCancel: () => void;
  onUse: (file: File) => void;
}

interface Point {
  x: number;
  y: number;
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

export function AvatarCropDialog({ file, onCancel, onUse }: AvatarCropDialogProps): ReactElement {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<Point | undefined>(undefined);
  const [source] = useState(() => URL.createObjectURL(file));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const titleId = useId();

  useEffect(
    () => () => {
      URL.revokeObjectURL(source);
    },
    [source],
  );

  function move(next: Point): void {
    const limit = Math.max(0, 1 - 1 / zoom);
    setOffset({ x: clamp(next.x, limit), y: clamp(next.y, limit) });
  }

  function reset(): void {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function crop(): void {
    const image = imageRef.current;
    if (image === null || image.naturalWidth === 0 || image.naturalHeight === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (context === null) return;
    const scale = Math.max(512 / image.naturalWidth, 512 / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (512 - width) / 2 + (offset.x * (width - 512)) / 2;
    const y = (512 - height) / 2 + (offset.y * (height - 512)) / 2;
    context.drawImage(image, x, y, width, height);
    canvas.toBlob(
      (blob) => {
        if (blob !== null) onUse(new File([blob], "koradio-avatar.webp", { type: "image/webp" }));
      },
      "image/webp",
      0.9,
    );
  }

  return (
    <div className="app-dialog-backdrop avatar-crop-backdrop">
      <section
        className="app-dialog avatar-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="settings-modal__eyebrow">PROFILE · AVATAR</p>
        <h2 id={titleId}>调整头像构图</h2>
        <p>拖动图片调整位置，滚轮或滑杆缩放。按方向键可细调，R 重置。</p>
        <div
          className="avatar-crop-frame"
          role="group"
          tabIndex={0}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.08 : 0.025;
            if (event.key === "ArrowLeft") move({ ...offset, x: offset.x - step });
            else if (event.key === "ArrowRight") move({ ...offset, x: offset.x + step });
            else if (event.key === "ArrowUp") move({ ...offset, y: offset.y - step });
            else if (event.key === "ArrowDown") move({ ...offset, y: offset.y + step });
            else if (event.key.toLocaleLowerCase() === "r") {
              reset();
              return;
            } else return;
            event.preventDefault();
          }}
          onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
            const start = dragStart.current;
            if (start === undefined) return;
            const rect = event.currentTarget.getBoundingClientRect();
            move({
              x: offset.x + (event.clientX - start.x) / rect.width,
              y: offset.y + (event.clientY - start.y) / rect.height,
            });
            dragStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => {
            dragStart.current = undefined;
          }}
        >
          <img
            ref={imageRef}
            src={source}
            alt="待裁剪的头像"
            draggable={false}
            style={{
              transform: `translate(${String(offset.x * 50)}%, ${String(offset.y * 50)}%) scale(${String(zoom)})`,
            }}
          />
          <span aria-hidden="true" />
        </div>
        <label className="avatar-crop-zoom">
          <span>缩放</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => {
              const next = Number(event.target.value);
              setZoom(next);
              const limit = Math.max(0, 1 - 1 / next);
              setOffset((current) => ({ x: clamp(current.x, limit), y: clamp(current.y, limit) }));
            }}
          />
        </label>
        <div className="settings-modal__actions">
          <button className="button button--ghost" type="button" onClick={reset}>
            重置
          </button>
          <button className="button button--ghost" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="button button--primary" type="button" onClick={crop}>
            使用此头像
          </button>
        </div>
      </section>
    </div>
  );
}
