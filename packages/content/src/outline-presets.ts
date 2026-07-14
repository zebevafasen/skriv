export type OutlinePresetScene = { title: string; summary: string };
export type OutlinePresetChapter = { title: string; scenes: OutlinePresetScene[] };
export type OutlinePresetAct = { title: string; chapters: OutlinePresetChapter[] };
export type OutlinePreset = {
  id: "three-act" | "save-the-cat";
  name: string;
  description: string;
  acts: OutlinePresetAct[];
};

export const outlinePresets: OutlinePreset[] = [
  {
    id: "three-act",
    name: "Three-Act Structure",
    description: "A flexible setup, confrontation, and resolution framework.",
    acts: [
      {
        title: "Act I — Setup",
        chapters: [
          {
            title: "The Setup",
            scenes: [
              {
                title: "Opening Situation",
                summary:
                  "Establish the protagonist, their ordinary world, and the story's central tension.",
              },
              {
                title: "Inciting Incident",
                summary: "Disrupt the ordinary world with an event the protagonist cannot ignore.",
              },
              {
                title: "First Plot Point",
                summary:
                  "Force a consequential choice that commits the protagonist to the main conflict.",
              },
            ],
          },
        ],
      },
      {
        title: "Act II — Confrontation",
        chapters: [
          {
            title: "Rising Action",
            scenes: [
              {
                title: "First Pinch Point",
                summary: "Demonstrate the antagonist's power and tighten the central conflict.",
              },
              {
                title: "Midpoint",
                summary:
                  "Deliver a revelation, reversal, or apparent victory that changes the protagonist's approach.",
              },
              {
                title: "Second Pinch Point",
                summary: "Escalate the cost of failure and close off easy solutions.",
              },
              {
                title: "Crisis",
                summary:
                  "Bring the protagonist to their lowest point and demand a final commitment.",
              },
            ],
          },
        ],
      },
      {
        title: "Act III — Resolution",
        chapters: [
          {
            title: "Climax and Resolution",
            scenes: [
              {
                title: "Climax",
                summary:
                  "Resolve the central conflict through the protagonist's decisive final action.",
              },
              {
                title: "Denouement",
                summary:
                  "Show the consequences of the climax and establish the story's new equilibrium.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "save-the-cat",
    name: "Save the Cat",
    description: "A fifteen-beat story structure grouped into three acts.",
    acts: [
      {
        title: "Act I — Thesis",
        chapters: [
          {
            title: "The Ordinary World",
            scenes: [
              {
                title: "Opening Image",
                summary:
                  "Present a visual snapshot of the protagonist's world before the story transforms it.",
              },
              {
                title: "Theme Stated",
                summary: "Hint at the lesson or truth the protagonist will need to understand.",
              },
              {
                title: "Setup",
                summary:
                  "Establish the protagonist, their flaws, relationships, stakes, and unresolved needs.",
              },
              {
                title: "Catalyst",
                summary:
                  "Disrupt the status quo with the event that sets the central story in motion.",
              },
              {
                title: "Debate",
                summary: "Let the protagonist resist, question, or prepare for the path ahead.",
              },
            ],
          },
        ],
      },
      {
        title: "Act II — Antithesis",
        chapters: [
          {
            title: "Promise of the Premise",
            scenes: [
              {
                title: "Break into Two",
                summary:
                  "Have the protagonist make a proactive choice and enter the story's unfamiliar second act.",
              },
              {
                title: "B Story",
                summary: "Introduce a relationship or secondary thread that carries the theme.",
              },
              {
                title: "Fun and Games",
                summary:
                  "Explore the central premise through escalating successes, failures, and discoveries.",
              },
              {
                title: "Midpoint",
                summary: "Raise the stakes with a major reversal, false victory, or false defeat.",
              },
            ],
          },
          {
            title: "Pressure and Collapse",
            scenes: [
              {
                title: "Bad Guys Close In",
                summary:
                  "Increase external pressure and internal conflict as the protagonist's approach stops working.",
              },
              {
                title: "All Is Lost",
                summary:
                  "Deliver the apparent defeat and strip away the protagonist's remaining certainty.",
              },
              {
                title: "Dark Night of the Soul",
                summary:
                  "Let the protagonist confront the meaning of their failure and find the seed of a new answer.",
              },
            ],
          },
        ],
      },
      {
        title: "Act III — Synthesis",
        chapters: [
          {
            title: "The Finale",
            scenes: [
              {
                title: "Break into Three",
                summary: "Combine the main-story lesson and B-story insight into a new plan.",
              },
              {
                title: "Finale",
                summary:
                  "Execute the final plan, overcome escalating obstacles, and resolve the central conflict.",
              },
              {
                title: "Final Image",
                summary:
                  "Mirror the opening image to show how the protagonist or world has changed.",
              },
            ],
          },
        ],
      },
    ],
  },
];

export function getOutlinePreset(id: OutlinePreset["id"]): OutlinePreset {
  const preset = outlinePresets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown outline preset: ${id}`);
  return preset;
}
