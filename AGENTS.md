<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vibe Coding Workflow

This repository is a zero-config starter for people who describe websites in
plain language. Make the requested website, not a generic demo or a different
product.

## Before making changes

1. Read this file, `package.json`, the relevant existing files, and the
   matching documentation under `node_modules/next/dist/docs/`.
2. Inspect the available skills in the current agent environment. Use a skill
   only when it is actually available; never claim to have used one otherwise.
3. Ask a question only when the answer would materially change the product.
   Otherwise make a sensible, explicit assumption and continue.

## Design and UX process

For a UI task, use this order whenever the named skills are available:

1. **Taste** — select the subtype that matches the product and audience.
2. **UI UX Pro Max** — use it to review hierarchy, flows, accessibility, and
   interaction details.
3. **Frontend Design** — use it to make deliberate typography, color, layout,
   copy, and motion decisions.
4. **Design-to-Code** — use it when the user supplies a screenshot, Figma
   reference, or another visual source of truth.

When any of those skills is unavailable, follow this fallback before coding:

- State the audience, the page's single job, and the intended visual direction.
- Define a compact design system: palette, type roles, layout rhythm, and one
  signature detail that belongs to this specific product.
- Reject generic AI-dashboard styling, arbitrary gradients, placeholder copy,
  and decoration that has no purpose.
- Design responsive layouts, keyboard focus states, readable contrast, reduced
  motion behavior, and useful empty and error states.

Do not apply one visual style to every project. Each website needs an
intentional direction based on its subject and audience.

## Implementation rules

- Use the App Router and Server Components by default. Add `"use client"` only
  at the smallest boundary that needs browser state, effects, or events.
- Use Tailwind CSS and the shadcn/ui primitives in `components/ui` first. Add a
  shadcn component only when the requested experience needs it.
- Use `lucide-react` for interface icons. Icons need an accessible label when
  their purpose is not already clear from nearby text.
- Use Framer Motion for local UI transitions. Use GSAP only for a purposeful
  timeline or scroll sequence, keep it inside a client component, clean up its
  context, and honor `prefers-reduced-motion`. Do not duplicate one animation
  with both libraries.
- Prefer semantic HTML, `next/image` for real images, and `next/link` for
  internal navigation. Keep CSS imports global only in the root layout and use
  CSS Modules only for component-specific behavior that Tailwind cannot express
  clearly.
- Do not add Convex, authentication, a database, CMS, analytics, or another
  dependency unless the user explicitly requests it. If a feature needs
  environment variables, add documented placeholders to `.env.example`; never
  commit secrets.
- Preserve user changes and keep the work narrowly scoped to the requested
  website.

## Finish every task

1. Run `npm run check`.
2. When a browser is available, inspect the changed UI at desktop and mobile
   widths and exercise its interactive paths.
3. Fix console errors, broken loading/error/empty states, accessibility
   regressions, and visual overflow before reporting completion.
4. Report the result in plain language: what changed, which commands passed,
   and any assumption or next manual step.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
