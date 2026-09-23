import React from 'react';
import { Panel } from '../components/ui.jsx';
import { RULES } from '../content/rules.js';

export default function Help() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="How authoring works" padding="p-5">
        <ol className="muted list-decimal space-y-2 pl-5 text-sm">
          <li><strong className="text-[var(--ink)]">Brief.</strong> Speak, upload a document or type what people face at work, say who is being assessed and why. The platform proposes 3 to 5 Skills; you confirm.</li>
          <li><strong className="text-[var(--ink)]">Scenarios.</strong> Everything is planned and written for you: situations, what a good answer must cover, scoring questions, MCQ options, time and response limits. Edit anything inline, regenerate with a plain instruction, and approve each scenario. "Adjust plan" changes the mix.</li>
          <li><strong className="text-[var(--ink)]">Preview.</strong> Take the assessment as a participant on desktop or mobile and see the sample report.</li>
          <li><strong className="text-[var(--ink)]">Publish.</strong> The quality gate lists anything that blocks, with the fix. Set the basics and publish a version.</li>
          <li><strong className="text-[var(--ink)]">Calibration.</strong> After publish, the sidebar shows Calibration for every Audio or Text scenario. Two calibrators score the first 30 responses, the AI scores them too, and AI scoring activates when agreement holds.</li>
        </ol>
      </Panel>
      <Panel title="The rules the platform keeps for you" padding="p-5">
        <ul className="muted list-disc space-y-1.5 pl-5 text-sm">
          <li>{RULES.skills.min} to {RULES.skills.max} Skills; {RULES.scenarios.totalMin} to {RULES.scenarios.totalMax} scenarios; at least {RULES.scenarios.perSkillMin} scenarios and {RULES.observations.perSkillMin} scored observations per Skill.</li>
          <li>Audio and Text scenarios carry 4 or 5 scoring questions with a model answer. MCQ scenarios carry 1 to 3 questions with up to 4 options, each valued 1 to 5 with a rationale.</li>
          <li>Audio up to 2 minutes, text 1,000 to 2,000 characters, sized from the model answer. Each scenario 5 to 15 minutes; the whole assessment aims for {RULES.time.totalTarget} minutes and cannot pass {RULES.time.totalHard}.</li>
          <li>Personal data in uploads is anonymized before generation. Scenario order is shuffled per participant with Skills interleaved.</li>
        </ul>
      </Panel>
      <Panel title="Speaking, uploading and typing" padding="p-5"><p className="muted text-sm">Dictation uses the browser's speech recognition (Chrome, Edge and Safari). Uploads accept PDF, DOCX, PPTX, XLSX and TXT; text is extracted in your browser, screened for personal data, and only the anonymized text goes to the model. Typing works everywhere, and a single sentence is enough to start.</p></Panel>
      <Panel title="Support" padding="p-5"><p className="muted text-sm">For KNOLSKAPE review, ontology gaps or calibration, contact the assessment team through GenieKreator support. Export your workspace from Settings before raising an issue so the team can reproduce it.</p></Panel>
    </div>
  );
}
