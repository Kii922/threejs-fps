// The look plan, in one place. Six values plus one ember red that marks the enemy
// team; the lighting makes every shade the game needs, so no other colour appears
// in the code. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  ember: '#e4572e',
};

export function shade(name) {
  return PALETTE[name];
}
