export function RefreshStatus({ updatedAt }: { updatedAt: string }) {
  return <div><span>Records checked {new Date(Date.parse(updatedAt) + 330 * 60_000).toISOString().slice(11, 16)} IST</span></div>;
}
