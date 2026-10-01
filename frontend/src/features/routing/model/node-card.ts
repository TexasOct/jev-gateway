export const NODE_CARD_WIDTH = 190;
export const NODE_CARD_BASE_HEIGHT = 56;
export const NODE_CARD_ROWS = { type: 12, title: 16, summary: 12 } as const;
export const NODE_CARD_CONTENT_HEIGHT = NODE_CARD_ROWS.type + NODE_CARD_ROWS.title + NODE_CARD_ROWS.summary;
export const NODE_CARD_CONTENT_INSET = (NODE_CARD_BASE_HEIGHT - NODE_CARD_CONTENT_HEIGHT) / 2;
export const NODE_CARD_PORT_RADIUS = 9;

type CardMetrics = { width: number; height: number };
type CardPort = { x: number; y: number; radius: number };

/** Three fixed content rows share the bounds used by canvas selection and movement. */
export function nodeCardMetrics(): CardMetrics {
  return { width: NODE_CARD_WIDTH, height: NODE_CARD_BASE_HEIGHT };
}

/** Add/target ports use the center; edge ports leave a full handle radius at either end. */
export function nodeCardCenter(side: "left" | "right"): { x: number; y: number } {
  return { x: side === "right" ? NODE_CARD_WIDTH : 0, y: NODE_CARD_BASE_HEIGHT / 2 };
}

function centeredPortY(count: number, index: number): number {
  const center = NODE_CARD_BASE_HEIGHT / 2;
  const spacing = count > 1 ? Math.min(20, (NODE_CARD_BASE_HEIGHT - 20) / (count - 1)) : 20;
  return center + (index - (count - 1) / 2) * spacing;
}

/** Order tag-pool source anchors top to bottom around the center add handle. */
function splitPortY(count: number, index: number): number {
  const center = NODE_CARD_BASE_HEIGHT / 2;
  const upperCount = Math.ceil(count / 2);
  const spacing = (center - NODE_CARD_PORT_RADIUS - 2) / Math.max(1, upperCount);
  return index < upperCount ? 1 + spacing * (index + 0.5)
    : NODE_CARD_BASE_HEIGHT - 1 - spacing * (count - index - 0.5);
}

/** Dense pools shrink edge handles; the drawer provides full-size per-edge controls. */
function createPorts(count: number, yAt: (count: number, index: number) => number, spacing: number): CardPort[] {
  return Array.from({ length: count }, (_, index) => ({
    x: NODE_CARD_WIDTH,
    y: yAt(count, index),
    radius: Math.min(NODE_CARD_PORT_RADIUS, spacing * 0.45),
  }));
}

export function nodeCardPorts(count: number): CardPort[] {
  const spacing = count > 1 ? Math.min(20, (NODE_CARD_BASE_HEIGHT - 20) / (count - 1)) : 20;
  return createPorts(count, centeredPortY, spacing);
}

/** Reserve the centered add port on tag pools. */
export function nodeCardPortsWithCenter(count: number): CardPort[] {
  const center = nodeCardCenter("right");
  const spacing = (center.y - NODE_CARD_PORT_RADIUS - 2) / Math.max(1, Math.ceil(count / 2));
  return createPorts(count, splitPortY, spacing);
}
