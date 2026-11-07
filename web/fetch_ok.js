// Status 0 is a successful load from file-like schemes (e.g. a WKWebView app scheme).
export function isLoaded(resp) {
  return resp.ok || resp.status === 0;
}
