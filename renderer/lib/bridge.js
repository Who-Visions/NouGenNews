// The renderer's only door to the main process: the preload exposes `window.nougennews.invoke`.
export const invoke = (cmd, args) => window.nougennews.invoke(cmd, args);
