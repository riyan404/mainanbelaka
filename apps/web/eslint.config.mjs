import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
	{ ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"] },
	...nextVitals,
	...nextTypeScript,
];

export default config;
