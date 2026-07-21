export async function resolveSearchParams<
  T extends Record<string, string | string[] | undefined>,
>(
  searchParams: T | Promise<T> | undefined,
): Promise<T> {
  if (!searchParams) return {} as T;
  return searchParams instanceof Promise ? await searchParams : searchParams;
}
