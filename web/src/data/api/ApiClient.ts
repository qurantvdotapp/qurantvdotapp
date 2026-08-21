// Ported from app/src/main/java/com/qurantv/app/data/api/ApiClient.kt
// Thin fetch wrapper — all calls go through here so error handling and headers
// stay consistent. (Browsers forbid setting User-Agent on fetch; Tizen/Vidaa
// send their own TV UA. mp3quran.net returns Access-Control-Allow-Origin: * on
// every endpoint — verified live — so cross-origin fetching works from a hosted
// app and from the packaged wgt.)

export class ApiException extends Error {
  readonly status: number;
  readonly isTimeout: boolean;
  constructor(message: string, status: number, isTimeout = false) {
    super(message);
    this.name = "ApiException";
    this.status = status;
    this.isTimeout = isTimeout;
  }
}

export class ApiClient {
  /** Abort a fetch that the server accepted but never answered — a stalled
   *  connection must not wedge the player (singleFlight shares the promise). */
  private static readonly FETCH_TIMEOUT_MS = 15_000;

  async getText(url: string): Promise<string> {
    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ApiClient.FETCH_TIMEOUT_MS);
      try {
        res = await fetch(url, {
          headers: {
            Accept: "application/json, text/plain, */*",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const isAbort = (e as Error).name === "AbortError" || (e as Error).message?.includes("aborted");
      const msg = isAbort ? `Request timed out for ${url}` : `Network error for ${url}: ${(e as Error).message}`;
      throw new ApiException(msg, isAbort ? 408 : 0, isAbort);
    }
    if (!res.ok) {
      throw new ApiException(`HTTP ${res.status} for ${url}`, res.status);
    }
    return res.text();
  }
}

export const apiClient = new ApiClient();
