export async function requestCameraStream(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error(
      "Camera API unavailable: page must be served over HTTPS or localhost. " +
      `Current origin: ${window.location.origin}`
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "navigator.mediaDevices.getUserMedia is not available in this browser/context."
    );
  }

  return navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Waits for a video element to be fully ready to have its frames drawn.
 * Resolves only when BOTH:
 *   1. readyState === HAVE_ENOUGH_DATA (4)
 *   2. videoWidth and videoHeight are non-zero (dimensions negotiated)
 */
export function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 10_000;
    
    const cleanup = () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      clearTimeout(timeoutId);
    };

    const onCanPlay = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        video.play()
          .then(() => {
            requestAnimationFrame(() => resolve());
          })
          .catch(reject);
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Video error: ${video.error?.message ?? "unknown"}`));
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Camera stream timed out — video never became ready"));
    }, TIMEOUT_MS);

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    // If video already has enough data
    if (video.readyState >= 4 && video.videoWidth > 0) {
      onCanPlay();
    }
  });
}

export function captureFrameToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): string | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    console.warn("captureFrame: video dimensions not yet available");
    return null;
  }

  if (video.readyState < 4) {
    console.warn(`captureFrame: readyState is ${video.readyState}, need 4`);
    return null;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.92);
}

export function captureOnNextDecodedFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<string> {
  return new Promise((resolve, reject) => {
    if ("requestVideoFrameCallback" in video) {
      (video as any).requestVideoFrameCallback((_now: number, _meta: any) => {
        const dataUrl = captureFrameToCanvas(video, canvas);
        if (dataUrl) resolve(dataUrl);
        else reject(new Error("Frame capture returned null"));
      });
    } else {
      const attemptCapture = () => {
        const dataUrl = captureFrameToCanvas(video, canvas);
        if (dataUrl) {
          resolve(dataUrl);
        } else {
          requestAnimationFrame(attemptCapture);
        }
      };
      requestAnimationFrame(attemptCapture);
    }
  });
}
