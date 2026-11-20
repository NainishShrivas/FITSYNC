export type MicPermissionState =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported';

export interface MicRequestResult {
  granted: boolean;
  state: MicPermissionState;
  stream: MediaStream | null;
  error: string | null;
}

export async function queryMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (
        status.state === 'granted' ||
        status.state === 'denied' ||
        status.state === 'prompt'
      ) {
        return status.state;
      }
    }
  } catch {
    // Permissions API for 'microphone' is unsupported in Safari/some webviews
  }
  return 'prompt';
}

export function describeMicrophoneError(err: unknown): {
  state: MicPermissionState;
  message: string;
} {
  const domErr = err as { name?: string; message?: string } | null;
  const name = domErr?.name ?? '';
  const rawMsg = domErr?.message ?? '';

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    /denied|not allowed|permissions policy/i.test(rawMsg)
  ) {
    return {
      state: 'denied',
      message:
        'Microphone access was blocked. Click the camera/mic or lock icon in your browser address bar, set Microphone to "Allow", then click Retry / Enable Mic.',
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      state: 'unsupported',
      message: 'No microphone was detected on this device. Connect a mic or headset and retry.',
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      state: 'prompt',
      message:
        'Your microphone is currently busy in another app or tab. Close other audio apps and try again.',
    };
  }

  return {
    state: 'prompt',
    message: rawMsg || 'Could not access microphone. Please allow mic permission in your browser.',
  };
}

export async function requestMicrophoneStream(
  constraints: MediaTrackConstraints | boolean = true
): Promise<MicRequestResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      state: 'unsupported',
      stream: null,
      error: 'Microphone recording is not supported in this browser or context (requires HTTPS).',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: constraints,
    });
    return {
      granted: true,
      state: 'granted',
      stream,
      error: null,
    };
  } catch (err) {
    const parsed = describeMicrophoneError(err);
    return {
      granted: false,
      state: parsed.state,
      stream: null,
      error: parsed.message,
    };
  }
}

export function audioBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode recorded audio.'));
    reader.readAsDataURL(blob);
  });
}
