---
description: "Check for TypeScript type errors and ESLint linting issues in the frontend, then fix any problems found"
agent: "agent"
---

Check the frontend code for errors:

1. Run `tsc --noEmit` in `frontend/` to find type errors
2. Run `eslint src/` in `frontend/` to find linting issues
3. Ignore `react-refresh/only-export-components` warnings (inherent to TanStack Router)
4. Report all real errors found
5. Fix them
