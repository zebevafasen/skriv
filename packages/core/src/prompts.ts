import {
  type PromptDefinition,
  type PromptMessage,
  type WorkflowKey,
  workflowVariables,
} from "@asterism/contracts";

const variablePattern = /{{\s*([a-z][a-z0-9_]*)\s*}}/g;

export type PromptValidationIssue = { path: string; message: string };

export function findTemplateVariables(content: string): string[] {
  return [...content.matchAll(variablePattern)].map((match) => match[1] as string);
}

export function validatePromptDefinition(prompt: PromptDefinition): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  const available = new Set(workflowVariables[prompt.workflow]);
  const declared = new Set(prompt.variables);
  const used = new Set(
    prompt.messages.flatMap((message) => findTemplateVariables(message.content)),
  );

  for (const variable of declared) {
    if (!available.has(variable)) {
      issues.push({
        path: "variables",
        message: `Unknown variable {{${variable}}} for ${prompt.workflow}.`,
      });
    }
  }
  for (const variable of used) {
    if (!available.has(variable)) {
      issues.push({
        path: "messages",
        message: `Unknown variable {{${variable}}} for ${prompt.workflow}.`,
      });
    } else if (!declared.has(variable)) {
      issues.push({
        path: "variables",
        message: `Used variable {{${variable}}} must be declared.`,
      });
    }
  }
  return issues;
}

export function renderPrompt(
  prompt: PromptDefinition,
  values: Partial<Record<string, string>>,
): PromptMessage[] {
  const issues = validatePromptDefinition(prompt);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join(" "));
  }

  return prompt.messages.map((message) => ({
    ...message,
    content: message.content.replace(
      variablePattern,
      (_match, variable: string) => values[variable] ?? "",
    ),
  }));
}

export function protectedProtocolMessage(workflow: WorkflowKey): PromptMessage {
  if (workflow === "context.extract") {
    return {
      role: "developer",
      content:
        "Return only a JSON object with selectedFragmentIds as an array of supplied fragment IDs. Never add facts or rewrite source text.",
    };
  }
  return {
    role: "developer",
    content:
      "Return only the requested creative output. Do not include analysis, markdown fences, labels, or commentary about the request.",
  };
}
