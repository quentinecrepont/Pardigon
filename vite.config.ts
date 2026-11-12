import { defineConfig, type Plugin } from "vite";

/**
 * Removes comments, indentation and blank lines from the GLSL sources.
 * Bundlers cannot minify text inside strings, so without this step every
 * application using Pardigon would ship the shader comments.
 */
function minifyGlsl(): Plugin {
  return {
    name: "pardigon:minify-glsl",
    transform(code, id) {
      if (!id.endsWith("/src/shaders.ts")) return null;
      return code.replace(
        /`(#version 300 es[\s\S]*?)`/g,
        (_match, source: string) => {
          const lines = source
            .split("\n")
            .map((line) => line.replace(/\/\/.*$/, "").trim())
            .filter((line) => line.length > 0);
          // GLSL directives such as #version must stay on their own line.
          return `\`${lines.join("\n")}\n\``;
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [minifyGlsl()],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
