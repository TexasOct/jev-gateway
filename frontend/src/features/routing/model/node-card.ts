export const NODE_CARD_WIDTH = 190;
export const NODE_CARD_BASE_HEIGHT = 56;
export const NODE_CARD_ROWS = { type: 12, title: 16, summary: 12 } as const;
export const NODE_CARD_CONTENT_HEIGHT = NODE_CARD_ROWS.type + NODE_CARD_ROWS.title + NODE_CARD_ROWS.summary;
export const NODE_CARD_CONTENT_INSET = (NODE_CARD_BASE_HEIGHT - NODE_CARD_CONTENT_HEIGHT) / 2;
export const NODE_CARD_PORT_RADIUS = 9;
export const NODE_CARD_OUTPUT_HEIGHT = 28;

export type CardMetrics = { width: number; height: number };
export type NodeDimensions = Record<string, CardMetrics>;
type CardPort = { x: number; y: number; radius: number };

/** Three fixed content rows share the bounds used by canvas selection and movement. */
export function nodeCardMetrics(outputs = 0): CardMetrics {
  return { width: NODE_CARD_WIDTH, height: NODE_CARD_BASE_HEIGHT + outputs * NODE_CARD_OUTPUT_HEIGHT };
}

/** Add/target ports use the center; edge ports leave a full handle radius at either end. */
export function nodeCardCenter(side: "left" | "right", outputs = 0): { x: number; y: number } {
  return { x: side === "right" ? NODE_CARD_WIDTH : 0, y: nodeCardMetrics(outputs).height / 2 };
}
/** Every semantic output keeps a full-size handle, including disconnected slots. */
export function nodeCardPorts(count: number): CardPort[] {
  return Array.from({ length: count }, (_, index) => ({
    x: NODE_CARD_WIDTH,
    y: NODE_CARD_BASE_HEIGHT + NODE_CARD_OUTPUT_HEIGHT * (index + 0.5),
    radius: NODE_CARD_PORT_RADIUS,
  }));
}
/** Pool members precede a separate add row. */
export function nodeCardPortsWithCenter(count: number): CardPort[] {
  return nodeCardPorts(count + 1).slice(0, count);
}
