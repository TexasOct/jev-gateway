type SelectionKey = "selectionCheapest" | "selectionQuality" | "selectionBalanced" | "inheritedSelection";

export function selectionCaption(value: string | undefined | null, t: (key: SelectionKey) => string): string {
  switch (value) {
    case "cheapest_adequate": return t("selectionCheapest");
    case "quality_first": return t("selectionQuality");
    case "balanced": return t("selectionBalanced");
    case undefined: case null: case "": return t("inheritedSelection");
    default: return value;
  }
}
