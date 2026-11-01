# Implementation plan

What this file is: the plan for new work, broken into phases and tasks
with stable IDs (`<phase>.<n>`, e.g. `5.2`). Faults in code that already
exists belong in the tracker (findings `F01`, ...), not here. The rule:
if it is broken now, it is a finding; if it does not exist yet, it is a
plan task. Project status lives in the notes file named in `.foreman.md`,
not in this file's header.

## How to use this file

- **One file, stable IDs.** Task IDs are never reused or renumbered; a
  new task gets the next free number in its phase.
- **Model tag:** right after the ID, `(model: A|B|C|Human (then X))`;
  levels in foreman's `shared/model-levels.md`. A task with none is
  tagged when `/foreman:start-task` first starts it (it asks; it never
  estimates).
- **To implement a task**, run `/foreman:start-task 5.2`. When done it
  ticks the box and adds the date: `- [x] **5.2** (model: B) ... Done
  <date>.`
- **Faults found while working** on a task go to the tracker as the next
  free finding ID; the task names that ID.

## Overview

<What the project builds, for whom, and what "done" looks like.>

## Phases

### Phase 1: <name>

<Goal of the phase in one or two lines; what it depends on.>

- [ ] **1.1** (model: B) <Task: what, and the test or check that shows
      it is done.>
- [ ] **1.2** <Task with no level yet.>

#### Notes and decisions

- <date>: <what was learned or decided, and where it is recorded (ADR,
  discovery note).>

### Phase 2: <name>

- [ ] **2.1** <Task.>
