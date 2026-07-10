/**
 * Small CSS-drawn glyphs mirroring the mockup's hand-drawn nav icons (DESIGN_REFERENCE
 * §4: grid squares / lines / ascending bars / plus-in-circle / dots — all in CSS, no
 * icon font or SVG sprite). Deliberately no text content (only `::before`/`::after` in
 * CSS) so a nav button's accessible/text content is exactly its label.
 */
import type { NavIconKind } from './navItems';

export interface NavIconProps {
  kind: NavIconKind;
  variant?: 'bottom' | 'sidebar';
}

export function NavIcon({ kind, variant = 'bottom' }: NavIconProps) {
  return <span className={`nav-icon nav-icon-${variant} nav-icon-${kind}`} aria-hidden="true" />;
}
