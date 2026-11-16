export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get warnings(): string[] {
    return (this.data.warnings as string[] | undefined) ?? [];
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

export async function api<T>(method: string, url: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "giapha" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network", "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* phản hồi không phải JSON */
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(data.code ?? `http_${res.status}`),
      String(data.message ?? data.detail ?? "Đã có lỗi xảy ra"),
      data,
    );
  }
  return data as T;
}

export const get = <T>(url: string) => api<T>("GET", url);
type Mutation = { batch_id?: string };
export const post = <T = Mutation>(url: string, body?: Body) => api<T>("POST", url, body ?? {});
export const patch = <T = Mutation>(url: string, body: Body) => api<T>("PATCH", url, body);
export const put = <T = Mutation>(url: string, body: Body) => api<T>("PUT", url, body);
export const del = <T = Mutation>(url: string) => api<T>("DELETE", url);
