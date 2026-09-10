export type SmartPartOption = {
  id: string;
  title: string;
  referenceLabel: string | null;
};

export type SmartThemeOption = {
  id: string;
  title: string;
  orderVersion: number;
  parts: SmartPartOption[];
};

export type SmartSubjectOption = {
  id: string;
  title: string;
  score: number;
  themes: SmartThemeOption[];
  themeSuggestion: {
    kind: "existing" | "uncertain" | "new";
    themeId: string | null;
    title: string | null;
  };
};

export type SmartCourseProposal = {
  courseTitle: string;
  referenceLabel: string | null;
  readableText: boolean;
  suggestedSubjectId: string | null;
  subjects: SmartSubjectOption[];
};
