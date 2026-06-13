import path from "node:path";
import {defineConfig} from "vite";

export default defineConfig({
	root: "src",
	publicDir: path.resolve(__dirname, "public"),
	server: {
		host: true,
		open: false,
	},
	preview: {
		host: true,
		open: false,
	},
	build: {
		outDir: path.resolve(__dirname, "dist"),
		emptyOutDir: true,
	},
});
