# Kontrol DZ: family homework workflow and review access

This document describes observable functionality and the change made after the
4.3(a) review of version 1.0.0 (68). It does not claim that no other application
has similar features, or identify the other submission Apple compared it with.

## The product workflow

The central object is a subject assignment for a particular child's school day,
not a generic timer or PDF catalogue:

1. A parent sets the child's subjects, timetable and preparation tasks. Tasks
   are generated for the next school day, with deadlines in the family timezone.
2. The child attaches their own notebook photos to that assignment. Task-specific
   notes, voice notes and chat provide context for that work.
3. A parent reviews the work or returns it with a specific correction. The child
   submits the correction in the same assignment. Sending work and accepting it
   are separate states. A parent's return reopens the task.
4. A child's request to skip a task remains pending until the parent decides.
5. Optional homework-dependent screen rules use the family's required-task state.
   A submitted task counts as done; a returned task does not. This is not a claim
   that every task must be explicitly accepted before any screen access resumes.
6. Parent, child and read-only tutor roles share this family workflow with distinct
   permissions. PDF files are user imports; the app supplies no textbook catalogue.

## Change for the new submission

The welcome screen now offers **Try a family day**, without sign-in or a second
device. It is a native, interactive learning exercise showing a child's answer,
a parent's correction, resubmission and acceptance, plus a pending skip request
and the parent's decision. It is also available in parent Settings.

It is clearly labelled as a fictional local exercise in Russian, Kazakh and
English. It does not write family data, activate the camera, request permissions,
or simulate successful operating-system blocking/location functionality. The real
family product remains accessible through Create family / I have a code.

This is an onboarding improvement that exposes the existing workflow, not a claim
that an onboarding change alone establishes compliance with guideline 4.3.

## Native, explicit homework text import

The former embedded third-party diary login and injected session/token lookup
script have been removed. Parents can explicitly paste homework text, inspect
subject/date matching and the exact bounded note in a native preview, and confirm
before the selected family task notes are replaced. Clipboard access occurs only
on the Paste from clipboard button. No third-party account/session is requested.
This is a concrete privacy/quality improvement found during the audit, not an
assertion that Apple identified that integration as the reason for 4.3(a).

## Inspectable implementation

- `src/app/onboarding.tsx`: subjects, schedule, household tasks and deadlines.
- `src/app/parent/index.tsx`: day review, correction comments and undo.
- `src/components/TaskCards.tsx`: distinct child and parent task actions.
- `supabase/functions/app/core.ts`: task-scoped photos, actions, corrections and skips.
- `supabase/functions/app/screen.ts`: homework readiness from required task status.
- `src/lib/screenGuardIos.ts`: Family Controls/Managed Settings/Device Activity integration.
- `src/app/parent/bilimclass.tsx`: native paste/preview/confirmation, retaining the old route for compatibility.
- `__tests__/homeworkImport.test.tsx`: explicit clipboard access, exact preview limit and confirmation before writes.
- `src/components/FamilyWalkthrough.tsx`: public, local learning exercise.
- `src/i18n/walkthrough.ts`: original exercise copy in three languages.
- `__tests__/familyWalkthrough.test.tsx`: both user journeys and reset across device/language fixtures.

The repository history records the mobile app and family backend from 14 October
2026 and subsequent feature and correction commits. Frameworks and libraries such
as Expo, React Native, Apple's Screen Time integration and OpenStreetMap remain
third-party dependencies; this document does not misrepresent their provenance.

## Real-device review

The public exercise needs no account, payment or system permissions. Full family
review uses the private demo codes supplied in App Store Connect Notes. Photos,
chat and cross-device review require a live family session and network access.

Child iPhone Screen Time requires a physical child device in Apple Family Sharing,
Apple authorization and selection on that child device. Remote installed-app lists,
per-app limits and usage reports are Android-only. An iOS parent can manage an
Android child. Background location is optional, disclosed and permission-gated.

The request to App Review is to evaluate this workflow and identify the specific
code, asset, metadata or app comparison behind the 4.3(a) finding if it persists.
No guarantee of approval or claim of physical iPhone QA is made here.
