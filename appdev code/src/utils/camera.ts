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
 * Resolves when:
 *   1. readyState >= HAVE_FUTURE_DATA (3)
 *   2. videoWidth and videoHeight are non-zero (dimensions negotiated)
 * Sets video.muted = true and triggers video.play() to bypass autoplay blocks.
 */
export function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 10_000;
    
    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("playing", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
      clearTimeout(timeoutId);
    };

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 3) {
        cleanup();
        video.muted = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("autoplay", "true");
        video.play()
          .then(() => {
            requestAnimationFrame(() => resolve());
          })
          .catch((err) => {
            console.warn("video.play() failed but dimensions are negotiated. Resolving to allow capture attempts:", err);
            resolve();
          });
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

    video.addEventListener("canplay", onReady);
    video.addEventListener("playing", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);

    // Immediate check if it's already ready
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 3) {
      onReady();
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

  // Minimum required state for stable decoded pixels is HAVE_FUTURE_DATA (3)
  if (video.readyState < 3) {
    console.warn(`captureFrame: readyState is ${video.readyState}, need >= 3`);
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
    let finished = false;

    const resolveFrame = (dataUrl: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      resolve(dataUrl);
    };

    const rejectFrame = (err: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      reject(err);
    };

    // Timeout fallback: if no frame event/callback fires within 1.5 seconds, attempt direct capture
    const timeoutId = setTimeout(() => {
      console.warn("captureOnNextDecodedFrame: timed out waiting for frame callback, attempting direct capture");
      const dataUrl = captureFrameToCanvas(video, canvas);
      if (dataUrl) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const probe = ctx.getImageData(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height / 2),
            4, 4
          ).data;
          const isBlack = Array.from(probe).every((v, i) => i % 4 === 3 || v < 10);
          if (isBlack) {
            rejectFrame(new Error("TIMEOUT_FALLBACK_PRODUCED_BLACK_FRAME"));
            return;
          }
        }
        resolveFrame(dataUrl);
      } else {
        rejectFrame(new Error("Frame capture timed out and direct capture returned null"));
      }
    }, 1500);

    if ("requestVideoFrameCallback" in video) {
      (video as any).requestVideoFrameCallback((_now: number, _meta: any) => {
        if (finished) return;
        const dataUrl = captureFrameToCanvas(video, canvas);
        if (dataUrl) resolveFrame(dataUrl);
        else rejectFrame(new Error("Frame capture returned null"));
      });
    } else {
      const attemptCapture = () => {
        if (finished) return;
        const dataUrl = captureFrameToCanvas(video, canvas);
        if (dataUrl) {
          resolveFrame(dataUrl);
        } else {
          requestAnimationFrame(attemptCapture);
        }
      };
      requestAnimationFrame(attemptCapture);
    }
  });
}

export async function captureWithRetry(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxAttempts = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await captureOnNextDecodedFrame(video, canvas);
    } catch (err: any) {
      console.warn(`Frame capture attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      // Wait 500ms before retrying — gives GPU time to surface a frame
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error("All capture attempts exhausted");
}
