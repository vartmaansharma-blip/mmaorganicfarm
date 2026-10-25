import type { ComponentProps } from 'react';
// Test-only adapters: real UI components and CSS, with no Next server or auth bypass.
export function Link({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) {
  void _prefetch;
  return <a {...props} />;
}
export function Image({ fill, sizes: _sizes, priority: _priority, ...props }: ComponentProps<'img'> & { fill?: boolean; priority?: boolean }) {
  void _sizes; void _priority;
  // This local-only adapter intentionally renders a plain image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ''} style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...props.style } : props.style} />;
}
