# Development Task Backlog

## Foundation & Infrastructure
- [x] Create React + Vite project with Tailwind and ESLint/Prettier. (M0)
- [x] Configure GitHub Actions (lint, type check, build).
- [x] Install Dexie, date-fns, Zustand/Redux, FullCalendar dependencies.
- [x] Scaffold layout components (`AppShell`, `Sidebar`, `TopBar`).
- [x] Implement Dexie schema and DataStore utility.
- [x] Seed demo data loader for development environment.

## Setup & Data Management
- [x] Build Trimester manager (list/add/edit date ranges, color pick).
- [x] Implement Holiday manager with group/level scope selection.
- [x] Create Level creation flow (grade number, subject, color).
- [x] Generate groups automatically (A/B/C) with edit/remove UI.
- [x] Develop schedule builder: weekly grid, add session, conflict validation.
- [x] Persist schedules and recompute cached placeholder slots.

## Calendar Experience
- [x] Integrate FullCalendar with month/week/day views and navigation controls.
- [x] Map schedules + lessons into FullCalendar events with color rules.
- [x] Add filters for trimester, level, group, lesson status.
- [x] Implement calendar range listener to prefetch relevant data.
- [x] Design condensed month view rendering (chips, overflow count).
- [x] Create day/week tooltips and keyboard shortcuts.

## Lesson Planning
- [x] Build Lesson drawer/modal shell with tab navigation.
- [ ] Implement structured fields for pre/while/post activities and validations.
- [ ] Add resource and rubric selectors with attachment metadata.
- [ ] Enable autosave (debounce) with “Last saved” indicator.
- [ ] Create activity templates library and insertion flow.
- [ ] Implement copy-to-level wizard with duration match check.
- [ ] Handle linked lessons (edit all/this/unlink options).
- [ ] Add completion status workflow and notes.

## Rescheduling & Intelligence
- [ ] Detect schedule/holiday changes and fetch affected lessons.
- [ ] Generate reschedule proposals (next available slot) with preview UI.
- [ ] Implement cascade logic and undo history.
- [ ] Support manual drag-and-drop reschedule with conflict checking.
- [ ] Highlight holidays and trimester boundaries on calendar.

## Reporting & Export
- [ ] Build coverage dashboard (planned vs completed by topic/trimester).
- [ ] Implement pacing comparison per group (ahead/on-track/behind).
- [ ] Summarize workload hours per week and prep gaps.
- [ ] Export lessons/schedules/holidays to CSV.
- [ ] Implement JSON backup export/import with version validation.
- [ ] Generate printable/PDF views for day/week agenda.

## Polish & Quality
- [ ] Add PWA service worker, manifest, offline notification banner.
- [ ] Implement user settings (default view, color scheme, time format).
- [ ] Add global search (lessons, topics, resources).
- [ ] Create onboarding checklist/sample data toggle.
- [ ] Run accessibility audit (ARIA labels, focus outlines, contrast).
- [ ] Optimize performance (memoized selectors, lazy loading resources).
- [ ] Write Cypress smoke tests for setup, lesson planning, rescheduling.
- [ ] Prepare release notes and deployment configuration (Vercel/Pages).
