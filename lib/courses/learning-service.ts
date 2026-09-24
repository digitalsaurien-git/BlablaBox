// Barrel re-export — this file preserves backward compatibility for all existing imports.
// New code should import directly from the specific module.

export { digest, splitPassages } from './learning-helpers.ts';
export { COURSE_READING_REQUIRED, ownedCourse, type Course, courseSources, passageSnapshot, analyzeCourse, reviewExtraction } from './learning-analysis.ts';
export { prepareLearning } from './learning-preparation.ts';
export { ownedSession, answerSession, advanceSession, requestCorrection } from './learning-session.ts';
export { learningAudioText, prepareAudio } from './learning-audio.ts';
