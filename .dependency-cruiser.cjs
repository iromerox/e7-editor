/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "protocol-is-pure",
      comment: "src/protocol must not depend on midi, store, or app — it has zero I/O.",
      severity: "error",
      from: { path: "^src/protocol" },
      to: { path: "^src/(midi|store|app)" },
    },
    {
      name: "midi-depends-on-protocol-only",
      comment: "src/midi may depend on protocol, not on store or app.",
      severity: "error",
      from: { path: "^src/midi" },
      to: { path: "^src/(store|app)" },
    },
    {
      name: "store-depends-on-protocol-only",
      comment: "src/store may depend on protocol, not on midi or app.",
      severity: "error",
      from: { path: "^src/store" },
      to: { path: "^src/(midi|app)" },
    },
    {
      name: "no-circular",
      comment: "No circular dependencies anywhere in src.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx"],
    },
  },
};
