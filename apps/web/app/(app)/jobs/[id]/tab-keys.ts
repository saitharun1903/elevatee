export const TAB_KEYS = ["overview", "match", "skills", "ats", "process", "questions", "company", "preparation", "application"] as const;
export type TabKey = (typeof TAB_KEYS)[number];
