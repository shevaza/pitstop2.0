// Shared behavior for web/mobile: callers still receive the original final Response.
export async function fetchCrossCheck(
    url: string,
    request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
    init: RequestInit = {},
): Promise<Response> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 240000);
    let next = url;
    try {
        while (!controller.signal.aborted) {
            const response = await request(next, { ...init, cache: "no-store", signal: controller.signal });
            if (response.status !== 202) return response;
            const job = await response.json();
            if (job.state !== "pending" || typeof job.jobId !== "string" || !/^[a-f0-9-]{36}$/.test(job.jobId)) {
                throw new Error("Invalid scrape status response");
            }
            const [path, query = ""] = url.split("?");
            const params = new URLSearchParams(query);
            params.set("jobId", job.jobId);
            next = `${path}?${params.toString()}`;
            await new Promise<void>((resolve, reject) => {
                const cancel = () => { clearTimeout(timer); reject(new Error("Cross-check cancelled or timed out. Try again.")); };
                const timer = setTimeout(() => { controller.signal.removeEventListener("abort", cancel); resolve(); }, 3000);
                controller.signal.addEventListener("abort", cancel, { once: true });
                if (controller.signal.aborted) cancel();
            });
        }
        throw new Error("Cross-check cancelled or timed out. Try again.");
    } finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener("abort", abort);
    }
}
