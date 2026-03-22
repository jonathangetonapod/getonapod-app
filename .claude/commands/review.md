---
description: Review the current branch diff for issues before merging
---

## Changes to Review

!`git diff --name-only main...HEAD`

## Detailed Diff

!`git diff main...HEAD`

Review the above changes for:
1. Security vulnerabilities (API keys, SQL injection, XSS)
2. Missing error handling
3. TypeScript type safety issues
4. Edge function CORS and auth consistency
5. Performance concerns (missing pagination, N+1 queries)
6. Breaking changes to existing edge function contracts

Give specific, actionable feedback per file.
