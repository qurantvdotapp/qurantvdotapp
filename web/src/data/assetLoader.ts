// Load a bundled text asset in every runtime the app ships in.
//
// fetch() is blocked on file:// URLs in Android WebView (and some TV
// webviews), but XHR is permitted with allowFileAccessFromFileURLs — the
// tvweb wrapper enables both. Bundled assets (Tanzil text, tafseer JSON)
// resolve to file:///android_asset/www/... in the APK and to http(s):// in
// hosted/Chromium runs; XHR handles all of them.

export function loadAssetText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) resolve(x.responseText);
      else reject(new Error(`asset HTTP ${x.status}`));
    };
    x.onerror = () => reject(new Error(`asset load failed: ${url}`));
    x.send();
  });
}
