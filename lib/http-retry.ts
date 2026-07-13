// Fire a webhook-style request with retries and increasing timeouts.
// Resolves regardless of outcome — failures are logged, never thrown.
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  retries = 3
) {
  const timeouts = [10000, 15000, 20000];
  const delays = [0, 5000, 10000];

  for (let i = 0; i < retries; i++) {
    try {
      if (delays[i] > 0) {
        await new Promise((r) => setTimeout(r, delays[i]));
      }
      await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeouts[i]),
      });
      console.log(`${label}: succeeded on attempt ${i + 1}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label}: attempt ${i + 1}/${retries} failed: ${msg}`);
      if (i === retries - 1) {
        console.error(`${label}: all ${retries} attempts failed`);
      }
    }
  }
}
