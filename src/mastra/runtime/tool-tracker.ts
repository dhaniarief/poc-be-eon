type ToolTrace = {
  tool: string;
};

export function createToolTracker() {
  const tools = new Set<string>();

  return {
    add(tool: ToolTrace) {
      tools.add(tool.tool);
    },

    getAll() {
      return Array.from(tools).map((tool) => ({
        tool,
      }));
    },
  };
}
