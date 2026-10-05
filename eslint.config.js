import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions is Deno code, linted by `deno lint` (its files carry
  // deno-lint-ignore directives), not by this browser-app config.
  { ignores: ["dist", "android", "ios", "supabase/functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // Hooks and variant helpers intentionally exported next to their
          // provider/component (context hooks, shadcn/ui variants).
          allowExportNames: [
            "useAuth",
            "useCart",
            "useWishlist",
            "useLayoutOverride",
            "useFormField",
            "useSidebar",
            "badgeVariants",
            "buttonVariants",
            "toggleVariants",
            "navigationMenuTriggerStyle",
            "toast",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
