# Project organisation

Each product capability owns its page implementation and feature-specific code.

- `app/` remains the Next.js routing layer: route entry points, layouts, loading and error boundaries.
- `features/<feature>/components/` contains feature-specific React components.
- `features/<feature>/data/` contains feature-specific data access or view-model preparation.
- `features/<feature>/sections/` contains substantial sections used only by that feature.
- `components/ui/` contains reusable design-system primitives.
- `components/layout/` and `components/shell/` contain application-wide layout components.
- `lib/` contains framework-independent domain logic, services, adapters, state and shared configuration.

Prefer kebab-case filenames and folders. React component identifiers remain PascalCase; functions and variables remain camelCase.
