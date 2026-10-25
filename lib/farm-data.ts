// PostgREST caps individual responses. Page complete day records before calculating counts.
export async function readAllRows<T>(
  fetchPage: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const result = await fetchPage(start, start + 999);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
