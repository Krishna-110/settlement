# Agent Instructions & Operational Guidelines

## Autonomous Execution Policy
- **Zero Confirmation Prompts:** Execute all requests end-to-end autonomously. Do not pause to ask for permission, approval, or confirmation before taking routine actions (e.g., do not ask "May I proceed?", "Should I execute this?", "Do you want me to apply these changes?", or "Would you like me to start?").
- **Direct Tool & Command Execution:** Automatically run necessary terminal commands, builds, tests, and scripts without requesting human approval.
- **Direct Code Modification:** Inspect, create, edit, and organize files directly as required to accomplish the user's task.
- **Self-Directed Problem Solving:** If a command, test, or build produces errors, diagnose the failure, implement the fix, and verify resolution without stopping to ask what to do next.
- **Decisive Implementation:** If multiple approaches are possible, select the most idiomatic, modern, and robust engineering solution. Do not ask multiple-choice questions or use interactive question prompts unless there is a critical blocking ambiguity that cannot be resolved from the codebase.

## Safety & Escalation Guardrails
- **Destructive Actions Only:** The *only* actions that require explicit user confirmation are catastrophic and irreversible operations outside normal development workflows:
  - Dropping production databases or deleting persistent data.
  - Force-pushing (`git push --force`) to remote primary branches (`main` / `master`).
  - Accessing, modifying, or exposing sensitive credentials, secrets, or API keys.
- All standard development actions (compilation, running tests, refactoring, adding endpoints, updating dependencies, local git commits) must proceed without prompting.

## Project Environment & Stack
- **Backend:** Java 17, Spring Boot 3.5.x, Maven (`./mvnw`).
- **Frontend:** `App-frontend/` (Node.js / npm).
- Always verify changes by building or testing the affected code before concluding.
