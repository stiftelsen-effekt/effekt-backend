/**
 * UI copy shared across the app. The admin is English-only for now (see docs/admin-design.md › Writing);
 * strings live here, not inline in shared components, so a later translation only has to
 * swap this module. Feature-specific copy can stay next to the feature.
 *
 * Rules: sentence case, verbs on buttons ("Save changes", not "OK"), no trailing periods on
 * labels, no exclamation marks, no emoji.
 */
export const strings = {
  actions: {
    save: "Save",
    saveChanges: "Save changes",
    cancel: "Cancel",
    discard: "Discard changes",
    edit: "Edit",
    delete: "Delete",
    close: "Close",
    open: "Open",
    openFullPage: "Open full page",
    copy: "Copy",
    copied: "Copied",
    retry: "Try again",
    undo: "Undo",
    export: "Export CSV",
    clear: "Clear",
    clearAll: "Clear all",
    apply: "Apply",
    back: "Back",
    next: "Continue",
    skip: "Skip",
  },
  list: {
    search: "Search",
    filter: "Filter",
    addFilter: "Add filter",
    columns: "Columns",
    views: "Views",
    saveView: "Save current view…",
    noViews: "No saved views yet",
    viewName: "View name",
    rowsPerPage: "Rows per page",
    noResults: "No results",
    noResultsHint: "Nothing matches these filters. Try removing one.",
    selected: (count: string) => `${count} selected`,
    clearSelection: "Clear selection",
    range: (from: string, to: string, total: string) => `${from}–${to} of ${total}`,
    page: (page: string, pages: string) => `Page ${page} of ${pages}`,
  },
  form: {
    unsaved: "Unsaved changes",
    unsavedLeave: "You have unsaved changes. Leave and discard them?",
    discardTitle: "Discard your changes?",
    discardHint: "What you changed in this form hasn't been saved.",
    keepEditing: "Keep editing",
    required: "Required",
    optional: "Optional",
  },
  errors: {
    generic: "Something went wrong",
    genericHint: "Try again. If it keeps happening, tell the tech team and include the time.",
    network: "Can't reach the server",
    networkHint: "Check your connection or the API status, then try again.",
    unauthorized: "Your session has expired",
    unauthorizedHint: "Sign in again to continue.",
    forbidden: "You don't have access to this",
    forbiddenHint: "Ask an admin to grant you the admin role.",
    upstream: "The payment provider didn't answer",
    upstreamHint:
      "It refused the request or couldn't be reached, so nothing changed. Try again in a few minutes; if it keeps failing, tell the tech team.",
    notFound: "Not found",
    notFoundHint: "It may have been deleted or merged into another record.",
  },
  preferences: {
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    density: "Density",
    comfortable: "Comfortable",
    compact: "Compact",
  },
} as const;
